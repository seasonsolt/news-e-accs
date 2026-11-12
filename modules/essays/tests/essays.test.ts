import { stub, pointModels } from "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import sharp from "sharp";
import { sql, closeDb } from "@aihot/backend/db";
import { config } from "@aihot/backend/config";
import { installModules } from "@aihot/backend/modules";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { dailyIssueMail } from "@aihot/backend/newsletter/mail";
import { letterFeatures } from "@aihot/backend/newsletter/reading";
import { buildApp } from "../../../apps/api/src/app.ts";
import essaysModule from "../server.ts";
import { runEssayTask } from "../backend/tasks.ts";
import { renderBody, sections } from "../backend/render.ts";
import { loadDiscoveryEntries } from "@aihot/backend/publication/sitemap";
import { essayLlmsLines, essaySitemapEntries } from "../backend/publication.ts";
import type { EssayDetail, EssayEdition, EssayList, PublicEssay, PublicEssayList } from "../contracts.ts";

for (const step of ["OUTLINE", "DRAFT", "REVISE", "LOCALIZE"]) process.env[`ESSAY_${step}_MODEL`] = "deepseek-flash";
installModules([essaysModule]);
const app = await buildApp();
const headers = { "x-csrf-token": "dev" };

const BODY = `The opening argues that wheat domesticated us as much as we domesticated it.

## The wheat bargain
!! Every tool that feeds us also reshapes us.
Farmers gave up foraging for granaries, and the granaries [[check: date of the first granaries]] changed who they were. See [the manifesto](/manifesto).

[[figure-1]]

## What follows
We should expect the same bargain with machines.`;

const answers: Record<string, unknown> = {
  outline: { thesis: "Humans and AI co-evolve.", titles: ["The Wheat Bargain", "Domesticated Twice", "Who Tamed Whom"],
    sections: [{ heading: "The wheat bargain", points: ["granaries changed farmers"], fragments: [1] }, { heading: "What follows", points: ["machines next"], fragments: [2] }],
    gaps: ["Which machine shows this best?"] },
  draft: { title: "The Wheat Bargain", dek: "We domesticated wheat; it domesticated us back.", description: "Why the human–AI relationship looks like the one between farmers and wheat.",
    body: BODY, images: [{ slot: "cover", prompt: "A wheat field at dawn", alt: "Wheat at dawn" }, { slot: "figure-1", prompt: "An ancient granary", alt: "A granary" }] },
  localize: { title: "小麦的交易", dek: "我们驯化了小麦，小麦也驯化了我们。", description: "人与 AI 的关系，像农民与小麦。",
    body: BODY.replace("The opening", "开篇").replace("[[check: date of the first granaries]]", "[[check: 最早粮仓的年代]]"), alt: { cover: "黎明的麦田", "figure-1": "粮仓" } },
  revise: { text: "## The wheat bargain\nA sharper section about granaries.\n\n[[figure-1]]\n" },
};
let mode: keyof typeof answers = "outline";
const bodies: string[] = [];
const provider = await stub(async (_hit, req) => (bodies.push(req.body), { choices: [{ message: { content: JSON.stringify(answers[mode]) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } }));
pointModels(provider.url, ["deepseek-flash"]);

const dataDir = config.dataDir;
before(async () => { config.dataDir = await mkdtemp(path.join(tmpdir(), "essays-")); });
after(async () => {
  await rm(config.dataDir, { recursive: true, force: true });
  config.dataDir = dataDir;
  config.codexBin = null;
  await app.close(); await stopBoss(); await provider.close(); installModules([]); await closeDb();
});

async function call<T>(method: "GET" | "POST" | "DELETE", url: string, payload?: unknown, expect = 200): Promise<T> {
  const response = await app.inject({ method, url, headers, payload: payload as never });
  assert.equal(response.statusCode, expect, `${method} ${url}: ${response.body}`);
  return response.json<T>();
}

/** Runs the task the desk just queued, as the worker does. */
async function work(detail: EssayDetail) {
  const task = detail.tasks.find((t) => t.status === "queued");
  assert.ok(task, "a task was queued");
  try {
    await runEssayTask(task.id);
  } catch {
    // A failed task is recorded on the desk; the test reads it there.
  }
  return call<EssayDetail>("GET", `/api/admin/essays/${detail.id}`);
}

const png = (width: number, height: number, background: string) => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer();

test("the body's Markdown subset renders safely, with theses, figures and checks", () => {
  const html = renderBody(`## Head\n!! Big claim\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1)) [y](/manifesto) <img src=x onerror=alert(1)>\n\n[[figure-1]]\n\n[[figure-2]]\n\nA [[check: source?]] claim.`,
    { media: "/m", language: "en", figures: { "figure-1": { file: "a".repeat(32) + ".jpg", width: 10, height: 5, alt: 'A "b"', credit: "https://www.example.org/p" } } });
  assert.doesNotMatch(html, /<script|href="javascript:|onerror/);
  assert.match(html, /<p class="essay-thesis">Big claim<\/p>/);
  assert.match(html, /<a href="\/manifesto">y<\/a>/);
  assert.match(html, /<figure class="essay-figure"><img src="\/m\/a{32}\.jpg" width="10" height="5" alt="A &quot;b&quot;"/);
  assert.match(html, /Image: <a href="https:\/\/www\.example\.org\/p" rel="noopener">example\.org<\/a>/);
  assert.match(html, /class="essay-figure-missing" data-slot="figure-2"/, "a figure without a picture shows as a gap");
  assert.match(html, /<mark class="essay-check">source\?<\/mark>/);
  assert.deepEqual(sections("intro\n## A\na\n## B\nb").map((s) => s.split("\n")[0]), ["intro", "## A", "## B"]);
  assert.equal(sections(BODY).join("\n"), BODY, "sections join back into the body");
});

test("the desk is admin-only and only queues model work; the worker writes outline, draft, Chinese edition and rewrites with receipts", async () => {
  config.devAdmin = null;
  assert.equal((await app.inject("/api/admin/essays")).statusCode, 401);
  config.devAdmin = { displayName: "Essay author" };
  assert.equal((await app.inject({ method: "POST", url: "/api/admin/essays", payload: { fragments: "x" } })).statusCode, 403, "a write needs the CSRF token");

  await call("GET", "/api/admin/essays/999999999", undefined, 404);
  const list = await call<EssayList>("GET", "/api/admin/essays");
  assert.ok(list.styles.some((s) => s.name === "plain" && s.hash), "the default style is offered");
  await call("POST", "/api/admin/essays", { fragments: "x", style: "nope" }, 400);
  const { id } = await call<{ id: number }>("POST", "/api/admin/essays", { fragments: "Wheat domesticated us.\n\nMachines will too.", refs: ["/manifesto"] });
  let essay = await call<EssayDetail>("GET", `/api/admin/essays/${id}`);
  assert.equal(essay.style, "plain");
  assert.match(essay.problems.join(" "), /临时/);

  const calls = provider.hits();
  config.modelCallsEnabled = false;
  await call("POST", `/api/admin/essays/${id}/tasks`, { version: essay.version, kind: "outline" }, 409);
  config.modelCallsEnabled = true;
  essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/tasks`, { version: essay.version, kind: "outline" });
  assert.equal(provider.hits(), calls, "a request only queues");
  await call("POST", `/api/admin/essays/${id}/tasks`, { version: essay.version, kind: "outline" }, 409);
  await call("POST", `/api/admin/essays/${id}`, { version: essay.version, outline: "mine" }, 409);

  mode = "outline";
  essay = await work(essay);
  assert.match(essay.outline, /^Thesis: Humans and AI co-evolve\./);
  assert.match(essay.outline, /## The wheat bargain\n- granaries changed farmers\n\(fragments 1\)/);
  assert.match(essay.outline, /Questions for the author:\n- Which machine/);
  const [request] = JSON.parse(bodies.at(-1)!).messages as Array<{ content: string }>;
  assert.match(request!.content, /Lead each section with its claim/, "the chosen style is in the system prompt");
  const [outlineRevision] = await sql`SELECT source, style, style_hash, receipt_id FROM essay_revisions WHERE essay_id = ${id} AND part = 'outline'`;
  assert.deepEqual([outlineRevision!.source, outlineRevision!.style, !!outlineRevision!.style_hash], ["outline", "plain", true]);
  const [receipt] = await sql`SELECT status, purpose FROM receipts WHERE id = ${outlineRevision!.receipt_id}`;
  assert.deepEqual([receipt!.status, receipt!.purpose], ["completed", "essay_outline"]);

  await call("POST", `/api/admin/essays/${id}`, { version: essay.version - 1, fragments: "stale" }, 409);
  mode = "draft";
  essay = await work(await call<EssayDetail>("POST", `/api/admin/essays/${id}/tasks`, { version: essay.version, kind: "draft" }));
  assert.equal(essay.editions.en.title, "The Wheat Bargain");
  assert.equal(essay.slug, "the-wheat-bargain", "the slug follows the first title");
  assert.deepEqual(essay.images.map((i) => [i.slot, i.prompt, i.alt.en]), [["cover", "A wheat field at dawn", "Wheat at dawn"], ["figure-1", "An ancient granary", "A granary"]]);

  // A Chinese edition that drops a figure is refused, and the desk says why.
  mode = "localize";
  const keep = answers.localize;
  answers.localize = { ...(keep as object), body: "开篇。\n\n## 小麦\n没有图。" + "很长的正文。".repeat(30) };
  essay = await work(await call<EssayDetail>("POST", `/api/admin/essays/${id}/tasks`, { version: essay.version, kind: "localize" }));
  assert.equal(essay.editions.zh.body, "");
  assert.ok(essay.tasks.some((t) => t.kind === "localize" && t.status === "failed"), "the failed task shows on the desk");
  answers.localize = keep;
  essay = await work(await call<EssayDetail>("POST", `/api/admin/essays/${id}/tasks`, { version: essay.version, kind: "localize" }));
  assert.equal(essay.editions.zh.title, "小麦的交易");
  assert.deepEqual(essay.images.map((i) => i.alt.zh), ["黎明的麦田", "粮仓"]);

  mode = "revise";
  essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/tasks`, { version: essay.version, kind: "revise", language: "en", section: 1, instruction: "Sharper." });
  essay = await work(essay);
  const proposal = essay.tasks.find((t) => t.kind === "revise" && t.status === "done")!;
  assert.equal(proposal.result!.base, sections(BODY)[1]);
  assert.equal(essay.editions.en.body, BODY, "a rewrite waits for the author");
  await call("POST", `/api/admin/essays/${id}/tasks/${proposal.id}`, { command: "accept", version: essay.version - 1 }, 409);
  essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/tasks/${proposal.id}`, { command: "accept", version: essay.version });
  assert.match(essay.editions.en.body, /A sharper section about granaries\.\n\n\[\[figure-1\]\]\n\n## What follows/);
  assert.match(essay.editions.en.body, /^The opening argues/);
  await call("POST", `/api/admin/essays/${id}/tasks/${proposal.id}`, { command: "discard" }, 409);

  const sources = (await sql<{ source: string }[]>`SELECT source FROM essay_revisions WHERE essay_id = ${id} ORDER BY id`).map((r) => r.source);
  assert.deepEqual(sources, ["outline", "draft", "localize", "revise"]);
});

test("pictures are found on the web first, drawn or uploaded, and only a live essay's pictures are public", async () => {
  mode = "draft";
  const { id } = await call<{ id: number }>("POST", "/api/admin/essays", { fragments: "Wheat.\n\nMachines." });
  let essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}`, { version: 1, outline: "Thesis: x" });
  essay = await work(await call<EssayDetail>("POST", `/api/admin/essays/${id}/tasks`, { version: essay.version, kind: "draft" }));
  assert.equal(essay.slug, "the-wheat-bargain-2", "a taken slug gets a number");

  const files: Record<string, { type: string; body: Buffer | string }> = {
    "/icon.png": { type: "image/png", body: await png(64, 64, "#000000") },
    "/field.png": { type: "image/png", body: await png(1400, 900, "#c0a040") },
    "/field-page": { type: "text/html", body: `<html><head><meta property="og:image" content="/field.png"></head></html>` },
    "/icon-page": { type: "text/html", body: `<html><head><meta property="og:image" content="/icon.png"></head></html>` },
  };
  const site = http.createServer((req, res) => {
    const file = files[new URL(req.url ?? "/", "http://site").pathname];
    res.writeHead(file ? 200 : 404, { "content-type": file?.type ?? "text/plain" });
    res.end(file?.body ?? "");
  });
  await new Promise<void>((resolve) => site.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(site.address() as { port: number }).port}`;
  // The pages and pictures are served by this test on 127.0.0.1.
  const privateFetch = config.allowPrivateNetworkFetch;
  config.allowPrivateNetworkFetch = true;
  try {
    config.codexBin = null;
    await call("POST", `/api/admin/essays/${id}/tasks`, { kind: "search", slot: "cover" }, 409);
    const search = path.join(config.dataDir, "codex-search");
    const answer = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify({ pages: [`${base}/icon-page`, `${base}/field-page`] }) } });
    await writeFile(search, `#!/bin/sh\ncat > /dev/null\necho '${answer}'\necho '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}'\n`);
    await chmod(search, 0o755);
    config.codexBin = search;
    essay = await work(await call<EssayDetail>("POST", `/api/admin/essays/${id}/tasks`, { kind: "search", slot: "cover" }));
    const cover = essay.images.find((i) => i.slot === "cover")!;
    assert.deepEqual(cover.candidates.map((c) => c.page), [`${base}/field-page`], "icons are passed over");
    assert.equal(cover.file, null, "the author picks a candidate");
    const [searchReceipt] = await sql`SELECT status, service FROM receipts WHERE purpose = 'essay_image_search' ORDER BY id DESC LIMIT 1`;
    assert.deepEqual([searchReceipt!.status, searchReceipt!.service], ["completed", "codex-text"]);
    essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/images/cover`, { choose: cover.candidates[0]!.file });
    const chosen = essay.images.find((i) => i.slot === "cover")!;
    assert.deepEqual([chosen.origin, chosen.credit, chosen.width], ["search", `${base}/field-page`, 1280]);

    const picture = path.join(config.dataDir, "drawn.png");
    await writeFile(picture, await png(1536, 1024, "#4080c0"));
    const draw = path.join(config.dataDir, "codex-draw");
    await writeFile(draw, `#!/bin/sh\ncp "${picture}" ./illustration.png\n`);
    await chmod(draw, 0o755);
    config.codexBin = draw;
    essay = await work(await call<EssayDetail>("POST", `/api/admin/essays/${id}/tasks`, { kind: "draw", slot: "figure-1" }));
    const figure = essay.images.find((i) => i.slot === "figure-1")!;
    assert.deepEqual([figure.origin, figure.credit, figure.width, figure.height], ["drawn", null, 1280, 853]);

    const upload = `data:image/png;base64,${(await png(800, 600, "#208020")).toString("base64")}`;
    essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/images/figure-2`, { image: upload });
    essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/images/figure-2`, { alt: { en: "Green" } });
    assert.deepEqual(essay.images.find((i) => i.slot === "figure-2")!.alt, { en: "Green" });
    essay = await call<EssayDetail>("DELETE", `/api/admin/essays/${id}/images/figure-2`);
    assert.equal(essay.images.some((i) => i.slot === "figure-2"), false);

    const file = essay.images.find((i) => i.slot === "cover")!.file!;
    assert.equal((await app.inject(`/essays/media/${file}`)).statusCode, 404, "a draft's picture is not public");
    assert.equal((await app.inject({ url: `/api/admin/essays/media/${file}`, headers })).statusCode, 200);
  } finally {
    config.codexBin = null;
    config.allowPrivateNetworkFetch = privateFetch;
    await new Promise<void>((resolve) => site.close(() => resolve()));
  }
});

test("publishing needs both editions checked and pictured; the live version is what readers, feeds, the sitemap and the letter see", async () => {
  mode = "draft";
  const { id } = await call<{ id: number }>("POST", "/api/admin/essays", { fragments: "Wheat.\n\nMachines." });
  let essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}`, { version: 1, outline: "Thesis: x" });
  essay = await work(await call<EssayDetail>("POST", `/api/admin/essays/${id}/tasks`, { version: essay.version, kind: "draft" }));
  for (const [slot, color] of [["cover", "#c0a040"], ["figure-1", "#4080c0"]] as const) {
    essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/images/${slot}`, { image: `data:image/png;base64,${(await png(1500, 1000, color)).toString("base64")}` });
  }
  await call("POST", `/api/admin/essays/${id}/publish`, { version: essay.version }, 409);
  assert.match(essay.problems.join(" "), /中文版缺少/);
  assert.match(essay.problems.join(" "), /英文版还有 \[\[check/);

  const clean = (e: EssayEdition) => ({ ...e, body: e.body.replace(/\s*\[\[check:[^\]]*\]\]/g, "") });
  const zh: EssayEdition = { title: "小麦的交易", dek: "我们驯化了小麦。", description: "人与 AI 像农民与小麦。", body: "开篇。\n\n## 小麦\n粮仓。\n\n[[figure-1]]" };
  essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}`, { version: essay.version, slug: "wheat-bargain", editions: { en: clean(essay.editions.en), zh } });
  assert.match(essay.problems.join(" "), /cover 缺少中文替代文字/);
  essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/images/cover`, { alt: { zh: "麦田" } });
  essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/images/figure-1`, { alt: { zh: "粮仓" } });
  assert.deepEqual(essay.problems, []);
  assert.equal((await app.inject("/api/site/essays/wheat-bargain")).statusCode, 404, "nothing is public before publishing");

  essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/publish`, { version: essay.version });
  assert.equal(essay.status, "published");
  assert.equal(essay.slugLocked, true);
  await call("POST", `/api/admin/essays/${id}`, { version: essay.version, slug: "other" }, 409);

  const en = await call<PublicEssay>("GET", "/api/site/essays/wheat-bargain");
  assert.equal(en.title, "The Wheat Bargain");
  assert.equal(en.alternate, "/zh/essays/wheat-bargain");
  assert.match(en.html, /<figure class="essay-figure"><img src="\/essays\/media\/[0-9a-f]{32}\.jpg"/);
  assert.doesNotMatch(en.html, /check/);
  assert.ok(en.wordCount > 30);
  assert.equal(en.author.name, "seasonsolt");
  const zhEssay = await call<PublicEssay>("GET", "/api/site/essays/wheat-bargain?lang=zh");
  assert.deepEqual([zhEssay.title, zhEssay.path, zhEssay.cover.alt], ["小麦的交易", "/zh/essays/wheat-bargain", "麦田"]);
  assert.equal((await app.inject(en.card)).statusCode, 200, "the link-preview picture is public");
  assert.equal((await app.inject(en.cover.src)).statusCode, 200);
  const list = await call<PublicEssayList>("GET", "/api/site/essays");
  assert.ok(list.essays.some((e) => e.slug === "wheat-bargain"));

  // Edits stay private until they are published again; the first date stays.
  essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}`, { version: essay.version, editions: { en: { ...essay.editions.en, title: "The Wheat Bargain, Revisited" } } });
  assert.equal((await call<PublicEssay>("GET", "/api/site/essays/wheat-bargain")).title, "The Wheat Bargain");
  essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/publish`, { version: essay.version });
  const updated = await call<PublicEssay>("GET", "/api/site/essays/wheat-bargain");
  assert.equal(updated.title, "The Wheat Bargain, Revisited");
  assert.equal(updated.publishedAt, en.publishedAt);
  assert.ok(updated.modifiedAt > en.modifiedAt);

  const feed = await app.inject("/feed/essays.xml");
  assert.equal(feed.statusCode, 200);
  assert.match(feed.body, /<title>The Wheat Bargain, Revisited<\/title>/);
  assert.match(feed.body, /src="http[^"]+\/essays\/media\//, "the feed's pictures are absolute");
  assert.match((await app.inject("/feed/zh/essays.xml")).body, /小麦的交易/);
  const sitemap = await essaySitemapEntries();
  const entry = sitemap.find((e) => e.loc === "/essays/wheat-bargain")!;
  assert.equal(entry.lastmod!.toISOString(), updated.modifiedAt, "lastmod is the latest publication");
  assert.ok(sitemap.some((e) => e.loc === "/essays"));
  const discovery = (await loadDiscoveryEntries()).map((e) => e.loc);
  for (const loc of ["/essays", "/zh/essays", "/essays/wheat-bargain", "/zh/essays/wheat-bargain"]) assert.ok(discovery.includes(loc), `${loc} is in the discovery list`);
  assert.match((await essayLlmsLines()).join("\n"), /\[The Wheat Bargain, Revisited\]\(http[^)]+\/essays\/wheat-bargain\)/);

  const features = await letterFeatures("en");
  assert.ok(features.some((f) => f.title === "The Wheat Bargain, Revisited" && f.kicker === "New essay"), "the next letter tells the new essay");
  await sql`INSERT INTO newsletter_language_sends (report_key, language, status, sent_at) VALUES ('2999-01-01', 'en', 'sent', now() + interval '1 minute')`;
  assert.equal((await letterFeatures("en")).length, 0, "once a letter went out after it, it is not told again");
  await sql`DELETE FROM newsletter_language_sends WHERE report_key = '2999-01-01'`;
  const mail = dailyIssueMail({ key: "2026-11-12", sections: [], flashes: [], lead: null, leadItemId: null, metrics: { totalEvents: 0 } } as never, "en", null, features);
  assert.match(mail.html, /NEW ESSAY[\s\S]*The Wheat Bargain, Revisited/);
  assert.match(mail.text, /New essay: The Wheat Bargain, Revisited/);

  essay = await call<EssayDetail>("POST", `/api/admin/essays/${id}/withdraw`, { version: essay.version });
  assert.equal((await app.inject("/api/site/essays/wheat-bargain")).statusCode, 410);
  assert.equal((await app.inject(en.cover.src)).statusCode, 404, "a withdrawn essay's pictures are no longer public");
  assert.equal((await essaySitemapEntries()).some((e) => e.loc === "/essays/wheat-bargain"), false);
  assert.doesNotMatch((await app.inject("/feed/essays.xml")).body, /Wheat Bargain/);
});
