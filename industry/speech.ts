// How the 视频号 voice should say a written script. The words on screen stay as written; only the audio
// track uses `spoken`. Another industry replaces the list (polyphonic words it actually misreads, and the
// names its audience hears). The checks that compare a transcript with the script treat every form of a
// row — written, spoken, heard — as the same word, so a correct reading is not reported as a mistake.
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

/** The line the voice model reads: marks become breaths, and the lexicon is applied. */
export function forSpeech(text: string): string {
  const held = text.replaceAll(PAUSE, "\u0000P\u0000").replace(STRESS, "\u0000S\u0000$1\u0000E\u0000");
  return applySpoken(held)
    .replaceAll("\u0000P\u0000", "[breath]")
    .replaceAll("\u0000S\u0000", "[breath]")
    .replaceAll("\u0000E\u0000", "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * Character error rate of a transcript against the script, after pause and stress marks and after
 * treating a lexicon row's written, spoken and heard forms as one word. 0 is an exact match.
 */
export function characterErrorRate(reference: string, hypothesis: string): number {
  const ref = compact(foldPronunciation(stripMarkup(reference)));
  const hyp = compact(foldPronunciation(stripMarkup(hypothesis)));
  if (!ref.length) return hyp.length ? 1 : 0;
  return editDistance(ref, hyp) / Array.from(ref).length;
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
