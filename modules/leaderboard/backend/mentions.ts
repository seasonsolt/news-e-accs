// The leaderboard models a story names, for the story page (storyPage): each links to its model page.
// Only models with a page are looked for, by their full name ("Gemini 4 Argon"); a one-word name
// ("Muse") would match too much, and "GPT-5" is not found inside "GPT-5.5".
import { sql } from "@aihot/backend/db";
import { featuredSlugs, NoLeaderboardRun, pageModels, comparePair } from "./read.ts";
import type { LbStoryModels } from "../contracts.ts";


/**
 * A name's pattern: its letters and digits in order, with any separators between ("GPT5" is GPT-5), except
 * that two numbers need one ("GPT-55" is not GPT-5.5). Null for a one-word name.
 */
export function namePattern(name: string): RegExp | null {
  const tokens = name.replace(/\s*\([^)]*\)\s*$/, "").toLowerCase().match(/[a-z]+|\d+/g);
  if (!tokens || tokens.length < 2) return null;
  const body = tokens.map((t, i) => (i === 0 ? t : `${/\d/.test(t) && /\d/.test(tokens[i - 1]!) ? "[\\s._-]+" : "[\\s._-]*"}${t}`)).join("");
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9]|[._-]\\d)`, "gi");
}

/** Slugs named in the text, by first mention; a name found inside a longer name's match is not a mention. */
export function mentioned(text: string, models: Array<{ slug: string; name: string }>): string[] {
  const hits: Array<{ slug: string; start: number; end: number }> = [];
  for (const m of models) {
    const pattern = namePattern(m.name);
    if (pattern) for (const match of text.matchAll(pattern)) hits.push({ slug: m.slug, start: match.index, end: match.index + match[0].length });
  }
  const own = hits
    .filter((h) => !hits.some((o) => o.start <= h.start && o.end >= h.end && o.end - o.start > h.end - h.start))
    .sort((a, b) => a.start - b.start);
  return [...new Set(own.map((h) => h.slug))];
}

const MAX = 4;

export async function storyModels(storyId: number): Promise<LbStoryModels | null> {
  const [story] = await sql<{ text: string }[]>`
    SELECT concat_ws(' ', title, latest, digest) AS text FROM stories WHERE id = ${storyId} AND merged_into IS NULL`;
  if (!story) return null;
  try {
    const { view, models } = await pageModels();
    const slugs = mentioned(story.text, models.map((m) => m.model)).slice(0, MAX);
    if (!slugs.length) return null;
    const featured = new Set(featuredSlugs(view));
    const both = slugs.filter((s) => featured.has(s));
    return {
      models: slugs.map((slug) => models.find((m) => m.model.slug === slug)!),
      compare: both.length >= 2 ? comparePair(both[0]!, both[1]!) : null,
    };
  } catch (error) {
    if (error instanceof NoLeaderboardRun) return null;
    throw error;
  }
}
