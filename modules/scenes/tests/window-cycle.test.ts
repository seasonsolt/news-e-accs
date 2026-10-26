import assert from "node:assert/strict";
import test from "node:test";
import { WindowCycle, type WindowBlend } from "../web/agents-2026/window-cycle.ts";

function bounded(state: WindowBlend) {
  assert.ok(state.mix >= 0 && state.mix <= 1);
  assert.ok(Number.isInteger(state.from) && state.from >= 0 && state.from < 3);
  assert.ok(Number.isInteger(state.to) && state.to >= 0 && state.to < 3);
}

test("the shared panorama index begins at zero and standby never rotates", () => {
  const cycle = new WindowCycle();
  assert.deepEqual(cycle.sample(0, 0, true), { from: 0, to: 0, mix: 1 });
  assert.deepEqual(cycle.sample(0, 100, true), { from: 0, to: 0, mix: 1 });
  assert.deepEqual(cycle.sample(0, 1000, false), { from: 0, to: 0, mix: 1 });
  assert.deepEqual(new WindowCycle().sample(3, 42, true), { from: 0, to: 0, mix: 1 });
});

test("a stage change fades smoothly, then the shared panorama rotates every ten seconds", () => {
  const cycle = new WindowCycle(); cycle.sample(0, 0, true);
  assert.deepEqual(cycle.sample(1, 1, true), { from: 0, to: 1, mix: 0 });
  const halfway = cycle.sample(1, 1.7, true);
  assert.ok(Math.abs(halfway.mix - .5) < 1e-12); bounded(halfway);
  assert.deepEqual(cycle.sample(1, 2.5, true), { from: 0, to: 1, mix: 1 });
  assert.deepEqual(cycle.sample(1, 10.99, true), { from: 1, to: 1, mix: 1 });
  assert.deepEqual(cycle.sample(1, 11, true), { from: 1, to: 2, mix: 0 });
  assert.deepEqual(cycle.sample(1, 12.5, true), { from: 1, to: 2, mix: 1 });
  assert.deepEqual(cycle.sample(1, 21, true), { from: 2, to: 0, mix: 0 });
  assert.deepEqual(cycle.sample(1, 22.5, true), { from: 2, to: 0, mix: 1 });
});

test("rapid stage changes queue without replacing a half-finished blend", () => {
  const cycle = new WindowCycle(); cycle.sample(0, 0, true);
  cycle.sample(1, 1, true);
  for (const [stage, time] of [[2, 1.2], [3, 1.3]]) {
    const state = cycle.sample(stage!, time!, true);
    assert.equal(state.from, 0); assert.equal(state.to, 1); bounded(state);
  }
  assert.deepEqual(cycle.sample(3, 2.5, true), { from: 0, to: 1, mix: 1 });
  assert.deepEqual(cycle.sample(3, 2.6, true), { from: 1, to: 2, mix: 0 });
  assert.deepEqual(cycle.sample(3, 4.1, true), { from: 1, to: 2, mix: 1 });
  assert.deepEqual(cycle.sample(3, 4.2, true), { from: 2, to: 0, mix: 0 });
  assert.deepEqual(cycle.sample(3, 5.7, true), { from: 2, to: 0, mix: 1 });
  assert.deepEqual(cycle.sample(3, 5.8, true), { from: 0, to: 0, mix: 1 });
});

test("pending changes are bounded to three and reset discards a running fade and queue", () => {
  const cycle = new WindowCycle(); cycle.sample(0, 0, true); cycle.sample(1, 1, true);
  for (let stage = 2; stage <= 8; stage++) cycle.sample(stage, 1.1 + stage * .01, true);
  cycle.sample(8, 2.5, true);
  let time = 2.6;
  for (let queued = 0; queued < 3; queued++) {
    assert.equal(cycle.sample(8, time, true).mix, 0);
    assert.equal(cycle.sample(8, time + 1.5, true).mix, 1);
    time += 1.6;
  }
  assert.deepEqual(cycle.sample(8, time, true), { from: 1, to: 1, mix: 1 });
  cycle.sample(9, time + .1, true); cycle.sample(10, time + .2, true);
  assert.deepEqual(cycle.sample(0, time + .3, true), { from: 0, to: 0, mix: 1 });
  assert.deepEqual(cycle.sample(0, 1000, true), { from: 0, to: 0, mix: 1 });
  assert.deepEqual(cycle.sample(1, 1001, true), { from: 0, to: 1, mix: 0 });
});

test("reduced motion changes only with manual stages and resolves pending changes immediately", () => {
  const cycle = new WindowCycle(); cycle.sample(0, 0, false);
  assert.deepEqual(cycle.sample(1, 0, false), { from: 1, to: 1, mix: 1 });
  assert.deepEqual(cycle.sample(1, 100, false), { from: 1, to: 1, mix: 1 });
  assert.deepEqual(cycle.sample(2, 100, false), { from: 2, to: 2, mix: 1 });
  assert.deepEqual(cycle.sample(3, 100, false), { from: 0, to: 0, mix: 1 });
  assert.deepEqual(cycle.sample(3, 1000, false), { from: 0, to: 0, mix: 1 });
  assert.deepEqual(cycle.sample(0, 1000, false), { from: 0, to: 0, mix: 1 });
  cycle.sample(1, 1001, true); cycle.sample(2, 1001.1, true);
  assert.deepEqual(cycle.sample(2, 1001.2, false), { from: 2, to: 2, mix: 1 });
  assert.deepEqual(cycle.sample(2, 2000, false), { from: 2, to: 2, mix: 1 });
});

test("a stopped scene clock cannot advance a fade or trigger automatic rotation", () => {
  const cycle = new WindowCycle(); cycle.sample(0, 0, true); cycle.sample(1, 1, true);
  const paused = cycle.sample(1, 1.5, true);
  for (let frame = 0; frame < 20; frame++) assert.deepEqual(cycle.sample(1, 1.5, true), paused);
  cycle.sample(1, 2.5, true);
  for (let frame = 0; frame < 20; frame++) assert.deepEqual(cycle.sample(1, 3, true), { from: 1, to: 1, mix: 1 });
  const resumed = cycle.sample(1, 11, true); assert.deepEqual(resumed, { from: 1, to: 2, mix: 0 });
  assert.deepEqual(cycle.sample(1, 1000, true), { from: 1, to: 2, mix: 1 });
  assert.deepEqual(cycle.sample(1, 1000.1, true), { from: 2, to: 2, mix: 1 });
});

test("fade endpoints clamp exactly and intermediate samples use smoothstep rather than linear opacity", () => {
  const cycle = new WindowCycle(); cycle.sample(0, 0, true);
  assert.deepEqual(cycle.sample(1, 0, true), { from: 0, to: 1, mix: 0 });
  assert.ok(Math.abs(cycle.sample(1, .35, true).mix - .15625) < 1e-12);
  assert.ok(Math.abs(cycle.sample(1, .7, true).mix - .5) < 1e-12);
  assert.ok(Math.abs(cycle.sample(1, 1.05, true).mix - .84375) < 1e-12);
  assert.deepEqual(cycle.sample(1, 1.4, true), { from: 0, to: 1, mix: 1 });
  assert.deepEqual(cycle.sample(1, 1.4001, true), { from: 1, to: 1, mix: 1 });
});
