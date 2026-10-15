import assert from "node:assert/strict";
import { after, test } from "node:test";
import { beijingDate, beijingTime } from "@aihot/contracts/time";
import { outboundLink, recordEngagement } from "../app/lib/engagement.ts";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
after(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

let instance = 0;
async function reader(starred: unknown[] = []) {
  const values = new Map([["aihot-starred-items", JSON.stringify(starred)]]);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    } },
  });
  // Reopening the page starts with an empty snapshot cache.
  const state: typeof import("../app/lib/local-state.ts") = await import(`../app/lib/local-state.ts?test=${instance++}`);
  return { state, values };
}

const displayDate = (value: string) => `${beijingDate(value)} ${beijingTime(value)}`;

test("import keeps bookmarks with invalid dates and persists displayable replacements", async () => {
  const invalid = ["broken", "", "999999-01-01", "+275760-09-13T00:00:00.000Z", null, 42, {}];
  const { state, values } = await reader();
  const before = Date.now();
  const report = state.importBundle(JSON.stringify({ version: 1, starred: invalid.map((date, i) => ({
    id: `import-${i}`, title: `Bookmark ${i}`, savedAt: date, publishedAt: date,
  })) }));
  assert.equal(report.starredAdded, invalid.length);
  assert.equal(values.get(state.KEYS.firstStar), "1", "imported stars are already on the device, so they are not a first star");
  const saved = JSON.parse(values.get(state.KEYS.starred)!);
  assert.equal(saved.length, invalid.length);
  for (const item of saved) {
    assert.equal(item.publishedAt, null);
    assert.ok(Date.parse(item.savedAt) >= before && Date.parse(item.savedAt) <= Date.now());
    assert.doesNotThrow(() => displayDate(item.savedAt));
  }
});

test("stored bookmarks with damaged dates remain readable, exportable and removable", async () => {
  const { state } = await reader([{ id: "stored", title: "Keep me", savedAt: "broken", publishedAt: "broken" }]);
  const starred = state.getStarred();
  assert.equal(starred.length, 1);
  assert.equal(starred[0]!.title, "Keep me");
  assert.equal(starred[0]!.publishedAt, null);
  assert.doesNotThrow(() => displayDate(starred[0]!.savedAt));
  assert.strictEqual(state.getStarred(), starred, "React snapshots must stay stable between changes");
  assert.deepEqual(state.exportBundle().starred, starred);
  assert.deepEqual(state.removeStars(["stored"]).map((s) => s.id), ["stored"]);
  assert.deepEqual(state.getStarred(), []);
});

test("valid dates are preserved and an import cannot replace an existing bookmark", async () => {
  const existing = { id: "valid", title: "Original", savedAt: "2026-09-29T08:30:00+08:00", publishedAt: "2026-09-28T23:00:00Z" };
  const { state } = await reader([existing]);
  const report = state.importBundle(JSON.stringify({ version: 1, starred: [{ ...existing, title: "Replacement", savedAt: "broken" }] }));
  assert.equal(report.starredAdded, 0);
  const [saved] = state.getStarred();
  assert.equal(saved!.title, existing.title);
  assert.equal(saved!.savedAt, existing.savedAt);
  assert.equal(saved!.publishedAt, existing.publishedAt);
});

// Failure cases before changing storage: another tab's writes must survive a cached-tab edit;
// unreadable bookmarks must not be overwritten and failed writes must not report success.
test("a cached tab merges newer saved bookmarks and read marks before writing", async () => {
  const { state, values } = await reader([{ id: "old", title: "Old" }]);
  state.getStarred();
  state.getReadIds();
  values.set(state.KEYS.starred, JSON.stringify([{ id: "other-tab", title: "Other tab" }, { id: "old", title: "Old" }]));
  values.set(state.KEYS.read, JSON.stringify(["other-tab"]));
  state.toggleStar({ id: "new", title: "New", summary: null, sourceName: "", publishedAt: null, score: null, aiSelected: false });
  state.markRead("new");
  assert.deepEqual(state.getStarred().map((s) => s.id), ["new", "other-tab", "old"]);
  assert.deepEqual(state.getReadIds(), ["new", "other-tab"]);
});

test("failed bookmark writes and damaged existing data do not report a successful toggle", async () => {
  const { state, values } = await reader();
  const item = { id: "new", title: "New", summary: null, sourceName: "", publishedAt: null, score: null, aiSelected: false };
  values.set(state.KEYS.starred, "damaged original data");
  assert.equal(state.toggleStar(item), false);
  assert.equal(values.get(state.KEYS.starred), "damaged original data");
  window.localStorage.setItem = () => { throw new Error("quota"); };
  assert.equal(state.toggleStar(item), false);
});

const star = (id: string) => ({ id, title: id, summary: null, sourceName: "", publishedAt: null, score: null, aiSelected: false });

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

/** Captures report requests instead of sending them. */
function listen(calls: Array<{ url: string; init: RequestInit }>, response: Promise<Response> = Promise.resolve(new Response(null, { status: 204 }))) {
  globalThis.fetch = ((url: string, init: RequestInit) => { calls.push({ url, init }); return response; }) as typeof fetch;
}
const bodies = (calls: Array<{ init: RequestInit }>) => calls.map((c) => c.init.body);

test("the first star on a device is counted once, and an existing list is not a new device", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const { state, values } = await reader();
  listen(calls);
  assert.equal(state.toggleStar(star("first")), true);
  assert.equal(state.toggleStar(star("second")), true);
  assert.equal(values.get(state.KEYS.firstStar), "1");
  assert.deepEqual(bodies(calls), [
    JSON.stringify({ event: "star_add", target: "first" }),
    JSON.stringify({ event: "first_star", target: "" }),
    JSON.stringify({ event: "star_add", target: "second" }),
  ]);

  calls.length = 0;
  const existing = await reader([{ id: "kept", title: "Kept" }]);
  existing.state.noteExistingStars();
  assert.equal(existing.values.get(existing.state.KEYS.firstStar), "1");
  assert.equal(calls.length, 0);
  let hinted = 0;
  const stop = existing.state.onFirstStar(() => { hinted += 1; });
  assert.equal(existing.state.toggleStar(star("kept")), false);
  assert.equal(existing.state.toggleStar(star("later")), true);
  assert.deepEqual(bodies(calls), [
    JSON.stringify({ event: "star_remove", target: "kept" }),
    JSON.stringify({ event: "star_add", target: "later" }),
  ]);
  assert.equal(hinted, 0);
  stop();
});

test("the first-star hint fires once, on the first star a device saves", async () => {
  const { state } = await reader();
  listen([]);
  let hinted = 0;
  const stop = state.onFirstStar(() => { hinted += 1; });
  state.toggleStar(star("first"));
  state.toggleStar(star("first"));
  state.toggleStar(star("second"));
  assert.equal(hinted, 1);
  stop();
});

test("removed stars come back in their saved order, without duplicates, on undo", async () => {
  const items = ["c", "b", "a"].map((id, i) => ({ id, title: id, savedAt: `2026-10-0${3 - i}T00:00:00.000Z` }));
  const { state } = await reader(items);
  const removed = state.removeStars(["b", "a", "missing"]);
  assert.deepEqual(removed.map((s) => s.id), ["b", "a"]);
  assert.deepEqual(state.getStarred().map((s) => s.id), ["c"]);
  state.toggleStar({ id: "a", title: "a", summary: null, sourceName: "", publishedAt: null, score: null, aiSelected: false });
  state.restoreStars(removed);
  assert.deepEqual(state.getStarred().map((s) => s.id), ["a", "c", "b"], "a star saved again meanwhile is not duplicated");
  assert.equal(state.getStarred().find((s) => s.id === "b")!.savedAt, "2026-10-02T00:00:00.000Z");
});

test("the last backup time is kept and a damaged value reads as none", async () => {
  const { state, values } = await reader();
  assert.equal(state.getLastBackup(), null);
  state.markBackedUp(new Date("2026-10-01T08:00:00.000Z"));
  assert.equal(state.getLastBackup(), "2026-10-01T08:00:00.000Z");
  values.set(state.KEYS.lastBackup, "broken");
  assert.equal(state.getLastBackup(), null);
});

test("engagement reports are fire-and-forget, skipped during SSR, and count middle clicks on source links", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  listen(calls, Promise.reject(new Error("offline")));
  const saved = Object.getOwnPropertyDescriptor(globalThis, "window");
  Reflect.deleteProperty(globalThis, "window");
  recordEngagement("share_click");
  assert.equal(calls.length, 0);

  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  recordEngagement("share_click");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1, "a failed send is swallowed");
  assert.equal(calls[0]!.url, "/api/site/events");
  assert.equal(calls[0]!.init.method, "POST");
  assert.equal(calls[0]!.init.keepalive, true);
  assert.equal(calls[0]!.init.credentials, "omit");
  assert.equal(calls[0]!.init.body, JSON.stringify({ event: "share_click", target: "" }));

  calls.length = 0;
  listen(calls);
  const link = outboundLink("https://WWW.Example.com/a/b?token=1");
  link.onClick();
  link.onAuxClick({ button: 1 });
  link.onAuxClick({ button: 2 });
  assert.deepEqual(bodies(calls), [
    JSON.stringify({ event: "outbound_click", target: "example.com" }),
    JSON.stringify({ event: "outbound_click", target: "example.com" }),
  ]);
  if (saved) Object.defineProperty(globalThis, "window", saved);
  else Reflect.deleteProperty(globalThis, "window");
});
