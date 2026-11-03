// Content pushes: newly selected items, and the images they need prepared first.
import type { PgBoss } from "pg-boss";
import { pushSelected } from "../notify/selected.ts";
import { prepareArticleMedia, warmShareImage } from "../media/prepare.ts";
import { convertAnimated, convertAvif } from "../media/images.ts";
import { MediaBusyError } from "../media/capacity.ts";
import { enqueue, QUEUES, work } from "./queue.ts";

const MAX_RETRIES = 6;
const MAX_WARM_RETRIES = 3;

export async function registerNotifyJobs(boss: PgBoss) {
  await work(boss, QUEUES.notifySelected, { localConcurrency: 1, pollingIntervalSeconds: 5 }, async ({ articleId, attempt = 0, warmAttempt = 0 }) => {
    // Delay before the first push when capacity is busy; no delivery has happened on these retries.
    if (!attempt) {
      try {
        await warmShareImage(articleId);
      } catch (error) {
        if (!(error instanceof MediaBusyError)) throw error;
        if (warmAttempt < MAX_WARM_RETRIES) {
          await enqueue(QUEUES.notifySelected, { articleId, warmAttempt: warmAttempt + 1 }, { singletonKey: `selected:${articleId}`, startAfter: error.retryAfter });
          return { status: "warming", attempt: warmAttempt + 1 };
        }
        // A persistent image backlog must not suppress the news indefinitely.
        console.warn(JSON.stringify({ level: "warn", msg: "share image warming capacity retries exhausted", articleId }));
      }
    }
    const outcome = await pushSelected(articleId);
    if (outcome.status === "retry" && attempt < MAX_RETRIES) {
      await enqueue(QUEUES.notifySelected, { articleId, attempt: attempt + 1 }, { singletonKey: `selected:${articleId}`, startAfter: outcome.after });
    }
    return outcome;
  });

  await work(boss, QUEUES.prepareMedia, { localConcurrency: 1, pollingIntervalSeconds: 5 }, async (data) =>
    "articleId" in data ? prepareArticleMedia(data.articleId)
      : data.format === "avif" ? { avifSaved: await convertAvif(data.url, data.mode) }
      : { animatedSaved: await convertAnimated(data.url, data.mode) });
}
