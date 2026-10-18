// Independent API/worker processes: codecs are forbidden in the API, including on cold requests.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { fork, type ChildProcess } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import sharp from "sharp";
import { sql, closeDb } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { enqueue, stopBoss, QUEUES } from "@aihot/backend/jobs/queue";
import { ogEtag, readCardPng } from "@aihot/backend/media/cards";
import { proxiedImage } from "@aihot/backend/media/imgproxy";

const children = new Set<ChildProcess>();
const dir = await mkdtemp(path.join(tmpdir(), "media-processes-"));
const moduleUrl = (file: string) => JSON.stringify(new URL(`../${file}`, import.meta.url).href);
const png = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#176b75" } }).png().toBuffer();
let hits = 0;
const slow = Promise.withResolvers<void>();
let slowCount = 0;
const source = createServer(async (req, res) => {
  hits++;
  if (req.url?.startsWith("/slow")) { slowCount++; await slow.promise; }
  res.writeHead(200, { "content-type": "image/png" }); res.end(png);
});
await new Promise<void>((resolve) => source.listen(0, "127.0.0.1", resolve));
const original = `http://127.0.0.1:${(source.address() as { port: number }).port}/picture`;

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const ended = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 10_000);
  try { await ended; } finally { clearTimeout(timeout); children.delete(child); }
}
after(async () => {
  slow.resolve();
  await Promise.all([...children].map(stop));
  source.closeAllConnections();
  await new Promise<void>((resolve) => source.close(() => resolve()));
  await stopBoss();
  await closeDb();
});

async function start(role: "api" | "worker") {
  const code = `
    import { registerHooks } from 'node:module';
    ${role === "api" ? `registerHooks({ resolve(spec, ctx, next) {
      if (['sharp','satori'].includes(spec)) throw new Error('codec imported by API: '+spec);
      return next(spec, ctx);
    }});` : ""}
    const { sql, closeDb } = await import(${moduleUrl("packages/backend/src/db.ts")});
    const { getBoss, stopBoss } = await import(${moduleUrl("packages/backend/src/jobs/queue.ts")});
    const sample = () => ({ ...process.memoryUsage(),
      nativeCodec: process.report.getReport().sharedObjects.some(s => /vips|sharp/i.test(s)) });
    let app;
    ${role === "api" ? `
      const { installModules } = await import(${moduleUrl("packages/backend/src/modules.ts")});
      const { SERVER_MODULES } = await import(${moduleUrl("site/modules/server.ts")});
      installModules(SERVER_MODULES);
      app = await (await import(${moduleUrl("apps/api/src/app.ts")})).buildApp();
      await app.listen({ host:'127.0.0.1', port:0 });
    ` : `await (await import(${moduleUrl("packages/backend/src/jobs/media.ts")})).registerMediaJobs(await getBoss());`}
    process.on('message', async message => {
      if (message === 'cover') {
        const { requestWechatCover } = await import(${moduleUrl("packages/backend/src/media/request.ts")});
        const { WECHAT_THEMES } = await import(${moduleUrl("packages/backend/src/newsletter/wechat.ts")});
        const png = await requestWechatCover({date:'2026-10-18',issueNumber:1,headline:'Worker cover',theme:Object.keys(WECHAT_THEMES)[0]});
        process.send({cover:[png.readUInt32BE(16),png.readUInt32BE(20)]});
      }
      if (message === 'sample') { global.gc(); await new Promise(r => setTimeout(r, 20)); global.gc(); process.send({sample: sample()}); }
    });
    process.on('SIGTERM', async () => { if (app) await app.close(); await stopBoss(); await closeDb(); process.exit(0); });
    process.send({ready:true,port:app?.server.address().port,sample:sample()});
  `;
  const file = path.join(dir, `${role}-${tag()}.mjs`);
  await writeFile(file, code);
  const env: NodeJS.ProcessEnv = { ...process.env, COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false", ALLOW_PRIVATE_NETWORK_FETCH: "true", AIHOT_CREDENTIALS_DIR: "/nonexistent-test-credentials" };
  delete env.NODE_TEST_CONTEXT;
  const child = fork(file, [], { env, execArgv: ["--expose-gc"], stdio: ["ignore", "pipe", "pipe", "ipc"] });
  children.add(child);
  let output = "";
  child.stdout?.on("data", (chunk) => { output += chunk; });
  child.stderr?.on("data", (chunk) => { output += chunk; });
  const ready = await new Promise<{ port?: number; sample: { rss: number; nativeCodec: boolean } }>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${role} startup timeout: ${output}`)), 20_000);
    child.once("exit", (code) => { clearTimeout(timeout); reject(new Error(`${role} exited ${code}: ${output}`)); });
    child.once("message", (message: { ready?: boolean; port?: number; sample: { rss: number; nativeCodec: boolean } }) => {
      clearTimeout(timeout); resolve(message);
    });
  });
  return { child, url: `http://127.0.0.1:${ready.port}`, sample: ready.sample };
}

async function sample(child: ChildProcess): Promise<{ rss: number; nativeCodec: boolean }> {
  return new Promise((resolve) => { child.once("message", (message: { sample: { rss: number; nativeCodec: boolean } }) => resolve(message.sample)); child.send("sample"); });
}

async function waitFor(read: () => Promise<boolean>) {
  for (let i = 0; i < 100; i++) { if (await read()) return; await delay(50); }
  throw new Error("media queue did not reach its expected state");
}

test("cold media runs in another process; cache reads survive worker loss and global admission is bounded", async (t) => {
  const worker = await start("worker");
  const api = await start("api");
  const api2 = await start("api");
  assert.equal(api.sample.nativeCodec, false);
  const coldStarted = performance.now();
  const site = await Promise.all([api.url, api2.url, api.url].map((base) => fetch(`${base}/og/site.png`)));
  for (const response of site) assert.equal(response.status, 200);
  const coldMs = Math.round(performance.now() - coldStarted);
  assert.equal(Number((await sql`SELECT count(*) AS n FROM pgboss.job WHERE name = 'media.render'`)[0]!.n), 1,
    "two API processes share the same created/active cold-card task");
  const siteBytes = await site[0]!.arrayBuffer();
  assert.deepEqual(await site[1]!.arrayBuffer(), siteBytes);
  assert.deepEqual(await site[2]!.arrayBuffer(), siteBytes);
  assert.equal((await fetch(`${api.url}/og/site.png`, { headers: { "if-none-match": site[0]!.headers.get("etag")! } })).status, 304);
  const imagePath = proxiedImage(original, "card")!;
  const image = await fetch(api.url + imagePath);
  assert.equal(image.status, 200);
  await image.arrayBuffer();
  assert.equal(hits, 1);
  const id = `worker-${tag()}`;
  await sql`INSERT INTO sources(id,name,kind,tier,participation_mode) VALUES(${id},'Worker','rss','T1','editorial')`;
  const { articleId } = await upsertMaterial({ sourceId: id, url: `https://example.org/${id}`, title: id, via: "fetch", publishedAt: new Date() });
  await sql`INSERT INTO analyses(article_id,input_revision,origin,relevance,editorial_language,title_zh,summary_zh,score,selected)
    VALUES(${articleId},1,'rule','pass','zh','跨进程海报','测试摘要',90,true)`;
  await publishArticle(articleId, { releasedAt: new Date(Date.now() - 60_000) });
  const poster = await fetch(`${api.url}/og/posters/${articleId}.png?lang=zh`);
  assert.equal(poster.status, 200);
  const posterBytes = Buffer.from(await poster.arrayBuffer());
  assert.deepEqual([posterBytes.readUInt32BE(16), posterBytes.readUInt32BE(20)], [1080, 1440]);
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${articleId}`;
  assert.equal((await fetch(`${api.url}/og/posters/${articleId}.png?lang=zh`)).status, 404);
  const before = Number((await sql`SELECT count(*) AS n FROM pgboss.job WHERE name IN ('media.render','media.image')`)[0]!.n);
  const invalid = new URL(imagePath, api.url); invalid.searchParams.set("sig", "bad");
  assert.equal((await fetch(invalid)).status, 403);
  assert.equal(Number((await sql`SELECT count(*) AS n FROM pgboss.job WHERE name IN ('media.render','media.image')`)[0]!.n), before);
  const slowRequests = ["/slow1", "/slow2"].map((path) => fetch(api.url + proxiedImage(original.replace("/picture", path), "card")!));
  try {
    await waitFor(async () => slowCount === 2);
    assert.equal((await fetch(`${api.url}/og/site.png?lang=zh`)).status, 200,
      "two held image downloads cannot occupy the share-card consumers");
  } finally { slow.resolve(); }
  for (const response of await Promise.all(slowRequests)) { assert.equal(response.status, 200); await response.arrayBuffer(); }
  const cover = await new Promise<{cover: number[]}>((resolve) => { api.child.once("message", (message: {cover: number[]}) => resolve(message)); api.child.send("cover"); });
  assert.deepEqual(cover.cover, [1175, 500], "the admin cover coordinator also renders in worker");
  const apiMemory = await sample(api.child);
  const workerMemory = await sample(worker.child);
  assert.equal(apiMemory.nativeCodec, false, "cold image/OG/poster requests must never load a codec in API");
  assert.equal(workerMemory.nativeCodec, true, "the actual native renderer must have run in worker");
  t.diagnostic(`API RSS before/after cold requests: ${api.sample.rss}/${apiMemory.rss}; worker RSS ${workerMemory.rss}; API codecs absent`);
  const stale = { kicker: "expired", title: "No stale rendering" };
  const staleId = await enqueue(QUEUES.renderMedia, { requestJson: JSON.stringify({ kind: "og", card: stale }), deadline: Date.now() - 1 });
  await waitFor(async () => (await sql`SELECT state FROM pgboss.job WHERE id = ${staleId}`)[0]?.state === "completed");
  assert.deepEqual((await sql`SELECT output FROM pgboss.job WHERE id = ${staleId}`)[0]!.output, { status: "busy" });
  assert.equal(await readCardPng(ogEtag(stale)), null, "expired work is skipped without rendering");
  t.diagnostic(`first cold site card ${coldMs}ms (includes queue, codec/font startup and rendering)`);
  await stop(worker.child);
  assert.equal((await fetch(api.url + imagePath)).status, 200);
  assert.equal((await fetch(`${api.url}/og/site.png`)).status, 200);
  const paths = ["all", "hot", "daily", "weekly", "monthly", "topics", "about", "terms", "privacy", "chronicle", "changelog", "feedback", "agent"];
  const statuses: number[] = [];
  const requests = paths.map((page, i) => fetch(`${i % 2 ? api2.url : api.url}/og/pages/${page}.png`).then(async (response) => {
    await response.arrayBuffer(); statuses.push(response.status); return response;
  }));
  await waitFor(async () => Number((await sql`SELECT count(*) AS n FROM pgboss.job WHERE name='media.render' AND state <= 'active'`)[0]!.n) === 12 && statuses.length === 1);
  assert.deepEqual(statuses, [503], "the thirteenth unique request is refused across both API processes");
  const recovered = await start("worker");
  const responses = await Promise.all(requests);
  assert.equal(responses.filter((r) => r.status === 200).length, 12);
  const busy = responses.find((r) => r.status === 503)!;
  assert.equal(busy.headers.get("cache-control"), "no-store");
  assert.equal(busy.headers.get("retry-after"), "5");
  assert.equal((await sample(api2.child)).nativeCodec, false);
  await stop(recovered.child);
});
