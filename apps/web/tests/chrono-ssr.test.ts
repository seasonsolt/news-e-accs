import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { parseHTML } from "linkedom";
import { startChronoFixture } from "./chrono-fixture.ts";

let fixture: Awaited<ReturnType<typeof startChronoFixture>>;
before(async () => { fixture = await startChronoFixture(); });
after(async () => { await fixture?.close(); });

async function page(path: string, status = 200) {
  const res = await fetch(fixture.origin + path);
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
  for (const scope of [document.querySelector("aside")!, document.querySelector('nav[aria-label="底部导航"]')!]) {
    assert.ok(scope.querySelector('a[href="/?at=2026-09-01"]'));
    assert.ok(scope.querySelector('a[href="/daily?at=2026-09-01"]'));
  }
  assert.match(document.querySelector('meta[name="robots"]')!.getAttribute("content")!, /noindex/);
  assert.ok(document.querySelector('link[rel="canonical"]')!.getAttribute("href")!.endsWith("/hot"));
});

test("home, empty board and empty report history are noindex without cookies", async () => {
  for (const path of ["/?at=2026-09-01", "/leaderboard?at=2026-09-01", "/daily?at=2026-09-01"]) {
    const document = await page(path);
    assert.match(document.querySelector('meta[name="robots"]')!.getAttribute("content")!, /noindex/);
    assert.doesNotMatch(document.querySelector('link[rel="canonical"]')!.getAttribute("href")!, /at=/);
    assert.equal(document.querySelector(".onboarding-overlay"), null);
    assert.ok([...document.querySelectorAll("script")].every((script) => !script.textContent?.includes("eacc-onboarded")), "history must not run the pre-paint onboarding lock");
    if (path.startsWith("/?")) assert.ok(document.querySelector('a[href="/hot?at=2026-09-01"]'));
    if (path.startsWith("/leaderboard")) assert.match(document.querySelector("main")!.textContent!, /这一天还没有模型榜/);
  }
});

test("dated reports redirect to the right issue, retain at and stay noindex", async () => {
  const res = await fetch(fixture.origin + "/daily?at=2026-09-02", { redirect: "manual" });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/daily/2026-09-01?at=2026-09-02");
  const document = await page("/daily/2026-09-01?at=2026-09-02");
  assert.match(document.querySelector('meta[name="robots"]')!.getAttribute("content")!, /noindex/);
  assert.ok(document.querySelector('link[rel="canonical"]')!.getAttribute("href")!.endsWith("/daily/2026-09-01"));
  assert.ok(document.querySelector('a[href="/weekly?at=2026-09-02"]'));
  assert.equal(document.querySelector('.time-bar a[aria-label="后一天"]')!.getAttribute("href"), "/daily?at=2026-09-03");
  assert.ok(document.querySelector('.time-bar a[href="/daily"]'));
});

test("a failing historical board makes exactly one upstream request", async () => {
  const key = "/api/site/leaderboard/boards/coding";
  const before = fixture.hits.get(key) ?? 0;
  await page("/leaderboard/category/coding?at=2026-09-01", 503);
  assert.equal((fixture.hits.get(key) ?? 0) - before, 1);
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
  assert.ok(document.querySelector('link[rel="canonical"]')!.getAttribute("href")!.endsWith("/chronicle"));
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
  for (const to of ["/", "/hot", "/leaderboard", "/daily"]) assert.ok(card.querySelector(`a[href="${to}?at=2026-09-01"]`));
  const present = await page("/chronicle?t=2040");
  const live = [...present.querySelectorAll("section")].find((el) => el.textContent?.includes("此刻的本站"))!;
  assert.ok(live.querySelector('a[href="/hot"]'));
});

test.skip("feature-off chronicle 404 (compile-time industry switch)", () => {});
