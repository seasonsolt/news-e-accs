import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { eraAt, type ChronicleEra, type ChronicleMilestone } from "@aihot/contracts/chronicle";
import { parseAt, stepAt, timelessAddress, withAt } from "../app/features/chrono/at.ts";
import { calendarTicks, distanceLabel, keepAxisInView, MIN_AXIS_SPAN, nearbyPlates, panAxisWindow, projectAxis, stepEra, stepPicture, timeParam, untilLabel, zoomAxisWindow } from "../app/features/chrono/format.ts";
import { ApiError, apiErrorResponse, loadOr404 } from "../app/lib/api.server.ts";
import { artSrcSet, artUrl, artWidth, loadArtImage } from "../app/features/chrono/art.ts";

test("every responsive Chronicle size uses the enhanced artwork and a fresh URL", () => {
  const src = "/media/art/epochs/steam-age";
  assert.equal(artUrl(src, 800), `${src}-hd-800.webp`);
  assert.equal(artUrl(src, 1600), `${src}-hd-1600.webp`);
  assert.equal(artUrl(src, 3840), `${src}-3840.webp`);
  assert.equal(artSrcSet(src), `${src}-hd-800.webp 800w, ${src}-hd-1600.webp 1600w, ${src}-3840.webp 3840w`);
});

const today = "2026-10-04";
test("plate resolution covers portrait crops and respects both GPU texture dimensions", () => {
  assert.equal(artWidth(320, 180, 1, 4096), 800);
  assert.equal(artWidth(1280, 720, 1, 4096), 1600);
  assert.equal(artWidth(390, 560, 2, 4096), 3840, "a tall phone crop needs more than 1600 source pixels");
  assert.equal(artWidth(1920, 1080, 3, 4096), 3840, "rendering DPR is capped at two");
  assert.equal(artWidth(1920, 1080, 2, 2048), 1600);
  assert.equal(artWidth(1920, 1080, 2, 1024), 800);
  assert.equal(artWidth(1000, 1000, 2, 4096, .5), 1600, "a portrait texture's height must fit too");
  assert.equal(artWidth(390, 560, 2, 512), null);
  assert.equal(artWidth(390, 500, 2, 4096), 1600);
  assert.equal(artWidth(390, 500, 2, 4096, 3840 / 2162), 3840, "Stargate's wider crop needs the next size even when a 3:2 plate fits 1600");
});

test("changing plates abandons a pending high-resolution image and never resolves its late decode", async () => {
  const original = globalThis.Image;
  const images: StubImage[] = [];
  class StubImage {
    src = "";
    finish!: () => void;
    constructor() { images.push(this); }
    decode() { return new Promise<void>((resolve) => { this.finish = resolve; }); }
    removeAttribute(name: string) { if (name === "src") this.src = ""; }
  }
  globalThis.Image = StubImage as unknown as typeof Image;
  try {
    const controller = new AbortController();
    const pending = loadArtImage("/first-3840.webp", controller.signal);
    assert.equal(images[0]!.src, "/first-3840.webp");
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    images[0]!.finish();
    await Promise.resolve();
    assert.equal(images[0]!.src, "");
    const next = loadArtImage("/second-3840.webp", new AbortController().signal);
    images[1]!.finish();
    assert.equal(await next, images[1]);
  } finally { globalThis.Image = original; }
});

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
}

test("axis projection maps the visible window to the track and leaves off-screen points outside", () => {
  const view = { lo: 0.25, hi: 0.5 };
  assert.equal(projectAxis(0.25, view), 0);
  assert.equal(projectAxis(0.375, view), 0.5);
  assert.equal(projectAxis(0.5, view), 1);
  assert.equal(projectAxis(0, view), -1);
  assert.equal(projectAxis(0.75, view), 2);
  for (const u of [0, 0.1, 0.5, 1]) assert.equal(projectAxis(u, { lo: 0, hi: 1 }), u);
});

test("axis zoom preserves the pointer's position until clamped, with a minimum span", () => {
  const view = { lo: 0.2, hi: 0.8 };
  for (const anchor of [view.lo, 0.35, view.hi]) {
    const zoomed = zoomAxisWindow(view, anchor, 2);
    near(zoomed.hi - zoomed.lo, 0.3);
    near(projectAxis(anchor, zoomed), projectAxis(anchor, view));
    const restored = zoomAxisWindow(zoomed, anchor, 0.5);
    near(restored.lo, view.lo);
    near(restored.hi, view.hi);
  }
  const left = zoomAxisWindow({ lo: 0, hi: 0.2 }, 0.2, 0.5);
  assert.equal(left.lo, 0);
  near(left.hi, 0.4);
  const right = zoomAxisWindow({ lo: 0.8, hi: 0.9 }, 0.8, 0.5);
  near(right.lo, 0.8);
  assert.equal(right.hi, 1);
  assert.deepEqual(zoomAxisWindow(view, 0.3, 0.01), { lo: 0, hi: 1 });
  const narrow = zoomAxisWindow(view, 0.35, 1e6);
  near(narrow.hi - narrow.lo, MIN_AXIS_SPAN);
  near(projectAxis(0.35, narrow), projectAxis(0.35, view));
  const limited = zoomAxisWindow(narrow, 0.35, 2);
  near(limited.hi - limited.lo, MIN_AXIS_SPAN);
});

test("axis panning and following the needle preserve zoom at both boundaries", () => {
  const view = { lo: 0.25, hi: 0.5 };
  assert.deepEqual(panAxisWindow(view, 0.125), { lo: 0.375, hi: 0.625 });
  assert.deepEqual(panAxisWindow(view, -1), { lo: 0, hi: 0.25 });
  assert.deepEqual(panAxisWindow(view, 1), { lo: 0.75, hi: 1 });
  assert.deepEqual(panAxisWindow({ lo: 0, hi: 1 }, 0.5), { lo: 0, hi: 1 });
  for (const u of [view.lo, 0.375, view.hi]) assert.equal(keepAxisInView(view, u), view);
  for (const current of [view, { lo: 0.625, hi: 0.6265 }, { lo: 0.75, hi: 0.9 }]) {
    for (const u of [0, 0.001, 0.002, 0.003, 0.1, 0.8, 1]) {
      const followed = keepAxisInView(current, u);
      near(followed.hi - followed.lo, current.hi - current.lo);
      assert.ok(followed.lo >= 0 && followed.hi <= 1);
      assert.ok(u >= followed.lo && u <= followed.hi);
    }
  }
  assert.deepEqual(keepAxisInView(view, 0), { lo: 0, hi: 0.25 });
  assert.deepEqual(keepAxisInView(view, 1), { lo: 0.75, hi: 1 });
});

test("picture navigation visits illustrated milestones inside eras, skips bare ticks and stays put at the ends", () => {
  const eras: ChronicleEra[] = [20, 0, 10].map((from) => ({ id: `era-${from}`, from, title: "Era", summary: "", art: "era", artStyle: "" }));
  const milestones: ChronicleMilestone[] = [
    { t: 8, art: "eight" }, { t: 4 }, { t: 2, art: "two" }, { t: 8, art: "duplicate" },
  ].map((m, i) => ({ id: `moment-${i}`, precision: "year", title: "Moment", detail: "", category: "human", source: "https://example.com", ...m }));
  assert.equal(stepPicture(eras, milestones, 1, 1), 2);
  assert.equal(stepPicture(eras, milestones, 2, 1), 8);
  assert.equal(stepPicture(eras, milestones, 5, 1), 8);
  assert.equal(stepPicture(eras, milestones, 5, -1), 2);
  assert.equal(stepPicture(eras, milestones, 8, 1), 10 + 1e-9);
  assert.equal(stepPicture(eras, milestones, 10 + 1e-9, -1), 8);
  assert.equal(stepPicture(eras, milestones, 2, -1), 1e-9);
  assert.equal(stepPicture(eras, milestones, 1e-9, -1), 1e-9);
  assert.equal(stepPicture(eras, milestones, 20 + 1e-9, 1), 20 + 1e-9);
  assert.equal(stepPicture(eras, milestones, -1, -1), -1);
  assert.equal(stepPicture(eras, milestones, 21, 1), 21);
  assert.equal(stepPicture(eras, milestones, 2 - 1e-7, 1), 8);
  assert.equal(stepPicture(eras, milestones, 8 + 1e-7, -1), 2);
  assert.equal(stepPicture([], [], 5, 1), 5);
  assert.equal(stepPicture([], [], 5, -1), 5);
  assert.equal(stepPicture([], milestones, 5, 1), 8);
  assert.equal(stepPicture(eras, [], 5, 1), 10 + 1e-9);
});

test("nearby plates are the ones the arrow keys lead to, a milestone's own drawing over its era's", () => {
  // Far apart on the log axis, so that standing on one never snaps to another.
  const eras: ChronicleEra[] = [-1e9, 1900].map((from, i) => ({ id: `era-${i}`, from, title: "Era", summary: "", art: `era-${i}`, artStyle: "" }));
  const milestones: ChronicleMilestone[] = [{ t: -1e6, art: "old" }, { t: -1e3 }].map((m, i) => ({ id: `moment-${i}`, precision: "year", title: "Moment", detail: "", category: "human", source: "https://example.com", ...m }));
  assert.deepEqual(nearbyPlates(eras, milestones, -1e6, 2026), ["/media/art/epochs/era-0", "/media/art/epochs/era-1"]);
  assert.deepEqual(nearbyPlates(eras, milestones, -1e9 + 1e-9, 2026), ["/media/art/moments/old"]);
  assert.deepEqual(nearbyPlates(eras, milestones, 1900 + 1e-9, 2026), ["/media/art/moments/old"]);
});

test("era navigation visits every plate even across densely packed recent breakthroughs", () => {
  const eras = JSON.parse(readFileSync(new URL("../../../industry/chronicle/eras.json", import.meta.url), "utf8")).eras as ChronicleEra[];
  for (let i = 0; i < eras.length; i++) {
    const era = eras[i]!;
    const next = stepEra(eras, era.from, 1);
    const previous = stepEra(eras, era.from, -1);
    assert.equal(eraAt(eras, next)?.id, eras[Math.min(i + 1, eras.length - 1)]!.id);
    assert.equal(eraAt(eras, previous)?.id, eras[Math.max(i - 1, 0)]!.id);
    assert.equal(Number(timeParam(next, 2026.75)), next);
  }
  assert.equal(eraAt(eras, stepEra(eras, 2026.75, -1))?.id, "reasoning");
  assert.equal(eraAt(eras, stepEra(eras, 2024.5, 1))?.id, "reasoning");
  assert.equal(stepEra([], 2026, 1), 2026);
});
test("past days are URL state, today and the future are live", () => {
  assert.equal(parseAt("?at=2026-09-01", today), "2026-09-01");
  for (const search of ["", "?at=2026-10-04", "?at=2026-10-05", "?at=2026-02-30", "?at=bad"]) assert.equal(parseAt(search, today), null);
  assert.equal(stepAt(null, -1, today), "2026-10-03");
  assert.equal(stepAt("2026-10-03", 1, today), null);
  assert.equal(stepAt("2026-10-03", 2, today), null);
  assert.equal(stepAt("2024-03-01", -1, today), "2024-02-29");
  assert.equal(stepAt("2026-01-01", -1, today), "2025-12-31");
  assert.equal(withAt("/hot?category=ai-models#rank", "2026-09-01"), "/hot?category=ai-models&at=2026-09-01#rank");
  assert.equal(withAt("/hot?at=2026-09-01&other=1#rank", null), "/hot?other=1#rank");
  assert.equal(withAt("/hot#rank", null), "/hot#rank");
  assert.equal(withAt("/hot?at=2026-09-01", "2026-09-02"), "/hot?at=2026-09-02");
  // Pages that show the present never gain an address per day.
  assert.equal(withAt("/all?category=industry&page=3", "2026-09-01"), "/all?category=industry&page=3");
  assert.equal(withAt("/story/x?at=2026-09-01#sources", "2026-09-02"), "/story/x#sources");
  assert.equal(timelessAddress("/zh/all", "?at=2023-02-16&category=industry&page=27"), "/zh/all?category=industry&page=27");
  assert.equal(timelessAddress("/story/x", "?at=2023-02-16"), "/story/x");
  assert.equal(timelessAddress("/all", "?category=industry"), null);
  assert.equal(timelessAddress("/all", "?format=x"), null);
  for (const path of ["/", "/zh", "/hot", "/daily/2023-02-16", "/leaderboard"]) assert.equal(timelessAddress(path, "?at=2023-02-16"), null, path);
});

test("moment URLs preserve era boundaries and nearby calendar dates", () => {
  for (const t of [-13.787e9, -538800000, 2012.7459 + 1e-9, 2026.663 + 1e-9]) assert.ok(Math.abs(Number(timeParam(t, 2026.75)) - t) <= Math.max(1e-9, Math.abs(t) * Number.EPSILON));
  assert.equal(untilLabel(1769, 1800), "31 年后出现");
  assert.equal(untilLabel(0, 1e8), "1 亿年后出现");
  assert.equal(distanceLabel(1769, 2026), "距今 257 年");
});

test("API errors map without a second request and preserve cancellation", async () => {
  for (const status of [400, 404, 500, 503]) {
    const mapped = apiErrorResponse(new ApiError(status, null, null));
    assert.equal("init" in mapped ? mapped.init?.status : mapped.status, status < 500 ? status : 503);
  }
  const redirected = apiErrorResponse(new ApiError(503, null, null), { busyRedirect: "/search-busy" });
  assert.ok(redirected instanceof Response);
  assert.equal(redirected.headers.get("location"), "/search-busy");
  const controller = new AbortController();
  controller.abort();
  const error = new Error("cancelled");
  assert.throws(() => apiErrorResponse(error, { signal: controller.signal }), (e) => e === error);
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; return Response.json({ code: "not_found" }, { status: 404 }); };
    await assert.rejects(loadOr404("/missing"), (e: { init?: { status: number } }) => e.init?.status === 404);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test("zoomed scale counts in years, then months, then days", () => {
  assert.deepEqual(calendarTicks(2100 - 1000, 2100), []);
  assert.deepEqual(calendarTicks(2019.5, 2026.5).map(([, label]) => label), ["2020", "2021", "2022", "2023", "2024", "2025", "2026"]);
  const months = calendarTicks(2026, 2026.75).map(([, label]) => label);
  assert.ok(months.includes("2026-03") && months.every((label) => /^2026-\d\d$/.test(label)), months.join());
  const days = calendarTicks(2026.7, 2026.72).map(([, label]) => label);
  assert.ok(days.length >= 3 && days.every((label) => /^\d\d-\d\d$/.test(label)), days.join());
  for (const [from, to] of [[2019.5, 2026.5], [2026, 2026.75], [2026.7, 2026.72]] as const) {
    for (const [t] of calendarTicks(from, to)) assert.ok(t > from && t < to);
  }
});
