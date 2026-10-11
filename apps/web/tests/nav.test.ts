import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";
import type * as Navigation from "../app/components/shell/nav.ts";

let server: Awaited<ReturnType<typeof createServer>>;
before(async () => { server = await createServer({ configFile: false, root: new URL("../", import.meta.url).pathname, resolve: { alias: { "@aihot/web/": new URL("../app/", import.meta.url).pathname } }, server: { middlewareMode: true, ws: false }, appType: "custom" }); });
after(async () => { await server?.close(); });

test("Acceleration has its own tab next to the picks in both locales; All lives under More", async () => {
  const { TOPNAV, TABBAR, MORE_MENU, MORE_PATHS, tabIsActive } = await server.ssrLoadModule("/app/components/shell/nav.ts") as typeof Navigation;
  const home = TOPNAV.find((item) => item.to === "/")!;
  assert.equal(home.label, "精选");
  assert.ok(TOPNAV.some((item) => item.to === "/chronicle"));
  assert.ok(TOPNAV.every((item) => item.to !== "/all"));
  for (const path of ["/", "/zh"]) assert.equal(tabIsActive(home, path), true, path);
  for (const path of ["/chronicle", "/zh/chronicle", "/hot", "/all"]) assert.equal(tabIsActive(home, path), false, path);
  assert.deepEqual(TABBAR.map((item) => item.to), ["/", "/chronicle", "/hot", "/daily", "/more"]);
  assert.equal(MORE_PATHS.includes("/hot"), false);
  assert.equal(MORE_PATHS.includes("/chronicle"), false);
  const more = TABBAR.at(-1)!;
  assert.equal(tabIsActive(more, "/zh/hot"), false);
  assert.equal(tabIsActive(more, "/zh/chronicle"), false);
  assert.equal(tabIsActive(more, "/zh/all"), true);
  assert.equal(MORE_MENU.find((group) => group.title === "阅读")?.items.find((item) => item.to === "/all")?.label, "全部动态");
});

test("hidden trending and a disabled time machine drop tabs without competing More highlights", async () => {
  const { FEATURES: features } = await server.ssrLoadModule("@aihot/industry/features") as { FEATURES: { timeMachine: boolean } };
  const { NAV: nav } = await server.ssrLoadModule("@aihot/site") as { NAV: { hidden: readonly string[] } };
  const originalFeature = features.timeMachine;
  const originalHidden = nav.hidden;
  try {
    nav.hidden = ["/hot"];
    const hidden = await server.ssrLoadModule("/app/components/shell/nav.ts?hidden-hot") as typeof Navigation;
    assert.deepEqual(hidden.TABBAR.map((item) => item.to), ["/", "/chronicle", "/daily", "/more"]);
    assert.equal(hidden.tabIsActive(hidden.TABBAR.at(-1)!, "/products"), true);
    features.timeMachine = false;
    nav.hidden = [];
    const disabled = await server.ssrLoadModule("/app/components/shell/nav.ts?time-machine-off") as typeof Navigation;
    assert.ok(disabled.TOPNAV.every((item) => item.to !== "/chronicle"));
    assert.deepEqual(disabled.TABBAR.map((item) => item.to), ["/", "/products", "/hot", "/daily", "/more"]);
    assert.equal(disabled.tabIsActive(disabled.TABBAR.at(-1)!, "/zh/products"), false);
    assert.equal(disabled.tabIsActive(disabled.TABBAR.at(-1)!, "/zh/hot"), false);
    assert.equal(disabled.tabIsActive(disabled.TABBAR.at(-1)!, "/zh/chronicle"), true);
    assert.ok(disabled.TOPNAV.every((item) => item.to !== "/all"));
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
      assert.equal(paths.length, 1);
      assert.match(paths[0]!, /\/api\/site\/timeline/);
    } finally { globalThis.fetch = originalFetch; }
  } finally {
    features.timeMachine = originalFeature;
    nav.hidden = originalHidden;
  }
});
