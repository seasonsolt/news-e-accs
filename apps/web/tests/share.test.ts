import assert from "node:assert/strict";
import { test } from "node:test";
import { shareOrCopy } from "../app/features/item/share.ts";

test("sharing and copying count only after completion; cancellation and failure do not count", async () => {
  const originals = new Map(["window", "navigator", "matchMedia", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let coarse = true;
  let fail = false;
  let calls = 0;
  let completed = false;
  const action = async () => {
    assert.equal(completed, false);
    if (fail) throw new DOMException("Cancelled", "AbortError");
    completed = true;
  };
  Object.defineProperties(globalThis, {
    window: { value: {}, configurable: true },
    navigator: { value: { share: action, clipboard: { writeText: action } }, configurable: true },
    matchMedia: { value: () => ({ matches: coarse }), configurable: true },
    fetch: { value: async () => { assert.equal(completed, true); calls++; return new Response(null, { status: 204 }); }, configurable: true },
  });
  try {
    assert.equal(await shareOrCopy("Title", "https://example.org"), "shared");
    assert.equal(calls, 1);
    completed = false;
    fail = true;
    assert.equal(await shareOrCopy("Title", "https://example.org"), null);
    assert.equal(calls, 1);
    coarse = false;
    assert.equal(await shareOrCopy("Title", "https://example.org"), null);
    assert.equal(calls, 1);
    fail = false;
    assert.equal(await shareOrCopy("Title", "https://example.org"), "copied");
    assert.equal(calls, 2);
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
