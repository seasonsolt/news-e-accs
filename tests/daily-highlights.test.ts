// A thin daily (a weekend's often carries a single entry) offers highlights (今日看点) after its lead. On this
// site a quiet window first lowers the selection bar until the issue carries six events (edition.ts relaxBar,
// since 2026-10-26), so the window's near misses become entries of the issue; upstream's picks (dailyPicks,
// 2026-11-09) only fill the highlights that are still missing with reports the issue does not carry at all,
// such as one scored above the bar that was still awaiting confirmation at the cutoff. Failure cases:
// - a thin issue shows a report twice (as an entry and as a pick), or fills highlights with what this issue or
//   the week's issues already carried, a report from outside the window or from a source that is not editorial,
//   or a selected one the next issue carries (released at or after the cutoff);
// - a pick becomes the lead, counts among the issue's events, or is missing from the outlets; its own page does
//   not name the daily that lists it;
// - an issue with three highlights of its own, or a quiet day, is given reports it did not carry;
// - what the highlights showed keeps a later selection out of the next issue's body.
import { editionAt, pointModels, stub, tag } from "./setup.ts";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { closeDb, sql } from "@aihot/backend/db";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { publishArticle } from "@aihot/backend/publication/publish";
import { firstDaily, loadReport, v1Daily } from "@aihot/backend/publication/reports";
import { composeDaily } from "@aihot/backend/reports/compose";
import { mergeStoryInto } from "@aihot/backend/events/merge";
import { buildApp } from "../apps/api/src/app.ts";

const T = tag();
const MEDIA = `highlights-media-${T}`;
const OTHER = `highlights-other-${T}`;
const SIGNAL = `highlights-signal-${T}`;
const app = await buildApp();
let n = 0;

/** The English copy the stubbed writer gives a fixture's Chinese prose: letters only, so no number changes. */
const english = (text: string) => `Story ${[...text].map((c) => c.codePointAt(0)!.toString(26).replace(/\d/g, (d) => "qrstuvwxyz"[Number(d)]!)).join(" ")}`;
// The issue is the English edition: the writer supplies the English copies of reports that have none.
const provider = await stub((hit, req) => {
  const user = String(JSON.parse(req.body).messages.at(-1).content);
  const missing = user.includes("Missing English citations") ? JSON.parse(user.slice(user.lastIndexOf("\n") + 1)) as Array<{ itemId: string; title: string; summary: string }> : [];
  return {
    id: `highlights-${T}-${hit}`,
    choices: [{ message: { content: JSON.stringify({ citationCopies: missing.map((e) => ({ itemId: e.itemId, title: english(e.title), summary: english(e.summary) })) }) } }],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  };
});
pointModels(provider.url);

before(async () => {
  await sql`INSERT INTO sources (id, name, kind, tier, participation_mode, next_fetch_at) VALUES
    (${MEDIA}, 'Media', 'rss', 'T2', 'editorial', '2100-01-01'),
    (${OTHER}, 'Other media', 'rss', 'T2', 'editorial', '2100-01-01'),
    (${SIGNAL}, 'Signal', 'rss', 'T2', 'hot_signal', '2100-01-01')`;
});
after(async () => { await app.close(); await stopBoss(); await closeDb(); await provider.close(); });

/** `hours` before the edition time of `date`. */
const hoursBefore = (date: string, hours: number) => new Date(editionAt("daily", date).getTime() - hours * 3_600_000);

/** A report that arrived at `at`, scored `score` and selected or not, public from then on (a selection from `releasedAt`). */
async function report(title: string, at: Date, score: number, selected: boolean, source = MEDIA, releasedAt = at): Promise<string> {
  const { articleId } = await upsertMaterial({ sourceId: source, url: `https://example.com/${T}/${++n}`, title,
    bodyText: `${title} 正文`, bodyStatus: "ok", publishedAt: at, discoveredAt: at, via: "fetch" });
  await sql`UPDATE articles SET grouping_status = 'complete' WHERE id = ${articleId}`;
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected)
    VALUES (${articleId}, 1, 'rule', 'pass', 'ai-models', ${title}, ${`${title}的摘要`}, ${score}, ${selected})`;
  const published = await publishArticle(articleId, { now: at, releasedAt });
  if (source !== SIGNAL) assert.deepEqual([published?.selected, published?.visibility], [selected, "public"], title);
  return articleId;
}

/** A fact of an event (a new event unless `story` is given), reported by `members`. */
async function fact(members: string[], story?: number): Promise<number> {
  const id = story ?? (await sql<{ id: number }[]>`INSERT INTO stories (public_id, title) VALUES (${randomUUID()}, '事件') RETURNING id`)[0]!.id;
  const [f] = await sql<{ id: number }[]>`INSERT INTO facts (public_id, story_id, title) VALUES (${randomUUID()}, ${id}, '事实') RETURNING id`;
  for (const m of members) await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${f!.id}, ${m}, 'primary')`;
  await sql`UPDATE publications SET fact_id = ${f!.id}, story_id = ${id} WHERE article_id = ANY(${members})`;
  return id;
}

type Content = { leadItemId: string | null; highlights: string[]; picks?: Array<{ itemId: string }>; metrics: Record<string, number>;
  sections: Array<{ items: Array<{ itemId: string }> }>; flashes: Array<{ itemId: string }> };
async function content(date: string): Promise<Content> {
  const [r] = await sql<{ content: Content }[]>`SELECT content FROM reports WHERE kind = 'daily' AND key = ${date}`;
  return r!.content;
}
const carried = (c: Content) => [...c.sections.flatMap((s) => s.items), ...c.flashes, ...(c.picks ?? [])].map((i) => i.itemId);

test("a thin issue carries the window's near misses as entries, and picks only what it does not carry", async () => {
  const day = "2021-03-09";
  // The issue before carried an event; its new development here is not news to this issue's readers.
  const earlier = await report("前一期的头条", hoursBefore(day, 30), 90, true);
  const covered = await fact([earlier]);
  await composeDaily("2021-03-08");
  const lead = await report("本期唯一的大事", hoursBefore(day, 5), 90, true);
  const leadStory = await fact([lead]);
  const sameAsLead = await report("头条事件的另一篇", hoursBefore(day, 4), 88, false);
  await fact([sameAsLead], leadStory);
  const best = await report("最值得看的", hoursBefore(day, 3), 74, false);
  const runnerUp = await report("同一事件的另一篇", hoursBefore(day, 2), 73, false);
  await fact([best, runnerUp]);
  const second = await report("第二值得看的", hoursBefore(day, 6), 71, false);
  await fact([second]);
  const followUp = await report("前一期事件的新进展", hoursBefore(day, 3), 80, false);
  await fact([followUp], covered);
  // Above the bar but still awaiting confirmation as new at the cutoff: never relaxed into the issue.
  const pending = await report("截稿时还在确认的", hoursBefore(day, 2), 82, false, OTHER);
  await sql`UPDATE publications SET selection_candidate = true WHERE article_id = ${pending}`;
  const outside = await report("窗口之前的", hoursBefore(day, 25), 90, false);
  const signal = await report("热度信源的", hoursBefore(day, 3), 90, false, SIGNAL);
  const nextIssues = await report("到截稿时刻才发布的精选", hoursBefore(day, 1), 95, true, OTHER, hoursBefore(day, 0));
  await fact([nextIssues]);

  await composeDaily(day);
  const c = await content(day);
  assert.equal(c.leadItemId, lead);
  const entries = [...c.sections.flatMap((s) => s.items), ...c.flashes].map((i) => i.itemId);
  // The near misses are the issue's own entries: one source fills the body (two at most), the rest are briefs.
  for (const id of [lead, best, second, followUp]) assert.ok(entries.includes(id), id);
  for (const id of [runnerUp, sameAsLead, pending, outside, signal, nextIssues]) assert.ok(!entries.includes(id), id);
  assert.deepEqual(c.picks?.map((p) => p.itemId), [pending], "a pick is a report the issue does not carry");
  assert.deepEqual(c.highlights, [best, pending]);
  assert.ok(!c.highlights.includes(lead));
  assert.deepEqual(await firstDaily(pending), { key: day, lead: false }, "its page names the daily that lists it, never as its lead");

  const site = (await loadReport("daily", day))!;
  assert.equal(site.leadItemId, lead);
  assert.deepEqual(site.highlights.map((h) => h.itemId), [best, pending]);
  const v1 = (await v1Daily(day))!.report as { highlights?: Array<{ title: string }> };
  assert.ok(v1.highlights?.some((h) => h.title === english("截稿时还在确认的")), "the pick is on every outlet");
  const agent = (await app.inject(`/api/v1/agent/daily/${day}`)).body;
  assert.match(agent, /【今日看点】/);
  assert.ok(agent.includes(english("截稿时还在确认的")));
});

test("an issue's own entries come first; one with three highlights of its own, or a quiet day, gets none filled in", async () => {
  const day = "2021-04-06";
  const lead = await report("头条", hoursBefore(day, 9), 92, true);
  const next = await report("第二件大事", hoursBefore(day, 8), 90, true);
  const pick = await report("正文以外最好的", hoursBefore(day, 3), 75, false);
  const nextPick = await report("正文以外第二", hoursBefore(day, 4), 70, false);
  for (const id of [lead, next, pick, nextPick]) await fact([id]);
  await composeDaily(day);
  const c = await content(day);
  assert.equal(c.leadItemId, lead);
  // The near misses are carried as briefs (one source, two in the body at most), so nothing is picked twice.
  assert.deepEqual(c.highlights, [next]);
  assert.deepEqual(c.flashes.map((i) => i.itemId), [pick, nextPick]);
  assert.equal(c.picks, undefined);

  const full = "2021-04-13";
  const own: string[] = [];
  for (const [i, source] of [MEDIA, MEDIA, OTHER, OTHER].entries()) own.push(await report(`大事${"甲乙丙丁"[i]}`, hoursBefore(full, 9 - i), 90 - i, true, source));
  const left = await report("没收进来的", hoursBefore(full, 3), 75, false);
  for (const id of [...own, left]) await fact([id]);
  await composeDaily(full);
  const f = await content(full);
  assert.deepEqual(f.highlights, own.slice(1));
  assert.equal(f.picks, undefined);

  const quiet = "2021-04-20";
  // Quiet here means nothing came near the bar: a near miss (understandFloor and up) would be relaxed in.
  const scored = await report("没有入选的", hoursBefore(quiet, 3), 45, false);
  await fact([scored]);
  await composeDaily(quiet);
  const q = await content(quiet);
  assert.equal(q.leadItemId, null, "a quiet day");
  assert.deepEqual(q.highlights, []);
  assert.equal(q.picks, undefined, "a quiet day says nothing new happened: nothing is filled in");
});

test("an issue never carries the week's news twice, and picks nothing it carries", async () => {
  const day = "2021-05-04";
  const lead = await report("周日的头条", hoursBefore(day, 5), 90, true);
  await fact([lead]);
  const shown = await report("周日看点第一", hoursBefore(day, 3), 75, false);
  const shownStory = await fact([shown]);
  const alsoShown = await report("周日看点第二", hoursBefore(day, 4), 74, false);
  const alsoShownStory = await fact([alsoShown]);
  const merged = await report("周日看点第三", hoursBefore(day, 5), 73, false);
  const mergedStory = await fact([merged]);
  await composeDaily(day);
  assert.deepEqual((await content(day)).highlights, [shown], "the others are carried as briefs");

  const next = "2021-05-05";
  const monday = await report("周一的头条", hoursBefore(next, 5), 90, true);
  await fact([monday]);
  // The same news, now from its official source and selected: the body carries it in full.
  const official = await report("同一件事的官方消息", hoursBefore(next, 4), 95, true, OTHER);
  const [f] = await sql<{ fact_id: number }[]>`SELECT fact_id FROM publications WHERE article_id = ${shown}`;
  await sql`INSERT INTO fact_articles (fact_id, article_id, role) VALUES (${f!.fact_id}, ${official}, 'primary')`;
  await sql`UPDATE publications SET fact_id = ${f!.fact_id}, story_id = ${shownStory} WHERE article_id = ${official}`;
  const echo = await report("周日看点第二的新进展", hoursBefore(next, 3), 80, false);
  await fact([echo], alsoShownStory);
  const fresh = await report("周一新的值得看的", hoursBefore(next, 6), 70, false);
  await fact([fresh]);
  // The third highlight's event has since been merged into an event with a new report.
  const joined = await report("合并进来的事件的新报道", hoursBefore(next, 2), 79, false);
  await mergeStoryInto(mergedStory, await fact([joined]), "test", "test");
  await composeDaily(next);
  const c = await content(next);
  // Here the day before carried that news as an entry (relaxed in), not only as a highlight: the same fact is
  // not carried again within the week, even from its official source.
  assert.ok(![...c.sections.flatMap((s) => s.items), ...c.flashes].some((i) => i.itemId === official), "the same news is not carried twice in a week");
  assert.ok([...c.sections.flatMap((s) => s.items), ...c.flashes].some((i) => i.itemId === fresh), "a new near miss is carried");
  assert.equal(c.picks, undefined, "nothing left out is picked");
});
