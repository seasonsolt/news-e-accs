// English pages show English. Stored copy can still carry a Chinese proper name or an untranslated
// sentence; this is the render-time fallback for an English response. Chinese editions are not passed
// through it. Tag keys stay in their stored form because filters and the UI dictionary address them.

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+(?:['’]s)?/gu;

/** Known outlet and account names. Longer keys first so 腾讯混元 wins over a shorter piece. */
const ENGLISH_NAMES: Array<[string, string]> = [
  ["腾讯混元", "Tencent Hunyuan"],
  ["量子位", "QbitAI"],
  ["雷锋网", "Leiphone"],
  ["智谱", "Zhipu"],
  ["歸藏", "Guizang"],
  ["归藏", "Guizang"],
  ["宝玉", "Baoyu"],
];

const NAME_KEYS = new Set(["name", "author", "authorName", "sourceName", "sourceNames", "monogram"]);
const PROSE_KEYS = new Set([
  "title", "summary", "reason", "digest", "latest", "text", "leadParagraph", "overview", "heading",
  "headline", "caption", "definition", "description", "originalTitle", "label",
]);
const SKIP_KEYS = new Set([
  "tags", "id", "publicId", "slug", "url", "href", "src", "handle", "key", "kind", "status", "language",
  "sourceLanguage", "requested", "editorialLanguage", "channel", "category", "role", "relation", "path",
  "loc", "cursor", "hash", "iconUrl", "avatarUrl", "originalUrl", "feedUrl", "itemId", "factId",
  "storyPublicId", "contentLanguage", "body", "outline",
]);

/** The same reader-facing trim as the publication source name, without pulling the backend in. */
function readerName(name: string): string {
  let bare = name;
  while (/（[^（）]*）/.test(bare)) bare = bare.replace(/（[^（）]*）/g, " ");
  const x = /^X[:：]\s*(.*?)\s*(?:\(@[^)]*\))?\s*$/.exec(bare);
  return (x ? x[1]! : bare).replace(/\s+/g, " ").trim() || /@\w+/.exec(name)?.[0] || name.trim();
}

function applyKnownNames(text: string): string {
  let out = text;
  for (const [zh, en] of ENGLISH_NAMES) out = out.replaceAll(zh, en);
  return out;
}

function tidy(text: string): string {
  return text
    .replace(CJK_RUN, "")
    .replace(/[“”「」『』]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,;:]){2,}/g, "$1")
    .replace(/\(\s*\)|（\s*）/g, "")
    .replace(/^[\s,;:·\-–—]+|[\s,;:·\-–—]+$/g, "")
    .trim();
}

/** A display name for an English page. Known outlets use their English name; other CJK is removed. */
export function englishDisplayName(name: string): string {
  const bare = applyKnownNames(readerName(name).replace(/\s*·\s*X\s*$/i, "").trim());
  if (!CJK.test(bare)) return bare;
  const stripped = tidy(bare);
  return stripped || "Source";
}

/**
 * English prose with no CJK. A sentence that is otherwise English is kept when its only CJK was a
 * known name; a sentence that still contains CJK is dropped when another sentence remains, and
 * otherwise loses the CJK characters so the English words stay.
 */
export function englishReaderText(text: string): string {
  const named = applyKnownNames(text);
  if (!CJK.test(named)) return named;
  const sentences = named.split(/(?<=[.!?])\s+/);
  const clean = sentences.filter((sentence) => !CJK.test(sentence));
  if (clean.length > 0 && clean.length < sentences.length) return clean.join(" ").trim();
  return tidy(named);
}

function predominantlyHan(text: string): boolean {
  const han = text.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return han > 0 && han >= latin;
}

/** `en` is a stored English edition. `loose` has no language mark: clean mixed prose, keep a Chinese original. */
function walk(value: unknown, key: string | null, mode: "en" | "loose" | "keep"): unknown {
  if (typeof value === "string") {
    if (mode === "keep" || !key || SKIP_KEYS.has(key) || !CJK.test(value)) return value;
    if (NAME_KEYS.has(key)) return key === "monogram" ? "•" : englishDisplayName(value);
    if (PROSE_KEYS.has(key)) return mode === "loose" && predominantlyHan(value) ? value : englishReaderText(value);
    return value;
  }
  if (Array.isArray(value)) {
    if (key && SKIP_KEYS.has(key)) return value;
    return value.map((item) => walk(item, key, mode));
  }
  if (value && typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return value;
    const state = (value as { contentLanguage?: { language?: string } }).contentLanguage;
    const next = state?.language === "zh" || state?.language === "unknown" ? "keep" : state?.language === "en" ? "en" : mode;
    return Object.fromEntries(Object.entries(value).map(([child, inner]) => [child, walk(inner, child, next)]));
  }
  return value;
}

/** Reader-facing strings of an English page's data. A disclosed Chinese fallback is left intact. */
export function presentEnglish<T>(value: T): T {
  return walk(value, null, "loose") as T;
}
