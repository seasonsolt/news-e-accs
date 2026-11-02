// One-off recovery: reuse recorded writing, scores and structure; never call a writing/scoring model.
// Run from the release root with node --env-file=/srv/eacc/.env deploy/releases/2026-11-02-restore-written-copies.ts [--apply].
import { sql, closeDb } from "../../packages/backend/src/db.ts";
import { audit } from "../../packages/backend/src/audit.ts";
import { loadAnalyzeInput, scoresSelect } from "../../packages/backend/src/editorial/analyze.ts";
import { finalizeCopy, translateInputOf } from "../../packages/backend/src/editorial/writing.ts";
import { enqueue, QUEUES, stopBoss } from "../../packages/backend/src/jobs/queue.ts";
import { emit, installModules } from "../../packages/backend/src/modules.ts";
import { publishArticleTx } from "../../packages/backend/src/publication/publish.ts";
import { SERVER_MODULES } from "../../site/modules/server.ts";

if (process.argv.slice(2).some(arg => arg !== "--apply")) throw new Error("Only --apply is supported; without it this is read-only");
const apply = process.argv.includes("--apply");
installModules(SERVER_MODULES);
try {
  const rows = await sql`
    SELECT a.id, an.id AS analysis_id FROM articles a
    JOIN LATERAL (SELECT * FROM analyses WHERE article_id=a.id ORDER BY input_revision DESC,id DESC LIMIT 1) an ON true
    WHERE a.discovered_at >= '2026-10-03T00:00:00+08:00' AND a.discovered_at < '2026-11-03T00:00:00+08:00'
      AND an.input_revision=a.revision AND an.editorial_language='en' AND an.relevance='unknown'
      AND an.output->>'writer'='understand' AND an.output->'prefilter'->>'label'='PASS'
      AND (coalesce(an.title,'')='' OR coalesce(an.summary,'')='')
    ORDER BY a.id`;
  let restored = 0;
  for (const row of rows) {
    const input = await loadAnalyzeInput(row.id);
    if (!input) continue;
    const result = await sql.begin(async tx => {
      const [article] = await tx`SELECT revision,grouping_status FROM articles WHERE id=${row.id} FOR UPDATE`;
      const [previous] = await tx`SELECT * FROM analyses WHERE article_id=${row.id} ORDER BY input_revision DESC,id DESC LIMIT 1`;
      if (!article || !previous || previous.id !== row.analysis_id || article.revision !== input.revision || previous.input_revision !== input.revision) return null;
      const [receipt] = await tx`
        SELECT id,response#>>'{choices,0,message,content}' AS content FROM receipts
        WHERE id=ANY(${previous.receipt_ids}::bigint[]) AND purpose='understand_article' AND status='completed'
        ORDER BY id DESC LIMIT 1`;
      if (!receipt?.content) return null;
      const raw = JSON.parse(receipt.content);
      if (typeof raw.title !== "string" || typeof raw.summary !== "string") return null;
      const copy = finalizeCopy(translateInputOf(input), raw);
      if (!copy.title || !copy.summary || copy.identityGuard.outcome !== "pass") return null;
      const scores = previous.output?.scores, threshold = previous.output?.threshold;
      if (!Array.isArray(scores) || scores.length !== 2 || !scores.every(v => Number.isInteger(v) && v >= 0 && v <= 100) || !Number.isFinite(threshold)) return null;
      const selected = scoresSelect({ values: scores, threshold, model: previous.output.scoreModel, receiptIds: [], reused: true, refused: previous.output.scoreRefused });
      if (!apply) return { id: row.id, selected, receiptId: receipt.id };

      const output = { ...previous.output, copyRecovery: { previousAnalysisId: previous.id, receiptId: receipt.id, release: "2026-11-02" } };
      const [next] = await tx`
        INSERT INTO analyses (article_id,input_revision,origin,model,prompt_version,receipt_ids,relevance,category,tags,subjects,
          title_zh,summary_zh,reason_zh,score,selected,output,editorial_language,title,summary,reason)
        SELECT article_id,input_revision,'replay',model,prompt_version,receipt_ids,'pass',category,tags,subjects,
          title_zh,summary_zh,reason_zh,score,${selected},${tx.json(output)},editorial_language,${copy.title},${copy.summary},reason
        FROM analyses WHERE id=${previous.id} RETURNING id`;
      const [published] = await tx`SELECT story_id FROM publications WHERE article_id=${row.id}`;
      const publication = await publishArticleTx(tx, row.id);
      if (!publication) throw new Error(`Missing publication for ${row.id}`);
      if (published && publication.changed) await emit("articleChanged", { id: row.id, reason: "republication", kind: publication.changeKind,
        reduced: publication.reduced, previousStoryIds: published.story_id === null ? [] : [published.story_id] }, tx);
      if (article.grouping_status === "pending") await enqueue(QUEUES.group, { articleId: row.id }, { singletonKey: row.id, priority: -2 }, tx);
      await audit("codex", "content.restore-written-copy", `content:${row.id}`, "Restore source-backed original-script names in saved English copy; reuse scores and receipts",
        { analysisId: previous.id, relevance: previous.relevance, selected: previous.selected }, { analysisId: next!.id, relevance: "pass", selected }, { db: tx });
      return { id: row.id, selected, receiptId: receipt.id };
    });
    if (result) { restored++; console.log(JSON.stringify({ apply, ...result })); }
  }
  console.log(JSON.stringify({ apply, restored }));
} finally {
  await stopBoss();
  await closeDb();
}
