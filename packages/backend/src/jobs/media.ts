// All public cold-image decode/render work runs here, including misses requested by the API.
import type { PgBoss } from "pg-boss";
import type { MediaRequest } from "../media/request.ts";
import { produceImage, ImageBudgetExceeded } from "../media/images.ts";
import { renderOg } from "../media/og.ts";
import { renderWechatCover } from "../media/wechat-cover.ts";
import { renderPoster } from "../media/poster.ts";
import { MediaBusyError } from "../media/capacity.ts";
import { logError } from "../lib/log-error.ts";
import { QUEUES, work, type JobData } from "./queue.ts";

export async function registerMediaJobs(boss: PgBoss) {
  const handle = async ({ requestJson, deadline }: JobData["media.render"]) => {
    // JSONB reorders object keys. Keep the original JSON text so existing content-hash cache
    // identities (including nested badge fields) remain identical on both sides of the queue.
    const request = JSON.parse(requestJson) as MediaRequest;
    // Disconnected/timed-out cold requests must not leave a long backlog of expensive stale work.
    if (Date.now() >= deadline) return { status: "busy" };
    try {
      if (request.kind === "image") await produceImage(request.url, request.mode);
      else if (request.kind === "og") await renderOg(request.card);
      else if (request.kind === "poster") await renderPoster(request.poster);
      else await renderWechatCover(request.cover);
      return { status: "ready" };
    } catch (error) {
      if (error instanceof MediaBusyError) return { status: "busy" };
      if (error instanceof ImageBudgetExceeded) return { status: "budget" };
      console.warn(JSON.stringify({ level: "warn", msg: "media worker preparation failed", kind: request.kind, err: logError(error) }));
      return { status: "unavailable" };
    }
  };
  // Download waits cannot occupy the consumers that render cards/posters. Native decode/render
  // work still shares mediaCapacity; the four image consumers also bound retained originals.
  await work(boss, QUEUES.prepareImage, { localConcurrency: 4, pollingIntervalSeconds: 0.5 }, handle);
  await work(boss, QUEUES.renderMedia, { localConcurrency: 2, pollingIntervalSeconds: 0.5 }, handle);
}
