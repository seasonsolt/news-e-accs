import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { createServer } from "vite";
import { parseHTML } from "linkedom";
import type { ChronicleMetric } from "@aihot/contracts/chronicle";
import { startChronoFixture } from "./chrono-fixture.ts";

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
    assert.equal(document.querySelector(".onboarding-overlay"), null);
    assert.ok([...document.querySelectorAll("script")].every((script) => !script.textContent?.includes("eacc-onboarded")), "history must not run the pre-paint onboarding lock");
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
  const slider = document.querySelector('[role="slider"]')!;
  assert.equal(slider.getAttribute("aria-valuetext"), "1769年");
  assert.equal(slider.hasAttribute("data-dragging"), false);
  assert.equal(document.querySelectorAll('nav[aria-label="时代"] a').length, 3);
  assert.equal(document.querySelector('nav[aria-label="时代"] a[aria-current]')!.textContent, "蒸汽时代");
  assert.match(document.querySelector("main")!.textContent!, /卡尔达肖夫指数/);
  assert.equal(document.querySelector('meta[name="robots"]'), null);
  assert.ok(document.querySelector('link[rel="canonical"]')!.getAttribute("href")!.endsWith("/zh/chronicle"));
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
