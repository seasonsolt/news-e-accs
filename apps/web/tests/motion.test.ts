import { localePath } from "../app/lib/locale.ts";
// Verify the real SSR output, not a source-code snapshot: final numbers and names must survive with
// JavaScript off. Boot persistence is exercised in a sandbox, including unavailable browser storage.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { runInNewContext } from "node:vm";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { parseHTML } from "linkedom";
import { SITE } from "@aihot/site";
import { startMotionFixture } from "./motion-fixture.ts";
import { runFrames } from "../app/features/motion/viewport.ts";
import { addedCardKeys, animateReadingChange, printHalftone } from "../app/features/motion/reading-flow.ts";

let fixture: Awaited<ReturnType<typeof startMotionFixture>>;
before(async () => { fixture = await startMotionFixture(); });
after(async () => { await fixture?.close(); });

async function html(path: string) {
  const response = await fetch(fixture.origin + localePath(path, "zh"), { headers: { "Accept-Language": "en" } });
  assert.equal(response.status, 200);
  return response.text();
}

test("onboarding keeps real text and mobile exposes an operable motion toggle", async () => {
  const home = await html("/");
  assert.match(home, /e-acc\.ai · 加速日报/);
  assert.match(home, /<video[^>]*\bloop\b/);
  assert.match(await html("/more"), /aria-pressed="false"[^>]*>[\s\S]*?减少动效/);
});

test("onboarding SSR has a poster layer but no film request trigger, even on /subscribe", async () => {
  for (const path of ["/", "/subscribe"]) {
    const { document } = parseHTML(await html(path));
    const video = document.querySelector("video")!;
    assert.ok(video);
    assert.equal(video.hasAttribute("src"), false);
    assert.equal(video.hasAttribute("poster"), false);
    assert.equal(video.hasAttribute("autoplay"), false);
    assert.equal(video.getAttribute("preload"), "none");
    assert.equal(video.querySelector("source[src]"), null);
    assert.ok(video.previousElementSibling?.classList.contains("onboarding-poster"));
    assert.equal(document.querySelector('link[href$=".mp4"]'), null);
    for (const attr of ["loop", "muted", "playsInline"]) assert.ok(video.hasAttribute(attr));
  }
});

test("onboarding boot preloads only the first-visit poster, before styles and hydration", async () => {
  const body = await html("/");
  const boot = [...body.matchAll(/<script>(.*?)<\/script>/gs)].map((match) => match[1]!).find((script) => script.includes("eacc-onboarded"));
  assert.ok(boot);
  assert.ok(body.indexOf(boot) < body.indexOf('rel="stylesheet"'));
  const reader = "Mozilla/5.0 Mobile Safari/537.36";
  for (const [pathname, userAgent, preference, expected] of [
    ["/", reader, null, true],
    ["/", reader, "2026-10-01T00:00:00Z", false],
    ["/", reader, "denied", false],
    ...["Googlebot", "crawler", "spider", "slurp", "preview", "Lighthouse", "HeadlessChrome"].map((ua) => ["/", ua, null, false]),
    ...["/subscribe", "/more", "/hot", "/items/test"].map((path) => [path, reader, null, false]),
  ] as Array<[string, string, string | null, boolean]>) {
    const attributes = new Map<string, string>();
    const links: Array<Record<string, string>> = [];
    runInNewContext(boot, {
      location: { pathname }, navigator: { userAgent },
      localStorage: { getItem(key: string) {
        assert.equal(key, "eacc-onboarded");
        if (preference === "denied") throw new Error("denied");
        return preference;
      } },
      document: {
        documentElement: { setAttribute(key: string, value: string) { attributes.set(key, value); } },
        createElement(tag: string) {
          assert.equal(tag, "link");
          const link: Record<string, unknown> = {};
          link.setAttribute = (key: string, value: string) => { link[key] = value; };
          return link;
        },
        head: { appendChild(link: Record<string, string>) {
          // Discovery must be coupled to showing the overlay, never an unconditional head preload.
          assert.ok(attributes.has("data-onboarding"));
          links.push(link);
        } },
      },
    });
    assert.equal(attributes.has("data-onboarding"), expected, `${pathname}: ${userAgent}: ${preference}`);
    assert.equal(links.length, expected ? 2 : 0);
    if (expected) links.forEach((link, i) => {
      assert.equal(link.rel, "preload");
      assert.equal(link.as, "image");
      assert.equal(link.fetchpriority, "high");
      assert.equal(link.media, `(orientation: ${i ? "landscape" : "portrait"})`);
      assert.equal(link.href, `/media/hero-${i ? "16x9" : "9x16"}-poster.jpg`);
    });
  }
});

test("subscription ticket SSR has one final stamp, issue time and operable stub", async () => {
  // The confirmed branch is client-only by design. Render the real component directly through
  // Vite's TSX loader, rather than adding a production route or a fake confirmation to SSR.
  const server = await createServer({ configFile: false, root: new URL("../", import.meta.url).pathname, server: { middlewareMode: true }, appType: "custom" });
  try {
    const { TearTicket } = await server.ssrLoadModule("/app/features/motion/react-bits/TearTicket.tsx") as { TearTicket: ComponentType<{ date: string }> };
    const { document } = parseHTML(renderToStaticMarkup(createElement(TearTicket, { date: "2026-10-04" })));
    const ticket = document.querySelector("[data-subscription-ticket]")!;
    for (const text of ["e/acc 日报 · 订阅凭证", "每天 08:00", "2026-10-04", "撕下票根"]) assert.equal(ticket.textContent?.split(text).length, 2);
    assert.equal(ticket.querySelector("time")?.getAttribute("dateTime"), "2026-10-04");
    assert.equal(ticket.querySelector("button")?.getAttribute("aria-label"), "撕下票根");
    assert.equal(ticket.querySelector("button")?.hasAttribute("disabled"), false);
    assert.equal(ticket.querySelector("[aria-hidden=true]")?.textContent, "");
    assert.equal(ticket.querySelector("[tabindex]"), null);
    assert.equal(ticket.querySelector("[style]"), null);
    assert.equal(ticket.hasAttribute("data-torn"), false);
  } finally { await server.close(); }
});

test("telegraph tape SSR has exactly the first five final headlines, linked once each", async () => {
  const { document } = parseHTML(await html("/hot"));
  const tape = document.querySelector("[data-telegraph-tape]")!;
  const links = tape.querySelectorAll("a");
  assert.equal(links.length, 5);
  links.forEach((link, i) => {
    assert.equal(link.textContent, `热点事件 ${i}`);
    assert.equal(tape.textContent?.split(`热点事件 ${i}`).length, 2);
    assert.equal(link.getAttribute("href"), `/zh/story/motion-story-${i}`);
  });
  assert.equal(tape.querySelector("button")?.getAttribute("aria-label"), "重播热点电报");
  assert.equal(tape.textContent?.split("重播").length, 2);
  assert.equal(tape.querySelector("[tabindex], [style]"), null);
  assert.ok(tape.querySelector(".overflow-x-auto"));
});

test("404 flap and caption are final and singular; other errors have neither egg", async () => {
  for (const [path, status] of [["/items/missing", 404], ["/items/broken", 503]] as const) {
    const response = await fetch(fixture.origin + localePath(path, "zh"), { headers: { "Accept-Language": "en" } });
    assert.equal(response.status, status);
    const { document } = parseHTML(await response.text());
    const board = document.querySelector(".not-found-board");
    const caption = document.querySelector("[data-telegraph-caption]");
    if (status === 404) {
      assert.equal(board?.tagName, "BUTTON");
      assert.equal(board?.textContent, "404");
      assert.equal(board?.getAttribute("aria-label"), "翻动 404 状态牌");
      assert.equal(board?.querySelectorAll("[aria-hidden=true]").length, 2);
      assert.equal(board?.querySelector("[style]"), null);
      assert.equal(caption?.textContent, "电报未送达 · 线路上没有这一页");
      assert.equal(caption?.parentElement?.textContent?.split(caption.textContent).length, 2);
    } else {
      assert.equal(board, null);
      assert.equal(caption, null);
      assert.ok(document.querySelector("#main")?.textContent?.includes("暂时无法加载"));
    }
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
  const observed: Element[] = [];
  let hidden = false;
  let visible = true;
  let intersect: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
  class Observer {
    constructor(callback: typeof intersect) { intersect = callback; }
    observe(element: Element) { observed.push(element); }
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

  // The new WAAPI clock and halftone mask share exactly the same bounded lifetime.
  visible = true;
  let paused = false;
  let cancelled = false;
  const animation = { currentTime: 0, pause() { paused = true; }, cancel() { cancelled = true; } };
  const target = Object.assign(element, { style: { maskImage: "", maskSize: "" }, animate: () => animation }) as unknown as HTMLElement;
  const stationaryFrame = { getBoundingClientRect: element.getBoundingClientRect } as Element;
  animateReadingChange(target, [{ transform: "translateY(7px)" }, { transform: "none" }], 420, 0, stationaryFrame);
  assert.equal(observed.at(-1), stationaryFrame);
  assert.equal(paused, true);
  step(800); step(1010);
  assert.equal(animation.currentTime, 210);
  intersect?.([{ isIntersecting: false }]);
  assert.equal(cancelled, true);
  assert.equal(animation.currentTime, 420);
  assert.equal(frames.size, 0);
  printHalftone(target);
  step(1100); step(1450);
  assert.match(target.style.maskImage, /radial-gradient/);
  assert.equal(target.style.maskSize, "8px 8px");
  hidden = true;
  for (const listener of visibility) listener();
  assert.equal(target.style.maskImage, "");
  assert.equal(target.style.maskSize, "");
  assert.equal(frames.size, 0);
  assert.equal(visibility.size, 0);
});

test("reading-flow SSR keeps each hot rank, heat, headline and feed string exactly once", async () => {
  const { document: hot } = parseHTML(await html("/hot"));
  const rows = hot.querySelectorAll("[data-hot-id]");
  assert.equal(rows.length, 10);
  rows.forEach((row, i) => {
    const rank = row.querySelector("[data-text]")?.parentElement;
    assert.equal(rank?.textContent, `${i < 3 ? "NO." : ""}${String(i + 1).padStart(2, "0")}`);
    assert.equal(rank?.querySelectorAll("[aria-hidden=true]").length, 2);
    const heat = String(987 - i * 37);
    assert.equal(row.querySelectorAll(".inline-block.tabular-nums").length, 1);
    assert.equal(row.querySelector(".inline-block.tabular-nums")?.textContent, heat);
    assert.equal(row.textContent?.split(heat).length, 2);
    assert.equal(row.querySelector("a")?.textContent, `热点事件 ${i}`);
    assert.equal(row.textContent?.split(`热点事件 ${i}`).length, 2);
  });
  const { document: feed } = parseHTML(await html("/?category=ai-models"));
  const cards = feed.querySelectorAll("[data-card-key]");
  assert.equal(cards.length, 12);
  cards.forEach((card, i) => {
    assert.equal(card.querySelector("h3")?.textContent, `测试报道 ${i}`);
    assert.equal(card.querySelector("h3")?.querySelectorAll("[aria-hidden], .sr-only").length, 0);
    assert.equal(card.textContent?.split(`独立摘要 ${i}`).length, 2);
    assert.doesNotMatch(card.className, /animate-fade-up/);
    assert.equal(card.getAttribute("style"), null);
    const star = card.querySelector("button[aria-label='收藏']");
    assert.ok(star);
    assert.equal(star.textContent, "");
    const decoration = star.querySelector("span[aria-hidden=true]");
    assert.equal(decoration?.children.length, 8);
    assert.equal(decoration?.querySelector("[tabindex]"), null);
  });
});

test("empty and error art have one final image, one copy of the accompanying text, no SSR mask", async () => {
  for (const [path, status, title] of [["/", 200, "这个筛选下还没有精选内容"], ["/items/missing", 404, "这里没有内容"]] as const) {
    const response = await fetch(fixture.origin + localePath(path, "zh"), { headers: { "Accept-Language": "en" } });
    assert.equal(response.status, status);
    const { document } = parseHTML(await response.text());
    const art = document.querySelectorAll(".empty-art");
    assert.equal(art.length, 1);
    assert.equal(art[0]?.getAttribute("src"), "/media/art/empty-800.webp");
    assert.equal(art[0]?.getAttribute("aria-hidden"), "true");
    assert.equal(art[0]?.getAttribute("style"), null);
    assert.equal(art[0]?.parentElement?.textContent?.split(title).length, 2);
  }
});

test("arrival eligibility excludes every existing key, including overlapping pages and refresh heads", () => {
  const before = [{ key: "a" }, { key: "b" }];
  assert.deepEqual([...addedCardKeys(before, [{ key: "b" }, { key: "c" }])], ["c"]);
  assert.deepEqual([...addedCardKeys(before, [{ key: "new" }, ...before])], ["new"]);
  assert.deepEqual([...addedCardKeys(before, [...before].reverse())], []);
  assert.deepEqual([...addedCardKeys(before, before)], []);
});

