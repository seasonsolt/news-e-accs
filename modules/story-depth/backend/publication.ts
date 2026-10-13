import { sql, type Db } from "@aihot/backend/db";
import { digestReports } from "@aihot/backend/publication/story-evidence";
import { evidenceCurrent, type Evidence } from "./evidence.ts";
import type { PublishedDepth, StoryDepth } from "../contracts.ts";

export async function publishedDepth(storyId: number, db: Db = sql): Promise<PublishedDepth | null> {
  const [row] = await db<{ draft: StoryDepth; evidence: Evidence[]; published_at: Date }[]>`
    SELECT r.draft, r.evidence, r.published_at FROM editorial_reviews r
    JOIN stories s ON s.id::text = r.subject_id
    WHERE r.kind = 'story-depth' AND r.subject_id = ${String(storyId)} AND r.status = 'published' AND s.merged_into IS NULL`;
  if (!row || !evidenceCurrent(row.evidence, await digestReports(db, [storyId]))) return null;
  return { content: row.draft, publishedAt: row.published_at.toISOString(), sources: row.evidence.map((e) => ({ id: e.id, name: e.source })) };
}
