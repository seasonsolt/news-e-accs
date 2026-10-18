// A busy decoder is retryable preparation, never a reason to deliver twice or block delivery forever.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "node:http";
import { readdir } from "node:fs/promises";
import path from "node:path";
import type { PgBoss } from "pg-boss";
import sharp from "sharp";

process.env.ALLOW_PRIVATE_NETWORK_FETCH = "true";
const { sql, closeDb } = await import("@aihot/backend/db");
const { config } = await import("@aihot/backend/config");
const { upsertMaterial } = await import("@aihot/backend/content/materials");
const { publishArticle } = await import("@aihot/backend/publication/publish");
const { prepareArticleMedia, warmShareImage } = await import("@aihot/backend/media/prepare");
const { mediaCapacity, MediaBusyError } = await import("@aihot/backend/media/capacity");
const { registerNotifyJobs } = await import("@aihot/backend/jobs/notify");
const { getBoss, stopBoss, QUEUES } = await import("@aihot/backend/jobs/queue");
const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#176b75" } }).png().toBuffer();
const images = createServer((_req, res) => { res.writeHead(200, { "content-type": "image/png" }); res.end(png); });
await new Promise<void>((resolve) => images.listen(0, "127.0.0.1", resolve));
const imageBase = `http://127.0.0.1:${(images.address() as { port: number }).port}`;
const handlers = new Map<string, (jobs: Array<{ data: unknown }>) => Promise<unknown>>();
await registerNotifyJobs({ work: async (name: string, _options: unknown, handler: (jobs: Array<{ data: unknown }>) => Promise<unknown>) => {
  handlers.set(name, handler);
} } as unknown as PgBoss);
const runNotify = (data: unknown) => handlers.get(QUEUES.notifySelected)!([{ data }]);
const leases = async (articleId: string) => Number((await sql`SELECT count(*) AS n FROM delivery_leases WHERE holder = ${articleId}`)[0]!.n);

after(async () => {
  images.closeAllConnections();
  await new Promise<void>((resolve) => images.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

async function fixture() {
  const source = `prewarm-${tag()}`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode,site_fulltext,syndicate_fulltext)
    VALUES(${source},'Prewarm fixture','rss','T1','editorial',true,true)`;
  const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.org/${source}`, title: `Prewarm ${source}`,
    bodyText: "An article with a local picture.", bodyHtml: `<p>An article.</p><img src="${imageBase}/${source}" width="800" height="400">`,
    language: "en", bodyStatus: "ok", via: "fetch", publishedAt: new Date() });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,category,editorial_language,title_zh,summary_zh,reason_zh,score,selected)
    VALUES(${articleId},1,'rule','pass','ai-models','zh',${`预热测试 ${source}`},'测试摘要','测试理由',90,true)`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  return articleId;
}

function occupyDecoders() {
  const gate = Promise.withResolvers<void>();
  const jobs = Array.from({ length: 10 }, (_, i) => mediaCapacity.run(async () => { if (i < 2) await gate.promise; }));
  return async () => { gate.resolve(); await Promise.all(jobs); };
}

test("busy article preparation propagates to the existing bounded queue retry", async () => {
  const articleId = await fixture();
  const release = occupyDecoders();
  try {
    await assert.rejects(prepareArticleMedia(articleId), MediaBusyError);
    await assert.rejects(handlers.get(QUEUES.prepareMedia)!([{ data: { articleId } }]), MediaBusyError);
    await assert.rejects(warmShareImage(articleId), MediaBusyError);
    const queue = await (await getBoss()).getQueue(QUEUES.prepareMedia);
    assert.equal(queue?.retryLimit, 1);
    assert.equal(queue?.retryDelay, 120);
  } finally { await release(); }
  const prepared = await prepareArticleMedia(articleId);
  assert.ok(prepared.renditions > 0);
  assert.equal(prepared.failed, 0);
});

test("share capacity retries happen before delivery and have a finite exhaustion path", async () => {
  const articleId = await fixture();
  const otherArticleId = await fixture();
  const release = occupyDecoders();
  try {
    for (let warmAttempt = 0; warmAttempt < 3; warmAttempt++) {
      const before = new Date();
      assert.deepEqual(await runNotify({ articleId, warmAttempt }), { status: "warming", attempt: warmAttempt + 1 });
      assert.equal(await leases(articleId), 0, "no actual delivery was attempted before share warming");
      const [queued] = await sql<{ id: string; start_after: Date }[]>`SELECT id, start_after FROM pgboss.job
        WHERE name = ${QUEUES.notifySelected} AND data->>'articleId' = ${articleId} AND (data->>'warmAttempt')::int = ${warmAttempt + 1}`;
      assert.ok(queued && queued.start_after.getTime() >= before.getTime() + 4000);
      if (!warmAttempt) {
        assert.deepEqual(await runNotify({ articleId: otherArticleId }), { status: "warming", attempt: 1 });
        const [other] = await sql`SELECT id FROM pgboss.job WHERE name = ${QUEUES.notifySelected}
          AND data->>'articleId' = ${otherArticleId} AND data->>'warmAttempt' = '1'`;
        assert.ok(other, "different articles must retain independent pending preparation retries");
      }
      // The real worker completes each active job before fetching its successor. This callback
      // harness drives attempts directly, so retire the inspected row before the next attempt.
      await sql`UPDATE pgboss.job SET state = 'completed', completed_on = now() WHERE id = ${queued.id}`;
    }
    assert.equal((await runNotify({ articleId, warmAttempt: 3 }) as { status: string }).status, "skipped", "push valve stays off");
    assert.equal(await leases(articleId), 1, "exhausted preparation no longer blocks the initial push phase");
    await runNotify({ articleId, attempt: 1 });
    const [count] = await sql`SELECT count(*) AS n FROM pgboss.job WHERE name = ${QUEUES.notifySelected}
      AND data->>'articleId' = ${articleId} AND data ? 'warmAttempt'`;
    assert.equal(Number(count!.n), 3, "push retries neither restart warming nor add more warm attempts");
  } finally { await release(); }
});

test("a postponed first delivery proceeds after share capacity recovers", async () => {
  const articleId = await fixture();
  const release = occupyDecoders();
  try {
    assert.deepEqual(await runNotify({ articleId }), { status: "warming", attempt: 1 });
    assert.equal(await leases(articleId), 0);
  } finally { await release(); }
  const result = await runNotify({ articleId, warmAttempt: 1 }) as { status: string };
  assert.equal(result.status, "skipped", "no external delivery with the push valve off");
  assert.equal(await leases(articleId), 1);
  assert.ok((await readdir(path.join(config.dataDir, "ogcache"))).some((name) => name.endsWith(".png")));
});
