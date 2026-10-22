import assert from "node:assert/strict";
import { test } from "node:test";
import { readingLinks } from "../app/components/next-reads.ts";

test("editorial context precedes discovery and never repeats the current story", () => {
  const reads = { daily: { key: "2026-10-21", title: "Daily", issueNumber: 1, count: 3 }, hot: [{ rank: 1, storyPublicId: "current", title: "Current" }, { rank: 2, storyPublicId: "related", title: "Related" }, { rank: 3, storyPublicId: "other", title: "Other" }] };
  const links = readingLinks(reads, [{ to: "/story/current", title: "Current", label: "Same" }, { to: "/story/related", title: "Related", label: "Same storyline" }], "current");
  assert.deepEqual(links.map((x) => x.to), ["/story/related", "/daily/2026-10-21"]);
  assert.equal(links[0]!.label, "Same storyline");
});

test("missing discovery data still offers known context; an empty site offers no invented link", () => {
  assert.deepEqual(readingLinks(null, [], null), []);
  assert.equal(readingLinks(null, [{ to: "/story/parent", title: "Parent event", label: "Full story" }], null)[0]!.to, "/story/parent");
});

test("a daily lead and a hot story with the same headline appear only once", () => {
  const links = readingLinks({ daily: { key: "2026-10-21", title: "Same headline", issueNumber: 1, count: 1 }, hot: [{ rank: 1, title: "Same headline", storyPublicId: "lead" }, { rank: 2, title: "Another story", storyPublicId: "other" }] }, [], null);
  assert.deepEqual(links.map((x) => x.to), ["/daily/2026-10-21"]);
});

test("without a daily, hot stories still provide a next step and exclude the current story", () => {
  assert.deepEqual(readingLinks({ daily: null, hot: [{ rank: 1, title: "Current", storyPublicId: "current" }, { rank: 2, title: "Other", storyPublicId: "other" }] }, [], "current").map(x => x.to), ["/story/other"]);
});
