import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dateToYear, decimalYear, eraAt, type ChronicleEra, type ChronicleMilestone } from "@aihot/contracts/chronicle";
import { frontPageTarget, parseAt, stepAt, withAt } from "../app/features/chrono/at.ts";
import { distanceLabel, keepAxisInView, MIN_AXIS_SPAN, panAxisWindow, projectAxis, stepEra, stepPicture, timeParam, untilLabel, zoomAxisWindow } from "../app/features/chrono/format.ts";
import { ApiError, apiErrorResponse, loadOr404 } from "../app/lib/api.server.ts";

const today = "2026-10-04";
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
});

test("front-page needle routes recorded days to picks, today to live and deep time or forecasts to the full view", () => {
  const now = decimalYear("2026-10-04T12:00:00Z");
  const bounds = { today, earliest: "2026-09-01" };
  for (const t of [now, decimalYear("2026-10-04T01:00:00Z"), decimalYear("2026-10-04T23:00:00Z")]) assert.equal(frontPageTarget(t, now, bounds), "/");
  for (const date of [bounds.earliest, "2026-09-20", "2026-10-03"]) assert.equal(frontPageTarget(dateToYear(date), now, bounds), `/?at=${date}`);
  for (const t of [dateToYear("2026-08-31"), 1769, -13.787e9, dateToYear("2026-10-05"), now + 100]) assert.equal(frontPageTarget(t, now, bounds), `/?t=${timeParam(t, now)}`);
  assert.equal(frontPageTarget(dateToYear("2026-09-01"), now, { today, earliest: null }), `/?t=${timeParam(dateToYear("2026-09-01"), now)}`);
  assert.equal(frontPageTarget(now, now, { today: "2026-10-05", earliest: "2026-09-01" }), "/", "the live needle stays live even when the Beijing day is ahead of UTC");
  for (const bounds of [undefined, null]) {
    assert.equal(frontPageTarget(now, now, bounds), "/");
    for (const t of [1769, now - 1, now - 0.001, now + 0.001, now + 100]) assert.equal(frontPageTarget(t, now, bounds), `/?t=${timeParam(t, now)}`);
  }
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
