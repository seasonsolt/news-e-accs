// Process heartbeats for the runs view and the watchdog: one settings row per process role.
import { hostname } from "node:os";
import { sql } from "../db.ts";
import { createResourceSampler } from "./resources.ts";

const startedAt = new Date().toISOString();

/** What a process writes to `settings.heartbeat.<role>` (the runs view and the watchdog read it). */
export type Heartbeat = {
  pid: number;
  host: string;
  release: string;
  startedAt: string;
  at: string;
  resources?: ReturnType<ReturnType<typeof createResourceSampler>>;
};

async function beat(role: string, sample: ReturnType<typeof createResourceSampler>) {
  const value: Heartbeat = { pid: process.pid, host: hostname(), release: process.env.AIHOT_RELEASE ?? "dev", startedAt, at: new Date().toISOString(), resources: sample() };
  // Keep the observation in the journal even when the database cannot accept its heartbeat.
  console.log(JSON.stringify({ level: "info", msg: "process resources", role, pid: value.pid, release: value.release, resources: value.resources }));
  await sql`INSERT INTO settings (key, value, updated_by) VALUES (${`heartbeat.${role}`}, ${sql.json(value)}, ${role})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
}

/** Beats now and every minute until the process exits. */
export function startHeartbeat(role: string): NodeJS.Timeout {
  const sample = createResourceSampler();
  void beat(role, sample).catch(() => {});
  const timer = setInterval(() => void beat(role, sample).catch(() => {}), 60_000);
  timer.unref();
  return timer;
}
