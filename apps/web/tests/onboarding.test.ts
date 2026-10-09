import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { ASCENT, ASCENT_FADE, ASCENT_STEP, ascentAt } from "../app/features/onboarding/ascent.ts";

const script = readFileSync(fileURLToPath(new URL("../../../tools/make-media.sh", import.meta.url)), "utf8");

test("the onboarding film and its captions use the same plates and timing", () => {
  const clips = [...script.matchAll(/^\s+"([a-z0-9-]+)\|/gm)].map((m) => m[1]);
  assert.deepEqual(clips, ASCENT.map((a) => a.art));
  const d = Number(/\bD=([\d.]+)/.exec(script)![1]);
  const xf = Number(/\bXF=([\d.]+)/.exec(script)![1]);
  assert.equal(xf, ASCENT_FADE);
  assert.equal(Math.round((d - xf) * 1000), Math.round(ASCENT_STEP * 1000));
  for (const { art } of ASCENT) assert.ok(existsSync(fileURLToPath(new URL(`../public/media/art/epochs/${art}-1600.webp`, import.meta.url))), art);
});

test("the caption switches halfway through each crossfade and wraps with the loop", () => {
  const loop = ASCENT.length * ASCENT_STEP;
  assert.equal(ascentAt(0), 0);
  assert.equal(ascentAt(ASCENT_STEP - ASCENT_FADE / 2 - 0.01), 0);
  assert.equal(ascentAt(ASCENT_STEP - ASCENT_FADE / 2 + 0.01), 1);
  assert.equal(ascentAt(loop - ASCENT_FADE), ASCENT.length - 1, "ends on a Type I civilization");
  assert.equal(ascentAt(loop - 0.01), 0, "fades back into the Big Bang");
  assert.equal(ASCENT.at(-1)!.art, "kardashev-i-speculative");
});
