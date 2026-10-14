// Routing checks that do not need the static Pages tree. The full file walk lives in seasonsolt/e-acc.ai.
import assert from "node:assert/strict";
import { test } from "node:test";
import { routeOf } from "../src/route.mjs";

test("/llms-full.txt goes to the news origin; shared discovery files stay merged", () => {
  assert.equal(routeOf("/llms-full.txt"), "news");
  for (const path of ["/llms.txt", "/robots.txt", "/sitemap.xml"]) assert.equal(routeOf(path), "merged", path);
  for (const path of ["/topics", "/starred", "/feedback", "/admin/runs", "/api/site/hot", "/zh/starred"]) {
    assert.equal(routeOf(path), "news", path);
  }
});
