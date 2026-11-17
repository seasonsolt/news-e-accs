import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { createServer } from "vite";
import { parseHTML } from "linkedom";
import { chromium, expect } from "@playwright/test";
import type { ChronicleMetric } from "@aihot/contracts/chronicle";
import { chronicle, startChronoFixture } from "./chrono-fixture.ts";

let fixture: Awaited<ReturnType<typeof startChronoFixture>>;
before(async () => { fixture = await startChronoFixture(); });
after(async () => { await fixture?.close(); });

async function page(path: string, status = 200) {
  const res = await fetch(fixture.origin + (path.startsWith("/?") ? path.replace("/?", "/zh?") : `/zh${path}`), { headers: { "Accept-Language": "en" } });
  assert.equal(res.status, status);
  assert.equal(res.headers.get("set-cookie"), null);
  const body = await res.text();
  return parseHTML(body).document;
}

test("a historical hot page SSR has one final title/bar and carries at through both shells", async () => {
  const document = await page("/hot?at=2026-09-01");
  const main = document.querySelector("main")!;
  assert.equal(main.textContent?.split("历史热点 2026-09-01").length, 2);
  assert.equal(main.textContent?.split("时光机停在").length, 2);
  assert.match(main.textContent!, /2026年9月1日/);
  for (const scope of [document.querySelector('nav[aria-label="主导航"]')!, document.querySelector('nav[aria-label="底部导航"]')!]) {
    assert.ok(scope.querySelector('a[href="/zh?at=2026-09-01"]'));
    assert.ok(scope.querySelector('a[href="/zh/daily?at=2026-09-01"]'));
  }
  assert.match(document.querySelector('meta[name="robots"]')!.getAttribute("content")!, /noindex/);
  assert.ok(document.querySelector('link[rel="canonical"]')!.getAttribute("href")!.endsWith("/zh/hot"));
});

test("home and empty report history are noindex without cookies", async () => {
  for (const path of ["/?at=2026-09-01", "/daily?at=2026-09-01"]) {
    const document = await page(path);
    assert.match(document.querySelector('meta[name="robots"]')!.getAttribute("content")!, /noindex/);
    assert.doesNotMatch(document.querySelector('link[rel="canonical"]')!.getAttribute("href")!, /at=/);
    if (path.startsWith("/?")) assert.ok(document.querySelector('a[href="/zh/hot?at=2026-09-01"]'));
  }
});

test("dated reports redirect to the right issue, retain at and stay noindex", async () => {
  const res = await fetch(fixture.origin + "/daily?at=2026-09-02", { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/daily/2026-09-01?at=2026-09-02");
  const document = await page("/daily/2026-09-01?at=2026-09-02");
  assert.match(document.querySelector('meta[name="robots"]')!.getAttribute("content")!, /noindex/);
  assert.ok(document.querySelector('link[rel="canonical"]')!.getAttribute("href")!.endsWith("/zh/daily/2026-09-01"));
  assert.ok(document.querySelector('a[href="/zh/weekly?at=2026-09-02"]'));
  assert.equal(document.querySelector('.time-bar a[aria-label="后一天"]')!.getAttribute("href"), "/zh/daily?at=2026-09-03");
  assert.ok(document.querySelector('.time-bar a[href="/zh/daily"]'));
});

test("chronicle SSR chooses its era/year and delivers final gauges and no-JS era links", async () => {
  const document = await page("/chronicle?t=1769");
  assert.equal(document.querySelector("h1")!.textContent, "1769年");
  assert.match(document.querySelector("header")!.textContent!, /蒸汽时代/);
  assert.ok(document.querySelector('img[alt="蒸汽时代（铜版画）"]'));
  assert.match(document.querySelector(".observatory-plate")!.getAttribute("srcSet")!, /-hd-800\.webp 800w, .*?-hd-1600\.webp 1600w, .*?-3840\.webp 3840w/);
  assert.match(document.querySelector(".observatory-plate")!.getAttribute("src")!, /-hd-1600\.webp$/);
  const thumbnails = [...document.querySelectorAll(".chronicle-rail-thumb, .chronicle-frame img")];
  assert.ok(thumbnails.length > 0);
  assert.ok(thumbnails.every(image => image.getAttribute("src")!.endsWith("-hd-800.webp")));
  // The depth parallax and the tunnel are client-only decoration: the server sends the static plate alone.
  assert.equal(document.querySelector(".observatory-depth, .observatory-tunnel, canvas, iframe"), null);
  // The deck's three readouts, and every panel of the layer, closed or not, are in the page.
  assert.deepEqual([...document.querySelectorAll(".chronicle-readout-label")].map((el) => el.textContent), ["世界人口", "一次能源功率"]);
  assert.deepEqual([...document.querySelectorAll("#chronicle-layer .chronicle-panel")].map((el) => el.getAttribute("data-panel")), ["gauges", "nearby", "eras"]);
  assert.equal(document.querySelector("#chronicle-layer")!.hasAttribute("data-panel"), false);
  assert.ok(document.querySelector('#chronicle-layer [data-panel="nearby"] .chronicle-rail-item'));
  const slider = document.querySelector('[role="slider"]')!;
  assert.equal(slider.getAttribute("aria-valuetext"), "1769年");
  // Unzoomed, the axis is named by its broad epochs, the current one marked, instead of era by era.
  assert.deepEqual([...slider.querySelectorAll(".chronicle-epoch")].map((el) => [el.textContent, el.classList.contains("is-current")]), [["宇宙", false], ["机器", true]]);
  assert.equal(slider.querySelector(".chronicle-band-label"), null);
  assert.equal(slider.hasAttribute("data-dragging"), false);
  assert.equal(document.querySelectorAll('nav[aria-label="时代"] a').length, 3);
  assert.equal(document.querySelector('nav[aria-label="时代"] a[aria-current]')!.textContent, "蒸汽时代");
  assert.match(document.querySelector("main")!.textContent!, /卡尔达肖夫指数/);
  // Indexable: the only robots line lets results show the plate large.
  assert.equal(document.querySelector('meta[name="robots"]')!.getAttribute("content"), "max-image-preview:large");
  assert.ok(document.querySelector('link[rel="canonical"]')!.getAttribute("href")!.endsWith("/zh/chronicle"));
});

test("the chronicle leads to the walk in the reader's language, and the retired workshops' addresses lead there too", async () => {
  for (const prefix of ["/zh", ""]) {
    const document = parseHTML(await (await fetch(`${fixture.origin}${prefix}/chronicle?t=1822`)).text()).document;
    const walk = [...document.querySelectorAll(".chronometer a.chronicle-walk")];
    assert.deepEqual(walk.map((a) => a.getAttribute("href")), [`${prefix}/chronicle/walk`]);
    assert.match(walk[0]!.textContent!, prefix ? /走完整条路/ : /Walk the whole road/);
    assert.equal(document.querySelector('[role="slider"] button, [role="slider"] a'), null);
    assert.equal(document.querySelector(".observatory-enter"), null);
    for (const retired of ["/chronicle/workshops", "/chronicle/steam", "/chronicle/difference-engine"]) {
      const response = await fetch(`${fixture.origin}${prefix}${retired}`, { redirect: "manual" });
      assert.equal(response.status, 301, `${prefix}${retired}`);
      assert.equal(response.headers.get("location"), `${prefix}/chronicle/walk`);
    }
    const page = await fetch(`${fixture.origin}${prefix}/chronicle/walk`);
    assert.equal(page.status, 200);
    const scene = parseHTML(await page.text()).document;
    // The walk draws its own chrome; its canvas is the browser's.
    assert.equal(scene.querySelector('nav[aria-label="主导航"], nav[aria-label="Main navigation"]'), null);
    assert.equal(scene.querySelector("canvas"), null);
    assert.ok(scene.querySelector('link[rel="canonical"]')!.getAttribute("href")!.endsWith(`${prefix}/chronicle/walk`));
    assert.doesNotMatch(scene.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "", /noindex/);
  }
});

test("civilization comparison notes localize large counts and preserve Chinese output", async () => {
  const server = await createServer({ configFile: false, root: new URL("../", import.meta.url).pathname, server: { middlewareMode: true, ws: false }, appType: "custom" });
  try {
    const { CivilizationGauges } = await server.ssrLoadModule("/app/features/chrono/CivilizationGauges.tsx") as { CivilizationGauges: ComponentType<{ metrics: ChronicleMetric[]; t: number; now: number }> };
    const cases: Array<[ChronicleMetric["key"], number, number, string, string]> = [
      ["compute", 1, 49.21e9, "今天的 1/492.1 亿", "1/49.21B of today"],
      ["population", 1, 1e4, "今天的 1/1 万", "1/10K of today"],
      ["compute", 49.21e9, 1, "今天的 492.1 亿 倍", "49.21B times today"],
      ["population", 1e4, 1, "今天的 1 万 倍", "10K times today"],
      ["messaging", 1.7e8, 1, "比今天慢 1.7 亿 倍", "170M times slower than today"],
      ["messaging", 1, 1e4, "比今天快 1 万 倍", "10K times faster than today"],
      ["compute", 1, 620, "今天的 1/620", "1/620 of today"],
      ["compute", 1, 1, "与今天相当", "Comparable to today"],
    ];
    for (const [key, v, today, zh, en] of cases) {
      const metric: ChronicleMetric = { key, label: key, unit: "", points: [[1969, v], [2026, today]], source: { name: "Test", url: "https://example.com" }, note: "" };
      const render = (path: string) => parseHTML(renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(CivilizationGauges, { metrics: [metric], t: 1969, now: 2026 })))).document.querySelector(".chronicle-gauge:not(.is-dial) .chronicle-gauge-note")!.textContent!;
      const english = render("/chronicle");
      assert.equal(english, en, zh);
      assert.doesNotMatch(english, /[\u3400-\u9fff]/u);
      assert.equal(render("/zh/chronicle"), zh);
    }
  } finally { await server.close(); }
});

test("the timeline reports the first move and the sixth moment once each, and a reader who only looks reports nothing", async () => {
  // Enough pictures on the axis to reach a sixth: the shared fixture has too few, and other tests count them.
  const added = chronicle.milestones.filter((m) => ["electricity", "moon", "record"].includes(m.id));
  for (const m of added) Object.assign(m, { art: "difference-engine", artStyle: "铜版画" });
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage();
    const events: string[] = [];
    await tab.route("**/api/site/events", async (route) => {
      events.push(route.request().postDataJSON().event);
      await route.fulfill({ status: 204 });
    });
    await tab.goto(`${fixture.origin}/zh/chronicle?t=1769`, { waitUntil: "domcontentloaded" });
    const previous = tab.getByRole("button", { name: "上一个里程碑" });
    const next = tab.getByRole("button", { name: "下一个里程碑" });
    await expect.poll(() => next.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps$")))).toBe(true);
    assert.deepEqual(events, []);

    const step = async (button: typeof next) => {
      const from = tab.url();
      await button.click();
      await expect.poll(() => tab.url()).not.toBe(from);
    };
    await step(next);
    await expect.poll(() => events).toEqual(["chronicle_move"]);
    await step(previous);
    await step(next);
    assert.deepEqual(events, ["chronicle_move"]);
    for (let i = 0; i < 4; i++) await step(next);
    await expect.poll(() => events).toEqual(["chronicle_move", "chronicle_deep"]);
  } finally {
    await browser.close();
    for (const m of added) { delete m.art; delete m.artStyle; }
  }
});

test("unknown and out-of-range moments are bounded; future energy is unknown", async () => {
  const future = await page("/chronicle?t=2040");
  assert.match(future.querySelector("main")!.textContent!, /推测/);
  const energy = [...future.querySelectorAll("article")].find((el) => el.textContent?.includes("能源功率"))!;
  assert.match(energy.textContent!, /—.*尚无可靠数据/);
  assert.equal((await page("/chronicle?t=-1e20")).querySelector("h1")!.textContent, "138亿年前");
  assert.notEqual((await page("/chronicle?t=NaN")).querySelector("h1")!.textContent, "0年");
});

test("recorded day links include at, current site links do not", async () => {
  const { dateToYear } = await import("@aihot/contracts/chronicle");
  const past = await page(`/chronicle?t=${dateToYear("2026-09-01")}`);
  const card = [...past.querySelectorAll("section")].find((el) => el.textContent?.includes("这一天在本站"))!;
  for (const to of ["/", "/hot", "/daily"]) assert.ok(card.querySelector(`a[href="${to === "/" ? "/zh" : `/zh${to}`}?at=2026-09-01"]`));
  const present = await page("/chronicle?t=2040");
  const live = [...present.querySelectorAll("section")].find((el) => el.textContent?.includes("此刻的本站"))!;
  assert.ok(live.querySelector('a[href="/zh/hot"]'));
});

test.skip("feature-off chronicle 404 (compile-time industry switch)", () => {});

test("era scenes include only illustrated moments in the selected era and retain no-JS navigation", async () => {
  const server = await createServer({ configFile: false, root: new URL("../", import.meta.url).pathname, server: { middlewareMode: true, ws: false }, appType: "custom" });
  try {
    const { EraStrip } = await server.ssrLoadModule("/app/features/chrono/EraStrip.tsx");
    const eras = [
      { id: "early", from: 1800, title: "Early", summary: "Early scenes", art: "early", artStyle: "Engraving" },
      { id: "later", from: 1900, title: "Later", summary: "Later scenes", art: "later", artStyle: "Painting" },
      { id: "future", from: 2030, title: "Future", summary: "Possible futures", art: "future", artStyle: "Concept", forecast: true },
    ];
    const milestones = [
      { id: "before", t: 1799, title: "Before", art: "before" },
      { id: "start", t: 1800, title: "Start", art: "start" },
      { id: "no-art", t: 1850, title: "Without illustration" },
      { id: "last", t: 1899, title: "Last", art: "last" },
      { id: "boundary", t: 1900, title: "Boundary", art: "boundary" },
    ].map((m) => ({ ...m, precision: "year", detail: m.title, category: "compute", source: "https://example.com" }));
    const render = (current: string, path = "/chronicle") => parseHTML(renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [path] }, createElement(EraStrip, { eras, milestones, current, now: 2026 })))).document;
    const early = render("early");
    assert.equal(early.querySelectorAll(".chronicle-frame").length, 3);
    assert.deepEqual([...early.querySelectorAll(".chronicle-scene-title")].map((el) => el.textContent), ["Start", "Last"]);
    assert.equal(early.querySelector(".chronicle-scene")?.getAttribute("href"), "/chronicle?t=1800#observatory");
    assert.match(early.textContent ?? early.documentElement.textContent!, /2 scenes/);
    const later = render("later", "/zh/chronicle");
    assert.deepEqual([...later.querySelectorAll(".chronicle-scene-title")].map((el) => el.textContent), ["Boundary"]);
    assert.match(later.querySelector(".chronicle-scenes")!.textContent!, /1 幅场景/);
    const future = render("future");
    assert.equal(future.querySelectorAll(".chronicle-scene").length, 0);
    assert.equal(future.querySelector(".chronicle-era-overview")?.getAttribute("src"), "/media/art/epochs/future-hd-800.webp");
  } finally { await server.close(); }
});
