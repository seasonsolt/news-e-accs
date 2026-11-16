// The worker watchdog, run from the api process (the worker cannot report its own death). It keeps its
// state in settings and sends its own alerts.
import { sql } from "../db.ts";
import { wakeAgent, flushAgentEvents } from "../notify/agent.ts";
import { formatAlert, formatRecovery, sendAlert, type Finding } from "../notify/feishu.ts";

// The process manager restarts a crashed worker within seconds and a deploy restarts it on purpose;
// half an hour without a heartbeat means those did not help.
const WORKER_STALE_MS = 30 * 60_000;

const WORKER_DOWN: Finding = {
  key: "worker",
  level: "now",
  title: "后台处理服务停了，网站不会出现新内容",
  impact: "新内容的采集、处理、推送和日报全部暂停，网站停在旧内容上",
  heals: "系统自动重启没有成功",
  action: "把这条发给 AI 排查重启",
};

/** The models worker of a split (jobs/roles.ts); watched only once it has ever beaten. */
const MODELS_DOWN: Finding = {
  key: "worker-models",
  level: "now",
  title: "模型处理服务停了，翻译、写作和配图暂停",
  impact: "新内容照常采集和发布，但英文版翻译、公众号点评、长文和配图都停下等待",
  heals: "系统自动重启没有成功",
  action: "把这条发给 AI 排查重启",
};

/** Each worker role's heartbeat (operations/heartbeat.ts), with what its silence means. */
const WATCHED = [{ role: "worker", finding: WORKER_DOWN }, { role: "worker-models", finding: MODELS_DOWN }];

/**
 * Runs in the api process: alerts once when a worker's heartbeat is older than half an hour, and once
 * when it recovers. The stored state moves only after the message went out, so a failed send is tried
 * again at the next check; the lock keeps two api processes (two overlap during a deploy) from both sending.
 * A role that never beat is not watched; when one is retired for good, delete its heartbeat row.
 */
export async function checkWorkerHeartbeat(): Promise<void> {
  for (const { role, finding } of WATCHED) await checkRole(role, finding);
  await flushAgentEvents();
}

async function checkRole(role: string, down: Finding): Promise<void> {
  const wentDown = await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`watchdog.${role}`}))`;
    const [hb] = await tx<{ updated_at: Date }[]>`SELECT updated_at FROM settings WHERE key = ${`heartbeat.${role}`}`;
    if (!hb) return null;
    const [prior] = await tx<{ value: { state: "up" | "down"; since: string } }[]>`SELECT value FROM settings WHERE key = ${`watchdog.${role}`}`;
    const now = Date.now();
    const stale = now - hb.updated_at.getTime() > WORKER_STALE_MS;
    const state = stale ? "down" : "up";
    if (prior?.value.state === state) return stale ? { since: new Date(prior.value.since) } : null;
    // A first check that finds the worker running only records it.
    if (stale) {
      const woken = await wakeAgent({ ...down, since: hb.updated_at }, now);
      const shown = woken
        ? { ...down, action: "已自动通知 AI 排查重启；如果半小时还没收到“已恢复”再问 AI" }
        : down;
      const msg = formatAlert(shown, hb.updated_at, now);
      await sendAlert(msg.title, msg.lines);
    } else if (prior) {
      const msg = formatRecovery(down.title, new Date(prior.value.since), now);
      await sendAlert(msg.title, msg.lines);
    }
    // "since" of a down state is the last heartbeat, so the recovery can say how long it lasted.
    const since = stale ? hb.updated_at : new Date(now);
    await tx`INSERT INTO settings (key, value, updated_by) VALUES (${`watchdog.${role}`}, ${tx.json({ state, since: since.toISOString() })}, 'api')
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    return stale ? { since: hb.updated_at } : null;
  });
  // The hub deduplicates uncertain sends by their persisted occurrence ID.
  if (wentDown) await wakeAgent({ ...down, since: wentDown.since });
}

export function startWorkerWatchdog(): NodeJS.Timeout {
  const timer = setInterval(() => void checkWorkerHeartbeat().catch(() => {}), 5 * 60_000);
  timer.unref();
  return timer;
}
