// Daily, weekly and monthly reports. Windows use the configured report calendar and written into the report;
// missed schedule points are caught up; regeneration creates a revision. The editors' prompts are in
// the industry pack (industry/prompts/report-*.md), the sections follow its categories.
import { z } from "zod";
import { SITE } from "@aihot/industry/site";
import { CATEGORIES } from "@aihot/industry/taxonomy";
import { promptText, promptVersion } from "../editorial/prompts.ts";
import { modelFor } from "../editorial/models.ts";
import { addDays, zonedDate, zonedTime, zonedMidnight, zonedDateTime, isoWeekLabel, isoWeekRange } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { config } from "../config.ts";
import { editionReady } from "../publication/distribution.ts";
import { localizePublication } from "../publication/content-language.ts";
import { looksEnglish } from "../editorial/writing.ts";
import { sha256, stableJson } from "../lib/ids.ts";
import { chatJson } from "../providers/llm.ts";
import { completeReceipt } from "../providers/receipts.ts";
import { shutdownSignal } from "../jobs/queue.ts";

export const REPORT_VERSION = promptVersion("report-daily-lead", "report-period", "report-citations");

const SECTION_EN: Record<string, string> = {
  "模型发布/更新": "Model releases and updates", "产品发布/更新": "Product releases and updates",
  "行业动态": "Industry", "论文研究": "Research", "技巧与观点": "Tips and perspectives",
};
const SECTION_OF: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, SECTION_EN[c.section] ?? c.section]));
const SECTION_ORDER = [...new Set(Object.values(SECTION_OF))];
export const reportTimeZone = () => config.reportTimeZone;
export function dailyReportWindow(date: string, timeZone = reportTimeZone()) {
  return { start: zonedDateTime(addDays(date, -1), "08:00", timeZone), end: zonedDateTime(date, "08:00", timeZone) };
}
export function periodReportWindow(startDate: string, endDateInclusive: string, timeZone = reportTimeZone()) {
  return { start: zonedMidnight(startDate, timeZone), end: zonedMidnight(addDays(endDateInclusive, 1), timeZone) };
}
/** A regeneration uses its stored calendar window; changing the configured zone applies only to new issues. */
async function issueWindow(kind: "daily" | "weekly" | "monthly", key: string, planned: { start: Date; end: Date }) {
  const [existing] = await sql<{ window_start: Date; window_end: Date; content: { reportTimeZone?: string } }[]>`
    SELECT window_start, window_end, content FROM reports WHERE kind=${kind} AND key=${key}`;
  return existing
    ? { start: existing.window_start, end: existing.window_end, timeZone: existing.content.reportTimeZone ?? "Asia/Shanghai" }
    : { ...planned, timeZone: reportTimeZone() };
}

/** Where an item without a category goes. */
const DEFAULT_SECTION = SECTION_OF.industry ?? SECTION_ORDER.at(-1)!;

export interface ReportEntry {
  itemId: string;
  factId: string | null;
  storyPublicId: string | null;
  title: string;
  summary: string;
  sourceName: string;
  sourceUrl: string;
  sourceId: string;
  firstParty: boolean;
  role: string;
  score: number | null;
  publishedAt: string;
}

export interface Candidate extends ReportEntry {
  category: string | null;
  factKey: string;
  needsEnglishCopy: boolean;
}

function roleOf(kind: string, firstParty: boolean): string {
  if (firstParty) return kind === "x_search" ? "Official · X" : "Official";
  if (kind === "x_search") return "Commentary · X";
  if (kind === "mp_account") return "WeChat";
  return "Media";
}

export async function candidates(start: Date, end: Date): Promise<Candidate[]> {
  const rows = await sql.begin("isolation level read committed", async (tx) => {
    // Wait for in-flight releases and keep later ones outside this snapshot. The following SELECT
    // gets a fresh READ COMMITTED snapshot; model calls and report writes happen after the lock ends.
    await tx`SELECT pg_advisory_xact_lock(hashtext('report_candidates'))`;
    return tx<{
      id: string; editorial_language: "en" | "zh"; title: string; summary: string | null; url: string; category: string | null; score: number | null; first_party: boolean;
      source_id: string; source_name: string; source_kind: string; fact_public_id: string | null; story_public_id: string | null; at: Date; backfill: boolean;
    }[]>`
      SELECT p.article_id AS id, p.editorial_language, p.title, p.summary, p.url, p.category, p.score, p.first_party, s.id AS source_id, s.name AS source_name,
             s.kind AS source_kind, f.public_id AS fact_public_id, st.public_id::text AS story_public_id, p.timeline_at AS at, p.backfill
      FROM publications p JOIN sources s ON s.id = p.source_id
      LEFT JOIN facts f ON f.id = p.fact_id LEFT JOIN stories st ON st.id = f.story_id
      -- Attribute each item by the later of arrival and release; either range can use its index.
      WHERE p.visibility = 'public' AND p.selected AND NOT p.backfill
        AND (
          (p.visible_after <= p.timeline_at AND p.timeline_at >= ${start} AND p.timeline_at < ${end})
          OR (p.visible_after > p.timeline_at AND p.visible_after >= ${start} AND p.visible_after < ${end})
        )`;
  });
  const localized = await localizePublication(rows.map(r => ({ id: r.id, title: r.title, summary: r.summary, editorialLanguage: r.editorial_language })), "en");
  const english = new Map(localized.map(r => [r.id, r]));
  // One entry per fact: first-party first, then score.
  const byFact = new Map<string, Candidate>();
  for (const r of rows) {
    const copy = english.get(r.id)!;
    const ready = editionReady(copy, "en");
    const key = r.fact_public_id ?? `a:${r.id}`;
    const c: Candidate = {
      itemId: r.id, factId: r.fact_public_id, storyPublicId: r.story_public_id, title: copy.title, summary: copy.summary ?? "",
      sourceName: r.source_name, sourceUrl: r.url, sourceId: r.source_id, firstParty: r.first_party, role: roleOf(r.source_kind, r.first_party),
      score: r.score === null ? null : Number(r.score), publishedAt: r.at.toISOString(), category: r.category, factKey: key, needsEnglishCopy: !ready,
    };
    const prev = byFact.get(key);
    if (!prev || Number(c.firstParty) - Number(prev.firstParty) > 0 || (c.firstParty === prev.firstParty && (c.score ?? 0) > (prev.score ?? 0))) byFact.set(key, c);
  }
  return [...byFact.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** Facts and items already covered by recent editions are not repeated. */
async function recentlyCovered(kind: "daily", before: string, days = 7): Promise<Set<string>> {
  const rows = await sql<{ content: Record<string, any> }[]>`
    SELECT content FROM reports WHERE kind = ${kind} AND key < ${before} AND key >= ${addDays(before, -days)}`;
  const out = new Set<string>();
  for (const r of rows) {
    for (const s of r.content.sections ?? []) for (const it of s.items ?? []) {
      if (it.itemId) out.add(`a:${it.itemId}`);
      if (it.factId) out.add(it.factId);
      if (it.clusterId) out.add(`c:${it.clusterId}`);
    }
  }
  return out;
}

const CitationSchema = z.object({ itemId: z.string().min(1), title: z.string().trim().min(1).max(220), summary: z.string().trim().min(1).max(2000) }).strict();
/** An incomplete/unknown/duplicate ID set defers the report; publications are never overwritten. */
export function validateReportCitationCopies(expected: ReportEntry[], copies: Array<z.infer<typeof CitationSchema>>) {
  const ids = expected.map(e => e.itemId).sort(), actual = copies.map(e => e.itemId).sort();
  if (JSON.stringify(ids) !== JSON.stringify(actual) || new Set(actual).size !== actual.length) throw new Error("incomplete or unknown report citation IDs");
  const source = new Map(expected.map(entry => [entry.itemId, entry]));
  const numbers = (text: string) => [...new Set(text.match(/\d+(?:[.,]\d+)*/g) ?? [])].sort();
  for (const copy of copies) {
    if (!looksEnglish(copy.title) || !looksEnglish(copy.summary)) throw new Error("report citations must be English");
    const original = source.get(copy.itemId)!;
    if (JSON.stringify(numbers(`${original.title} ${original.summary}`)) !== JSON.stringify(numbers(`${copy.title} ${copy.summary}`))) throw new Error("report citation numbers changed");
  }
  return new Map(copies.map(copy => [copy.itemId, copy]));
}
function citationBrief(entries: ReportEntry[]) {
  return entries.length ? `\n\nMissing English citations (translate each, return exact itemId):\n${JSON.stringify(entries.map(e => ({ itemId: e.itemId, title: e.title, summary: e.summary, sourceName: e.sourceName })))}` : "";
}
function applyCitationCopies(entries: ReportEntry[], copies: Map<string, z.infer<typeof CitationSchema>>) {
  for (const entry of entries) { const copy = copies.get(entry.itemId); if (copy) { entry.title = copy.title; entry.summary = copy.summary; } }
}

const LeadSchema = z.object({
  title: z.string().max(220),
  leadParagraph: z.string().max(1200),
  citationCopies: z.array(CitationSchema).default([]),
  highlights: z.array(z.union([z.number(), z.string()])).max(6).catch([]),
});

async function writeLead(kind: string, key: string, entries: ReportEntry[], model: string, missing: ReportEntry[], timeZone: string) {
  if (entries.length === 0) return null;
  const list = entries.slice(0, 30).map((e, i) => `${i + 1}. ${e.title}｜${e.summary.slice(0, 120)}`).join("\n");
  const res = await chatJson({
    model, purpose: "report_lead", subject: `report:${kind}:${key}@${sha256(stableJson({ entries, missing, timeZone }))}`, promptVersion: REPORT_VERSION,
    system: `${promptText("report-daily-lead")}\n${promptText("report-citations")}`,
    user: list + citationBrief(missing), schema: LeadSchema.superRefine((data, ctx) => {
      try {
        validateReportCitationCopies(missing, data.citationCopies);
        if (!looksEnglish(data.title) || !looksEnglish(data.leadParagraph)) throw new Error("report lead must be English");
      } catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); }
    }), temperature: 0.3, maxTokens: missing.length ? 16000 : 1500,
  });
  if (!looksEnglish(res.data.title) || !looksEnglish(res.data.leadParagraph)) throw new Error("report lead must be English");
  const citationCopies = validateReportCitationCopies(missing, res.data.citationCopies);
  const highlights = res.data.highlights
    .map((h) => entries[Number(h) - 1])
    .filter((e): e is ReportEntry => !!e)
    .map((e) => e.itemId);
  return { lead: { title: res.data.title, leadParagraph: res.data.leadParagraph }, highlights, citationCopies, receiptId: res.receiptId };
}

async function saveReport(kind: "daily" | "weekly" | "monthly", key: string, start: Date, end: Date, content: Record<string, unknown>, reason: string, model: string) {
  await sql.begin(async (tx) => {
    const [existing] = await tx<{ id: number; revision: number; content: Record<string, unknown>; generated_at: Date; window_start: Date; window_end: Date; editorial_language: string }[]>`
      SELECT id, revision, content, generated_at, window_start, window_end, editorial_language FROM reports WHERE kind = ${kind} AND key = ${key} FOR UPDATE`;
    if (existing) {
      const snapshot = { ...existing.content, editorialLanguage: existing.editorial_language,
        windowStart: existing.window_start.toISOString(), windowEnd: existing.window_end.toISOString(),
        reportTimeZone: existing.content.reportTimeZone ?? "Asia/Shanghai" };
      await tx`INSERT INTO report_revisions (report_id, revision, content, generated_at, reason)
               VALUES (${existing.id}, ${existing.revision}, ${tx.json(snapshot as never)}, ${existing.generated_at}, ${reason}) ON CONFLICT DO NOTHING`;
      await tx`UPDATE reports SET content = ${tx.json(content as never)}, window_start = ${start}, window_end = ${end}, generated_at = now(),
                 editorial_language = 'en', model = ${model}, revision = revision + 1, origin = 'model', updated_at = now() WHERE id = ${existing.id}`;
    } else {
      await tx`INSERT INTO reports (kind, key, window_start, window_end, content, generated_at, model, origin, editorial_language)
               VALUES (${kind}, ${key}, ${start}, ${end}, ${tx.json(content as never)}, now(), ${model}, 'model', 'en')`;
    }
  });
}

/** Calendar-local [D-1 08:00, D 08:00); DST can make the window 23 or 25 hours. */
export async function composeDaily(date: string, reason = "scheduled"): Promise<{ key: string; entries: number }> {
  const { start, end, timeZone } = await issueWindow("daily", date, dailyReportWindow(date));
  const covered = await recentlyCovered("daily", date);
  const all = await candidates(start, end);
  const fresh = all.filter((c) => !covered.has(c.factKey) && !covered.has(`a:${c.itemId}`));
  const perSection = new Map<string, Candidate[]>();
  const flashes: Array<{ itemId: string; title: string; sourceName: string; sourceUrl: string; publishedAt: string }> = [];
  for (const c of fresh) {
    const label = SECTION_OF[c.category ?? ""] ?? DEFAULT_SECTION;
    const list = perSection.get(label) ?? [];
    if (list.length < 8) list.push(c);
    else if (flashes.length < 12) flashes.push({ itemId: c.itemId, title: c.title, sourceName: c.sourceName, sourceUrl: c.sourceUrl, publishedAt: c.publishedAt });
    perSection.set(label, list);
  }
  const sections = SECTION_ORDER.filter((l) => perSection.get(l)?.length).map((label) => ({
    label,
    items: perSection.get(label)!.map(({ category: _c, factKey: _f, needsEnglishCopy: _n, ...entry }) => entry),
  }));
  const ordered = sections.flatMap((s) => s.items).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const model = await modelFor("report");
  const usedIds = new Set([...ordered, ...flashes].map(e => e.itemId));
  const missing = fresh.filter(e => usedIds.has(e.itemId) && e.needsEnglishCopy);
  const lead = ordered.length ? await writeLead("daily", date, ordered, model, missing, timeZone) : null;
  if (lead) {
    applyCitationCopies(ordered, lead.citationCopies);
    for (const flash of flashes) { const copy = lead.citationCopies.get(flash.itemId); if (copy) flash.title = copy.title; }
  }
  const content = {
    date,
    title: `${SITE.name} Daily Briefing · ${date}`,
    reportTimeZone: timeZone,
    lead: lead?.lead ?? null,
    highlights: lead?.highlights ?? [],
    sections,
    flashes,
    metrics: {
      totalEvents: ordered.length,
      sourcesCount: new Set(ordered.map((e) => e.sourceId)).size,
      modelsReleased: perSection.get(SECTION_OF["ai-models"]!)?.length ?? 0,
      firstPartyEvents: ordered.filter((e) => e.firstParty).length,
    },
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    generator: { version: REPORT_VERSION, model, repeatsSuppressed: all.length - fresh.length },
  };
  await saveReport("daily", date, start, end, content, reason, model);
  if (lead) await completeReceipt(sql, lead.receiptId);
  return { key: date, entries: ordered.length };
}

export const PeriodSchema = z.object({
  // A headline is asked for, but a missing or unusable one leaves the issue on its generic name.
  citationCopies: z.array(CitationSchema).default([]),
  headline: z.string().max(220).catch(""),
  overview: z.string().max(5000),
  themes: z
    // A theme cites at most eight entries; a model that lists more keeps its first eight rather than failing the issue.
    .array(z.object({ heading: z.string().max(180), summary: z.string().max(2000), refs: z.array(z.union([z.number(), z.string()])).transform((refs) => refs.slice(0, 8)) }))
    .min(1)
    .transform((themes) => themes.slice(0, 6)),
});

/** The editor's brief for a week or month: its top entries as a numbered list, each with its section. */
export function periodPrompt(kind: "weekly" | "monthly", startDate: string, endDateInclusive: string, top: Candidate[]) {
  const list = top.map((e, i) => `${i + 1}. [${SECTION_OF[e.category ?? ""] ?? DEFAULT_SECTION}] ${e.title}｜${e.summary.slice(0, 140)}`).join("\n");
  return {
    system: promptText("report-period", { kindName: kind === "weekly" ? "weekly" : "monthly", overviewLength: kind === "weekly" ? "100–200" : "150–300" }),
    user: `Period: ${startDate} to ${endDateInclusive}\n${list}`,
  };
}

async function composePeriod(kind: "weekly" | "monthly", key: string, startDate: string, endDateInclusive: string, reason: string) {
  const { start, end, timeZone } = await issueWindow(kind, key, periodReportWindow(startDate, endDateInclusive));
  const all = await candidates(start, end);
  const top = all.slice(0, kind === "weekly" ? 40 : 60);
  const dailyCount = (await sql<{ n: number }[]>`SELECT count(*) AS n FROM reports WHERE kind = 'daily' AND key >= ${startDate} AND key <= ${endDateInclusive}`)[0]?.n ?? 0;
  let themes: Array<{ heading: string; summary: string; storyRefs: ReportEntry[] }> = [];
  let headline = "";
  let overview = "";
  let receiptId: number | null = null;
  const model = await modelFor("report");
  if (top.length) {
    const missing = top.filter(e => e.needsEnglishCopy);
    const brief = periodPrompt(kind, startDate, endDateInclusive, top);
    const res = await chatJson({
      model, purpose: `report_${kind}`, subject: `report:${kind}:${key}@${sha256(stableJson({ top, startDate, endDateInclusive, timeZone }))}`, promptVersion: REPORT_VERSION,
      system: `${brief.system}\n${promptText("report-citations")}`, user: brief.user + citationBrief(missing), schema: PeriodSchema.superRefine((data, ctx) => {
        try {
          validateReportCitationCopies(missing, data.citationCopies);
          if (data.themes.some(theme => theme.refs.some(ref => !Number.isInteger(Number(ref)) || Number(ref) < 1 || Number(ref) > top.length))) throw new Error("unknown period report citation reference");
          if ((data.headline && !looksEnglish(data.headline)) || !looksEnglish(data.overview) || data.themes.some(t => !looksEnglish(t.heading) || !looksEnglish(t.summary))) throw new Error("period report must be English");
        } catch (error) { ctx.addIssue({ code: "custom", message: (error as Error).message }); }
      }), temperature: 0.3, maxTokens: missing.length ? 20000 : 5000,
    });
    const copies = validateReportCitationCopies(missing, res.data.citationCopies);
    applyCitationCopies(top, copies);
    if ((res.data.headline && !looksEnglish(res.data.headline)) || !looksEnglish(res.data.overview) || res.data.themes.some(t => !looksEnglish(t.heading) || !looksEnglish(t.summary))) throw new Error("period report must be English");
    receiptId = res.receiptId;
    headline = res.data.headline.trim();
    overview = res.data.overview;
    themes = res.data.themes.map((t) => ({
      heading: t.heading,
      summary: t.summary,
      storyRefs: t.refs.map((r) => top[Number(r) - 1]).filter((e): e is Candidate => !!e).map(({ category: _c, factKey: _f, needsEnglishCopy: _n, ...e }) => e),
    }));
  }
  const content = {
    kind,
    title: kind === "weekly" ? `${SITE.name} Weekly Briefing · ${key}` : `${SITE.name} Monthly Briefing · ${key}`,
    ...(kind === "weekly" ? { isoLabel: key } : { monthLabel: key }),
    reportTimeZone: timeZone,
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    periodStart: startDate,
    periodEnd: endDateInclusive,
    ...(headline ? { headline } : {}),
    overview,
    themes,
    storyOrder: top.map((e) => e.itemId),
    metrics: { totalStories: themes.reduce((n, t) => n + t.storyRefs.length, 0), selectedCount: all.length, reportsCovered: Number(dailyCount) },
    generator: { version: REPORT_VERSION, model },
  };
  await saveReport(kind, key, start, end, content, reason, model);
  if (receiptId) await completeReceipt(sql, receiptId);
  return { key, entries: top.length };
}

export async function composeWeekly(label: string, reason = "scheduled") {
  const range = isoWeekRange(label);
  if (!range) throw new Error(`bad week label ${label}`);
  return composePeriod("weekly", label, range.start, range.end, reason);
}

export async function composeMonthly(label: string, reason = "scheduled") {
  const m = /^(\d{4})-(\d{2})$/.exec(label);
  if (!m) throw new Error(`bad month label ${label}`);
  const start = `${label}-01`;
  const next = Number(m[2]) === 12 ? `${Number(m[1]) + 1}-01-01` : `${m[1]}-${String(Number(m[2]) + 1).padStart(2, "0")}-01`;
  return composePeriod("monthly", label, start, addDays(next, -1), reason);
}

/**
 * Catch-up: generates any missing daily report for the last `days` days (never the future and never
 * before the first report in the database), the last complete week and the last complete month.
 */
export async function catchUpReports(now = new Date(), days = 7): Promise<{ generated: string[] }> {
  const generated: string[] = [];
  const today = zonedDate(now, reportTimeZone());
  const localTime = zonedTime(now, reportTimeZone());
  const localHour = Number(localTime.slice(0, 2));
  const [first] = await sql<{ key: string | null }[]>`SELECT min(key) AS key FROM reports WHERE kind = 'daily'`;
  const latestDue = localHour >= 8 ? today : addDays(today, -1);
  for (let i = days - 1; i >= 0; i--) {
    if (shutdownSignal.signal.aborted) return { generated }; // the next hourly run continues
    const d = addDays(latestDue, -i);
    if (first?.key && d < first.key) continue;
    const [exists] = await sql`SELECT 1 FROM reports WHERE kind = 'daily' AND key = ${d}`;
    if (!exists) {
      await composeDaily(d, "catch-up");
      generated.push(`daily:${d}`);
    }
  }
  // Last complete ISO week (Monday 10:00 onwards).
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const lastWeek = isoWeekLabel(addDays(today, -dow - 7));
  const weekDue = dow > 0 || localHour >= 10;
  if (weekDue) {
    const [w] = await sql`SELECT 1 FROM reports WHERE kind = 'weekly' AND key = ${lastWeek}`;
    if (!w) {
      await composeWeekly(lastWeek, "catch-up");
      generated.push(`weekly:${lastWeek}`);
    }
  }
  // Last complete month (1st 10:30 onwards).
  const [y, mo, dd] = today.split("-").map(Number) as [number, number, number];
  const prevMonth = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
  const monthDue = dd > 1 || localHour > 10 || (localHour === 10 && Number(localTime.slice(3, 5)) >= 30);
  if (monthDue) {
    const [m] = await sql`SELECT 1 FROM reports WHERE kind = 'monthly' AND key = ${prevMonth}`;
    if (!m) {
      await composeMonthly(prevMonth, "catch-up");
      generated.push(`monthly:${prevMonth}`);
    }
  }
  return { generated };
}
