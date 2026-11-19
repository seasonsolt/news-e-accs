// Where search engines' fetches go, specified before the implementation:
// - pages whose own text is only a summary's worth are advertised to Google, which spends its fetches on them;
// - keeping those pages from Google also keeps them from the engines that index them, or from notifications;
// - an article whose event stands in search competes at Google with that event's page (2026-11-09; the event's rule 2026-11-19).
// This site keeps one sitemap (/sitemap.xml, with its own Google News tags), so the upstream's sectioned files,
// news section and topic archive pages do not apply here.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { loadDiscoveryEntries } from "@aihot/backend/publication/sitemap";
import { buildApp } from "../apps/api/src/app.ts";

const app = await buildApp();
after(async () => { await app.close(); await closeDb(); });

const HOUR = 3_600_000;
const now = Date.now();
const ago = (hours: number) => new Date(now - hours * HOUR);
const key = tag();
const source = `focus-${key}`;
const id = (name: string) => `${source}-${name}`;

interface Report {
  at: Date;
  channel?: "news" | "x";
  bodyMode?: "full" | "summary";
  body?: string;
  post?: string;
  article?: string;
  selected?: boolean;
  indexable?: boolean;
  manual?: boolean;
  /** Another outlet than the fixture's own source. */
  outlet?: string;
}

async function report(name: string, r: Report) {
  const article = id(name);
  const from = r.outlet ? `${source}-${r.outlet}` : source;
  const xPost = r.post === undefined ? null : { text: r.post, handle: "fixture", authorName: "Fixture" };
  await sql`INSERT INTO articles (id,source_id,identity_key,url,title,timeline_at,discovered_at,body_status,body_text,body_html,x_post,x_article)
    VALUES (${article},${from},${article},${`https://example.org/${article}`},'Fixture',${r.at},${r.at},${r.body === undefined ? "none" : "ok"},
      ${r.body ?? null},${r.body === undefined ? null : `<p>${r.body}</p>`},${xPost ? sql.json(xPost) : null},${r.article ? sql.json({ text: r.article }) : null})`;
  await sql`INSERT INTO publications (article_id,source_id,title,summary,url,timeline_at,discovered_at,sort_at,selected,eligible,indexable,
      visible_after,channel,category,body_mode,seo_indexed_at)
    VALUES (${article},${from},'公开报道','一段转述原文的摘要。',${`https://example.org/${article}`},${r.at},${r.at},${r.at},${r.selected ?? true},true,
      ${r.indexable ?? true},${r.at},${r.channel ?? "news"},'ai-models',${r.bodyMode ?? (r.body === undefined && !r.article ? "summary" : "full")},
      ${r.manual ? r.at : null})`;
  return article;
}

/** `own`: the members' page names this story as theirs, as publishing does for an article's primary event. */
async function story(members: string[], own = false) {
  const publicId = randomUUID();
  const [st] = await sql<{ id: number }[]>`INSERT INTO stories (public_id,title,latest_at,digest) VALUES (${publicId},'事件',${ago(1)},'综述') RETURNING id`;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id,story_id,title) VALUES (${randomUUID()},${st!.id},'事实') RETURNING id`;
  for (const member of members) await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${member},'primary')`;
  if (own) await sql`UPDATE publications SET story_id = ${st!.id}, fact_id = ${fact!.id} WHERE article_id = ANY(${members})`;
  return publicId;
}

const long = "这是一篇完整的报道正文。".repeat(40);
const ids: Record<string, string> = {};
const stories: Record<string, string> = {};

before(async () => {
  for (const [sid, name] of [[source, "Focus"], [`${source}-b`, "Focus B"], [`${source}-c`, "Focus C"]]) {
    await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${sid!},${name!},'rss','T1','editorial')`;
  }
  Object.assign(ids, {
    long: await report("long", { at: ago(1), body: long }),
    noBody: await report("no-body", { at: ago(1) }),
    shortBody: await report("short-body", { at: ago(1), body: "只有一句话的快讯。" }),
    chinese300: await report("chinese-300", { at: ago(1), body: "字".repeat(300) }),
    post299: await report("post-299", { at: ago(1), channel: "x", bodyMode: "full", post: "a".repeat(299) }),
    post300: await report("post-300", { at: ago(1), channel: "x", bodyMode: "full", post: "a".repeat(300) }),
    postArticle: await report("post-article", { at: ago(1), channel: "x", bodyMode: "full", post: "A long read:", article: long }),
    manual: await report("manual", { at: ago(1), manual: true, selected: false }),
    hidden: await report("hidden", { at: ago(1), indexable: false, selected: false }),
    pairA: await report("pair-a", { at: ago(1), body: long }),
    pairB: await report("pair-b", { at: ago(2), body: long, outlet: "b" }),
    pairManual: await report("pair-manual", { at: ago(3), body: long, manual: true, outlet: "c" }),
    single: await report("single", { at: ago(1), body: long }),
  });
  Object.assign(stories, {
    pair: await story([ids.pairA!, ids.pairB!, ids.pairManual!], true),
    single: await story([ids.single!], true),
  });
});

const urls = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
async function sitemap() {
  const res = await app.inject("/sitemap.xml");
  assert.equal(res.statusCode, 200);
  return res.body;
}

test("a page whose own text is a summary's worth is kept from Google only, and from the sitemap", async () => {
  const listed = urls(await sitemap());
  const inventory = new Set((await loadDiscoveryEntries(new Date())).map((e) => e.loc));
  const expected: Record<string, { indexable: boolean; googleNoindex: boolean }> = {
    long: { indexable: true, googleNoindex: false },
    noBody: { indexable: true, googleNoindex: true },
    shortBody: { indexable: true, googleNoindex: true },
    chinese300: { indexable: true, googleNoindex: false },
    post299: { indexable: true, googleNoindex: true },
    post300: { indexable: true, googleNoindex: false },
    postArticle: { indexable: true, googleNoindex: false },
    manual: { indexable: true, googleNoindex: false },
    hidden: { indexable: false, googleNoindex: false },
  };
  for (const [name, want] of Object.entries(expected)) {
    const res = await app.inject(`/api/site/items/${ids[name]}`);
    assert.equal(res.statusCode, 200, name);
    const detail = res.json() as { indexable: boolean; googleNoindex: boolean };
    assert.deepEqual({ indexable: detail.indexable, googleNoindex: detail.googleNoindex }, want, name);
    assert.equal(listed.includes(`/items/${ids[name]}`), want.indexable && !want.googleNoindex, `${name}: the sitemap agrees with the page`);
    if (want.indexable) assert.ok(inventory.has(`/items/${ids[name]}`), `${name}: engines that index it are still notified`);
  }
});

test("an article whose event stands in search is left to the event page at Google, and only there", async () => {
  const listed = urls(await sitemap());
  const inventory = new Set((await loadDiscoveryEntries(new Date())).map((e) => e.loc));
  // A full article otherwise indexed everywhere; an editor's mark keeps it; an event of one outlet has no page in search.
  const expected: Record<string, boolean> = { pairA: true, pairB: true, pairManual: false, single: false };
  for (const [name, googleNoindex] of Object.entries(expected)) {
    const res = await app.inject(`/api/site/items/${ids[name]}`);
    assert.equal(res.statusCode, 200, name);
    const detail = res.json() as { indexable: boolean; googleNoindex: boolean; story: { publicId: string } | null };
    assert.ok(detail.story, `${name}: the page names its event`);
    assert.deepEqual({ indexable: detail.indexable, googleNoindex: detail.googleNoindex }, { indexable: true, googleNoindex }, name);
    assert.equal(listed.includes(`/items/${ids[name]}`), !googleNoindex, `${name}: the sitemap agrees with the page`);
    assert.ok(inventory.has(`/items/${ids[name]}`), `${name}: engines that index it are still notified`);
  }
  const events = urls(await sitemap());
  assert.ok(events.includes(`/story/${stories.pair}`), "the event page stands for its reports");
  assert.ok(!events.includes(`/story/${stories.single}`), "an event of one outlet is left to that report's page");
  assert.ok(inventory.has(`/story/${stories.pair}`));
  assert.ok(!inventory.has(`/story/${stories.single}`), "its page is noindex: no engine is asked to fetch it");
});
