// Queue overflow/timeouts must not allocate work or leak a slot; failures must let the next job run.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createMediaCapacity, MediaBusyError } from "@aihot/backend/media/capacity";

test("capacity transfers slots in FIFO order and refuses work beyond its bounded queue", async () => {
  const capacity = createMediaCapacity({ maxConcurrent: 2, maxQueued: 2, waitMs: 1000 });
  const gate = Promise.withResolvers<void>();
  const started: number[] = [];
  const run = (n: number) => capacity.run(async () => { started.push(n); if (n < 2) await gate.promise; return n; });
  const jobs = [run(0), run(1), run(2), run(3)];
  try {
    assert.deepEqual(started, [0, 1]);
    assert.deepEqual(capacity.snapshot(), { running: 2, queued: 2, rejected: 0 });
    await assert.rejects(run(4), MediaBusyError);
    assert.deepEqual(started, [0, 1], "rejected work never starts");
  } finally { gate.resolve(); }
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3]);
  assert.deepEqual(started, [0, 1, 2, 3]);
  assert.deepEqual(capacity.snapshot(), { running: 0, queued: 0, rejected: 1 });
});

test("a timed-out waiter is removed and cannot consume capacity later", async () => {
  const capacity = createMediaCapacity({ maxConcurrent: 1, maxQueued: 1, waitMs: 20 });
  const gate = Promise.withResolvers<void>();
  const first = capacity.run(() => gate.promise);
  let called = false;
  try {
    await assert.rejects(capacity.run(async () => { called = true; }), MediaBusyError);
    assert.deepEqual(capacity.snapshot(), { running: 1, queued: 0, rejected: 1 });
  } finally { gate.resolve(); await first; }
  assert.equal(called, false);
  await capacity.run(async () => {});
  assert.equal(capacity.snapshot().running, 0);
});

test("a failed operation releases its slot to queued work", async () => {
  const capacity = createMediaCapacity({ maxConcurrent: 1, maxQueued: 1, waitMs: 1000 });
  const gate = Promise.withResolvers<void>();
  const failure = assert.rejects(capacity.run(async () => { await gate.promise; throw new Error("decode failed"); }), /decode failed/);
  const next = capacity.run(async () => "next");
  gate.resolve();
  await failure;
  assert.equal(await next, "next");
  assert.deepEqual(capacity.snapshot(), { running: 0, queued: 0, rejected: 0 });
});
