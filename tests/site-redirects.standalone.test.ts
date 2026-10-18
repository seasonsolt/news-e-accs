// The site's own redirects (site/site.ts REDIRECTS): the indexed addresses of the retired e-acc.ai static
// site lead to the news site's pages, its data files and the second sitemap are gone, and none of them
// shadows a page this site serves.
import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveRedirect } from "@aihot/contracts/http-policy";

test("retired static-site pages move permanently to their news-site counterparts", () => {
  for (const [from, to] of [["/timeline", "/chronicle"], ["/api", "/agent"], ["/terminal", "/"], ["/sitemap-news.xml", "/sitemap.xml"]]) {
    assert.deepEqual(resolveRedirect(from!, ""), { status: 301, location: to, headers: {} }, from);
  }
});

test("its data files and tool sitemap answer 410", () => {
  for (const path of ["/sitemap-tools.xml", "/api/benchmark.json", "/api/latest-frontier.json", "/api/timeline.json"]) {
    assert.deepEqual(resolveRedirect(path, ""), { status: 410, location: null, headers: {} }, path);
  }
});

test("the news site's own pages and APIs are not caught", () => {
  for (const path of ["/agent", "/chronicle", "/sitemap.xml", "/api/v1/items", "/api/site/leaderboard/pricing", "/api/timeline.json.bak", "/zh/timeline-x", "/timeline/2026"]) {
    assert.equal(resolveRedirect(path, ""), null, path);
  }
});
