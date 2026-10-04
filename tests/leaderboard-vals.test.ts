// The Vals page has carried its benchmark data two ways: inline in the BenchmarkView island's Astro
// props, and (since October 2026) as a same-site JSON file the island names. Both are read; data
// named on another site is refused.
import assert from "node:assert/strict";
import { test } from "node:test";
import { benchmarkView } from "@aihot/backend/leaderboard/fetch/sources/vals";

const island = (component: string, props: unknown) =>
  `<html><astro-island uid="x" component-url="/_astro/${component}.abc.js" props="${JSON.stringify(props).replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"></astro-island></html>`;

test("inline props: the serialised view is revived", () => {
  const html = island("BenchmarkView", {
    benchmarkView: [0, { metadata: [0, { benchmark_id: [0, "finance_agent_v2"], version: [0, "2"] }], tasks: [0, { overall: [0, { "a/m": [0, { accuracy: [0, 61.5], stderr: [0, 0.4] }] }] }] }],
  });
  const found = benchmarkView(html);
  assert.ok("view" in found);
  assert.equal(found.view.metadata.version, "2");
  assert.equal(found.view.tasks.overall["a/m"]!.accuracy, 61.5);
});

test("a named data file on the same site is resolved against the page", () => {
  const html = island("BenchmarkViewLoader", { benchmarkViewUrl: [0, "/_astro/benchmark_view_finance_agent_v2.CGmPXXOm.json"], benchmarkName: [0, "Finance Agent v2 & co"] });
  assert.deepEqual(benchmarkView(html), { url: "https://www.vals.ai/_astro/benchmark_view_finance_agent_v2.CGmPXXOm.json" });
});

test("data on another site, or no data at all, is refused", () => {
  assert.throws(() => benchmarkView(island("BenchmarkViewLoader", { benchmarkViewUrl: [0, "https://evil.example/view.json"] })), /another site/);
  assert.throws(() => benchmarkView(island("BenchmarkViewLoader", { benchmarkName: [0, "x"] })), /not found/);
  assert.throws(() => benchmarkView(island("ScatterGraph", {})), /not found/);
});
