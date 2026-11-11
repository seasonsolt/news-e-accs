import type { AdminNavCounts } from "@aihot/contracts/admin";
import { BEIJING_TIMEZONE } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { serverModules } from "../modules.ts";
import { awaitingRelease } from "../providers/receipts.ts";

/**
 * Items waiting for the admin, on the navigation: new feedback, failing sources, receipts and deliveries in
 * doubt, newsletter subscribers confirmed today (Asia/Shanghai), and what the modules count.
 */
export async function navCounts(): Promise<AdminNavCounts> {
  const [[c], counts] = await Promise.all([
    sql<AdminNavCounts[]>`
    SELECT (SELECT count(*)::int FROM feedback WHERE status = 'new') AS feedback,
           (SELECT count(*)::int FROM sources WHERE enabled AND health = 'failing') AS sources,
           (SELECT count(*)::int FROM newsletter_subscribers WHERE status = 'confirmed' AND unsubscribed_at IS NULL
              AND confirmed_at >= date_trunc('day', now() AT TIME ZONE ${BEIJING_TIMEZONE}) AT TIME ZONE ${BEIJING_TIMEZONE}) AS newsletter,
           (SELECT count(*)::int FROM receipts WHERE ${awaitingRelease()}) + (SELECT count(*)::int FROM deliveries WHERE status = 'unknown') AS runs`,
    Promise.all(serverModules().flatMap((m) => Object.entries(m.admin?.counts ?? {}).map(async ([key, count]) => [key, await count()] as const))),
  ]);
  return { ...c, ...Object.fromEntries(counts) };
}
