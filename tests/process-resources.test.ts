// Diagnostics must survive in the existing heartbeat and journal without recording environment values.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, mock, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { closeDb, sql } from "@aihot/backend/db";
import { startHeartbeat, type Heartbeat } from "@aihot/backend/operations/heartbeat";
import { createResourceSampler } from "@aihot/backend/operations/resources";

after(closeDb);

test("resource samples report interval CPU, memory and the current bounded media queue", async () => {
  const { mediaCapacity } = await import("@aihot/backend/media/capacity");
  const sample = createResourceSampler();
  sample();
  const gate = Promise.withResolvers<void>();
  const jobs = [mediaCapacity.run(() => gate.promise), mediaCapacity.run(() => gate.promise), mediaCapacity.run(async () => {})];
  try {
    await delay(20);
    const resources = sample();
    assert.ok(resources.memory.rss > 0);
    assert.ok(resources.memory.heapUsed > 0);
    assert.ok(resources.memory.external >= resources.memory.arrayBuffers);
    assert.ok(resources.cpu.intervalMs >= 15);
    assert.ok(resources.cpu.userMicros >= 0 && resources.cpu.systemMicros >= 0);
    assert.ok(Number.isFinite(resources.eventLoopUtilization));
    assert.deepEqual([resources.media.running, resources.media.queued], [2, 1]);
    assert.equal(resources.media.originalCacheBytes, 0);
  } finally { gate.resolve(); await Promise.all(jobs); }
  assert.deepEqual([sample().media.running, sample().media.queued], [0, 0]);
});

test("heartbeat persists the resource sample and emits only diagnostic fields", async () => {
  const messages: Array<Record<string, unknown>> = [];
  const logger = mock.method(console, "log", (line: string) => { messages.push(JSON.parse(line)); });
  const role = `resources-${tag()}`;
  const timer = startHeartbeat(role);
  try {
    let value: Heartbeat | undefined;
    for (let i = 0; i < 100; i++) {
      value = (await sql<{ value: Heartbeat }[]>`SELECT value FROM settings WHERE key = ${`heartbeat.${role}`}`)[0]?.value;
      if (value) break;
      await delay(20);
    }
    assert.ok(value?.resources);
    assert.equal(value.pid, process.pid);
    assert.ok(value.resources.memory.rss > 0);
    assert.equal(messages.length, 1);
    assert.deepEqual(messages[0]!.resources, value.resources);
    assert.deepEqual(Object.keys(messages[0]!).sort(), ["level", "msg", "pid", "release", "resources", "role"]);
  } finally { clearInterval(timer); logger.mock.restore(); }
});
