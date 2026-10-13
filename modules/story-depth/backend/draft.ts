import { sql } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { recordRun } from "@aihot/backend/jobs/queue";
import { defineQueue } from "@aihot/backend/modules";
import { modelFor } from "@aihot/backend/editorial/models";
import { promptText, promptVersion } from "@aihot/backend/editorial/prompts";
import { chatJson } from "@aihot/backend/providers/llm";
import { completeReceipt } from "@aihot/backend/providers/receipts";
import { digestReports } from "@aihot/backend/publication/story-evidence";
import { DepthSchema, evidenceCurrent, indexPaths, snapshot, validateDepth } from "./evidence.ts";

export const depthQueue = defineQueue<{ reviewId: number }>({
  name: "story-depth.draft",
  options: { retryLimit: 0, expireInSeconds: 600 },
  worker: { batchSize: 1 },
  run: async (jobs) => { for (const job of jobs) await recordRun("story-depth.draft", () => draftDepth(job.reviewId)); },
});

export async function draftDepth(reviewId: number) {
  const [row] = await sql<{ subject_id: string; version: number }[]>`
    SELECT subject_id, version FROM editorial_reviews WHERE id = ${reviewId} AND kind = 'story-depth' AND status = 'queued'`;
  if (!row) return;
  try {
    if (!config.modelCallsEnabled) throw new Error("Model calls are disabled.");
    const storyId = Number(row.subject_id);
    const [story] = await sql<{ title: string }[]>`SELECT title FROM stories WHERE id = ${storyId} AND merged_into IS NULL`;
    if (!story) throw new Error("Story is no longer available.");
    const reports = (await digestReports(sql, [storyId])).sort((a, b) => a.at.getTime() - b.at.getTime()).slice(-40);
    const evidence = snapshot(reports);
    if (!evidence.length) throw new Error("No current public evidence.");
    const curves = indexPaths();
    const response = await chatJson({ model: await modelFor("storyDepth"), purpose: "story_depth", subject: `review:${reviewId}`,
      attemptTag: `review:${reviewId}`, promptVersion: promptVersion("story-depth"), system: promptText("story-depth"),
      user: JSON.stringify({ title: story.title, reports: evidence.map(({ hash: _hash, ...r }) => r), indexLinks: curves }),
      schema: DepthSchema.superRefine((content, ctx) => {
        try { validateDepth(content, evidence); }
        catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); }
      }), temperature: 0.3, maxTokens: 4000 });
    await sql.begin(async (tx) => {
      if (response.receiptId !== null) await completeReceipt(tx, response.receiptId);
      const [current] = await tx`SELECT status, version FROM editorial_reviews WHERE id = ${reviewId} FOR UPDATE`;
      if (!current || current.status !== "queued" || current.version !== row.version) return;
      const [available] = await tx`SELECT id FROM stories WHERE id = ${storyId} AND merged_into IS NULL`;
      if (!available || !evidenceCurrent(evidence, await digestReports(tx, [storyId]))) {
        await tx`UPDATE editorial_reviews SET status = 'failed', error = 'Evidence changed while drafting. Reject and request a new draft.', version = version + 1, updated_at = now() WHERE id = ${reviewId}`;
        return;
      }
      const content = validateDepth(response.data, evidence);
      await tx`UPDATE editorial_reviews SET status = 'pending', draft = ${tx.json(content as never)}, evidence = ${tx.json(evidence as never)},
        receipt_id = ${response.receiptId}, error = NULL, version = version + 1, updated_at = now() WHERE id = ${reviewId}`;
    });
  } catch (error) {
    await sql`UPDATE editorial_reviews SET status = 'failed', error = 'Drafting failed. Check the worker run and provider receipt, then reject and request again.',
      version = version + 1, updated_at = now() WHERE id = ${reviewId} AND status = 'queued' AND version = ${row.version}`;
    throw error;
  }
}
