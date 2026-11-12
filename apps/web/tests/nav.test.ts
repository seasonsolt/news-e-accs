import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import type * as Navigation from "../app/components/shell/nav.ts";

let server: Awaited<ReturnType<typeof createServer>>;
before(async () => { server = await createServer({ configFile: false, root: new URL("../", import.meta.url).pathname, resolve: { alias: { "@aihot/web/": new URL("../app/", import.meta.url).pathname } }, server: { middlewareMode: true, ws: false }, appType: "custom" }); });
after(async () => { await server?.close(); });

test("the deck has picks, daily, acceleration, the frontier and the essays; everything else sits under More in both locales", async () => {
  const { TOPNAV, MORE_MENU, MORE_PATHS, tabBar, tabIsActive, isNightPage } = await server.ssrLoadModule("/app/components/shell/nav.ts") as typeof Navigation;
  const home = TOPNAV.find((item) => item.to === "/")!;
  assert.equal(home.label, "精选");
  assert.deepEqual(TOPNAV.map((item) => item.to), ["/", "/daily", "/chronicle"]);
  for (const path of ["/", "/zh"]) assert.equal(tabIsActive(home, path), true, path);
  for (const path of ["/chronicle", "/zh/chronicle", "/hot", "/all"]) assert.equal(tabIsActive(home, path), false, path);
  const tabs = tabBar();
  assert.deepEqual(tabs.map((item) => item.to), ["/", "/daily", "/chronicle", "/frontier", "/essays", "/more"]);
  assert.equal(tabs[1]!.label, "日报");
  const frontier = tabs.find((item) => item.to === "/frontier")!;
  for (const path of ["/frontier", "/zh/leaderboard/category/coding", "/pricing/compare/a-vs-b", "/index/cost-of-intelligence"]) assert.equal(tabIsActive(frontier, path), true, path);
  assert.equal(isNightPage("/zh/pricing"), true);
  assert.equal(isNightPage("/index/cost-of-intelligence"), true);
  assert.equal(isNightPage("/zh/story/447297b4"), true);
  assert.equal(isNightPage("/items/447297b4"), false);
  const essays = tabs.find((item) => item.to === "/essays")!;
  for (const path of ["/essays", "/zh/essays/machines-that-learn"]) assert.equal(tabIsActive(essays, path), true, path);
  const more = tabs.at(-1)!;
  for (const path of ["/zh/all", "/hot", "/products/wallpaper", "/eacc-vs-ea", "/subscribe"]) assert.equal(tabIsActive(more, path), true, path);
  // 更多 lists the essays too, but their own section is the one lit.
  assert.ok(MORE_MENU.flatMap((group) => group.items).some((item) => item.to === "/essays"));
  for (const path of ["/chronicle/workshops", "/zh/weekly", "/pricing", "/essays", "/zh/essays/machines-that-learn"]) assert.equal(tabIsActive(more, path), false, path);
  assert.equal(MORE_PATHS.includes("/chronicle"), false);
  assert.deepEqual(MORE_MENU.map((group) => group.title), ["阅读", "了解 e/acc", "创作", "我的", "本站"]);
  assert.ok(MORE_MENU.every((group) => group.items.every((item) => item.note)), "each More entry says what it holds");
  const paths = MORE_MENU.flatMap((group) => group.items.map((item) => item.to));
  assert.equal(new Set(paths).size, paths.length, "no page is listed twice");
});

test("hidden trending and a disabled time machine drop their entries and keep More highlighting their pages", async () => {
  const { FEATURES: features } = await server.ssrLoadModule("@aihot/industry/features") as { FEATURES: { timeMachine: boolean } };
  const { NAV: nav } = await server.ssrLoadModule("@aihot/site") as { NAV: { hidden: readonly string[] } };
  const originalFeature = features.timeMachine;
  const originalHidden = nav.hidden;
  try {
    nav.hidden = ["/hot"];
    const hidden = await server.ssrLoadModule("/app/components/shell/nav.ts?hidden-hot") as typeof Navigation;
    assert.ok(hidden.MORE_MENU[0]!.items.every((item) => item.to !== "/hot"));
    assert.equal(hidden.tabIsActive(hidden.tabBar().at(-1)!, "/hot"), true);
    features.timeMachine = false;
    nav.hidden = [];
    const disabled = await server.ssrLoadModule("/app/components/shell/nav.ts?time-machine-off") as typeof Navigation;
    assert.ok(disabled.TOPNAV.every((item) => item.to !== "/chronicle"));
    assert.deepEqual(disabled.tabBar().map((item) => item.to), ["/", "/daily", "/frontier", "/essays", "/more"]);
    assert.equal(disabled.tabIsActive(disabled.tabBar().at(-1)!, "/zh/chronicle"), true);
    assert.ok(disabled.MORE_MENU.flatMap((group) => group.items).every((item) => !item.to.startsWith("/chronicle")));
    const home = await server.ssrLoadModule("/app/routes/home.tsx?time-machine-off") as typeof import("../app/routes/home.tsx");
    const originalFetch = globalThis.fetch;
    const paths: string[] = [];
    try {
      globalThis.fetch = async (input) => {
        paths.push(String(input));
        return Response.json({ filters: { channel: "all", category: null, tag: null }, cards: [], nextCursor: null, hot: null, dayCounts: {} });
      };
      const response = await home.loader({ request: new Request("https://e-acc.ai/?at=2026-09-01") } as Parameters<typeof home.loader>[0]);
      assert.equal(response.data.filters.at, null);
      assert.match(paths[0]!, /\/api\/site\/timeline/);
      assert.ok(paths.every((path) => !path.includes("/chronicle")));
    } finally { globalThis.fetch = originalFetch; }
  } finally {
    features.timeMachine = originalFeature;
    nav.hidden = originalHidden;
  }
});
