// How the 视频号 voice should say a written script. The words on screen stay as written; only the audio
// track uses the spoken forms. Another industry replaces the lexicon (polyphonic words it actually
// misreads, and the names its audience hears). Numbers, fractions and mixed model names are read aloud
// here too, and never written back onto the subtitles. A transcript check treats a lexicon row's written,
// spoken and heard forms as one word, folds traditional characters, and reads numbers the same way on
// both sides, so a correct reading is not reported as a mistake.
import { toSimplified } from "./simplified.ts";
export interface SpokenForm {
  /** As it appears in the script. A form with Latin letters matches a whole token, in any case. */
  written: string;
  /** What the voice model reads. */
  spoken: string;
  /** Other spellings a transcript may use for this reading. */
  heard?: readonly string[];
}

/**
 * Readings VoxCPM2 gets wrong often enough to fix in the audio only.
 * 调 in 调用 is diào, and a bare 调 is often read tiáo; 行 in 一行 (one line) and 重 in 重新/重试
 * swap with their other readings. The replacement is a same-sound word with one reading.
 * Model names are said the way a Chinese newscast says them, not left for the voice to guess.
 */
export const PRONUNCIATION: readonly SpokenForm[] = [
  { written: "调用", spoken: "吊用" },
  { written: "重新", spoken: "虫新" },
  { written: "重试", spoken: "虫试" },
  { written: "重复", spoken: "虫复" },
  { written: "重载", spoken: "虫载" },
  { written: "重启", spoken: "虫启" },
  { written: "一行", spoken: "一航" },
  { written: "GPT", spoken: "G P T", heard: ["吉皮提", "吉辟提"] },
  { written: "Opus", spoken: "欧帕斯" },
  { written: "GLM", spoken: "G L M" },
  { written: "xAI", spoken: "埃克斯 AI", heard: ["埃克斯AI", "叉AI", "叉 AI"] },
  { written: "x.ai", spoken: "埃克斯 AI", heard: ["埃克斯AI"] },
];

/** A breath the voice model turns into a pause, and a word it should land on. Subtitles drop both. */
const PAUSE = "[[停]]";
const STRESS = /\*\*([^*]+)\*\*/g;

/** The line a viewer reads: pause and stress marks removed. */
export function stripMarkup(text: string): string {
  return text.replaceAll(PAUSE, "").replace(STRESS, "$1").replace(/\s+/g, " ").trim();
}

/** The line the voice model reads: marks become breaths, numbers are spoken, and the lexicon is applied. */
export function forSpeech(text: string): string {
  const held = text.replaceAll(PAUSE, "\u0000P\u0000").replace(STRESS, "\u0000S\u0000$1\u0000E\u0000");
  return applySpoken(normalizeForSpeech(held))
    .replaceAll("\u0000P\u0000", "[breath]")
    .replaceAll("\u0000S\u0000", "[breath]")
    .replaceAll("\u0000E\u0000", "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Character error rate of a transcript against the script. Pause and stress marks are ignored, traditional
 * characters are folded, and numbers are read the same way on both sides. 0 is an exact match.
 */
export function characterErrorRate(reference: string, hypothesis: string): number {
  const ref = comparable(reference);
  const hyp = comparable(hypothesis);
  if (!ref.length) return hyp.length ? 1 : 0;
  return editDistance(ref, hyp) / Array.from(ref).length;
}

function comparable(text: string): string {
  return compact(normalizeForSpeech(foldPronunciation(toSimplified(stripMarkup(text)))));
}

const DIGIT = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;
const BIG = ["", "万", "亿", "兆"] as const;
/**
 * What to read aloud, longest shape first. A comma in 16,000 is part of the number. A bare year
 * from 1900 to 2099 is read digit by digit; the same number with a thousands separator is a quantity.
 */
const SPOKEN = new RegExp(
  [
    String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?[%％]?`,
    String.raw`\d+(?:\.\d+)?[%％]`,
    String.raw`\d+\s*/\s*\d+`,
    String.raw`[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+`,
    String.raw`[A-Za-z]+\d+(?:\.\d+)?`,
    String.raw`\d+\.\d+`,
    String.raw`\d+`,
  ].join("|"),
  "g",
);

/** Numbers, fractions and mixed model names, in the form the voice should say. Screen text is not changed. */
function normalizeForSpeech(text: string): string {
  const dates = new Map<string, string>();
  let i = 0;
  const held = text.replace(/\d{4}\/\d{1,2}\/\d{1,2}/g, (date) => {
    const key = String.fromCharCode(0xE000 + i++);
    dates.set(key, date);
    return key;
  });
  SPOKEN.lastIndex = 0;
  return held.replace(SPOKEN, (raw) => speakToken(raw)).replace(/[\uE000-\uE0FF]/g, (key) => dates.get(key) ?? key);
}

function speakToken(raw: string): string {
  const percent = /[%％]$/.test(raw);
  const body = percent ? raw.slice(0, -1) : raw;
  if (percent) return `百分之${speakQuantity(body)}`;
  if (body.includes("/")) {
    const [num, den] = body.split("/").map((part) => chineseInteger(Number(part.trim())));
    return `${den}分之${num}`;
  }
  if (/[A-Za-z]/.test(body)) return speakModel(body);
  // A thousands separator marks a quantity. A bare 1900–2099 is a year.
  return body.includes(",") ? speakQuantity(body) : speakPlain(body);
}

function speakQuantity(raw: string): string {
  const plain = raw.replace(/,/g, "");
  return plain.includes(".") ? speakDecimal(plain) : chineseInteger(Number(plain));
}

function speakPlain(raw: string): string {
  if (raw.includes(".")) return speakDecimal(raw);
  if (/^(?:19|20)\d{2}$/.test(raw)) return Array.from(raw, (ch) => DIGIT[Number(ch)]!).join("");
  return chineseInteger(Number(raw));
}

function speakDecimal(raw: string): string {
  const [whole, frac] = raw.split(".") as [string, string];
  const head = whole === "0" ? "零" : chineseInteger(Number(whole));
  return `${head}点${Array.from(frac, (ch) => DIGIT[Number(ch)]!).join("")}`;
}

/** A hyphenated or letter-and-digit name, spelled so the voice does not invent a pronunciation. */
function speakModel(token: string): string {
  return token.split(/-+/).filter(Boolean).map(speakModelPart).join(" ");
}

function speakModelPart(part: string): string {
  const version = part.match(/^v(\d+(?:\.\d+)?)$/i);
  if (version) return `V ${speakPlain(version[1]!)}`;
  const mixed = part.match(/^([A-Za-z]+)(\d+(?:\.\d+)?)$/);
  if (mixed) return `${spell(mixed[1]!)} ${speakPlain(mixed[2]!)}`;
  if (/^\d/.test(part)) return speakPlain(part);
  return spell(part);
}

function spell(letters: string): string {
  return Array.from(letters, (ch) => ch.toUpperCase()).join(" ");
}

/**
 * A quantity. 两 is used before 百, 千, 万 and 亿; 二 is used before 十 and in the ones place.
 * 10 to 19 at the start of the number drop the leading 一.
 */
function chineseInteger(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) return String(n);
  if (n === 0) return "零";
  const groups: number[] = [];
  let x = n;
  while (x > 0) {
    groups.push(x % 10000);
    x = Math.floor(x / 10000);
  }
  let out = "";
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]!;
    if (group === 0) continue;
    let below = readGroup(group, out === "");
    if (below === "二" && i > 0) below = "两";
    if (out && (group < 1000 || groups[i + 1] === 0)) out += "零";
    out += below + BIG[i]!;
  }
  return out;
}

function readGroup(n: number, leading: boolean): string {
  const digits = [Math.floor(n / 1000), Math.floor(n / 100) % 10, Math.floor(n / 10) % 10, n % 10];
  const unit = ["千", "百", "十", ""] as const;
  let out = "";
  let zero = false;
  for (let i = 0; i < 4; i++) {
    const digit = digits[i]!;
    if (digit === 0) {
      if (out) zero = true;
      continue;
    }
    if (zero) {
      out += "零";
      zero = false;
    }
    const place = unit[i]!;
    if (leading && out === "" && i === 2 && digit === 1) {
      out += "十";
      continue;
    }
    out += `${digit === 2 && (place === "百" || place === "千") ? "两" : DIGIT[digit]!}${place}`;
  }
  return out;
}

function applySpoken(text: string): string {
  let out = text;
  for (const row of byLength(PRONUNCIATION)) {
    const re = writtenPattern(row.written);
    re.lastIndex = 0;
    out = out.replace(re, row.spoken);
  }
  return out;
}

/** Every form of a row, longest first, rewritten to the written form so both sides of a comparison agree. */
function foldPronunciation(text: string): string {
  let out = text;
  for (const alias of aliases()) {
    alias.re.lastIndex = 0;
    out = out.replace(alias.re, alias.canon);
  }
  return out;
}

interface Alias { re: RegExp; canon: string; length: number }

let aliasCache: Alias[] | null = null;
function aliases(): Alias[] {
  if (aliasCache) return aliasCache;
  const rows: Alias[] = [];
  const seen = new Set<string>();
  for (const row of PRONUNCIATION) {
    const canon = row.written.replace(/\./g, "");
    for (const form of [row.written, row.spoken, ...(row.heard ?? [])]) {
      const key = `${canon}\0${form.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ re: aliasPattern(form), canon, length: form.replace(/\s/g, "").length });
    }
  }
  aliasCache = rows.sort((a, b) => b.length - a.length);
  return aliasCache;
}

function byLength(rows: readonly SpokenForm[]): SpokenForm[] {
  return [...rows].sort((a, b) => b.written.length - a.written.length);
}

function writtenPattern(written: string): RegExp {
  return /[A-Za-z]/.test(written)
    ? new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(written)}(?![A-Za-z0-9])`, "gi")
    : new RegExp(escapeRegExp(written), "g");
}

/** Spaced letters ("G P T") also match the letters run together ("GPT"). */
function aliasPattern(form: string): RegExp {
  const bits = form.split(/\s+/);
  if (bits.length > 1 && bits.every((b) => /^[A-Za-z]$/.test(b))) {
    return new RegExp(`(?<![A-Za-z0-9])${bits.map(escapeRegExp).join("\\s*")}(?![A-Za-z0-9])`, "gi");
  }
  return writtenPattern(form);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compact(text: string): string {
  return text.replace(/[^\p{Script=Han}a-z0-9]/gu, "").toLowerCase();
}

function editDistance(a: string, b: string): number {
  const A = Array.from(a);
  const B = Array.from(b);
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) {
      cur[j] = A[i - 1] === B[j - 1] ? prev[j - 1]! : 1 + Math.min(prev[j]!, cur[j - 1]!, prev[j - 1]!);
    }
    prev = cur;
  }
  return prev[B.length]!;
}
