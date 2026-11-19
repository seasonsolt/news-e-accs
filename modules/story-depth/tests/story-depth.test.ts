import { stub, pointModels, tag, gate } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { installModules } from "@aihot/backend/modules";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../../../apps/api/src/app.ts";
import { startWebServer } from "../../../apps/web/tests/web-server.ts";
import depthModule from "../server.ts";
import { depthQueue, draftDepth } from "../backend/draft.ts";
import { publishedDepth } from "../backend/publication.ts";
import { validateDepth } from "../backend/evidence.ts";
import { reviewQueue } from "../backend/review.ts";
import { depthDiff, type StoryDepth, type ReviewQueue } from "../contracts.ts";

process.env.COLLECT_ENABLED = "false";
process.env.STORY_DEPTH_MODEL = "deepseek-flash";
installModules([depthModule]);
const app = await buildApp();
const key = tag();
const source = `depth-${key}`;
let nextAnswer: StoryDepth;
let intercept: (() => Promise<void>) | null = null;
const bodies: string[] = [];
const provider = await stub(async (_hit, req) => {
  bodies.push(req.body);
  if (intercept) await intercept();
  return { choices: [{ message: { content: JSON.stringify(nextAnswer) } }], usage: { prompt_tokens: 100, completion_tokens: 100 } };
});
pointModels(provider.url, ["deepseek-flash"]);
after(async () => { await app.close(); await stopBoss(); await provider.close(); installModules([]); await closeDb(); });

async function fixture() {
  const publicId = randomUUID();
  const [story] = await sql<{ id: number }[]>`INSERT INTO stories (public_id, title, editorial_language, digest) VALUES (${publicId}, 'Acme makes inference cheaper', 'en', 'Acme tested cheaper inference.') RETURNING id`;
  const storyId = Number(story!.id);
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${randomUUID()}, ${storyId}, 'Acme releases Atlas') RETURNING id`;
  const reportId = `report-${randomUUID()}`;
  const text = "Acme reports a 50% cost reduction in its limited test. Analyst Lee calls it promising.";
  await sql`INSERT INTO sources (id, name, kind, tier, config) VALUES (${source}, 'Acme research', 'rss', 'T1', '{}') ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, published_at, timeline_at) VALUES
    (${reportId}, ${source}, ${reportId}, 'https://example.org/report', ${text}, now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour')`;
  await sql`INSERT INTO publications (article_id, source_id, title, summary, url, channel, first_party, published_at, timeline_at, discovered_at, sort_at,
    story_id, fact_id, selected, eligible, visible_after, tags, body_mode, score, visibility, editorial_language)
    VALUES (${reportId}, ${source}, ${text}, ${text}, 'https://example.org/report', 'news', true, now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour', now() - interval '1 hour',
      ${storyId}, ${fact!.id}, true, true, now() - interval '1 hour', '{}', 'summary', 80, 'public', 'en')`;
  await sql`INSERT INTO fact_articles (fact_id, article_id, role, evidence) VALUES (${fact!.id}, ${reportId}, 'report', ${text})`;
  // Two more outlets: an event page stands in search only with a digest and three sources (STORY_INDEX_MIN_SOURCES).
  for (const [n, minutes] of [[2, 50], [3, 40]] as const) {
    const outlet = `${source}-${n}`;
    const otherId = `report-${randomUUID()}`;
    const other = `Acme's limited inference test is covered by outlet ${n}.`;
    const at = sql`now() - make_interval(mins => ${minutes})`;
    await sql`INSERT INTO sources (id, name, kind, tier, config) VALUES (${outlet}, ${`Outlet ${n}`}, 'rss', 'T1', '{}') ON CONFLICT DO NOTHING`;
    await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, published_at, timeline_at) VALUES
      (${otherId}, ${outlet}, ${otherId}, ${`https://example.org/report-${n}`}, ${other}, ${at}, ${at}, ${at})`;
    await sql`INSERT INTO publications (article_id, source_id, title, summary, url, channel, first_party, published_at, timeline_at, discovered_at, sort_at,
      story_id, fact_id, selected, eligible, visible_after, tags, body_mode, score, visibility, editorial_language)
      VALUES (${otherId}, ${outlet}, ${other}, ${other}, ${`https://example.org/report-${n}`}, 'news', true, ${at}, ${at}, ${at}, ${at},
        ${storyId}, ${fact!.id}, false, true, ${at}, '{}', 'summary', 70, 'public', 'en')`;
    await sql`INSERT INTO fact_articles (fact_id, article_id, role, evidence) VALUES (${fact!.id}, ${otherId}, 'report', ${other})`;
  }
  const content: StoryDepth = {
    background: "Acme tested a lower-cost inference method with a limited group of customers.",
    numbers: [{ value: "50%", context: "Acme's reported cost reduction in its limited test.", reportId, quote: "Acme reports a 50% cost reduction in its limited test." }],
    reactions: [{ who: "Analyst Lee", text: "Calls the result promising.", reportId, quote: "Analyst Lee calls it promising." }],
    accelerates: "Lower inference costs could allow more experiments, though the limited test does not establish wider results.",
    curve: { path: "/index/cost-of-intelligence", label: "Cost of intelligence" },
  };
  return { storyId, publicId, reportId, content };
}

const headers = { "x-csrf-token": "dev" };
async function command(id: number, version: number, action: string, content?: StoryDepth, note = "Checked the limited test, source quotes and distinction between results and interpretation.") {
  return app.inject({ method: "POST", url: `/api/admin/review/${id}`, headers, payload: { version, command: action, content, note } });
}
async function request(storyId: number) {
  const response = await app.inject({ method: "POST", url: "/api/admin/review/deepen", headers, payload: { storyId } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().id as number;
}
async function entry(id: number) { return (await reviewQueue()).entries.find((e) => e.id === id)!; }

test("admin-only review, worker drafting, substantive editing, publication and re-draft comparison", async () => {
  const f = await fixture();
  config.devAdmin = null;
  assert.equal((await app.inject("/api/admin/review")).statusCode, 401);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/review/deepen", payload: { storyId: f.storyId } })).statusCode, 401);
  config.devAdmin = { displayName: "Depth reviewer" };
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/review/deepen", payload: { storyId: f.storyId } })).statusCode, 403);
  const calls = provider.hits();
  config.modelCallsEnabled = false;
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/review/deepen", headers, payload: { storyId: f.storyId } })).statusCode, 409);
  config.modelCallsEnabled = true;
  nextAnswer = f.content;
  const id = await request(f.storyId);
  assert.equal(provider.hits(), calls, "admin request only enqueues");
  assert.equal(await publishedDepth(f.storyId), null);
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/review/deepen", headers, payload: { storyId: f.storyId } })).statusCode, 409);
  await depthQueue.run([{ reviewId: id }]);
  assert.equal(provider.hits(), calls + 1);
  assert.ok(bodies.at(-1)!.includes(f.reportId));
  assert.ok(bodies.at(-1)!.includes("limited test"));
  assert.equal(await publishedDepth(f.storyId), null, "pending draft is private");
  const pending = await entry(id);
  assert.equal(pending.status, "pending");
  assert.equal((await app.inject("/api/admin/review")).json<ReviewQueue>().entries.find((e) => e.id === id)!.evidence.length, 3);
  const edited = { ...f.content, accelerates: "This could make repeated experiments affordable; independent testing is still needed." };
  assert.equal((await command(id, pending.version, "save", edited)).statusCode, 200);
  assert.equal((await command(id, pending.version, "publish", edited)).statusCode, 409, "stale editor cannot overwrite saved edits");
  const saved = await entry(id);
  assert.equal((await command(id, saved.version, "publish", edited, "")).statusCode, 400, "review note is required");
  assert.equal((await command(id, saved.version, "publish", edited)).statusCode, 200);
  assert.equal((await publishedDepth(f.storyId))!.content.accelerates, edited.accelerates);
  assert.equal((await sql`SELECT status FROM receipts WHERE purpose = 'story_depth' AND subject = ${`review:${id}`}`)[0]!.status, "completed");
  assert.equal((await sql`SELECT actor FROM audit_log WHERE action = 'review.publish' AND subject = ${`story:${f.storyId}`}`).length, 1);
  await draftDepth(id);
  assert.equal(provider.hits(), calls + 1, "completed job is idempotent");

  nextAnswer = { ...f.content, background: "The revised background remains grounded in Acme's limited customer test." };
  const redraft = await request(f.storyId);
  await draftDepth(redraft);
  const revision = await entry(redraft);
  assert.deepEqual(revision.published, edited);
  assert.ok(depthDiff(revision.published, revision.draft!).some((d) => d.field === "background" && d.before.includes(edited.background)));
  assert.deepEqual((await publishedDepth(f.storyId))!.content, edited, "re-drafting leaves approved content public");
  assert.equal((await command(redraft, revision.version, "reject")).statusCode, 200);
  assert.deepEqual((await publishedDepth(f.storyId))!.content, edited, "rejection preserves published version");

  const replacement = await request(f.storyId);
  await draftDepth(replacement);
  assert.equal((await command(replacement, (await entry(replacement)).version, "publish", nextAnswer)).statusCode, 200);
  assert.equal((await sql`SELECT status FROM editorial_reviews WHERE id = ${id}`)[0]!.status, "superseded");
  const publicResponse = await app.inject(`/api/site/stories/${f.publicId}`);
  assert.equal(publicResponse.statusCode, 200, publicResponse.body);
  assert.equal(publicResponse.json().modules["story-depth"].content.background, nextAnswer.background);

  nextAnswer = { ...f.content, background: "Private pending background for the next editorial review." };
  const privateDraft = await request(f.storyId);
  await draftDepth(privateDraft);
  const beforeReads = provider.hits();
  const web = await startWebServer(createServer(async (req, res) => {
    const response = await app.inject({ method: "GET", url: req.url!, headers: req.headers });
    res.writeHead(response.statusCode, response.headers); res.end(response.rawPayload);
  }), { MODEL_CALLS_ENABLED: "false", COLLECT_ENABLED: "false" });
  try {
    for (const prefix of ["", "/zh"]) {
      const response = await fetch(`${web.origin}${prefix}/story/${f.publicId}`);
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, /In depth/);
      assert.doesNotMatch(html, /Private pending background/);
      assert.match(html, /lang="en"[^>]*aria-labelledby="story-depth-title"/);
      assert.match(html, /Key numbers/);
      assert.ok(html.includes(`/items/${f.reportId}`));
      assert.ok(html.includes("/index/cost-of-intelligence"));
      assert.doesNotMatch(html, /name="robots" content="noindex/);
    }
    config.devAdmin = null;
    const anon = await app.inject(`/api/site/stories/${f.publicId}`);
    assert.deepEqual(anon.json().modules, publicResponse.json().modules, "public content is identical without an admin session");
    const admin = await fetch(`${web.origin}/admin/review`, { redirect: "manual" });
    assert.equal(admin.status, 302);
    config.devAdmin = { displayName: "Depth reviewer" };
    const queuePage = await fetch(`${web.origin}/admin/review`);
    assert.equal(queuePage.status, 200);
    const queueHtml = await queuePage.text();
    assert.match(queueHtml, /选择要做厚的事件/);
    assert.match(queueHtml, /与已发布版本的差异/);
    assert.match(queueHtml, /Private pending background/);
    assert.match(queueHtml, /原文引用/);
  } finally { await web.stop(); }
  assert.equal(provider.hits(), beforeReads, "reading pages never calls a model");
  assert.equal((await command(privateDraft, (await entry(privateDraft)).version, "reject")).statusCode, 200);

  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${f.reportId}`;
  assert.equal(await publishedDepth(f.storyId), null, "withdrawn evidence removes the depth from public reads");
});

test("figures must match complete source numbers, not substrings of a larger number", () => {
  const evidence = [{ id: "source", hash: "unused", title: "Test", source: "Test", text: "Acme reports a 150% increase." }];
  const content: StoryDepth = { background: "Acme reports an increase.", accelerates: "Further testing is needed.", reactions: [], curve: null,
    numbers: [{ value: "50%", context: "The reported increase.", reportId: "source", quote: evidence[0]!.text }] };
  assert.throws(() => validateDepth(content, evidence), /number absent/);
  content.numbers[0]!.value = "150%";
  assert.deepEqual(validateDepth(content, evidence), content);
  content.numbers[0]!.context = "The increase across 42 users.";
  assert.throws(() => validateDepth(content, evidence), /number absent/);
});

test("unsupported figures, changed evidence, model valve and cancellation cannot publish a draft", async () => {
  config.devAdmin = { displayName: "Depth reviewer" };
  config.modelCallsEnabled = true;
  const f = await fixture();
  nextAnswer = { ...f.content, numbers: [{ ...f.content.numbers[0]!, value: "99%" }] };
  const bad = await request(f.storyId);
  await assert.rejects(draftDepth(bad), /figure must appear/);
  assert.equal((await entry(bad)).status, "failed");
  assert.equal(await publishedDepth(f.storyId), null);
  await command(bad, (await entry(bad)).version, "reject");
  nextAnswer = f.content;
  const valid = await request(f.storyId);
  await draftDepth(valid);
  const pending = await entry(valid);
  const invented = { ...f.content, numbers: [{ ...f.content.numbers[0]!, reportId: "different-story" }] };
  assert.equal((await command(valid, pending.version, "publish", invented)).statusCode, 400);
  assert.equal((await command(valid, pending.version, "publish", { ...f.content, curve: { path: "https://evil.example", label: "Bad" } })).statusCode, 400);
  await sql`UPDATE publications SET summary = 'Corrected source text' WHERE article_id = ${f.reportId}`;
  assert.equal((await command(valid, pending.version, "publish", f.content)).statusCode, 409);
  await command(valid, pending.version, "reject");

  const disabled = await request(f.storyId);
  const before = provider.hits();
  config.modelCallsEnabled = false;
  await assert.rejects(draftDepth(disabled), /disabled/);
  assert.equal(provider.hits(), before);
  await command(disabled, (await entry(disabled)).version, "reject");
  config.modelCallsEnabled = true;

  const started = gate(); const release = gate();
  intercept = async () => { started.open(); await release.promise; };
  const cancelled = await request(f.storyId);
  const running = draftDepth(cancelled);
  await started.promise;
  await command(cancelled, (await entry(cancelled)).version, "reject");
  release.open(); await running; intercept = null;
  assert.equal((await sql`SELECT status FROM editorial_reviews WHERE id = ${cancelled}`)[0]!.status, "rejected");
  assert.equal(await publishedDepth(f.storyId), null);

  intercept = async () => {
    await sql`UPDATE publications SET summary = 'Evidence corrected during the model request' WHERE article_id = ${f.reportId}`;
  };
  const changed = await request(f.storyId);
  await draftDepth(changed);
  intercept = null;
  assert.equal((await entry(changed)).status, "failed");
  assert.match((await entry(changed)).error!, /Evidence changed/);
});
