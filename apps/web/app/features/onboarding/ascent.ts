// The onboarding film: the acceleration (/chronicle) from the Big Bang to a Type I civilization, one era
// plate each, in order. tools/make-media.sh renders public/media/hero-*.mp4 from the same list and
// timing (a test keeps them in step), and the film's caption follows the playhead with these labels.

/** Seconds each plate holds before the next has fully faded in, and the length of each crossfade. */
export const ASCENT_STEP = 2.4;
export const ASCENT_FADE = 0.8;

/** `art` is the plate under /media/art/epochs/ (the era's own illustration). */
export const ASCENT: ReadonlyArray<{ art: string; zh: string; en: string }> = [
  { art: "big-bang", zh: "138 亿年前 · 大爆炸", en: "13.8 billion years ago · The Big Bang" },
  { art: "origin-of-life", zh: "35 亿年前 · 生命起源", en: "3.5 billion years ago · Life begins" },
  { art: "cambrian-explosion", zh: "5.4 亿年前 · 寒武纪大爆发", en: "540 million years ago · The Cambrian explosion" },
  { art: "taming-fire", zh: "100 万年前 · 火的驯服", en: "1 million years ago · Taming fire" },
  { art: "cognitive-revolution", zh: "6 万年前 · 认知革命", en: "60,000 years ago · The cognitive revolution" },
  { art: "cities-writing", zh: "公元前 3500 年 · 城市与文字", en: "3500 BC · Cities and writing" },
  { art: "printing", zh: "1440 · 印刷术", en: "1440 · Printing" },
  { art: "steam-age", zh: "1769 · 蒸汽时代", en: "1769 · The steam age" },
  { art: "electric-age", zh: "1879 · 电气时代", en: "1879 · The electric age" },
  { art: "space-age", zh: "1957 · 太空时代", en: "1957 · The space age" },
  { art: "internet", zh: "1991 · 互联网", en: "1991 · The internet" },
  { art: "large-models", zh: "2022 · 对话式大模型", en: "2022 · Conversational models" },
  { art: "agents", zh: "2025 · 智能体时代", en: "2025 · The agent era" },
  { art: "kardashev-i-speculative", zh: "2080（推测）· 迈向 I 型文明", en: "2080 (speculative) · Toward a Type I civilization" },
];

/**
 * The plate on screen at a point in the loop: plate k starts fading in at k·STEP − FADE (the film is
 * trimmed so that plate 0 opens it), and the caption switches halfway through each crossfade.
 */
export function ascentAt(seconds: number): number {
  const n = ASCENT.length;
  const k = Math.floor((seconds + ASCENT_FADE / 2) / ASCENT_STEP);
  return ((k % n) + n) % n;
}
