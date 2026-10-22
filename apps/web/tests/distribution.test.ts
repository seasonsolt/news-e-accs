import assert from "node:assert/strict";
import { test } from "node:test";
import { distributionChannel, distributionUrl } from "@aihot/contracts/distribution";
import { dailyBriefing } from "@aihot/contracts/report-briefing";
import type { ReportDetail, ReportCitation } from "@aihot/contracts/site";

test("distribution labels are finite and preserve the destination", () => {
  assert.equal(distributionChannel("reader@example.com"), null);
  assert.equal(distributionChannel("share"), "share");
  assert.equal(distributionUrl("https://example.test/zh/story/x?at=2026-10-20#sources", "share"), "https://example.test/zh/story/x?at=2026-10-20&via=share#sources");
});
test("daily briefing uses public, deduplicated citations and only recorded follow-ups", () => {
  const cite = (id: string, extra = {}): ReportCitation => ({ itemId: id, title: id, available: true, summary: null, sourceName: "Source", sourceUrl: "https://example.test", sourceIconUrl: null, firstParty: true, publishedAt: null, ...extra });
  const a = cite("a"), b = cite("b", { followUp: "2026-10-20" }), hidden = cite("hidden", { available: false });
  const report = { kind: "daily", highlights: [a, hidden], sections: [{ items: [a, b, cite("c"), cite("d")] }], flashes: [] } as unknown as ReportDetail;
  assert.deepEqual(dailyBriefing(report).changes.map((c) => c.itemId), ["a", "b", "c"]);
  assert.deepEqual(dailyBriefing(report).followUps, [b]);
  assert.deepEqual(dailyBriefing({ ...report, kind: "weekly" }), { changes: [], followUps: [] });
});

test("visible reading pauses in hidden tabs and cleans up on navigation", async () => {
  const saved = new Map(["window", "document", "performance", "fetch", "setTimeout", "clearTimeout"].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  let time = 0, delay = 0, callback: (() => void) | undefined, listener: (() => void) | undefined;
  const doc = { visibilityState: "visible", addEventListener: (_: string, fn: () => void) => { listener = fn; }, removeEventListener: () => { listener = undefined; } };
  const events: string[] = [];
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: {} }, document: { configurable: true, value: doc },
    performance: { configurable: true, value: { now: () => time } },
    fetch: { configurable: true, value: async (_: unknown, init: RequestInit) => { events.push(JSON.parse(String(init.body)).event); return new Response(); } },
    setTimeout: { configurable: true, value: (fn: () => void, ms: number) => { callback = fn; delay = ms; return 1; } },
    clearTimeout: { configurable: true, value: () => { callback = undefined; } },
  });
  try {
    const { trackDistribution } = await import("../app/lib/distribution.ts");
    const stop = trackDistribution("share");
    assert.equal(delay, 15000);
    time = 5000; doc.visibilityState = "hidden"; listener!();
    assert.equal(callback, undefined);
    time = 95000; doc.visibilityState = "visible"; listener!();
    assert.equal(delay, 10000, "hidden time is excluded");
    callback!();
    doc.visibilityState = "hidden"; listener!();
    doc.visibilityState = "visible"; listener!();
    assert.deepEqual(events, ["distribution_visit", "distribution_read"]);
    stop(); assert.equal(listener, undefined);
    const cancel = trackDistribution(null); cancel(); assert.equal(callback, undefined);
  } finally { for (const [k, d] of saved) { if (d) Object.defineProperty(globalThis, k, d); else Reflect.deleteProperty(globalThis, k); } }
});
