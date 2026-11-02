// Chinese URLs belong in discovery only when the Chinese page is a real Chinese edition and the
// English page is a real English edition. A page still waiting on a translation canonicalizes to the
// edition that exists, so advertising the other URL would ask Google to index a copy.
import { sql } from "../db.ts";
import { fetchItemsByIds, toItemSummary } from "./items.ts";
import { loadReport, type ReportKind } from "./reports.ts";
import { loadStoriesProse } from "./stories.ts";
import { contentSource, editionMatches, type ContentKind, type TranslationEntry } from "./content-source.ts";
import type { SitemapEntry } from "../modules.ts";

type EditionRow = {
  kind: string;
  content_id: string;
  lang: "en" | "zh";
  source_hash: string;
  source_language: string;
  source_segments: TranslationEntry["segments"];
  translations: Record<string, string>;
};

const REPORT_LOC = /^\/(daily|weekly|monthly)\/(\d{4}-\d{2}(?:-\d{2}|W\d{2})?)$/;

function bothReady(kind: ContentKind, id: string, dto: unknown, rows: EditionRow[]): boolean {
  const zh = contentSource(kind, id, dto, "zh");
  const en = contentSource(kind, id, dto, "en");
  const zhRow = rows.find((row) => row.lang === "zh");
  const enRow = rows.find((row) => row.lang === "en");
  const zhReady = zh.sourceLanguage === "zh" || (!!zhRow && editionMatches(zh, zhRow));
  const enReady = en.sourceLanguage === "en" || (!!enRow && editionMatches(en, enRow));
  return zhReady && enReady;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      out[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return out;
}

/**
 * English paths whose Chinese edition is stored and current, and whose English edition is too.
 * Callers add `/zh…` mirrors for these paths and the xhtml:link alternates between them.
 */
export async function reciprocalChinesePaths(entries: SitemapEntry[], at: Date): Promise<Set<string>> {
  const stories = entries.flatMap((entry) => {
    const match = /^\/story\/([0-9a-f-]{36})$/i.exec(entry.loc);
    return match ? [match[1]!] : [];
  });
  const reports = entries.flatMap((entry) => {
    const match = REPORT_LOC.exec(entry.loc);
    return match ? [{ loc: entry.loc, kind: match[1] as ReportKind, key: match[2]!, id: `${match[1]}:${match[2]}` }] : [];
  });
  const items = entries.flatMap((entry) => {
    const match = /^\/items\/([^/]+)$/.exec(entry.loc);
    return match ? [match[1]!] : [];
  });
  const ids = [...stories, ...reports.map((report) => report.id), ...items];
  if (ids.length === 0) return new Set();
  const stored = await sql<EditionRow[]>`SELECT kind, content_id, lang, source_hash, source_language, source_segments, translations
    FROM content_translations WHERE lang IN ('en', 'zh') AND content_id = ANY(${ids}::text[])`;
  const byContent = new Map<string, EditionRow[]>();
  for (const row of stored) {
    const key = `${row.kind}:${row.content_id}`;
    const list = byContent.get(key);
    if (list) list.push(row);
    else byContent.set(key, [row]);
  }
  const ready = new Set<string>();

  const storyCandidates = stories.filter((id) => byContent.has(`story:${id}`));
  if (storyCandidates.length) {
    const found = await sql<{ id: number; public_id: string }[]>`SELECT id, public_id::text FROM stories WHERE public_id::text = ANY(${storyCandidates}::text[])`;
    for (let offset = 0; offset < found.length; offset += 200) {
      const slice = found.slice(offset, offset + 200);
      const prose = await loadStoriesProse(slice.map((row) => Number(row.id)), at);
      for (const row of slice) {
        const dto = prose.get(Number(row.id));
        const editions = byContent.get(`story:${row.public_id}`);
        if (dto && editions && bothReady("story", row.public_id, dto, editions)) ready.add(`/story/${row.public_id}`);
      }
    }
  }

  const reportCandidates = reports.filter((report) => byContent.has(`report:${report.id}`));
  const loaded = await mapLimit(reportCandidates, 6, async (report) => ({ report, dto: await loadReport(report.kind, report.key) }));
  for (const { report, dto } of loaded) {
    const editions = byContent.get(`report:${report.id}`);
    if (dto && editions && bothReady("report", report.id, dto, editions)) ready.add(report.loc);
  }

  const itemCandidates = items.filter((id) => byContent.has(`item:${id}`));
  if (itemCandidates.length) {
    const rows = await fetchItemsByIds(itemCandidates);
    for (const id of itemCandidates) {
      const row = rows.get(id);
      const editions = byContent.get(`item:${id}`);
      if (!row || !editions || row.visibility !== "public" || row.source_mode !== "editorial") continue;
      if (row.selected && (!row.visible_after || row.visible_after > at)) continue;
      if (bothReady("item", id, toItemSummary(row), editions)) ready.add(`/items/${id}`);
    }
  }

  // The latest-report pages alternate only when that issue's own two editions do.
  for (const kind of ["daily", "weekly", "monthly"] as const) {
    let newest: string | null = null;
    let newestKey = "";
    for (const entry of entries) {
      const match = REPORT_LOC.exec(entry.loc);
      if (!match || match[1] !== kind || match[2]! <= newestKey) continue;
      newestKey = match[2]!;
      newest = entry.loc;
    }
    if (newest && ready.has(newest)) ready.add(`/${kind}`);
  }
  return ready;
}
