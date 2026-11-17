// Stable translation inputs come exclusively from public DTOs, never raw source bodies.
import { createHash } from 'node:crypto';
import { z } from 'zod';
export const contentKinds = ['item', 'story', 'report', 'body'] as const;
export type ContentKind = typeof contentKinds[number];
export const translationEntrySchema = z.object({
  sourceRevision: z.number().int().positive().optional(),
  sourceLanguage: z.string().regex(/^(unknown|[a-z]{2,3}(-[A-Za-z0-9]+)*)$/).optional(), targetLanguage: z.enum(['en','zh']).optional(),
  kind: z.enum(contentKinds), id: z.string().min(1).max(120), sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  segments: z.array(z.object({ key: z.string().min(1), text: z.string().min(1) }).strict()).max(10000),
  translations: z.record(z.string(), z.string().trim().min(1)).optional(),
}).strict();
export const translationBatchSchema = z.object({ schemaVersion: z.literal(1), targetLanguage: z.enum(['en','zh']), entries: z.array(translationEntrySchema).max(1000) }).strict().refine(batch => batch.entries.every(entry => (entry.targetLanguage ?? 'en') === batch.targetLanguage), 'entry target language must match batch');
export type TranslationEntry = z.infer<typeof translationEntrySchema>;
const proseKeys = new Set(['title', 'summary', 'reason', 'digest', 'latest', 'label', 'heading', 'headline', 'leadParagraph', 'overview', 'caption', 'text']);
export function contentSource(kind: ContentKind, id: string, dto: any, targetLanguage: "en" | "zh" = "en"): TranslationEntry {
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
  const sourceLanguage = dto.contentLanguage?.sourceLanguage ?? dto.editorialLanguage ?? "zh";
  const sourceHash = createHash('sha256').update(JSON.stringify({ kind, id, sourceLanguage, segments, ...(kind === 'report' ? { revision: dto.revision ?? null } : {}) })).digest('hex');
  return { kind, id, sourceHash, segments, sourceLanguage, targetLanguage, ...(kind === "report" && dto.revision ? { sourceRevision: dto.revision } : {}) };
}
/** Script/echo guard for edition prose, not a complete language detector. Protected code, quoted
 * source text and short proper-name labels can remain verbatim; ordinary prose must use the target. */
export function targetLanguageProse(text: string, target: "en" | "zh"): boolean {
  const prose = text.replace(/<pre[\s\S]*?<\/pre>|<code[\s\S]*?<\/code>/gi, " ")
    .replace(/```[\s\S]*?```|`[^`]*`/g, " ")
    .replace(/"[^"\n]*"|“[^”\n]*”|‘[^’\n]*’/g, " ")
    .replace(/<[^>]*>|https?:\/\/\S+|⟦\d+⟧|&[a-z0-9#]+;/gi, " ").trim();
  if (!/[\p{L}]/u.test(prose)) return true;
  if (target === "en") return /[A-Za-z]{2}/.test(prose) && !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}]/u.test(prose);
  if (/[\p{Script=Han}]/u.test(prose)) {
    // Lowercase terms and commands (llama.cpp, token, ollama pull clef) belong in Chinese tech prose,
    // even in a short title; a left-over English sentence runs five or more lowercase words together,
    // and passes only as a quotation inside plenty of Chinese.
    const english = prose.match(/\b[a-z][a-z'-]*\b/g)?.length ?? 0;
    const run = Math.max(0, ...(prose.match(/\b[a-z][a-z'-]*(?:[ \t]+[a-z][a-z'-]*)*\b/g) ?? []).map(words => words.split(/[ \t]+/).length));
    const han = prose.match(/\p{Script=Han}/gu)?.length ?? 0;
    return !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}]/u.test(prose) && (run < 5 || han >= english * 10);
  }
  // Preserve short names/acronyms/version labels such as OpenAI, GPT-5, Model 2.5 or datasette 1.0a41, and
  // a label before a bare link ("API：qwencloud.com/…"), whose colon is not part of the name, nor the
  // ellipsis X puts on a link it shortens.
  const words = prose.split(/\s+/).map(word => word.replace(/[:：…]$/, '')).filter(Boolean);
  return words.length <= 4 && words.filter(word => /^[A-Z][a-z]+$/.test(word)).length <= 2 && words.filter(word => /^[a-z]/.test(word)).length <= 1
    && words.every(word => /^(?:[A-Za-z][A-Za-z0-9.+/#_-]*|[0-9][0-9A-Za-z.,%+-]*)$/.test(word));
}

export function validateTranslation(entry: TranslationEntry, current: TranslationEntry): Record<string, string> {
  if ((entry.sourceLanguage ?? 'zh') !== (current.sourceLanguage ?? 'zh') || (entry.targetLanguage ?? 'en') !== (current.targetLanguage ?? 'en') || entry.kind !== current.kind || entry.id !== current.id || entry.sourceHash !== current.sourceHash || JSON.stringify(entry.segments) !== JSON.stringify(current.segments)) throw new Error(`stale source: ${entry.kind}:${entry.id}`);
  const keys = current.segments.map(s => s.key).sort();
  if (!entry.translations || JSON.stringify(Object.keys(entry.translations).sort()) !== JSON.stringify(keys)) throw new Error(`incomplete translations: ${entry.kind}:${entry.id}`);
  for (const text of Object.values(entry.translations)) {
    if (!text.trim() || (entry.kind !== 'body' && /<\/?[a-z][^>]*>/i.test(text))) throw new Error('translations must be nonempty plain text');
    if (!targetLanguageProse(text, entry.targetLanguage ?? 'en')) throw new Error(`translation prose must use ${entry.targetLanguage ?? 'en'}`);
  }
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

/** Editions imported before editorial languages existed retain their Chinese-source hash. */
export function legacySourceHash(source: TranslationEntry, revision: number | null = source.sourceRevision ?? null): string {
  return createHash('sha256').update(JSON.stringify({ kind: source.kind, id: source.id, segments: source.segments,
    ...(source.kind === 'report' ? { revision } : {}) })).digest('hex');
}
export function editionMatches(source: TranslationEntry, edition: { source_hash: string; source_language: string; source_segments: TranslationEntry['segments']; translations: Record<string,string> }, revision: number | null = source.sourceRevision ?? null): boolean {
  // Old body editions could have used a non-Chinese original when no Chinese body existed.
  // Their legacy hash proves the same blocks; it carries no original-language claim.
  const legacy = edition.source_language === 'zh' && (source.sourceLanguage === 'zh' || source.kind === 'body') && edition.source_hash === legacySourceHash(source,revision);
  if (!legacy && edition.source_language !== (source.sourceLanguage ?? 'zh')) return false;
  if (JSON.stringify(edition.source_segments) !== JSON.stringify(source.segments)) return false;
  if (edition.source_hash !== source.sourceHash && !legacy) return false;
  try { validateTranslation({ ...source, translations: edition.translations }, source); return true; } catch { return false; }
}
