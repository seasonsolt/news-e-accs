// Starred items live in the browser; this tells the page which ones are still public, and the source
// name a public one shows today (older stars saved the admin name). A starred item stays available as
// long as its page does (rules.hasItemPage), whether or not it is in the lists. A public item also
// brings its category and when the other selected developments of its event first appeared, counted
// as in followups.ts.
import type { CategoryKey } from "@aihot/contracts/taxonomy";
import type { ItemAvailability } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { hasItemPage, publicSourceName } from "./rules.ts";
import { ownFactEvidenceCondition, selectedCondition } from "./scope.ts";

const DEVELOPMENTS = 20;

export async function itemAvailability(ids: string[], now = new Date()): Promise<Record<string, ItemAvailability>> {
  const clean = [...new Set(ids.filter((id) => /^[a-zA-Z0-9_-]{1,80}$/.test(id)))].slice(0, 500);
  const out: Record<string, ItemAvailability> = {};
  for (const id of clean) out[id] = { status: "unavailable" };
  if (clean.length === 0) return out;
  const rows = await sql<{
    id: string; visibility: string; source_mode: string; source_name: string; category: CategoryKey | null;
    story_id: number | null; story_public_id: string | null; fact_id: number | null;
  }[]>`
    SELECT p.article_id AS id, p.visibility, s.participation_mode AS source_mode, s.name AS source_name, p.category,
      st.id AS story_id, st.public_id AS story_public_id, p.fact_id
    FROM publications p JOIN sources s ON s.id = p.source_id
    LEFT JOIN stories st ON st.id = p.story_id AND st.merged_into IS NULL
    WHERE p.article_id IN ${sql(clean)}`;
  const shown = rows.filter((r) => hasItemPage({ visibility: r.visibility, sourceMode: r.source_mode }));
  const storyIds = [...new Set(shown.flatMap((r) => r.story_id === null ? [] : [Number(r.story_id)]))];
  const facts = storyIds.length === 0 ? [] : await sql<{ story_id: number; fact_id: number; first: Date }[]>`
    SELECT p.story_id, p.fact_id, min(p.sort_at) AS first FROM publications p
    WHERE p.story_id IN ${sql(storyIds)} AND p.fact_id IS NOT NULL AND ${selectedCondition(now)} AND ${ownFactEvidenceCondition()}
    GROUP BY p.story_id, p.fact_id`;
  for (const r of shown) {
    const item: ItemAvailability = { status: r.visibility === "summary-only" ? "summary-only" : "public", sourceName: publicSourceName(r.source_name), category: r.category };
    if (r.story_id !== null && r.story_public_id) {
      const developments = facts
        .filter((f) => Number(f.story_id) === Number(r.story_id) && Number(f.fact_id) !== Number(r.fact_id))
        .map((f) => f.first.getTime()).sort((a, b) => b - a).slice(0, DEVELOPMENTS)
        .map((t) => new Date(t).toISOString());
      item.story = { id: r.story_public_id, developments };
    }
    out[r.id] = item;
  }
  return out;
}
