// The onboarding film: the acceleration (/chronicle) from the Big Bang to a Type I civilization, one era
// plate each, in order. Every plate pushes in. Deep time holds long and calm; from the steam age the holds
// drop steeply into a sprint through the electric age, the internet and the agent era, before the film
// settles on a Type I civilization and fades back to the start.
// tools/make-media.sh renders public/media/ascent-*.mp4 from the same list and timing (a test keeps them
// in step), and the film's caption follows the playhead with these labels.

/** The length of each crossfade, in seconds. */
export const ASCENT_FADE = 0.6;

/**
 * `art` is the plate under /media/art/epochs/ (the era's own illustration); `hold` is the time from the
 * moment it has fully faded in to the moment the next plate has.
 */
export const ASCENT: ReadonlyArray<{ art: string; hold: number; zh: string; en: string }> = [
  { art: "big-bang", hold: 5.0, zh: "138 亿年前 · 大爆炸", en: "13.8 billion years ago · The Big Bang" },
  { art: "origin-of-life", hold: 4.5, zh: "35 亿年前 · 生命起源", en: "3.5 billion years ago · Life begins" },
  { art: "cambrian-explosion", hold: 4.0, zh: "5.4 亿年前 · 寒武纪大爆发", en: "540 million years ago · The Cambrian explosion" },
  { art: "taming-fire", hold: 3.5, zh: "100 万年前 · 火的驯服", en: "1 million years ago · Taming fire" },
  { art: "cognitive-revolution", hold: 3.1, zh: "6 万年前 · 认知革命", en: "60,000 years ago · The cognitive revolution" },
  { art: "uruk-accounting-v2", hold: 2.8, zh: "公元前 3500 年 · 城市与文字", en: "3500 BC · Cities and writing" },
  { art: "printing", hold: 2.5, zh: "1440 · 印刷术", en: "1440 · Printing" },
  { art: "steam-age", hold: 2.0, zh: "1769 · 蒸汽时代", en: "1769 · The steam age" },
  { art: "electric-age", hold: 1.5, zh: "1879 · 电气时代", en: "1879 · The electric age" },
  { art: "space-age", hold: 1.2, zh: "1957 · 太空时代", en: "1957 · The space age" },
  { art: "internet-v2", hold: 1.0, zh: "1991 · 互联网", en: "1991 · The internet" },
  { art: "large-models-v2", hold: 1.0, zh: "2022 · 对话式大模型", en: "2022 · Conversational models" },
  { art: "agents", hold: 1.1, zh: "2025 · 智能体时代", en: "2025 · The agent era" },
  { art: "kardashev-i-speculative", hold: 5.0, zh: "2080（推测）· 迈向 I 型文明", en: "2080 (speculative) · Toward a Type I civilization" },
];

/** The film's length: one hold per plate (the last crossfade runs into the first plate again). */
export const ASCENT_LOOP = ASCENT.reduce((sum, a) => sum + a.hold, 0);

/**
 * The plate on screen at a point in the loop. The film is trimmed so that plate 0 opens it; plate k is
 * fully in at the sum of the holds before it and starts fading in FADE earlier, and the caption switches
 * halfway through each crossfade.
 */
export function ascentAt(seconds: number): number {
  const u = ((seconds % ASCENT_LOOP) + ASCENT_LOOP) % ASCENT_LOOP + ASCENT_FADE / 2;
  let fullyIn = 0;
  for (let k = 0; k < ASCENT.length; k++) {
    fullyIn += ASCENT[k]!.hold;
    if (u < fullyIn) return k;
  }
  return 0;
}
