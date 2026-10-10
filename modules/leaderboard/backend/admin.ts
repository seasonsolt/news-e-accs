import { sql } from "@aihot/backend/db";
import type { LbFetchOverview } from "../contracts.ts";

export async function fetchOverview(): Promise<LbFetchOverview | null> {
  const [row] = await sql<{ value: { at: string; sources: Record<string, Omit<LbFetchOverview["sources"][number], "key">> } }[]>`
    SELECT value FROM settings WHERE key = 'leaderboard.fetch'`;
  return row ? {
    at: row.value.at,
    sources: Object.entries(row.value.sources).map(([key, v]) => ({ key, ...v })).sort((a, b) => Number(a.ok) - Number(b.ok) || a.key.localeCompare(b.key)),
  } : null;
}
