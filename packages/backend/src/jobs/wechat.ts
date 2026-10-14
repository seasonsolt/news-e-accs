// The 公众号 column's illustrations, found or drawn one at a time as the workbench asks for them, and the 视频号
// edition's voice-over scripts.
import type { PgBoss } from "pg-boss";
import { drawWechatIllustration, findWechatIllustration } from "../newsletter/wechat-illustrations.ts";
import { writeWechatVideoScript } from "../newsletter/wechat-video.ts";
import { QUEUES, work } from "./queue.ts";

export async function registerWechatJobs(boss: PgBoss) {
  await work(boss, QUEUES.illustrate, { localConcurrency: 1, pollingIntervalSeconds: 5 }, (job) => (job.mode === "find" ? findWechatIllustration(job) : drawWechatIllustration(job)));
  await work(boss, QUEUES.videoScript, { localConcurrency: 1, pollingIntervalSeconds: 5 }, writeWechatVideoScript);
}
