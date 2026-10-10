import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ASCENT, ASCENT_FADE, ASCENT_LOOP, ascentAt } from "../app/features/onboarding/ascent.ts";

const script = readFileSync(fileURLToPath(new URL("../../../tools/make-media.sh", import.meta.url)), "utf8");

test("the onboarding film and its captions use the same plates and timing", () => {
  const clips = [...script.matchAll(/^\s+"([a-z0-9-]+)\|[^|]+\|([\d.]+)\|/gm)].map((m) => ({ art: m[1], hold: Number(m[2]) }));
  assert.deepEqual(clips, ASCENT.map(({ art, hold }) => ({ art, hold })));
  assert.equal(Number(/\bXF=([\d.]+)/.exec(script)![1]), ASCENT_FADE);
  for (const { art } of ASCENT) assert.ok(existsSync(fileURLToPath(new URL(`../public/media/art/epochs/${art}-1600.webp`, import.meta.url))), art);
});

test("the film accelerates toward the present and settles on a Type I civilization", () => {
  const holds = ASCENT.map((a) => a.hold);
  const agents = ASCENT.findIndex((a) => a.art === "agents");
  assert.ok(holds[0]! > holds[agents]! * 2, "deep time holds far longer than the present");
  assert.equal(ASCENT.at(-1)!.art, "kardashev-i-speculative");
  assert.equal(Math.max(...holds), ASCENT.at(-1)!.hold, "the last plate holds longest");
});

test("the caption switches halfway through each crossfade and wraps with the loop", () => {
  const first = ASCENT[0]!.hold;
  assert.equal(ascentAt(0), 0);
  assert.equal(ascentAt(first - ASCENT_FADE / 2 - 0.01), 0);
  assert.equal(ascentAt(first - ASCENT_FADE / 2 + 0.01), 1);
  assert.equal(ascentAt(ASCENT_LOOP - ASCENT_FADE), ASCENT.length - 1);
  assert.equal(ascentAt(ASCENT_LOOP - 0.01), 0, "fades back into the Big Bang");
  assert.equal(ascentAt(ASCENT_LOOP + 0.5), 0, "the next loop starts over");
});
