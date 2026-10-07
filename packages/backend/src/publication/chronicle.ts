// The time machine's read side: the curated civilization timeline from the industry pack
// (industry/chronicle/) and where the site's own record of each part begins.
import { readFileSync } from "node:fs";
import path from "node:path";
import { FEATURES } from "@aihot/industry/features";
import { decimalYear, interpolateMetric, kardashev, type ChronicleEra, type ChronicleMetric, type ChronicleMilestone, type ChronicleResponse, type TimeMachineBounds } from "@aihot/contracts/chronicle";
import { beijingDate } from "@aihot/contracts/time";
import { REPO_ROOT } from "../config.ts";
import { sql } from "../db.ts";
import { cached } from "../lib/cache.ts";

let chronicleCache: ChronicleResponse | null = null;

/** The three data files, read once per process (they change only with a deploy). */
export function loadChronicle(): ChronicleResponse {
  if (!chronicleCache) {
    const dir = process.env.AIHOT_CHRONICLE_DIR || path.join(REPO_ROOT, "industry/chronicle");
    const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as T;
    chronicleCache = {
      eras: read<{ eras: ChronicleEra[] }>("eras.json").eras,
      milestones: read<{ milestones: ChronicleMilestone[] }>("milestones.json").milestones,
      metrics: read<{ series: ChronicleMetric[] }>("metrics.json").series,
    };
  }
  return chronicleCache;
}

const bounds = cached(queryBounds, { freshMs: 10 * 60_000, maxStaleMs: 24 * 3600_000 });

/** First day each part of the site has history for; a slice before it shows that part empty. */
export async function timeMachineBounds(): Promise<TimeMachineBounds> {
  return { ...(await bounds.get()), today: beijingDate(Date.now()), kardashev: kardashevNow() };
}

/** Today's Kardashev rating from the energy series, to three decimals. */
function kardashevNow(): number | null {
  const energy = loadChronicle().metrics.find((m) => m.key === "energy");
  const now = decimalYear(Date.now());
  const watts = energy ? interpolateMetric(energy.points, now, now, energy.forecastFrom) : null;
  return watts === null ? null : Math.round(kardashev(watts) * 1000) / 1000;
}

async function queryBounds(): Promise<Omit<TimeMachineBounds, "today" | "kardashev">> {
  const [row] = await sql<{ feed: Date | null; hot: Date | null; leaderboard: Date | null; daily: string | null }[]>`
    SELECT
      (SELECT min(visible_after) FROM publications WHERE visibility = 'public' AND selected) AS feed,
      (SELECT min(computed_at) FROM hot_rankings WHERE published) AS hot,
      ${FEATURES.leaderboard ? sql`(SELECT min(generated_at) FROM lb_runs WHERE status = 'published')` : sql`NULL::timestamptz`} AS leaderboard,
      (SELECT min(key) FROM reports WHERE kind = 'daily') AS daily`;
  const day = (d: Date | null | undefined) => (d ? beijingDate(d) : null);
  const parts = { feed: day(row?.feed), hot: day(row?.hot), leaderboard: day(row?.leaderboard), daily: row?.daily ?? null };
  const known = Object.values(parts).filter((d): d is string => !!d).sort();
  return { earliest: known[0] ?? null, ...parts };
}
