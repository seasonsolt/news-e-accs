// Exercise admission, completion and the same-key successor through a real pg-boss worker.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { sql, closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { mediaCapacity } from "@aihot/backend/media/capacity";
import { registerNotifyJobs } from "@aihot/backend/jobs/notify";
import { enqueue, getBoss, stopBoss, QUEUES } from "@aihot/backend/jobs/queue";

after(async () => { await stopBoss(); await closeDb(); });

async function waitFor<T>(read: () => Promise<T | undefined | null>): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (value != null) return value;
    await delay(25);
  }
  throw new Error("real notify worker did not reach the expected state within 20 seconds");
}

test("a real short-policy worker enqueues a same-key retry while active and executes it after recovery", async (t) => {
  const source = `prewarm-worker-${tag()}`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode)
    VALUES(${source},'Worker prewarm fixture','rss','T1','editorial')`;
  const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.org/${source}`,
    title: `Worker prewarm ${source}`, language: "en", via: "fetch", publishedAt: new Date() });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,editorial_language,title_zh,summary_zh,reason_zh,score,selected)
    VALUES(${articleId},1,'rule','pass','ai-models','zh',${`真实队列预热 ${source}`},'测试摘要','测试理由',90,true)`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  const boss = await getBoss();
  const gate = Promise.withResolvers<void>();
  const decoders = [mediaCapacity.run(() => gate.promise), mediaCapacity.run(() => gate.promise)];
  try {
    const id = await enqueue(QUEUES.notifySelected, { articleId }, { singletonKey: `selected:${articleId}` });
    assert.ok(id);
    assert.equal((await boss.getQueue(QUEUES.notifySelected))?.policy, "short");
    await registerNotifyJobs(boss);
    await waitFor(async () => (await sql`SELECT id FROM pgboss.job WHERE id = ${id} AND state = 'active'`)[0]);
    const parent = await waitFor(async () => (await sql`SELECT started_on, completed_on, output FROM pgboss.job
      WHERE id = ${id} AND state = 'completed'`)[0]);
    assert.deepEqual(parent.output, { status: "warming", attempt: 1 });
    const [retry] = await sql`SELECT id, state, singleton_key, created_on, start_after FROM pgboss.job
      WHERE name = ${QUEUES.notifySelected} AND data->>'articleId' = ${articleId} AND data->>'warmAttempt' = '1'`;
    assert.ok(retry, "the active parent must not block creation of its same-key successor");
    assert.equal(retry.singleton_key, `selected:${articleId}`);
    assert.equal(retry.state, "created");
    assert.ok(retry.created_on >= parent.started_on && retry.created_on <= parent.completed_on,
      "the real handler enqueued the retry before pg-boss completed its active parent");
    assert.ok(retry.start_after.getTime() >= retry.created_on.getTime() + 4900);
    assert.equal(Number((await sql`SELECT count(*) AS n FROM delivery_leases WHERE holder = ${articleId}`)[0]!.n), 0,
      "the congested first attempt must not enter delivery");
    gate.resolve();
    await Promise.all(decoders);
    const completed = await waitFor(async () => (await sql`SELECT started_on, output FROM pgboss.job
      WHERE id = ${retry.id} AND state = 'completed'`)[0]);
    assert.ok(completed.started_on >= parent.completed_on && completed.started_on >= retry.start_after);
    assert.equal(completed.output.status, "skipped", "real delivery still respects the disabled push valve");
    t.diagnostic(`same-key retry created during its active parent; scheduled delay ${retry.start_after.getTime() - retry.created_on.getTime()}ms, execution delay ${completed.started_on.getTime() - retry.created_on.getTime()}ms`);
    assert.equal(Number((await sql`SELECT count(*) AS n FROM pgboss.job
      WHERE name = ${QUEUES.notifySelected} AND data->>'articleId' = ${articleId}`)[0]!.n), 2,
      "capacity recovery completes the successor without another warm retry");
    assert.equal(Number((await sql`SELECT count(*) AS n FROM delivery_leases WHERE holder = ${articleId}`)[0]!.n), 1);
    assert.ok((await readdir(path.join(config.dataDir, "ogcache"))).some((name) => name.endsWith(".png")));
  } finally { gate.resolve(); await Promise.all(decoders); }
});
