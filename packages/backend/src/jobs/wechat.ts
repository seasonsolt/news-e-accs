// The 公众号 column's illustrations, drawn one at a time as the workbench asks for them, and the 视频号
// edition's voice-over scripts.
import type { PgBoss } from "pg-boss";
import { drawWechatIllustration } from "../newsletter/wechat-illustrations.ts";
import { writeWechatVideoScript } from "../newsletter/wechat-video.ts";
import { QUEUES, work } from "./queue.ts";

export async function registerWechatJobs(boss: PgBoss) {
  await work(boss, QUEUES.illustrate, { localConcurrency: 1, pollingIntervalSeconds: 5 }, drawWechatIllustration);
  await work(boss, QUEUES.videoScript, { localConcurrency: 1, pollingIntervalSeconds: 5 }, writeWechatVideoScript);
}
