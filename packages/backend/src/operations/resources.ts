import { performance } from "node:perf_hooks";
import { mediaCapacity } from "../media/capacity.ts";
import { mediaRequestStats } from "../media/request.ts";
import { imageMemoryStats } from "../media/images.ts";

/** Interval CPU and event-loop usage, plus current memory; no request URLs, payloads or secrets. */
export function createResourceSampler() {
  let cpu = process.cpuUsage();
  let loop = performance.eventLoopUtilization();
  let at = performance.now();
  return () => {
    const nextCpu = process.cpuUsage();
    const nextLoop = performance.eventLoopUtilization();
    const now = performance.now();
    const sample = {
      memory: { ...process.memoryUsage() },
      cpu: { userMicros: nextCpu.user - cpu.user, systemMicros: nextCpu.system - cpu.system, intervalMs: now - at },
      eventLoopUtilization: performance.eventLoopUtilization(nextLoop, loop).utilization,
      media: { ...mediaCapacity.snapshot(), ...imageMemoryStats(), requests: mediaRequestStats() },
    };
    cpu = nextCpu;
    loop = nextLoop;
    at = now;
    return sample;
  };
}
