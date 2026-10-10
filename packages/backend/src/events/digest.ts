// Story digest: rewritten incrementally as reports arrive; contradictions with earlier reporting are
// stated explicitly. v1 `digest` and `latest` read the same stored version.
import { z } from "zod";
import { modelFor } from "../editorial/models.ts";
import { looksEnglish, looksZh } from "../editorial/writing.ts";
import { sql } from "../db.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { promptText, promptVersion } from "../editorial/prompts.ts";

export const DIGEST_PROMPT_VERSION = promptVersion("story-digest");

export function storyDigestLanguage(story: { origin: string; editorial_language: "en" | "zh" }): "en" | "zh" {
  return story.origin === "manual" ? story.editorial_language : "en";
}

const Schema = z.object({
  title: z.string().max(200).catch(""),
  digest: z.string().min(10).max(4000),
  latest: z.string().max(500).catch(""),
});

export function storyStatusFor(latestAt: Date | null, now = Date.now()): "active" | "watching" | "settled" {
  if (!latestAt) return "settled";
  const age = now - latestAt.getTime();
  if (age < 24 * 3600 * 1000) return "active";
  if (age < 72 * 3600 * 1000) return "watching";
  return "settled";
}

/** `afterCorrection`: an editor changed a report of this story; rewrite even when older versions lack inputs. */
export async function composeStoryDigest(storyId: number, opts: { afterCorrection?: boolean } = {}): Promise<{ updated: boolean; version?: number }> {
  const [story] = await sql<{ id: number; title: string; digest: string | null; version: number; origin: string; editorial_language: "en" | "zh" }[]>`
    SELECT id, title, digest, version, origin, editorial_language FROM stories WHERE id = ${storyId} AND merged_into IS NULL`;
  if (!story) return { updated: false };
  const language = storyDigestLanguage(story);
  const digestVersion = promptVersion(language === "en" ? "story-digest" : "story-digest-zh");
  const reports = await sql<{ id: string; title: string; summary: string | null; source_name: string; first_party: boolean; at: Date }[]>`
    SELECT DISTINCT ON (p.article_id) p.article_id AS id, p.title, p.summary, s.name AS source_name, p.first_party,
      coalesce(p.published_at, p.discovered_at) AS at
    FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id JOIN publications p ON p.article_id = fa.article_id
    JOIN sources s ON s.id = p.source_id
    WHERE f.story_id = ${storyId} AND p.visibility = 'public' AND p.eligible
    ORDER BY p.article_id`;
  if (reports.length === 0) return { updated: false };
  reports.sort((a, b) => a.at.getTime() - b.at.getTime());
  const ids = reports.map((r) => r.id).sort();
  // What this version is written from: the reports and what they currently say (corrections included).
  const prose = [...reports].sort((a, b) => a.id.localeCompare(b.id)).map(r => [r.id, r.title, r.summary ?? ""]);
  const inputsHash = sha256(stableJson([digestVersion, language, ...prose]));
  const legacyInputsHash = sha256(stableJson(prose));
  const [last] = await sql<{ article_ids: string[]; inputs_hash: string | null }[]>`
    SELECT article_ids, inputs_hash FROM story_digests WHERE story_id = ${storyId} ORDER BY version DESC LIMIT 1`;
  const sameReports = !!last && JSON.stringify([...last.article_ids].sort()) === JSON.stringify(ids);
  // Versions written before inputs were recorded compare by report set only.
  if (sameReports && !opts.afterCorrection && (last!.inputs_hash === inputsHash || last!.inputs_hash === legacyInputsHash || last!.inputs_hash === null)) return { updated: false };
  // Old stories convert on their next real evidence update, never a language-only historical rewrite.
  // Same reports, different content: an editor corrected one. Rewrite from the reports as they are now,
  // without the previous digest, so a corrected fact does not survive as "earlier reports said".
  const corrected = sameReports;
  const known = new Set(last?.article_ids ?? []);

  const lines = reports.slice(-40).map((r) => `${corrected || known.has(r.id) ? "" : "【新】"}${r.at.toISOString()}｜${r.source_name}${r.first_party ? "（一手）" : ""}｜${r.title}｜${(r.summary ?? "").slice(0, 220)}`);
  const user = corrected
    ? `事件当前标题：${story.title}\n\n报道内容经过编辑更正。请只依据下面这些报道的当前内容重写综述，不要沿用以前版本的说法。\n报道（按时间）：\n${lines.join("\n")}`
    : `事件当前标题：${story.title}\n${story.digest ? `上一版综述：${story.digest}\n` : ""}\n报道（按时间，标【新】的是上一版之后的新报道）：\n${lines.join("\n")}`;
  const res = await chatJson({
    model: await modelFor("digest"), purpose: "story_digest", subject: `story:${storyId}@${inputsHash}`, promptVersion: digestVersion,
    system: promptText(language === "en" ? "story-digest" : "story-digest-zh"), user, schema: Schema.superRefine((data, ctx) => {
      const invalid = language === "en"
        ? (story.origin !== "manual" && !looksEnglish(data.title)) || !looksEnglish(data.digest) || (data.latest && !looksEnglish(data.latest))
        : !looksZh(data.digest) || (data.latest && !looksZh(data.latest));
      if (invalid) ctx.addIssue({ code: "custom", message: `story digest must use ${language}` });
    }), temperature: 0.3, maxTokens: 1200,
  });
  const version = story.version + 1;
  await sql.begin(async (tx) => {
    await tx`INSERT INTO story_digests (story_id, version, digest, latest, receipt_id, article_ids, inputs_hash)
             VALUES (${storyId}, ${version}, ${res.data.digest}, ${res.data.latest || null}, ${res.receiptId}, ${ids}, ${inputsHash})`;
    await tx`UPDATE stories SET frame = CASE WHEN editorial_language <> ${language} AND nullif(btrim(summary),'') IS NOT NULL
                 THEN jsonb_set(coalesce(frame,'{}'::jsonb),'{summaryLanguage}',to_jsonb(coalesce(frame->>'summaryLanguage',editorial_language))) ELSE frame END,
               editorial_language = ${language}, digest = ${res.data.digest}, latest = ${res.data.latest || null}, digest_updated_at = now(),
               title = CASE WHEN origin = 'manual' OR ${res.data.title} = '' THEN title ELSE ${res.data.title} END,
               version = ${version}, updated_at = now()
             WHERE id = ${storyId}`;
    await completeReceipt(tx, res.receiptId);
  });
  return { updated: true, version };
}

/** Periodic: statuses follow activity (持续更新 / 观察中 / 历史事件). */
export async function refreshStoryStatuses(): Promise<{ updated: number }> {
  const res = await sql`
    UPDATE stories SET status = CASE
      WHEN latest_at > now() - interval '24 hours' THEN 'active'
      WHEN latest_at > now() - interval '72 hours' THEN 'watching'
      ELSE 'settled' END
    WHERE merged_into IS NULL AND status <> CASE
      WHEN latest_at > now() - interval '24 hours' THEN 'active'
      WHEN latest_at > now() - interval '72 hours' THEN 'watching'
      ELSE 'settled' END`;
  return { updated: res.count };
}
