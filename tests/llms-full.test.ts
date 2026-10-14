// /llms-full.txt is the last 7 Beijing days of daily briefings plus the current hot stories.
// Failure modes: an older briefing or a withdrawn citation stays in the file, a story loses its
// event page or original source, a non-http address is kept, or the route is uncached.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { addDays, beijingDate } from "@aihot/contracts/time";
import { closeDb, sql } from "@aihot/backend/db";
import type { HotEntry } from "@aihot/backend/events/hot";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { storyUrl } from "@aihot/backend/publication/links";
import { llmsFullTxt } from "@aihot/backend/publication/llms-full";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const app = await buildApp();
const now = new Date();
const today = beijingDate(now);
const edge = addDays(today, -6);
const old = addDays(today, -7);
after(async () => { await app.close(); await stopBoss(); await closeDb(); });

const AI_AGENTS = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "OAI-SearchBot"];
const SHARED = ["Allow: /api/v1/", "Allow: /api/mcp", "Disallow: /api/", "Disallow: /admin/", "Disallow: /starred", "Disallow: /feedback"];

function robotGroups(text: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let agent = "";
  for (const line of text.split("\n")) {
    const match = /^User-agent:\s*(.+)$/.exec(line.trim());
    if (match) { agent = match[1]!.trim(); groups.set(agent, []); continue; }
    if (agent && /^(?:Allow|Disallow):/.test(line.trim())) groups.get(agent)!.push(line.trim());
  }
  return groups;
}

test("robots.txt lets answer-engine crawlers read the public site under the same private-path rules", () => {
  const groups = robotGroups(readFileSync(new URL("../site/public/robots.txt", import.meta.url), "utf8"));
  assert.deepEqual(groups.get("*"), SHARED);
  for (const agent of AI_AGENTS) assert.deepEqual(groups.get(agent), [...SHARED, "Allow: /"], agent);
});

test("llms-full.txt cites the last 7 days and the hot list, and drops withdrawn or older material", async () => {
  const source = `llms-full-${T}`;
  const kept = `kept-${T}`;
  const gone = `gone-${T}`;
  const loose = `loose-${T}`;
  const at = new Date(now.getTime() - 60_000);
  const keptUrl = `https://example.org/${T}/kept`;
  const goneUrl = `https://example.org/${T}/gone`;
  const extraUrl = `https://example.org/${T}/extra`;
  const looseUrl = `https://example.org/${T}/loose`;
  const oldUrl = `https://example.org/${T}/old`;
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at)
    VALUES (${source}, 'Kept source', 'rss', 'T1', 'editorial', '2100-01-01')`;
  const [story] = await sql<{ id: number; public_id: string }[]>`INSERT INTO stories (public_id, title)
    VALUES (${randomUUID()}, ${`Public story ${T}`}) RETURNING id, public_id::text`;
  const [fact] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title)
    VALUES (${randomUUID()}, ${story!.id}, ${`Public story ${T}`}) RETURNING id`;
  await sql`INSERT INTO articles (id, source_id, identity_key, url, title, discovered_at, timeline_at)
    VALUES (${kept}, ${source}, ${kept}, ${keptUrl}, ${`Public story ${T}`}, ${at}, ${at}),
           (${gone}, ${source}, ${gone}, ${goneUrl}, ${`Withdrawn story ${T}`}, ${at}, ${at})`;
  await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${fact!.id}, ${kept}, 'report')`;
  await sql`INSERT INTO publications (article_id, source_id, title, summary, url, timeline_at, discovered_at, sort_at, body_mode, eligible, channel, story_id, fact_id)
    VALUES (${kept}, ${source}, ${`Public story ${T}`}, ${`Public summary ${T}`}, ${keptUrl}, ${at}, ${at}, ${at}, 'summary', true, 'news', ${story!.id}, ${fact!.id}),
           (${gone}, ${source}, ${`Withdrawn story ${T}`}, ${`Gone summary ${T}`}, ${goneUrl}, ${at}, ${at}, ${at}, 'summary', true, 'news', NULL, NULL)`;
  await sql`UPDATE publications SET visibility = 'withdrawn' WHERE article_id = ${gone}`;
  const entry = (title: string, sourceUrl: string, extra: Record<string, unknown> = {}) => ({ title, summary: `${title} summary`, sourceName: "Kept source", sourceUrl, ...extra });
  const issue = async (key: string, content: Record<string, unknown>) => {
    await sql`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, origin)
      VALUES ('daily', ${key}, ${at}, ${now}, ${sql.json(content as never)}, ${now}, 'manual')`;
  };
  await issue(today, {
    lead: { title: `Public story ${T}`, leadParagraph: `Lead paragraph ${T}.` },
    leadItemId: kept,
    sections: [{ label: "News", items: [
      entry(`Public story ${T}`, keptUrl, { storyPublicId: story!.public_id, itemId: kept, related: [
        { title: `Extra ${T}`, sourceName: "Extra", sourceUrl: extraUrl },
        { title: `Script ${T}`, sourceName: "Script", sourceUrl: "javascript:alert(1)" },
      ] }),
      entry(`Withdrawn story ${T}`, goneUrl, { itemId: gone }),
      entry(`Ungrouped ${T}`, looseUrl, { itemId: loose, sourceName: "Loose" }),
    ] }],
  });
  await issue(edge, { sections: [{ label: "News", items: [entry(`Edge story ${T}`, `https://example.org/${T}/edge`, { storyPublicId: randomUUID() })] }] });
  await issue(old, { lead: { title: `Ancient ${T}`, leadParagraph: `Ancient paragraph ${T}.` }, sections: [{ label: "News", items: [entry(`Ancient item ${T}`, oldUrl, { storyPublicId: randomUUID() })] }] });
  const hot: HotEntry = {
    rank: 1, storyId: story!.id, storyPublicId: story!.public_id, title: `Public story ${T}`, heat: 10, trend: "flat", trendPct: 0, badges: [],
    participantCount: 1, sourceCount: 1, signalCount: 0, reportCount: 1, sourceNames: ["Kept source"], latestAt: at.toISOString(), firstReportAt: at.toISOString(),
    representativeItemId: kept, representativeUrl: keptUrl, representativeSource: "Kept source", participants: [],
  };
  await sql`INSERT INTO hot_rankings (computed_at, rule_version, entries, published) VALUES (${now}, 'test', ${sql.json([hot] as never)}, true)`;

  const text = await llmsFullTxt(now);
  const page = storyUrl(story!.public_id);
  assert.match(text, new RegExp(`\\[Public story ${T}\\]\\(${page.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`));
  assert.ok(text.includes(keptUrl));
  assert.ok(text.includes(extraUrl));
  assert.ok(text.includes(`/items/${loose}`));
  assert.ok(text.includes(looseUrl));
  assert.ok(text.includes(`Lead paragraph ${T}.`));
  assert.ok(text.includes(`/daily/${edge}`));
  assert.ok(text.includes(`Edge story ${T}`));
  assert.ok(text.includes(`https://example.org/${T}/edge`));
  assert.ok(!text.includes(goneUrl));
  assert.ok(!text.includes(`Withdrawn story ${T}`));
  assert.ok(!text.includes(oldUrl));
  assert.ok(!text.includes(`Ancient ${T}`));
  assert.ok(!text.includes("javascript:"));
  assert.ok(text.includes("## Hot stories"));
  assert.ok(text.indexOf("## Daily briefings") < text.indexOf("## Hot stories"));
  const hotSection = text.slice(text.indexOf("## Hot stories"));
  assert.ok(hotSection.includes(page));
  assert.ok(hotSection.includes(keptUrl));

  const response = await app.inject({ method: "GET", url: "/llms-full.txt" });
  assert.equal(response.statusCode, 200);
  assert.match(response.headers["content-type"] ?? "", /text\/markdown/);
  assert.equal(response.headers["cache-control"], "public, max-age=300, must-revalidate");
  assert.match(String(response.headers.etag), /^W\/"llms-full-/);
  assert.equal(response.body, text);
  const cached = await app.inject({ method: "GET", url: "/llms-full.txt", headers: { "if-none-match": String(response.headers.etag) } });
  assert.equal(cached.statusCode, 304);
  const discovery = await app.inject({ method: "GET", url: "/llms.txt" });
  assert.equal(discovery.statusCode, 200);
  assert.match(discovery.body, /\[Full recent content\]\([^)]+\/llms-full\.txt\)/);
  const robots = await app.inject({ method: "GET", url: "/robots.txt" });
  assert.equal(robots.statusCode, 200);
  for (const agent of AI_AGENTS) assert.ok(robots.body.includes(`User-agent: ${agent}`), agent);
});
