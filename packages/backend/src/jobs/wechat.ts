// The 公众号 column's illustrations, drawn one at a time as the workbench asks for them.
import type { PgBoss } from "pg-boss";
import { drawWechatIllustration } from "../newsletter/wechat-illustrations.ts";
import { QUEUES, work } from "./queue.ts";

export async function registerWechatJobs(boss: PgBoss) {
  await work(boss, QUEUES.illustrate, { localConcurrency: 1, pollingIntervalSeconds: 5 }, drawWechatIllustration);
}
