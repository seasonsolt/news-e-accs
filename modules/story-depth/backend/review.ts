import { sql } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { audit, Conflict } from "@aihot/backend/audit";
import { enqueueOn } from "@aihot/backend/jobs/queue";
import { digestReports } from "@aihot/backend/publication/story-evidence";
import { evidenceCurrent, validateDepth, type Evidence } from "./evidence.ts";
import { depthQueue } from "./draft.ts";
import type { ReviewEntry, ReviewQueue, StoryDepth } from "../contracts.ts";

export async function requestDepth(storyId: number, actor: string) {
  if (!config.modelCallsEnabled) throw new Conflict("Model calls are disabled; enable them before requesting a draft.");
  return sql.begin(async (tx) => {
    const [story] = await tx`SELECT id FROM stories WHERE id = ${storyId} AND merged_into IS NULL FOR UPDATE`;
    if (!story || !(await digestReports(tx, [storyId])).length) throw new Conflict("This story has no current public evidence.");
    const [active] = await tx`SELECT id FROM editorial_reviews WHERE kind = 'story-depth' AND subject_id = ${String(storyId)} AND status IN ('queued', 'pending', 'failed')`;
    if (active) throw new Conflict("Review or reject the existing draft before requesting another.");
    const [row] = await tx<{ id: number }[]>`INSERT INTO editorial_reviews (kind, subject_id, status, requested_by)
      VALUES ('story-depth', ${String(storyId)}, 'queued', ${actor}) RETURNING id`;
    const id = Number(row!.id);
    await enqueueOn(depthQueue, { reviewId: id }, {}, tx);
    await audit(actor, "review.request", `story:${storyId}`, null, null, { reviewId: id }, { db: tx });
    return { id };
  });
}

export async function reviewDepth(id: number, version: number, command: "save" | "publish" | "reject", input: unknown, note: string, actor: string) {
  return sql.begin(async (tx) => {
    const [row] = await tx<{ subject_id: string; status: string; version: number; draft: StoryDepth | null; evidence: Evidence[] }[]>`
      SELECT subject_id, status, version, draft, evidence FROM editorial_reviews WHERE id = ${id} AND kind = 'story-depth' FOR UPDATE`;
    if (!row || row.version !== version || !["pending", "failed", "queued"].includes(row.status)) throw new Conflict("This review changed. Reload before editing.");
    if (command !== "reject" && row.status !== "pending") throw new Conflict("Wait for a draft before editing or publishing.");
    if (command === "publish" && !note.trim()) throw Object.assign(new Error("Describe the facts and judgment you checked before publishing."), { statusCode: 400 });
    const content = command === "reject" ? row.draft : validateDepth(input, row.evidence);
    if (command === "publish") {
      const [story] = await tx`SELECT id FROM stories WHERE id = ${Number(row.subject_id)} AND merged_into IS NULL FOR UPDATE`;
      if (!story || !evidenceCurrent(row.evidence, await digestReports(tx, [Number(row.subject_id)]))) throw new Conflict("Evidence changed. Reject this draft and request a new one.");
      await tx`UPDATE editorial_reviews SET status = 'superseded', updated_at = now() WHERE kind = 'story-depth' AND subject_id = ${row.subject_id} AND status = 'published'`;
    }
    const status = command === "publish" ? "published" : command === "reject" ? "rejected" : "pending";
    await tx`UPDATE editorial_reviews SET draft = ${content ? tx.json(content as never) : null}, status = ${status}, version = version + 1,
      reviewed_by = ${actor}, review_note = ${note}, updated_at = now(), published_at = ${command === "publish" ? new Date() : null} WHERE id = ${id}`;
    await audit(actor, `review.${command}`, `story:${row.subject_id}`, note, { reviewId: id, draft: row.draft }, { reviewId: id, draft: content, status }, { db: tx });
    return { ok: true };
  });
}

export async function reviewQueue(search = "", page = 1): Promise<ReviewQueue> {
  const rows = await sql<{ id: number; kind: string; subject_id: string; title: string; public_id: string; status: ReviewEntry["status"]; version: number;
    draft: StoryDepth | null; published: StoryDepth | null; error: string | null; evidence: Evidence[] }[]>`
    SELECT r.*, s.title, s.public_id, p.draft AS published FROM editorial_reviews r
    JOIN stories s ON s.id::text = r.subject_id
    LEFT JOIN editorial_reviews p ON p.kind = r.kind AND p.subject_id = r.subject_id AND p.status = 'published'
    WHERE r.kind = 'story-depth' AND r.status IN ('queued', 'pending', 'failed') ORDER BY r.created_at, r.id`;
  const stories = await sql<{ id: number; publicId: string; title: string; published: boolean }[]>`
    SELECT s.id, s.public_id AS "publicId", s.title, EXISTS(SELECT 1 FROM editorial_reviews r WHERE r.kind = 'story-depth' AND r.subject_id = s.id::text AND r.status = 'published') AS published
    FROM stories s WHERE s.merged_into IS NULL AND (s.title ILIKE ${`%${search}%`} OR s.public_id::text = ${search})
    ORDER BY s.latest_at DESC NULLS LAST, s.id DESC LIMIT 31 OFFSET ${(page - 1) * 30}`;
  return { entries: rows.map((r) => ({ id: Number(r.id), kind: r.kind, subjectId: r.subject_id, title: r.title, publicId: r.public_id,
    status: r.status, version: r.version, draft: r.draft, published: r.published, error: r.error, evidence: r.evidence })),
    stories: stories.slice(0, 30).map((s) => ({ ...s, id: Number(s.id) })), page, hasMore: stories.length > 30 };
}
