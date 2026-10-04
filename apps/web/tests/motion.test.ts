// Verify the real SSR output, not a source-code snapshot: final numbers and names must survive with
// JavaScript off. Boot persistence is exercised in a sandbox, including unavailable browser storage.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { runInNewContext } from "node:vm";
import { parseHTML } from "linkedom";
import { SITE } from "@aihot/industry/site";
import { startMotionFixture } from "./motion-fixture.ts";
import { runFrames } from "../app/features/motion/viewport.ts";

let fixture: Awaited<ReturnType<typeof startMotionFixture>>;
before(async () => { fixture = await startMotionFixture(); });
after(async () => { await fixture?.close(); });

async function html(path: string) {
  const response = await fetch(fixture.origin + path);
  assert.equal(response.status, 200);
  return response.text();
}

test("SSR delivers final ranks and decimal scores on every board", async () => {
  for (const [path, score] of [["/leaderboard", "98.7"], ["/leaderboard/category/coding", "95.7"]]) {
    const body = await html(path);
    assert.ok(body.includes(`共识指数 ${score}`));
    const { document } = parseHTML(body);
    assert.equal(document.querySelector('tr[data-slug="motion-model-29"] td')?.textContent, "30");
    assert.doesNotMatch(body, /<canvas/);
  }
});

test("onboarding keeps real text and mobile exposes an operable motion toggle", async () => {
  const home = await html("/");
  assert.match(home, /e-acc\.ai · 加速日报/);
  assert.match(home, /<video[^>]*\bloop\b/);
  assert.match(await html("/more"), /aria-pressed="false"[^>]*>[\s\S]*?减少动效/);
});

test("SSR motion text occurs exactly once in score cells, ranks, titles and kickers", async () => {
  const { document: board } = parseHTML(await html("/leaderboard"));
  const rows = board.querySelectorAll("tbody tr[data-slug]");
  assert.equal(rows.length, 30);
  function once(element: Element | null, final: string) {
    assert.ok(element);
    const text = element.textContent?.trim();
    assert.equal(text, final);
    assert.equal(text.split(final).length - 1, 1);
  }
  rows.forEach((row, i) => once(row.querySelector("td:last-child"), (98.7 - i).toFixed(1)));
  once(rows[0]!.querySelector("td:first-child"), "01");
  for (const [path, mode] of [["/", "overlay"], ["/subscribe", "page"]]) {
    const { document } = parseHTML(await html(path!));
    const title = document.querySelector(`#onboarding-title-${mode}`);
    once(title, SITE.name);
    once(title?.previousElementSibling ?? null, "e-acc.ai · 加速日报");
    assert.equal(title?.tagName, mode === "page" ? "H1" : "H2");
    assert.equal(title?.previousElementSibling?.querySelector("[tabindex]"), null);
  }
});

test("motion preference is applied in the head before styles and survives storage denial", async () => {
  const body = await html("/more");
  const boot = [...body.matchAll(/<script>(.*?)<\/script>/gs)].map((match) => match[1]!).find((script) => script.includes("eacc-reduce-motion"));
  assert.ok(boot);
  assert.ok(body.indexOf(boot) < body.indexOf('rel="stylesheet"'));
  for (const preference of ["reduced", null, "invalid", "denied"]) {
    const attributes = new Map<string, string>();
    runInNewContext(boot, {
      localStorage: { getItem() { if (preference === "denied") throw new Error("denied"); return preference; } },
      document: { documentElement: { setAttribute(key: string, value: string) { attributes.set(key, value); } } },
    });
    assert.equal(attributes.get("data-motion"), preference === "reduced" ? "reduced" : undefined);
  }
});

test("finite tweens settle and release frames on finish, viewport exit and hidden tabs", (t) => {
  const frames = new Map<number, FrameRequestCallback>();
  const visibility = new Set<() => void>();
  let id = 0;
  let disconnected = 0;
  let hidden = false;
  let visible = true;
  let intersect: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
  class Observer {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe() {}
    disconnect() { disconnected++; }
  }
  const globals: Record<string, unknown> = {
    window: { innerWidth: 375, innerHeight: 812, IntersectionObserver: Observer },
    document: { get hidden() { return hidden; }, addEventListener(_key: string, fn: () => void) { visibility.add(fn); }, removeEventListener(_key: string, fn: () => void) { visibility.delete(fn); } },
    IntersectionObserver: Observer,
    requestAnimationFrame(fn: FrameRequestCallback) { frames.set(++id, fn); return id; },
    cancelAnimationFrame(key: number) { frames.delete(key); },
  };
  const original = Object.fromEntries(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    for (const key of Object.keys(globals)) {
      if (original[key]) Object.defineProperty(globalThis, key, original[key]!);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const element = { getBoundingClientRect: () => ({ width: 40, height: 20, top: visible ? 0 : 900, bottom: visible ? 20 : 920, left: 0, right: 40 }) } as unknown as Element;
  let progress = -1;
  const update = (value: number) => { progress = value; };
  const step = (now: number) => { const callbacks = [...frames.values()]; frames.clear(); for (const callback of callbacks) callback(now); };
  runFrames(element, 600, update);
  step(100); step(400);
  assert.equal(progress, 0.5);
  step(700);
  assert.equal(progress, 1);
  assert.equal(frames.size, 0);
  assert.equal(visibility.size, 0);
  runFrames(element, 600, update);
  intersect?.([{ isIntersecting: false }]);
  assert.equal(progress, 1);
  assert.equal(frames.size, 0);
  runFrames(element, 600, update);
  hidden = true;
  for (const listener of visibility) listener();
  assert.equal(progress, 1);
  assert.equal(frames.size, 0);
  hidden = false;
  visible = false;
  runFrames(element, 600, update);
  assert.equal(frames.size, 0);
  assert.equal(progress, 1);
  assert.equal(disconnected, 3);
});

test("source lineage keeps all final names, periods and notes in HTML", async () => {
  const body = await html("/leaderboard/sources");
  for (const name of ["SWE-bench Verified", "DeepSWE", "FrontierCode"]) assert.ok(body.includes(name));
  assert.equal((body.match(/data-lineage-rule=""/g) ?? []).length, 3);
});
