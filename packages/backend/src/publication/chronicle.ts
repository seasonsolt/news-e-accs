// The time machine's read side: the curated civilization timeline from the industry pack
// (industry/chronicle/) and where the site's own record of each part begins.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { decimalYear, interpolateMetric, kardashev, type ChronicleEra, type ChronicleMetric, type ChronicleMilestone, type ChronicleResponse, type TimeMachineBounds } from "@aihot/contracts/chronicle";
import { beijingDate } from "@aihot/contracts/time";
import { REPO_ROOT } from "../config.ts";
import { sql } from "../db.ts";
import { cached } from "../lib/cache.ts";

/** en.json: the English reader text, by era and milestone id and metric key; a missing field keeps the Chinese. */
interface ChronicleEnglish {
  eras?: Record<string, Partial<Pick<ChronicleEra, "title" | "summary" | "artStyle" | "epoch">>>;
  milestones?: Record<string, Partial<Pick<ChronicleMilestone, "title" | "detail" | "capability" | "artStyle">> & { forecastBy?: string }>;
  metrics?: Record<string, Partial<Pick<ChronicleMetric, "label" | "unit" | "note">> & { sourceName?: string }>;
}

const chronicleCache = new Map<"zh" | "en", ChronicleResponse>();

function chronicleDir() {
  return process.env.AIHOT_CHRONICLE_DIR || path.join(REPO_ROOT, "industry/chronicle");
}

/** The data files, read once per process and edition (they change only with a deploy). */
export function loadChronicle(lang: "zh" | "en" = "zh"): ChronicleResponse {
  let chronicle = chronicleCache.get(lang);
  if (!chronicle) {
    const read = <T>(file: string): T => JSON.parse(readFileSync(path.join(chronicleDir(), file), "utf8")) as T;
    if (lang === "zh") {
      chronicle = {
        eras: read<{ eras: ChronicleEra[] }>("eras.json").eras,
        milestones: read<{ milestones: ChronicleMilestone[] }>("milestones.json").milestones,
        metrics: read<{ series: ChronicleMetric[] }>("metrics.json").series,
      };
    } else {
      const zh = loadChronicle("zh");
      const en = existsSync(path.join(chronicleDir(), "en.json")) ? read<ChronicleEnglish>("en.json") : {};
      chronicle = {
        eras: zh.eras.map((era) => ({ ...era, ...en.eras?.[era.id] })),
        milestones: zh.milestones.map((m) => {
          const { forecastBy, ...text } = en.milestones?.[m.id] ?? {};
          return { ...m, ...text, ...(m.forecast && forecastBy ? { forecast: { ...m.forecast, by: forecastBy } } : {}) };
        }),
        metrics: zh.metrics.map((metric) => {
          const { sourceName, ...text } = en.metrics?.[metric.key] ?? {};
          return { ...metric, ...text, ...(sourceName ? { source: { ...metric.source, name: sourceName } } : {}) };
        }),
      };
    }
    chronicleCache.set(lang, chronicle);
  }
  return chronicle;
}

const bounds = cached(queryBounds, { freshMs: 10 * 60_000, maxStaleMs: 24 * 3600_000 });

/** First day each part of the site has history for; a slice before it shows that part empty. */
export async function timeMachineBounds(): Promise<TimeMachineBounds> {
  return { ...(await bounds.get()), today: beijingDate(Date.now()), kardashev: kardashevNow() };
}

/** Today's Kardashev rating from the energy series, to three decimals. */
export function kardashevNow(): number | null {
  const energy = loadChronicle().metrics.find((m) => m.key === "energy");
  const now = decimalYear(Date.now());
  const watts = energy ? interpolateMetric(energy.points, now, now, energy.forecastFrom) : null;
  return watts === null ? null : Math.round(kardashev(watts) * 1000) / 1000;
}

async function queryBounds(): Promise<Omit<TimeMachineBounds, "today" | "kardashev">> {
  const [row] = await sql<{ feed: Date | null; hot: Date | null; daily: string | null }[]>`
    SELECT
      (SELECT min(visible_after) FROM publications WHERE visibility = 'public' AND selected) AS feed,
      (SELECT min(computed_at) FROM hot_rankings WHERE published) AS hot,
      (SELECT min(key) FROM reports WHERE kind = 'daily') AS daily`;
  const day = (d: Date | null | undefined) => (d ? beijingDate(d) : null);
  const parts = { feed: day(row?.feed), hot: day(row?.hot), daily: row?.daily ?? null };
  const known = Object.values(parts).filter((d): d is string => !!d).sort();
  return { earliest: known[0] ?? null, ...parts };
}
