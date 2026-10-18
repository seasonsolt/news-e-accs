// API cold misses wait for a bounded worker task. Payloads contain source/card data, never bytes;
// the existing shared data directory carries the result across processes.
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { sql } from "../db.ts";
import { enqueue, ensureQueue, QUEUES } from "../jobs/queue.ts";
import { MediaBusyError } from "./capacity.ts";
import { ImageBudgetExceeded, readPreparedImage, type PreparedImage } from "./cache.ts";
import { ogEtag, posterEtag, readCardPng, wechatCoverEtag, type OgCard, type Poster, type WechatCover } from "./cards.ts";

export type MediaRequest = { kind: "image"; url: string; mode: string } | { kind: "og"; card: OgCard } | { kind: "poster"; poster: Poster } | { kind: "cover"; cover: WechatCover };
export function mediaRequestKey(request: MediaRequest): string {
  if (request.kind === "og") return `og:${ogEtag(request.card)}`;
  if (request.kind === "poster") return `poster:${posterEtag(request.poster)}`;
  if (request.kind === "cover") return `wechat:${wechatCoverEtag(request.cover)}`;
  return `image:${createHash("sha256").update(`${request.mode}|${request.url}`).digest("hex")}`;
}
const queueOf = (request: MediaRequest) => request.kind === "image" ? QUEUES.prepareImage : QUEUES.renderMedia;
const MAX_PENDING = 12;
const WAIT_MS = 30_000;
const inflight = new Map<string, Promise<unknown>>();
export const mediaRequestStats = () => ({ pending: inflight.size });

async function submit(request: MediaRequest, deadline: number): Promise<string> {
  const queue = queueOf(request);
  await ensureQueue(queue);
  const key = mediaRequestKey(request);
  return sql.begin(async (tx) => {
    // Requests and processes can arrive together: serialize the count and insert so the queue
    // cannot exceed its bound or duplicate an already active same-key task (short only dedups created).
    await tx`SELECT pg_advisory_xact_lock(hashtextextended('media.render admission', 0))`;
    const [existing] = await tx`SELECT id FROM pgboss.job WHERE name = ${queue}
      AND singleton_key = ${key} AND state <= 'active' LIMIT 1`;
    if (existing) return existing.id as string;
    const [count] = await tx`SELECT count(*) AS n FROM pgboss.job WHERE name IN (${QUEUES.renderMedia}, ${QUEUES.prepareImage}) AND state <= 'active'`;
    if (Number(count!.n) >= MAX_PENDING) throw new MediaBusyError();
    const id = await enqueue(queue, { requestJson: JSON.stringify(request), deadline }, { singletonKey: key }, tx);
    if (!id) throw new MediaBusyError();
    return id;
  }) as Promise<string>;
}

async function prepare<T>(request: MediaRequest, read: () => Promise<T | null>): Promise<T> {
  const deadline = Date.now() + WAIT_MS;
  const id = await submit(request, deadline);
  while (Date.now() < deadline) {
    const [job] = await sql`SELECT state, output FROM pgboss.job WHERE name = ${queueOf(request)} AND id = ${id}`;
    if (!job) throw new MediaBusyError();
    if (job.state === "completed") {
      if (job.output?.status === "budget") throw new ImageBudgetExceeded();
      if (job.output?.status === "unavailable") throw new Error("worker could not prepare the image");
      if (job.output?.status !== "ready") throw new MediaBusyError();
      const value = await read();
      if (value === null) throw new Error("worker output is missing");
      return value;
    }
    if (job.state === "failed" || job.state === "cancelled") throw new MediaBusyError();
    await delay(250);
  }
  throw new MediaBusyError();
}

async function prepared<T>(request: MediaRequest, read: () => Promise<T | null>): Promise<T> {
  const cached = await read();
  if (cached !== null) return cached;
  const key = mediaRequestKey(request);
  let job = inflight.get(key);
  if (!job) {
    if (inflight.size >= MAX_PENDING) throw new MediaBusyError();
    job = prepare(request, read).finally(() => inflight.delete(key));
    inflight.set(key, job);
  }
  return job as Promise<T>;
}

export const requestImage = (url: string, mode: string): Promise<PreparedImage> =>
  prepared({ kind: "image", url, mode }, () => readPreparedImage(url, mode));
export const requestOg = (card: OgCard): Promise<Buffer> =>
  prepared({ kind: "og", card }, () => readCardPng(ogEtag(card)));
export const requestPoster = (poster: Poster): Promise<Buffer> =>
  prepared({ kind: "poster", poster }, () => readCardPng(`poster-${posterEtag(poster)}`));

export const requestWechatCover = (cover: WechatCover): Promise<Buffer> =>
  prepared({ kind: "cover", cover }, () => readCardPng(`wechat-${wechatCoverEtag(cover)}`));
