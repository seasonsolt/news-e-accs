// A topic directory kept for the website must not become a second stale layer beneath discovery's
// own cache. Its last qualifying report can be withdrawn while the directory is still warm.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { topicDiscovery } from "@aihot/backend/publication/topics";
import { loadLlmsAvailability } from "@aihot/backend/publication/llms";
import { randomUUID } from "node:crypto";
import { buildApp } from "../apps/api/src/app.ts";

const app = await buildApp();
after(async () => { await app.close(); await closeDb(); });

test("llms and sitemap build from current topic scope rather than a cached directory", async () => {
  const source = `discovery-topics-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${source},'Discovery topics','rss','T1','editorial')`;
  for (let i = 0; i < 20; i++) {
    const id = `${source}-${i}`;
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,timeline_at,discovered_at)
      VALUES (${id},${source},${id},${`https://example.org/${id}`},'MiniMax',now(),now())`;
    await sql`INSERT INTO publications (article_id,source_id,title,summary,url,timeline_at,discovered_at,sort_at,selected,eligible,visible_after,tags,channel,category)
      VALUES (${id},${source},'MiniMax 发布模型','Summary',${`https://example.org/${id}`},now(),now(),now(),true,true,now() - interval '1 minute',ARRAY['entity:minimax'],'news','ai-models')`;
  }
  assert.equal((await topicDiscovery()).find((topic) => topic.slug === "minimax")!.indexable, true);
  const listed = (await loadLlmsAvailability()).topics.find((topic) => topic.slug === "minimax");
  assert.ok(listed && !/\p{Script=Han}/u.test(listed.name + listed.definition), "llms.txt describes topics in English");
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE source_id = ${source}`;
  assert.ok(!(await loadLlmsAvailability()).topics.some((topic) => topic.slug === "minimax"));
  const sitemap = await app.inject("/sitemap.xml");
  assert.equal(sitemap.statusCode, 200);
  assert.ok(!sitemap.body.includes("/topics/minimax</loc>"));
});

test("the sitemap pairs mirrored editions and names only fresh native English stories as news", async (t) => {
  // Past the copy the previous test left in the five-minute cache.
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() + 6 * 60_000 });
  const source = `discovery-news-${tag()}`;
  await sql`INSERT INTO sources (id,name,kind,tier,participation_mode) VALUES (${source},'Discovery news','rss','T1','editorial')`;
  const story = async (title: string, language: "en" | "zh", created: string) => {
    const publicId = randomUUID();
    const id = `${source}-${publicId}`;
    await sql`INSERT INTO articles (id,source_id,identity_key,url,title,timeline_at,discovered_at)
      VALUES (${id},${source},${id},${`https://example.org/${id}`},${title},now(),now())`;
    await sql`INSERT INTO publications (article_id,source_id,title,summary,url,timeline_at,discovered_at,sort_at,selected,eligible,visible_after,channel,category)
      VALUES (${id},${source},${title},'Summary',${`https://example.org/${id}`},now(),now(),now(),true,true,now() - interval '1 minute','news','ai-models')`;
    const [row] = await sql<{ id: number }[]>`INSERT INTO stories (public_id,title,editorial_language,latest_at,created_at) VALUES (${publicId},${title},${language},now(),${created}::timestamptz) RETURNING id`;
    const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id,story_id,title) VALUES (${randomUUID()},${row!.id},${title}) RETURNING id`;
    await sql`INSERT INTO fact_articles (fact_id,article_id,role) VALUES (${fact!.id},${id},'primary')`;
    return publicId;
  };
  const fresh = await story("Fresh <English> story", "en", new Date(Date.now() - 3_600_000).toISOString());
  const old = await story("Older English story", "en", new Date(Date.now() - 3 * 86_400_000).toISOString());
  const chinese = await story("中文事件", "zh", new Date(Date.now() - 3_600_000).toISOString());
  const { body } = await app.inject("/sitemap.xml");
  assert.match(body, /xmlns:news="http:\/\/www\.google\.com\/schemas\/sitemap-news\/0\.9"/);
  const entry = (publicId: string) => body.split("<url>").find((part) => part.includes(`/story/${publicId}</loc>`)) ?? "";
  assert.match(entry(fresh), /<news:title>Fresh &lt;English&gt; story<\/news:title>/);
  assert.match(entry(fresh), /<news:language>en<\/news:language>/);
  assert.ok(entry(old) && !entry(old).includes("<news:news>"), "a page older than two days is not news");
  assert.ok(entry(chinese) && !entry(chinese).includes("<news:news>"), "a Chinese story has no English headline of its own");
  const about = body.split("<url>").find((part) => part.includes("/about</loc>") && !part.includes("/zh/about</loc>"))!;
  assert.match(about, /hreflang="zh-CN" href="[^"]+\/zh\/about"/);
  assert.match(about, /hreflang="x-default" href="[^"]+\/about"/);
  assert.ok(about.indexOf("</priority>") < about.indexOf("<xhtml:link"), "extension elements follow the core ones");
  assert.ok(!entry(fresh).includes("hreflang"), "content pages wait for both editions");
});
