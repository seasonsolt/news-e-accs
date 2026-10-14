// /llms-full.txt — the last 7 days of daily briefings and the current hot stories, in Markdown.
// Each story links to its event page and the original sources. Readers of llms.txt are pointed here.
import { SITE } from "@aihot/site";
import { sql } from "../db.ts";
import { dailyUrl, itemUrl, storyUrl } from "./links.ts";
import { latestHotRanking } from "./hot.ts";
import { recentLlmsDailies, type LlmsDailyCitation, type LlmsDailyIssue } from "./reports.ts";
import { publicSourceName } from "./rules.ts";
import { compositeCondition, ownFactEvidenceCondition, storyReportCondition } from "./scope.ts";
import { storyTexts } from "./story-text.ts";

export interface LlmsFullSource {
  name: string;
  url: string;
  title: string;
}

export interface LlmsFullEntry {
  title: string;
  /** Event page, or the item page when the report was never grouped into an event. */
  url: string;
  summary: string | null;
  sources: LlmsFullSource[];
}

export interface LlmsFullDaily {
  key: string;
  url: string;
  title: string | null;
  lead: string | null;
  entries: LlmsFullEntry[];
}

const SOURCE_CAP = 40;

function httpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

function addSource(sources: LlmsFullSource[], seen: Set<string>, source: LlmsFullSource) {
  if (sources.length >= SOURCE_CAP) return;
  const url = httpUrl(source.url);
  if (!url || seen.has(url)) return;
  seen.add(url);
  let name = source.name.trim();
  if (!name) {
    try { name = new URL(url).hostname.replace(/^www\./, ""); } catch { name = url; }
  }
  sources.push({ name, url, title: source.title });
}

async function storiesOfItems(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await sql<{ id: string; public_id: string }[]>`
    SELECT p.article_id AS id, st.public_id::text AS public_id
    FROM publications p
    JOIN facts f ON f.id = p.fact_id AND ${ownFactEvidenceCondition()}
    JOIN stories st ON st.id = f.story_id AND st.merged_into IS NULL
    WHERE p.article_id = ANY(${unique}::text[])`;
  return new Map(rows.map((r) => [r.id, r.public_id]));
}

function pageFor(citation: LlmsDailyCitation, storyOfItem: Map<string, string>): { key: string; url: string } | null {
  const storyId = citation.storyPublicId ?? (citation.itemId ? storyOfItem.get(citation.itemId) ?? null : null);
  if (storyId) return { key: storyId, url: storyUrl(storyId) };
  if (citation.itemId) return { key: `item:${citation.itemId}`, url: itemUrl(citation.itemId) };
  return null;
}

function entriesOf(issue: LlmsDailyIssue, storyOfItem: Map<string, string>): LlmsFullEntry[] {
  const groups = new Map<string, LlmsFullEntry & { seen: Set<string> }>();
  for (const { main, related } of issue.entries) {
    const page = pageFor(main, storyOfItem);
    if (!page) continue;
    let group = groups.get(page.key);
    if (!group) {
      group = { title: main.title, url: page.url, summary: main.summary, sources: [], seen: new Set() };
      groups.set(page.key, group);
    }
    addSource(group.sources, group.seen, { name: main.sourceName, url: main.sourceUrl, title: main.title });
    for (const extra of related) addSource(group.sources, group.seen, { name: extra.sourceName, url: extra.sourceUrl, title: extra.title });
  }
  return [...groups.values()].map(({ seen: _, ...entry }) => entry);
}

async function hotStories(now: Date): Promise<LlmsFullEntry[]> {
  const ranking = await latestHotRanking();
  const entries = ranking?.entries ?? [];
  if (entries.length === 0) return [];
  const ids = entries.map((e) => e.storyId);
  const [texts, reports] = await Promise.all([
    storyTexts(ids, now),
    sql<{ story_id: number; title: string; url: string; source_name: string }[]>`
      SELECT f.story_id, p.title, p.url, s.name AS source_name
      FROM facts f
      JOIN fact_articles fa ON fa.fact_id = f.id
      JOIN publications p ON p.article_id = fa.article_id
      JOIN sources s ON s.id = p.source_id
      WHERE f.story_id = ANY(${ids}::bigint[])
        AND fa.role <> 'mention' AND NOT ${compositeCondition()} AND ${storyReportCondition(now)}
      ORDER BY f.story_id, coalesce(p.published_at, p.discovered_at) DESC, p.article_id`,
  ]);
  const byStory = new Map<number, Array<{ title: string; url: string; source_name: string }>>();
  for (const report of reports) {
    const id = Number(report.story_id);
    const list = byStory.get(id) ?? [];
    list.push(report);
    byStory.set(id, list);
  }
  return entries.map((entry) => {
    const text = texts.get(entry.storyId);
    const sources: LlmsFullSource[] = [];
    const seen = new Set<string>();
    for (const report of byStory.get(entry.storyId) ?? []) {
      addSource(sources, seen, { name: publicSourceName(report.source_name), url: report.url, title: report.title });
    }
    if (sources.length === 0 && entry.representativeUrl) {
      addSource(sources, seen, {
        name: publicSourceName(entry.representativeSource ?? entry.sourceNames[0] ?? ""),
        url: entry.representativeUrl,
        title: entry.title,
      });
    }
    return {
      title: entry.title,
      url: storyUrl(entry.storyPublicId),
      summary: text?.digest ?? text?.summary ?? null,
      sources,
    };
  });
}

export async function loadLlmsFull(now = new Date()): Promise<{ dailies: LlmsFullDaily[]; hot: LlmsFullEntry[] }> {
  const issues = await recentLlmsDailies(now);
  const missing = issues.flatMap((issue) => issue.entries.flatMap(({ main, related }) => [main, ...related]))
    .filter((c) => c.itemId && !c.storyPublicId).map((c) => c.itemId!);
  const storyOfItem = await storiesOfItems(missing);
  return {
    dailies: issues.map((issue) => ({
      key: issue.key,
      url: dailyUrl(issue.key),
      title: issue.title,
      lead: issue.lead,
      entries: entriesOf(issue, storyOfItem),
    })),
    hot: await hotStories(now),
  };
}

function plain(text: string): string {
  return text.replace(/\s+/g, " ").trim().replace(/[\[\]]/g, "");
}

function link(label: string, url: string): string {
  return `[${plain(label) || url}](${url})`;
}

function writeEntry(lines: string[], entry: LlmsFullEntry) {
  lines.push(`- ${link(entry.title, entry.url)}${entry.summary ? `: ${plain(entry.summary)}` : ""}`);
  for (const source of entry.sources) lines.push(`  - ${link(source.name, source.url)}: ${plain(source.title)}`);
}

/** Markdown for answer engines. Headings stay in English; story text is the stored edition. */
export function renderLlmsFull(input: { dailies: LlmsFullDaily[]; hot: LlmsFullEntry[] }): string {
  const lines = [
    `# ${SITE.name} — recent briefings and hot stories`,
    "",
    "> Last 7 days of daily briefings and the current hot stories. Each story links to its event page and the original sources it cites.",
    "",
    "## Daily briefings",
    "",
  ];
  if (input.dailies.length === 0) lines.push("No daily briefing in the last 7 days.", "");
  for (const daily of input.dailies) {
    const heading = daily.title ? `${daily.key}: ${plain(daily.title)}` : daily.key;
    lines.push(`### ${link(heading, daily.url)}`, "");
    if (daily.lead) lines.push(plain(daily.lead), "");
    if (daily.entries.length === 0) lines.push("No public stories in this briefing.", "");
    for (const entry of daily.entries) writeEntry(lines, entry);
    lines.push("");
  }
  lines.push("## Hot stories", "");
  if (input.hot.length === 0) lines.push("No hot stories right now.", "");
  for (const entry of input.hot) writeEntry(lines, entry);
  lines.push("");
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

export async function llmsFullTxt(now = new Date()): Promise<string> {
  return renderLlmsFull(await loadLlmsFull(now));
}
