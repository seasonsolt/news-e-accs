import assert from "node:assert/strict";
import { test } from "node:test";
import { backupDue, developmentsSince, matchesQuery, savedGroup } from "../app/features/starred/saved-list.ts";

test("stars group by Beijing day: today, this week from Monday, earlier", () => {
  // Wednesday 2026-10-14, 09:00 in Beijing.
  const now = new Date("2026-10-14T01:00:00Z");
  assert.equal(savedGroup("2026-10-13T16:30:00Z", now), "today", "00:30 Beijing time is already today");
  assert.equal(savedGroup("2026-10-13T15:30:00Z", now), "week");
  assert.equal(savedGroup("2026-10-12T00:00:00Z", now), "week", "Monday");
  assert.equal(savedGroup("2026-10-11T12:00:00Z", now), "earlier", "Sunday belongs to last week");
  // On a Monday, only today is this week.
  const monday = new Date("2026-10-12T04:00:00Z");
  assert.equal(savedGroup("2026-10-11T12:00:00Z", monday), "earlier");
  assert.equal(savedGroup("2026-10-12T15:00:00Z", monday), "today", "a clock running ahead still reads as today");
});

test("only developments after the star count as new", () => {
  const saved = "2026-10-10T00:00:00.000Z";
  assert.equal(developmentsSince(saved, ["2026-10-12T00:00:00.000Z", "2026-10-10T00:00:00.000Z", "2026-10-01T00:00:00.000Z"]), 1);
  assert.equal(developmentsSince(saved, undefined), 0);
});

test("the backup reminder speaks up at five stars without a backup, or a week after the last one", () => {
  const now = Date.parse("2026-10-15T00:00:00Z");
  assert.equal(backupDue(0, null, now), false);
  assert.equal(backupDue(4, null, now), false);
  assert.equal(backupDue(5, null, now), true);
  assert.equal(backupDue(1, "2026-10-09T00:00:00Z", now), false);
  assert.equal(backupDue(1, "2026-10-07T23:00:00Z", now), true);
  assert.equal(backupDue(0, "2026-01-01T00:00:00Z", now), false, "nothing to back up");
});

test("search matches every word in the title, summary or source, ignoring case", () => {
  const item = { title: "Gemini 4 Argon 全球上线", summary: "Google 宣布向所有用户开放", sourceName: "The Decoder" };
  assert.ok(matchesQuery(item, ""));
  assert.ok(matchesQuery(item, "gemini decoder"));
  assert.ok(matchesQuery(item, "  所有用户 "));
  assert.ok(!matchesQuery(item, "gemini openai"));
  assert.ok(matchesQuery({ ...item, summary: null }, "argon"));
});
