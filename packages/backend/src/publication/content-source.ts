// Stable translation inputs come exclusively from public DTOs, never raw source bodies.
import { createHash } from 'node:crypto';
import { z } from 'zod';
export const contentKinds = ['item', 'story', 'report', 'body'] as const;
export type ContentKind = typeof contentKinds[number];
export const translationEntrySchema = z.object({
  kind: z.enum(contentKinds), id: z.string().min(1).max(120), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  segments: z.array(z.object({ key: z.string().min(1), text: z.string().min(1) }).strict()).max(10000),
  translations: z.record(z.string(), z.string().trim().min(1)).optional(),
}).strict();
export const translationBatchSchema = z.object({ schemaVersion: z.literal(1), targetLanguage: z.literal('en'), entries: z.array(translationEntrySchema).max(1000) }).strict();
export type TranslationEntry = z.infer<typeof translationEntrySchema>;
const proseKeys = new Set(['title', 'summary', 'reason', 'digest', 'latest', 'label', 'heading', 'headline', 'leadParagraph', 'overview', 'caption', 'text']);
export function contentSource(kind: ContentKind, id: string, dto: any): TranslationEntry {
  const segments: TranslationEntry['segments'] = [];
  const add = (key: string, text: unknown) => { if (typeof text === 'string' && text.trim()) segments.push({ key, text }); };
  if (kind === 'item') for (const key of ['title', 'summary', 'reason']) add(key, dto[key]);
  else if (kind === 'story') {
    for (const key of ['title', 'summary', 'digest', 'latest']) add(key, dto[key]);
    add('excerpt.text', dto.excerpt?.text);
    for (const [index, development] of (dto.developments ?? []).entries()) add(`developments.${index}.title`, development.title);
  }
  else {
    const walk = (value: any, path: string) => {
      if (!value || typeof value !== 'object' || value.available === false) return;
      for (const [key, child] of Object.entries(value)) {
        const next = path ? `${path}.${key}` : key;
        if (typeof child === 'string' && proseKeys.has(key)) add(next, child);
        else if (child && typeof child === 'object') walk(child, next);
      }
    };
    walk(dto, '');
  }
  // Editorial text includes current overrides; report republication revisions also invalidate.
  // Unrelated counters, dates and image proxies cannot invalidate prose.
  const sourceHash = createHash('sha256').update(JSON.stringify({ kind, id, segments, ...(kind === 'report' ? { revision: dto.revision ?? null } : {}) })).digest('hex');
  return { kind, id, sourceHash, segments };
}
export function validateTranslation(entry: TranslationEntry, current: TranslationEntry): Record<string, string> {
  if (entry.kind !== current.kind || entry.id !== current.id || entry.sourceHash !== current.sourceHash || JSON.stringify(entry.segments) !== JSON.stringify(current.segments)) throw new Error(`stale source: ${entry.kind}:${entry.id}`);
  const keys = current.segments.map(s => s.key).sort();
  if (!entry.translations || JSON.stringify(Object.keys(entry.translations).sort()) !== JSON.stringify(keys)) throw new Error(`incomplete translations: ${entry.kind}:${entry.id}`);
  for (const text of Object.values(entry.translations)) if (!text.trim() || (entry.kind !== 'body' && /<\/?[a-z][^>]*>/i.test(text))) throw new Error('translations must be nonempty plain text');
  return entry.translations;
}
export function applyTranslations<T>(dto: T, source: TranslationEntry, translations: Record<string, string>): T {
  const out = structuredClone(dto) as any;
  for (const segment of source.segments) {
    let parent = out;
    const parts = segment.key.split('.');
    for (const part of parts.slice(0, -1)) parent = parent?.[part];
    if (parent && parent[parts.at(-1)!] === segment.text && translations[segment.key]) parent[parts.at(-1)!] = translations[segment.key];
  }
  return out;
}
