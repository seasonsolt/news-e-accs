// External collection reports (POST /api/ingest/items). Same identity rules and timeline
// rule as every other entrance: old or future-dated items and explicit backfill never count as
// today's news and are never pushed. Unknown sources are created isolated, awaiting an operator.
// An item carrying `x` is a post, stored like the X collector's own candidate and filed under the
// x_search source that already reads that author. A generic item is unchanged.
import { sql } from "../db.ts";
import { upsertMaterial } from "../content/materials.ts";
import { queueProcessing } from "../jobs/content.ts";
import { normalizeUrl } from "../lib/url.ts";
import { parseXItem, xHandle, xSourcesByHandle, type ParsedXPost } from "./x-post.ts";

export const MAX_ITEMS = 50;
/** Accounts a pusher can mark checked in one request (a poll that found nothing new). */
export const MAX_CHECKED = 100;

export class IngestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ItemIn {
  title?: unknown;
  url?: unknown;
  publishedAt?: unknown;
  author?: unknown;
  raw?: { _aihot?: { backfill?: boolean; baseline?: boolean } } & Record<string, unknown>;
  x?: unknown;
}

export interface IngestResult {
  ok: true;
  created: number;
  /** X posts skipped because the payload was not usable. Absent on a generic report. */
  rejected?: number;
  /** Handles that match no enabled x_search source. Absent on a generic report. */
  unmatched?: string[];
}

function checkedHandles(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new IngestError(400, "checkedHandles must be an array");
  if (value.length > MAX_CHECKED) throw new IngestError(413, `checkedHandles exceeds max ${MAX_CHECKED} per request`);
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") throw new IngestError(400, "checkedHandles must be handles");
    out.push(entry);
  }
  return out;
}

async function openSource(sourceId: string, sourceName: unknown) {
  const [source] = await sql<{ id: string; participation_mode: string; enabled: boolean }[]>`
    INSERT INTO sources (id, name, kind, config, tier, participation_mode, interval_minutes, enabled, health, tags)
    VALUES (${sourceId.slice(0, 120)}, ${typeof sourceName === "string" && sourceName.trim() ? sourceName.trim().slice(0, 200) : sourceId.slice(0, 120)},
            'external', '{}'::jsonb, 'T2', 'isolated', 1440, true, 'ok', ${["ingest:auto-created"]})
    ON CONFLICT (id) DO UPDATE SET last_ok_at = now() WHERE sources.enabled
    RETURNING id, participation_mode, enabled`;
  if (!source) throw new IngestError(409, "source paused");
  return source;
}

function backfillOf(raw: ItemIn["raw"]): string | null {
  const flags = raw?._aihot ?? {};
  return flags.backfill ? "reported-backfill" : flags.baseline ? "reported-baseline" : null;
}

/** A report with no X posts: unknown sources are created isolated, and the response stays `{ok, created}`. */
async function ingestGeneric(sourceId: string, sourceName: unknown, items: ItemIn[]): Promise<IngestResult> {
  if (!sourceId || !items.length) throw new IngestError(400, "sourceId and items[] required");
  if (items.length > MAX_ITEMS) throw new IngestError(413, `items[] exceeds max ${MAX_ITEMS} per request`);
  const source = await openSource(sourceId, sourceName);

  const seen = new Set<string>();
  let created = 0;
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const title = typeof it.title === "string" ? it.title.trim() : "";
    const rawUrl = typeof it.url === "string" ? it.url.trim() : "";
    if (!title || !rawUrl) continue;
    const url = normalizeUrl(rawUrl);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const published = typeof it.publishedAt === "string" ? new Date(it.publishedAt) : null;
    const res = await upsertMaterial({
      sourceId: source.id,
      // Normalize only for deduplication. Ownership needs the reported origin (including www and
      // scheme), and upsertMaterial already applies the common normalized identity rule.
      url: rawUrl,
      title,
      author: typeof it.author === "string" ? it.author.slice(0, 200) : null,
      publishedAt: published && Number.isFinite(published.getTime()) ? published : null,
      raw: it.raw ?? null,
      via: "ingest",
      backfill: backfillOf(it.raw),
    });
    if (res.created) created += 1;
    if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
  }
  await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id = ${source.id}`;
  await sql`INSERT INTO ingest_events (client, kind, status, summary) VALUES ('ingest-items', 'items', 'ok', ${sql.json({ sourceId: source.id, received: items.length, created })})`;
  return { ok: true, created };
}

export async function ingestItems(body: { sourceId?: unknown; sourceName?: unknown; items?: unknown; checkedHandles?: unknown }): Promise<IngestResult> {
  const sourceId = typeof body.sourceId === "string" ? body.sourceId.trim() : "";
  const items = Array.isArray(body.items) ? (body.items as ItemIn[]) : [];
  const checked = checkedHandles(body.checkedHandles);
  const xMode = checked.length > 0 || items.some((it) => !!it && typeof it === "object" && "x" in it);
  if (!xMode) return ingestGeneric(sourceId, body.sourceName, items);
  if (items.length > MAX_ITEMS) throw new IngestError(413, `items[] exceeds max ${MAX_ITEMS} per request`);

  const generic: ItemIn[] = [];
  const posts: Array<{ parsed: ParsedXPost; backfill: string | null }> = [];
  let rejected = 0;
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    if (!("x" in it)) { generic.push(it); continue; }
    const parsed = parseXItem(it);
    if (!parsed) rejected += 1;
    else posts.push({ parsed, backfill: backfillOf(it.raw) });
  }
  if (generic.length && !sourceId) throw new IngestError(400, "sourceId and items[] required");
  if (!posts.length && !checked.length && !generic.length && rejected === 0) throw new IngestError(400, "sourceId and items[] required");

  // A paused generic source rejects the whole report, before any X post is stored.
  const source = generic.length ? await openSource(sourceId, body.sourceName) : null;
  const handles = [...posts.map((p) => p.parsed.handle), ...checked];
  const sources = await xSourcesByHandle(handles);
  const unmatched: string[] = [];
  const seenUnmatched = new Set<string>();
  const noteUnmatched = (handle: string) => {
    const key = handle.toLowerCase();
    if (seenUnmatched.has(key)) return;
    seenUnmatched.add(key);
    unmatched.push(handle);
  };

  const seen = new Set<string>();
  let created = 0;
  const touched = new Map<string, { found: number; created: number }>();
  const touch = (id: string) => touched.get(id) ?? touched.set(id, { found: 0, created: 0 }).get(id)!;

  if (source) {
    for (const it of generic) {
      const title = typeof it.title === "string" ? it.title.trim() : "";
      const rawUrl = typeof it.url === "string" ? it.url.trim() : "";
      if (!title || !rawUrl) continue;
      const url = normalizeUrl(rawUrl);
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const published = typeof it.publishedAt === "string" ? new Date(it.publishedAt) : null;
      const res = await upsertMaterial({
        sourceId: source.id,
        url: rawUrl,
        title,
        author: typeof it.author === "string" ? it.author.slice(0, 200) : null,
        publishedAt: published && Number.isFinite(published.getTime()) ? published : null,
        raw: it.raw ?? null,
        via: "ingest",
        backfill: backfillOf(it.raw),
      });
      if (res.created) created += 1;
      if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
    }
    await sql`UPDATE sources SET last_fetch_at = now(), last_ok_at = now() WHERE id = ${source.id}`;
  }

  for (const { parsed, backfill } of posts) {
    const match = sources.get(parsed.handle.toLowerCase());
    if (!match) { noteUnmatched(parsed.handle); continue; }
    const identity = parsed.candidate.identityKey!;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const bucket = touch(match.id);
    bucket.found += 1;
    const res = await upsertMaterial({ ...parsed.candidate, sourceId: match.id, via: "ingest", backfill });
    if (res.created) { created += 1; bucket.created += 1; }
    if (res.created || res.revised || res.processingNeeded) await queueProcessing(res.articleId);
  }

  for (const entry of checked) {
    const handle = xHandle(entry);
    if (!handle) { if (entry.trim()) noteUnmatched(entry.trim().slice(0, 40)); continue; }
    const match = sources.get(handle.toLowerCase());
    if (!match) noteUnmatched(handle);
    else touch(match.id);
  }

  const ids = [...touched.keys()];
  if (ids.length) {
    // Health and the check's run commit together: a push that stored posts still counts as a successful fetch.
    await sql.begin(async (tx) => {
      await tx`
        UPDATE sources SET last_fetch_at = now(), last_ok_at = now(), fail_count = 0, last_error = NULL,
          health = 'ok', next_fetch_at = now() + make_interval(mins => interval_minutes), updated_at = now()
        WHERE enabled AND kind = 'x_search' AND id = ANY(${ids})`;
      for (const [id, counts] of touched) {
        await tx`INSERT INTO fetch_runs (source_id, status, finished_at, found_count, new_count, detail)
          VALUES (${id}, 'ok', now(), ${counts.found}, ${counts.created}, ${tx.json({ via: "ingest" })})`;
      }
    });
  }
  await sql`INSERT INTO ingest_events (client, kind, status, summary) VALUES ('ingest-items', 'items', 'ok',
    ${sql.json({ sourceId: source?.id ?? (sourceId || null), received: items.length, created, rejected, unmatched })})`;
  return { ok: true, created, rejected, unmatched };
}
