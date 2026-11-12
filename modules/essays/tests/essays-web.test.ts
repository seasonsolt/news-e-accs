// The essays' public pages through the production web build (npm run build -w @aihot/web) in front of the
// real api: both editions of an essay, the index, a withdrawn and an unknown essay, and the ways in from
// the front page and the manifesto.
import "../../../tests/setup.ts";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { closeDb, sql } from "@aihot/backend/db";
import { installModules } from "@aihot/backend/modules";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { buildApp } from "../../../apps/api/src/app.ts";
import { startWebServer, type WebServer } from "../../../apps/web/tests/web-server.ts";
import essays from "../server.ts";
import type { PublishedCover, PublishedEdition } from "../backend/store.ts";

process.env.COLLECT_ENABLED = "false";
process.env.MODEL_CALLS_ENABLED = "false";
installModules([essays]);
const app = await buildApp();
let web: WebServer;

const SLUG = "machines-that-learn";
const editions: Record<"en" | "zh", PublishedEdition> = {
  en: {
    title: "Machines That Learn to Learn", dek: "Why the curve bends upward.", description: "An essay on recursive improvement and what it asks of us.",
    html: `<p>The first paragraph of the English edition.</p><h2>The curve</h2><p class="essay-thesis">Acceleration is the default.</p><figure class="essay-figure"><img src="/essays/media/figure.jpg" width="1280" height="720" alt="A curve"><figcaption>Image: <a href="https://example.org/chart" rel="noopener">example.org</a></figcaption></figure>`,
    wordCount: 1234,
  },
  zh: {
    title: "学会学习的机器", dek: "曲线为什么向上弯。", description: "一篇关于递归改进的长文。",
    html: "<p>中文版的第一段。</p><h2>曲线</h2>",
    wordCount: 2345,
  },
};
const cover: PublishedCover = { file: "cover.jpg", width: 1280, height: 800, alt: { en: "A monolith at dawn", zh: "黎明的方碑" }, credit: "https://example.org/photo", card: "card.jpg" };

async function publication(slug: string, status: "live" | "withdrawn", publishedAt: string, firstPublishedAt = publishedAt) {
  const [essay] = await sql<{ id: number }[]>`INSERT INTO essays (slug, status, style, created_by) VALUES (${slug}, ${status === "live" ? "published" : "withdrawn"}, 'plain', 'test') RETURNING id`;
  await sql`INSERT INTO essay_publications (essay_id, slug, status, editions, cover, files, first_published_at, published_at, published_by)
    VALUES (${essay!.id}, ${slug}, ${status}, ${sql.json(editions as never)}, ${sql.json(cover as never)}, ${["cover.jpg", "card.jpg", "figure.jpg"]}, ${firstPublishedAt}, ${publishedAt}, 'test')`;
}

before(async () => {
  await app.ready();
  web = await startWebServer(createServer(async (req, res) => {
    // Readers only read: anything but a GET reaching the api from a page load fails the test.
    assert.equal(req.method, "GET", `${req.method} ${req.url}`);
    const response = await app.inject({ method: "GET", url: req.url!, headers: req.headers });
    res.writeHead(response.statusCode, response.headers);
    res.end(response.rawPayload);
  }), { COLLECT_ENABLED: "false", MODEL_CALLS_ENABLED: "false" });
});
after(async () => {
  await web?.stop();
  await app.close();
  await stopBoss();
  installModules([]);
  await closeDb();
});

/** Every JSON-LD node on a page, nested ones included: Google validates each typed object it finds. */
function jsonLdNodes(html: string): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") {
      nodes.push(value as Record<string, unknown>);
      Object.values(value).forEach(walk);
    }
  };
  for (const [, json] of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) walk(JSON.parse(json!));
  return nodes;
}

function filled(node: Record<string, unknown>, fields: string[], label: string) {
  for (const field of fields) {
    const value = node[field];
    assert.ok(value !== undefined && value !== null && value !== "" && !(Array.isArray(value) && value.length === 0), `${label}: ${field} is set`);
  }
}

/** The fields each type this module writes must carry (AGENTS.md, structured data). */
const REQUIRED: Record<string, string[]> = {
  Article: ["headline", "description", "image", "datePublished", "dateModified", "author", "publisher", "mainEntityOfPage", "inLanguage", "wordCount"],
  Person: ["name", "url"],
  Organization: ["name", "url", "logo"],
  BreadcrumbList: ["itemListElement"],
  ItemList: ["itemListElement"],
};

function checkTypedNodes(html: string, label: string) {
  for (const node of jsonLdNodes(html)) {
    const type = node["@type"];
    if (typeof type !== "string") continue;
    if (type === "ListItem") {
      filled(node, ["position"], `${label} ListItem`);
      assert.ok(node.item || node.url, `${label}: a ListItem points at a page`);
      continue;
    }
    assert.ok(REQUIRED[type], `${label}: no unexpected typed object (${type})`);
    filled(node, REQUIRED[type]!, `${label} ${type}`);
  }
}

const canonical = (html: string) => /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
const alternate = (html: string, language: string) => new RegExp(`<link rel="alternate" hrefLang="${language}" href="([^"]+)"`).exec(html)?.[1];

test("the index says when nothing is published yet", async () => {
  const response = await fetch(`${web.origin}/essays`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /No essays published yet\./);
  assert.match(html, /drafted with AI from the author&#x27;s notes|drafted with AI from the author's notes/);
  assert.ok(!jsonLdNodes(html).some((n) => n["@type"] === "ItemList"), "no empty list in the structured data");
  const home = await (await fetch(`${web.origin}/`)).text();
  assert.doesNotMatch(home, /Latest essays/, "the front page leaves the block out");
});

test("an essay reads in both editions, names the other, and describes itself completely", async () => {
  await publication(SLUG, "live", "2026-11-12T08:00:00Z", "2026-11-10T08:00:00Z");
  for (const [prefix, language, edition] of [["", "en", editions.en], ["/zh", "zh-CN", editions.zh]] as const) {
    const path = `${prefix}/essays/${SLUG}`;
    const response = await fetch(`${web.origin}${path}`);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(html.includes(edition.title), `${path}: title`);
    assert.ok(html.includes(edition.html.slice(0, 40)), `${path}: body`);
    assert.match(html, prefix ? /根据作者笔记由 AI 起草，作者修改并审定。/ : /Drafted with AI from the author&#x27;s notes; edited and approved by the author\.|Drafted with AI from the author's notes; edited and approved by the author\./, `${path}: disclosure`);
    assert.ok(html.includes(`href="/about"`) || html.includes(`href="/zh/about"`), `${path}: the author links to the about page`);
    assert.match(html, prefix ? /更新于/ : /Updated/, `${path}: a later publication shows its date`);
    assert.ok(html.includes(`href="${prefix ? "" : "/zh"}/essays/${SLUG}"`), `${path}: links the other edition`);
    assert.doesNotMatch(html, /name="robots" content="noindex/);

    assert.equal(canonical(html), `${web.origin}${path}`, `${path}: canonical`);
    assert.equal(alternate(html, "en"), `${web.origin}/essays/${SLUG}`, `${path}: hreflang en`);
    assert.equal(alternate(html, "zh-CN"), `${web.origin}/zh/essays/${SLUG}`, `${path}: hreflang zh-CN`);
    assert.match(html, /property="og:type" content="article"/);
    assert.ok(html.includes(`property="og:image" content="${web.origin}/essays/media/card.jpg"`), `${path}: the card is the share image`);

    checkTypedNodes(html, path);
    const nodes = jsonLdNodes(html);
    const article = nodes.find((n) => n["@type"] === "Article")!;
    assert.ok(article, `${path}: Article`);
    assert.equal(article.headline, edition.title);
    assert.equal(article.inLanguage, language);
    assert.equal(article.mainEntityOfPage, `${web.origin}${path}`, `${path}: the page is a plain address`);
    assert.equal(article.datePublished, "2026-11-10T08:00:00.000Z");
    assert.equal(article.dateModified, "2026-11-12T08:00:00.000Z");
    assert.equal(article.wordCount, edition.wordCount);
    assert.deepEqual(article.image, [`${web.origin}/essays/media/card.jpg`, `${web.origin}/essays/media/cover.jpg`]);
    assert.equal((article.author as { name: string }).name, "seasonsolt");
    const crumbs = nodes.find((n) => n["@type"] === "BreadcrumbList")!.itemListElement as Array<{ item: string; name: string }>;
    assert.equal(crumbs.at(-1)!.item, `${web.origin}${path}`);
    assert.ok(crumbs.every((c) => c.name && c.item), `${path}: every crumb is named`);
  }
});

test("the index lists the essays and points at them only by address; the front page and the manifesto lead there", async () => {
  for (const prefix of ["", "/zh"]) {
    const response = await fetch(`${web.origin}${prefix}/essays`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(prefix ? editions.zh.title : editions.en.title), `${prefix}: the list names the essay`);
    const feed = prefix ? "/feed/zh/essays.xml" : "/feed/essays.xml";
    assert.ok(html.includes(`href="${feed}"`), `${prefix}: the feed`);
    assert.match(html, /type="application\/rss\+xml"[^>]*essays\.xml|essays\.xml[^>]*type="application\/rss\+xml"/, `${prefix}: the feed in the head`);
    checkTypedNodes(html, `${prefix}/essays`);
    const list = jsonLdNodes(html).find((n) => n["@type"] === "ItemList")!;
    assert.deepEqual(list.itemListElement, [{ "@type": "ListItem", position: 1, url: `${web.origin}${prefix}/essays/${SLUG}` }]);
    assert.equal(alternate(html, "zh-CN"), `${web.origin}/zh/essays`);
  }
  const home = await (await fetch(`${web.origin}/`)).text();
  assert.match(home, /Latest essays/);
  assert.ok(home.includes(`href="/essays/${SLUG}"`), "the front page links the essay");
  assert.doesNotMatch(await (await fetch(`${web.origin}/?at=2026-09-01`)).text(), /Latest essays/, "not on a past day of the time machine");
  const zhHome = await (await fetch(`${web.origin}/zh`)).text();
  assert.match(zhHome, /最新长文/);
  assert.ok(zhHome.includes(`href="/zh/essays/${SLUG}"`));
  const manifesto = await (await fetch(`${web.origin}/manifesto`)).text();
  assert.ok(manifesto.includes(editions.en.title) && manifesto.includes(`href="/essays/${SLUG}"`), "the manifesto lists the essay");
});

test("a withdrawn essay answers 410 and is kept out of search; an unknown one 404", async () => {
  await publication("taken-down", "withdrawn", "2026-11-01T08:00:00Z");
  for (const prefix of ["", "/zh"]) {
    const response = await fetch(`${web.origin}${prefix}/essays/taken-down`);
    assert.equal(response.status, 410, prefix);
    const html = await response.text();
    assert.match(html, prefix ? /这篇长文已撤下/ : /This essay was withdrawn/);
    assert.match(html, /name="robots" content="noindex/);
    assert.ok(!html.includes(editions.en.title), "nothing of the essay is printed");
    assert.equal(jsonLdNodes(html).length, 0);
  }
  for (const path of ["/essays/no-such-essay", "/zh/essays/no-such-essay", "/essays/Not_A_Slug"]) {
    assert.equal((await fetch(`${web.origin}${path}`)).status, 404, path);
  }
});
