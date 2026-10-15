// Subtitle timing, transcript checks and loudness for the 视频号 video. The words a viewer reads come from
// stripMarkup; the voice reads forSpeech. When a local transcript with word times is available, cues
// follow those times. Otherwise each cue takes a share of the line by its length.
import { characterErrorRate, stripMarkup } from "@aihot/industry/speech";

export { characterErrorRate, stripMarkup };

/** One token from a local transcript, in seconds from the start of its clip. */
export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface Cue {
  text: string;
  seconds: number;
}

/** A subtitle shows at most this many characters, one line at the frame's size. */
const SUBTITLE_MAX = 18;
/** Below this share of characters lined up with the transcript, the times are not trusted. */
const ALIGN_MIN = 0.45;

/**
 * A spoken line cut into subtitles of at most SUBTITLE_MAX characters, at its punctuation where it can.
 * The punctuation that ends a subtitle is not shown. Times come from `words` when they line up with the
 * line, and otherwise from each cue's length.
 */
export function subtitles(text: string, seconds: number, words?: WhisperWord[] | null): Cue[] {
  const shown = stripMarkup(text);
  const parts = splitParts(shown);
  if (!parts.length) return [{ text: "", seconds: Math.max(seconds, 0) }];
  const aligned = words?.length ? alignParts(parts, words, seconds) : null;
  return aligned ?? proportion(parts, seconds);
}

/** Cues placed on the finished timeline: `lead` seconds of silence, then each clip, with `gap` between clips. */
export function absoluteCues(segments: Array<{ text: string; seconds: number; words?: WhisperWord[] | null }>, lead: number, gap: number): Array<{ text: string; start: number; end: number }> {
  const cues: Array<{ text: string; start: number; end: number }> = [];
  let at = lead;
  for (const [k, segment] of segments.entries()) {
    let local = 0;
    for (const cue of subtitles(segment.text, segment.seconds, segment.words)) {
      cues.push({ text: cue.text, start: at + local, end: at + local + cue.seconds });
      local += cue.seconds;
    }
    at += segment.seconds + (k === segments.length - 1 ? 0 : gap);
  }
  return cues;
}

export function formatSrt(cues: Array<{ text: string; start: number; end: number }>): string {
  const ts = (time: number) => {
    const ms = Math.max(0, Math.round(time * 1000));
    const h = Math.floor(ms / 3_600_000);
    const m = Math.floor((ms % 3_600_000) / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  return cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`).join("\n") + (cues.length ? "\n" : "");
}

export interface LoudnormStats {
  measuredI: number;
  measuredLra: number;
  measuredTp: number;
  measuredThresh: number;
  offset: number;
}

/** The JSON block ffmpeg prints at the end of a loudnorm measure pass, or null when it is missing. */
export function parseLoudnorm(stderr: string): LoudnormStats | null {
  const blocks = stderr.match(/\{[\s\S]*?\}/g);
  if (!blocks) return null;
  for (let i = blocks.length - 1; i >= 0; i--) {
    try {
      const json = JSON.parse(blocks[i]!) as Record<string, unknown>;
      const num = (key: string) => Number(json[key]);
      const stats = {
        measuredI: num("input_i"), measuredLra: num("input_lra"), measuredTp: num("input_tp"),
        measuredThresh: num("input_thresh"), offset: num("target_offset"),
      };
      if (Object.values(stats).every((n) => Number.isFinite(n))) return stats;
    } catch {
      // A brace pair that is not the measure report.
    }
  }
  return null;
}

/** Second pass when `stats` is present, otherwise a single loudnorm pass at `target` LUFS. */
export function loudnormFilter(target: number, stats: LoudnormStats | null): string {
  const base = `loudnorm=I=${target}:TP=-1.5:LRA=11`;
  if (!stats) return base;
  return `${base}:measured_I=${stats.measuredI}:measured_LRA=${stats.measuredLra}:measured_TP=${stats.measuredTp}:measured_thresh=${stats.measuredThresh}:offset=${stats.offset}:linear=true`;
}

interface Part { text: string; weight: number }

function splitParts(text: string): Part[] {
  const phrases = text.split(/(?<=[，。！？；：,.!?;:])/).map((p) => p.trim()).filter(Boolean);
  const parts: string[] = [];
  for (const phrase of phrases) {
    const chars = Array.from(phrase);
    for (let i = 0; i < chars.length; i += SUBTITLE_MAX) {
      const piece = chars.slice(i, i + SUBTITLE_MAX).join("");
      const last = parts.at(-1);
      // Short phrases of one sentence share a subtitle; a sentence's end always starts a new one.
      if (i === 0 && last && !/[。！？.!?]$/.test(last) && Array.from(last + piece).length <= SUBTITLE_MAX) parts[parts.length - 1] = last + piece;
      else parts.push(piece);
    }
  }
  return parts.map((p) => ({ text: p.replace(/[，。；：,.;:]+$/, ""), weight: Array.from(p).length }));
}

function proportion(parts: Part[], seconds: number): Cue[] {
  const total = parts.reduce((n, p) => n + p.weight, 0) || 1;
  return parts.map((p) => ({ text: p.text, seconds: (seconds * p.weight) / total }));
}

function alignParts(parts: Part[], words: WhisperWord[], seconds: number): Cue[] | null {
  const refs = parts.map((p) => Array.from(compact(p.text)));
  const ref = refs.flat();
  const hyp = wordChars(words);
  if (!ref.length || !hyp.length) return null;
  const ops = align(ref, hyp.map((h) => h.ch));
  const matched = ops.filter((op) => op.ri !== null && op.hi !== null && ref[op.ri] === hyp[op.hi]!.ch).length;
  if (matched / ref.length < ALIGN_MIN) return null;
  const times: Array<{ start: number; end: number } | null> = ref.map(() => null);
  for (const op of ops) {
    if (op.ri !== null && op.hi !== null) times[op.ri] = { start: hyp[op.hi]!.start, end: hyp[op.hi]!.end };
  }
  let carried = hyp[0]!.start;
  for (let i = 0; i < times.length; i++) {
    if (times[i]) carried = times[i]!.start;
    else times[i] = { start: carried, end: carried };
  }
  const starts: number[] = [];
  let offset = 0;
  for (const chars of refs) {
    starts.push(times[offset]?.start ?? 0);
    offset += chars.length;
  }
  const bounds = [0, ...starts.slice(1).map((s) => Math.min(seconds, Math.max(0, s))), seconds];
  for (let i = 1; i < bounds.length; i++) bounds[i] = Math.min(seconds, Math.max(bounds[i]!, bounds[i - 1]!));
  bounds[0] = 0;
  bounds[bounds.length - 1] = seconds;
  const cues = parts.map((p, i) => ({ text: p.text, seconds: bounds[i + 1]! - bounds[i]! }));
  const sum = cues.reduce((n, c) => n + c.seconds, 0);
  if (sum <= 0) return null;
  return cues.map((c) => ({ text: c.text, seconds: (c.seconds * seconds) / sum }));
}

function wordChars(words: WhisperWord[]): Array<{ ch: string; start: number; end: number }> {
  const out: Array<{ ch: string; start: number; end: number }> = [];
  for (const word of words) {
    const chars = Array.from(compact(word.word));
    if (!chars.length) continue;
    const start = Math.max(0, word.start);
    const end = Math.max(start, word.end);
    chars.forEach((ch, i) => {
      out.push({ ch, start: start + ((end - start) * i) / chars.length, end: start + ((end - start) * (i + 1)) / chars.length });
    });
  }
  return out;
}

function compact(text: string): string {
  return text.replace(/[^\p{Script=Han}a-z0-9]/gu, "").toLowerCase();
}

interface Op { ri: number | null; hi: number | null }

function align(ref: string[], hyp: string[]): Op[] {
  const n = ref.length;
  const m = hyp.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i]![0] = i;
  for (let j = 0; j <= m; j++) dp[0]![j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  const ops: Op[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && dp[i]![j] === dp[i - 1]![j - 1]! + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) {
      ops.push({ ri: i - 1, hi: j - 1 });
      i--;
      j--;
    } else if (i > 0 && dp[i]![j] === dp[i - 1]![j]! + 1) {
      ops.push({ ri: i - 1, hi: null });
      i--;
    } else {
      ops.push({ ri: null, hi: j - 1 });
      j--;
    }
  }
  return ops.reverse();
}
