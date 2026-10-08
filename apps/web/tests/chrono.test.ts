import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { eraAt, type ChronicleEra } from "@aihot/contracts/chronicle";
import { parseAt, stepAt, withAt } from "../app/features/chrono/at.ts";
import { distanceLabel, stepEra, timeParam, untilLabel } from "../app/features/chrono/format.ts";
import { ApiError, apiErrorResponse, loadOr404 } from "../app/lib/api.server.ts";

const today = "2026-10-04";
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
