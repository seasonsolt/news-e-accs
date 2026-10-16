// Cuts the 视频号 video of a day's 「AI 早报」 on the editor's Mac: reads the script written and edited in
// the 公众号 workbench (newsletter/wechat-video.ts) from the site, speaks it with VoxCPM2 on this machine
// (scripts/wechat-video-tts.py), finds when each word is said (scripts/wechat-video-listen.py), animates
// the lead, the quick hits, the last word and the subtitles with HyperFrames (scripts/wechat-video-composition.ts), lays the voice over a
// music bed of its own (scripts/wechat-video-music.py) and joins them into a 1080×1920 mp4, beside the
// caption to paste into 视频号 and a cover. 视频号 has no upload API: the editor uploads the mp4 in 视频号助手
// (channels.weixin.qq.com) or on the phone.
//
//   npm run wechat-video -- [YYYY-MM-DD] [--base https://e-acc.ai] [--out <folder>]
//
// Needs ffmpeg (with libx264) on PATH, network for `npx hyperframes` and its Chrome on the first run,
// WECHAT_VIDEO_TOKEN (the server's value), and a venv with mlx-audio (VOXCPM_PYTHON) holding VoxCPM2,
// Qwen3-ForcedAligner and Qwen3-ASR. The voice is VOICE_DESCRIPTION in words, or a recording
// VOICE_REF_AUDIO (with VOICE_REF_TEXT, its transcript) of someone who agreed to have their voice used;
// VOICE_TEMPO speeds it up (or slows it down) without changing its pitch.
import { execFile, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { SITE } from "@aihot/site";
import { calendarDate } from "@aihot/contracts/time";
import type { WechatVideoSpec } from "../packages/backend/src/newsletter/wechat-video.ts";
import { composition, tokens, type Cut } from "./wechat-video-composition.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** A path from .env, where `~` is not expanded by the shell. */
const expand = (p: string) => path.resolve(p.replace(/^~(?=\/|$)/, homedir()));
const arg = (name: string) => {
  const at = process.argv.indexOf(name);
  return at > 0 ? process.argv[at + 1] : undefined;
};
const date = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? calendarDate(Date.now(), process.env.REPORT_TIME_ZONE ?? "Asia/Shanghai");
const base = (arg("--base") ?? process.env.WECHAT_VIDEO_BASE_URL ?? SITE.defaultUrl).replace(/\/+$/, "");
const out = expand(arg("--out") ?? path.join("~/Movies/e-acc-daily", date));
const token = process.env.WECHAT_VIDEO_TOKEN;
const python = expand(process.env.VOXCPM_PYTHON ?? "~/.local/share/voxcpm2-mlx/venv/bin/python");
const voice = {
  model: process.env.VOXCPM_MODEL ?? "mlx-community/VoxCPM2-bf16",
  timesteps: Number(process.env.VOXCPM_TIMESTEPS) || 10,
  instruct: process.env.VOICE_DESCRIPTION ?? "沉稳清晰的普通话男声，语速适中，新闻播报风格",
  refAudio: process.env.VOICE_REF_AUDIO ? expand(process.env.VOICE_REF_AUDIO) : null,
  refText: process.env.VOICE_REF_TEXT ?? null,
};
const LISTEN = { aligner: "mlx-community/Qwen3-ForcedAligner-0.6B-8bit", asr: "mlx-community/Qwen3-ASR-1.7B-8bit" };
/** How many more times a line the hearing check got wrong is spoken. */
const RESPEAK = 2;
/** A cloned voice also copies the pace of its recording; ffmpeg's atempo keeps the pitch. */
const tempo = Number(process.env.VOICE_TEMPO) || 1;
/** Pinned: a new HyperFrames may draw the same composition differently. */
const HYPERFRAMES = "hyperframes@0.8.162";

/**
 * Seconds of the opening title before the voice (its animation ends by then, and the cover is taken from
 * it), between lines (where the cards change) and after the last.
 */
const LEAD = 1.8;
const GAP = 0.7;
const TAIL = 2.0;
/** Between one quick hit and the next, which share a card. */
const BRIEF_GAP = 0.35;
/** A card arrives this long before its line is spoken. */
const CUT_AHEAD = 0.45;
/** A subtitle is at most this many Chinese characters wide, one line at its size. */
const SUBTITLE_MAX = 16;
/** Under the voice the bed sits about this far down before it is ducked. */
const BED_GAIN = 0.3;

function fail(message: string): never {
  console.error(`wechat-video: ${message}`);
  process.exit(1);
}

async function get(pathname: string): Promise<Response> {
  const res = await fetch(`${base}${pathname}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 401) fail(`${base} 不认这个 WECHAT_VIDEO_TOKEN（服务器上没有配置，或两边不一样）。`);
  return res;
}

/** Runs a command to its end; its output is shown only when it fails. */
function run(cmd: string, args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env });
    let log = "";
    const keep = (d: Buffer) => { log = (log + d.toString()).slice(-4000); };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args[0] ?? ""} exited ${code}\n${log}`))));
  });
}

/** Runs one of the venv's scripts with a JSON request; each JSON line it prints, but its last. */
function venv<T>(script: string, request: object, progress: (msg: T, k: number) => void): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-I", path.join(HERE, script)], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? "1" } });
    const lines: T[] = [];
    let err = "";
    child.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-4000); });
    createInterface({ input: child.stdout }).on("line", (raw) => {
      const msg = JSON.parse(raw) as T & { done?: boolean };
      if (msg.done) return;
      lines.push(msg);
      progress(msg, lines.length);
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(lines) : reject(new Error(`${script} exited ${code}\n${err}`))));
    child.stdin.end(JSON.stringify(request));
  });
}

/** How wide text sets: a Chinese character or full-width mark is one, a letter, digit or space about half. */
const width = (s: string) => Array.from(s).reduce((n, c) => n + (/[\u2E80-\uFFEF]/.test(c) ? 1 : 0.55), 0);

/**
 * A spoken line cut into subtitles at most SUBTITLE_MAX characters wide, at its punctuation where it can
 * and into even pieces where a phrase is longer, never inside a name or number: each subtitle's text and
 * where it starts in the line's characters. The punctuation that ends a subtitle is not shown.
 */
export function subtitles(text: string): Array<{ text: string; from: number }> {
  const length = (s: string) => Array.from(s).length;
  const parts: Array<{ raw: string; from: number }> = [];
  let at = 0;
  // A full-width mark always ends a phrase; a dot or comma only when no letter or digit follows (71.8%).
  for (const phrase of text.split(/(?<=[，。！？；：])|(?<=[,.!?;:])(?![A-Za-z0-9])/)) {
    const target = width(phrase) / Math.ceil(width(phrase) / SUBTITLE_MAX);
    const pieces: Array<{ raw: string; from: number }> = [];
    let offset = at;
    for (const piece of tokens(phrase)) {
      const last = pieces.at(-1);
      if (last && width(last.raw) < target && width(last.raw + piece) <= SUBTITLE_MAX) last.raw += piece;
      else pieces.push({ raw: piece, from: offset });
      offset += length(piece);
    }
    for (const [i, piece] of pieces.entries()) {
      const last = parts.at(-1);
      // Short phrases of one sentence share a subtitle; a sentence's end always starts a new one.
      if (i === 0 && last && !/[。！？.!?]\s*$/.test(last.raw) && width((last.raw + piece.raw).trim()) <= SUBTITLE_MAX) last.raw += piece.raw;
      else parts.push(piece);
    }
    at = offset;
  }
  return parts.flatMap((p) => {
    const shown = p.raw.trim().replace(/[，。；：,.;:]+$/, "");
    return shown ? [{ text: shown, from: p.from + length(p.raw) - length(p.raw.trimStart()) }] : [];
  });
}

/**
 * When each character of a spoken line is said, in seconds into the line, from the aligner's words
 * (which skip punctuation and may split or miss a name). A character no word covers is placed between
 * its neighbours that are. Also the share of the words found in the text, to tell when it went wrong.
 */
export function charTimes(text: string, words: Array<[string, number, number]>, seconds: number): { at: number[]; found: number } {
  const chars = Array.from(text.toLowerCase());
  const at: Array<number | null> = chars.map(() => null);
  let cursor = 0;
  let found = 0;
  for (const [word, start, end] of words) {
    const w = Array.from(word.toLowerCase());
    for (let i = cursor; w.length && i + w.length <= chars.length && i <= cursor + 12; i++) {
      if (!w.every((c, j) => chars[i + j] === c)) continue;
      w.forEach((_, j) => { at[i + j] = start + ((end - start) * j) / w.length; });
      cursor = i + w.length;
      found++;
      break;
    }
  }
  const known = at.flatMap((t, i) => (t === null ? [] : [i]));
  const filled = at.map((t, i) => {
    if (t !== null) return t;
    const before = known.findLast((k) => k < i);
    const after = known.find((k) => k > i);
    const [t0, i0] = before === undefined ? [0, -1] : [at[before]!, before];
    const [t1, i1] = after === undefined ? [seconds, chars.length] : [at[after]!, after];
    return t0 + ((t1 - t0) * (i - i0)) / (i1 - i0);
  });
  return { at: filled, found: words.length ? found / words.length : 0 };
}

/** Names the recogniser writes in Chinese however they were said. */
const SAID_IN_CHINESE: Record<string, string> = { google: "谷歌", apple: "苹果", microsoft: "微软", nvidia: "英伟达", amazon: "亚马逊", tesla: "特斯拉", intel: "英特尔", samsung: "三星" };

/** What a listener would have heard wrong in a spoken line: names not heard, and how much of the rest. */
export function misheard(text: string, heard: string): string[] {
  const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const said = flat(heard);
  const problems = (text.match(/[A-Za-z][A-Za-z0-9.@'-]*[A-Za-z0-9]|[A-Za-z]/g) ?? [])
    .filter((name) => !said.includes(flat(name)) && !heard.includes(SAID_IN_CHINESE[flat(name)] ?? "\0"))
    .map((name) => `没听出「${name}」`);
  // Chinese read back: the share of the script's characters heard in order (numbers are read in words, so
  // only what the script spells in characters is compared).
  const han = (s: string) => Array.from(s.replace(/[^\p{Script=Han}]/gu, ""));
  const a = han(text);
  const b = han(heard);
  const lcs = Array.from({ length: b.length + 1 }, () => 0);
  for (const ca of a) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const above = lcs[j]!;
      lcs[j] = ca === b[j - 1] ? diagonal + 1 : Math.max(lcs[j]!, lcs[j - 1]!);
      diagonal = above;
    }
  }
  const recall = a.length ? lcs[b.length]! / a.length : 1;
  if (recall < 0.9) problems.push(`汉字只对上 ${Math.round(recall * 100)}%`);
  return problems;
}

async function main() {
  if (!token) fail("没有 WECHAT_VIDEO_TOKEN：写进 .env，值和服务器上的一样。");
  console.log(`读取 ${date} 的口播稿（${base}）`);
  const res = await get(`/api/wechat-video/${date}`);
  if (!res.ok) fail(`${res.status} ${await res.text()}`);
  const spec = (await res.json()) as WechatVideoSpec;
  if (!spec.segments.length) fail("口播稿里没有条目。");

  const project = path.join(out, "composition");
  await rm(project, { recursive: true, force: true });
  await mkdir(path.join(project, "images"), { recursive: true });
  await mkdir(path.join(project, "fonts"), { recursive: true });
  await mkdir(path.join(out, "voice"), { recursive: true });
  for (const weight of [400, 700]) {
    await copyFile(path.join(HERE, `../assets/og-fonts/noto-sans-sc-${weight}.ttf`), path.join(project, "fonts", `noto-sans-sc-${weight}.ttf`));
  }
  const images: Record<string, string> = {};
  const pictured = [...spec.segments.map((x) => ({ ...x, name: String(x.number).padStart(2, "0") })), ...(spec.egg ? [{ ...spec.egg, name: "egg" }] : [])];
  for (const x of pictured.filter((p) => p.hasImage)) {
    if (images[x.key]) continue;
    const img = await get(`/api/wechat-video/${date}/illustration.jpg?entry=${encodeURIComponent(x.key)}`);
    if (!img.ok) continue;
    images[x.key] = `images/${x.name}.jpg`;
    await writeFile(path.join(project, images[x.key]!), Buffer.from(await img.arrayBuffer()));
  }

  // The lines in speaking order, each with the card it is said over.
  const [lead, ...briefs] = spec.segments;
  const said = [
    { text: spec.opening, card: "opening" },
    { text: lead!.narration, card: "lead" },
    ...briefs.map((x) => ({ text: x.narration, card: "briefs" })),
    ...(spec.egg ? [{ text: spec.egg.narration, card: "egg" }] : []),
    { text: spec.closing, card: "closing" },
  ].map((x) => ({ ...x, text: x.text.trim() }));
  if (said.some((x) => !x.text)) fail("口播稿的开场或结尾是空的。");
  const lines = said.map((x) => x.text);
  const all = lines.map((_, k) => k);
  const file = (k: number, attempt: number) => path.join(out, "voice", `${String(k).padStart(3, "0")}${attempt ? `-${attempt + 1}` : ""}.wav`);
  /** Speaks these lines into this attempt's files: each one's length in seconds. */
  const speak = async (ks: number[], attempt: number) => {
    const spoken = await venv<{ seconds: number }>("wechat-video-tts.py", { ...voice, lines: ks.map((k) => ({ text: lines[k], out: file(k, attempt) })) },
      (m, j) => { if (!attempt) console.log(`  配音 ${j}/${lines.length}（${m.seconds.toFixed(1)} 秒）`); });
    if (tempo === 1) return spoken.map((m) => m.seconds);
    // atempo's output is not exactly 1/tempo as long, and the timeline adds every line up.
    const seconds: number[] = [];
    for (const k of ks) {
      const wav = file(k, attempt);
      await run("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-af", `atempo=${tempo}`, `${wav}.tmp.wav`]);
      await rename(`${wav}.tmp.wav`, wav);
      const { stdout } = await promisify(execFile)("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", wav]);
      seconds.push(Number(stdout));
    }
    return seconds;
  };
  const listen = (ks: number[], attempt: number) => venv<{ words: Array<[string, number, number]>; heard: string }>("wechat-video-listen.py",
    { ...LISTEN, lines: ks.map((k) => ({ text: lines[k], wav: file(k, attempt) })) }, () => {});

  const voiceName = voice.refAudio ? `参考录音 ${path.basename(voice.refAudio)}` : `声音描述「${voice.instruct}」`;
  console.log(`配音：VoxCPM2，${voiceName}，共 ${lines.length} 段（每段约需它时长的 1.5 倍）`);
  const seconds = await speak(all, 0);
  console.log("对齐字幕、听写自检");
  const heard = await listen(all, 0);
  const wavs = all.map((k) => file(k, 0));
  // The voice model reads a name differently each time: a line heard wrong is spoken again, and the
  // reading heard best is kept.
  const wrong = (k: number, words = heard[k]!.heard) => misheard(lines[k]!, words).length;
  for (let attempt = 1; attempt <= RESPEAK; attempt++) {
    const again = all.filter((k) => wrong(k) > 0);
    if (!again.length) break;
    console.log(`  重配听错的第 ${again.map((k) => k + 1).join("、")} 段（第 ${attempt + 1} 次）`);
    const [respoken, reheard] = [await speak(again, attempt), await listen(again, attempt)];
    for (const [j, k] of again.entries()) {
      if (wrong(k, reheard[j]!.heard) >= wrong(k)) continue;
      [seconds[k], heard[k], wavs[k]] = [respoken[j]!, reheard[j]!, file(k, attempt)];
    }
  }

  // The timeline: each line's start (quick hits follow each other closely), the cards cut just before
  // their first line, and the subtitles, the lead's points and the quick hits' turns on the words.
  const gaps = said.map((x, k) => (k === said.length - 1 ? TAIL : x.card === "briefs" && said[k + 1]!.card === "briefs" ? BRIEF_GAP : GAP));
  const starts = seconds.map((_, k) => LEAD + seconds.slice(0, k).reduce((a, b, j) => a + b + gaps[j]!, 0));
  const duration = starts.at(-1)! + seconds.at(-1)! + TAIL;
  const firsts = said.flatMap((x, k) => (k === 0 || said[k - 1]!.card !== x.card ? [k] : []));
  const cuts = firsts.map((k) => (k === 0 ? 0 : starts[k]! - CUT_AHEAD));
  const scenes = cuts.map((start, j) => ({ start, end: cuts[j + 1] ?? duration }));
  const timed = lines.map((line, k) => charTimes(line, heard[k]!.words, seconds[k]!));
  const at = (k: number, index: number) => starts[k]! + timed[k]!.at[index]!;
  // A point comes up as the sentence it stands for starts (the prompt pairs them in order).
  const sentences = [0, ...Array.from(lines[1]!.matchAll(/[。！？](?=.)/gu), (m) => Array.from(lines[1]!.slice(0, m.index! + 1)).length)];
  const points = lead!.points.map((_, j) => at(1, sentences[Math.min(j, sentences.length - 1)]!));
  const briefSpans = said.flatMap((x, k) => (x.card === "briefs" ? [{ start: starts[k]! - 0.1, end: starts[k]! + seconds[k]! + gaps[k]! - 0.1 }] : []));
  const report: string[] = [];
  const subs: Cut["subtitles"] = [];
  for (const [k, line] of lines.entries()) {
    if (timed[k]!.found < 0.8) report.push(`第 ${k + 1} 段：字幕只对上 ${Math.round(timed[k]!.found * 100)}% 的词，时间可能不准`);
    for (const problem of misheard(line, heard[k]!.heard)) report.push(`第 ${k + 1} 段：${problem}（听成「${heard[k]!.heard}」）`);
    const parts = subtitles(line);
    for (const [j, part] of parts.entries()) {
      let from = part.from;
      const words = tokens(part.text).map((text) => {
        const word = { text, at: at(k, from) };
        from += Array.from(text).length;
        return word;
      });
      const next = parts[j + 1];
      const start = words[0]!.at;
      const end = next ? at(k, next.from) : Math.min(starts[k]! + seconds[k]! + 0.3, (starts[k + 1] ?? duration) - 0.05);
      subs.push({ start, end: Math.max(end, start + 0.3), tokens: words });
    }
  }

  console.log("配乐与混音");
  const music = path.join(out, "music.wav");
  await run(python, ["-I", path.join(HERE, "wechat-video-music.py"), JSON.stringify({ seconds: duration, seed: Number(date.replaceAll("-", "")), out: music })]);
  const mix = path.join(out, "sound.m4a");
  const pads = wavs.map((_, k) => `[${k}:a]aformat=sample_rates=48000:channel_layouts=mono,apad=pad_dur=${gaps[k]}[a${k}]`);
  await run("ffmpeg", [
    "-y", "-loglevel", "error", ...wavs.flatMap((w) => ["-i", w]), "-i", music,
    "-filter_complex", [
      ...pads,
      `${wavs.map((_, k) => `[a${k}]`).join("")}concat=n=${wavs.length}:v=0:a=1,adelay=${Math.round(LEAD * 1000)}:all=1,pan=stereo|c0=c0|c1=c0,asplit=2[voice][key]`,
      `[${wavs.length}:a]volume=${BED_GAIN}[bed]`,
      // The bed steps further back while a word is spoken and returns between lines.
      "[bed][key]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=400[ducked]",
      "[voice][ducked]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[out]",
    ].join(";"),
    "-map", "[out]", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", mix,
  ]);

  console.log("渲染画面（HyperFrames）");
  const cut: Cut = { spec, duration, scenes, points, briefs: briefSpans, subtitles: subs, images };
  await writeFile(path.join(project, "index.html"), composition(cut, "fonts"));
  const picture = path.join(out, "picture.mp4");
  await run("npx", ["-y", HYPERFRAMES, "render", project, "-o", picture, "--fps", "30", "--quiet"], { ...process.env, HYPERFRAMES_NO_TELEMETRY: "1" });
  const video = path.join(out, `AI早报-${date}.mp4`);
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", picture, "-i", mix, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "copy", "-shortest", "-movflags", "+faststart", video]);

  // The cover is the opening title just before the voice starts; the sheet is each card halfway through.
  await run("ffmpeg", ["-y", "-loglevel", "error", "-ss", (LEAD - 0.1).toFixed(2), "-i", video, "-frames:v", "1", path.join(out, "cover.png")]);
  const middles = scenes.map((s) => Math.round(((s.start + s.end) / 2) * 30));
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-i", video,
    "-vf", `select='${middles.map((f) => `eq(n\\,${f})`).join("+")}',scale=270:480,tile=${Math.min(4, middles.length)}x${Math.ceil(middles.length / 4)}:padding=8`,
    "-fps_mode", "vfr", "-frames:v", "1", path.join(out, "contact-sheet.jpg"),
  ]);
  await writeFile(path.join(out, "caption.txt"), spec.caption + "\n");
  await writeFile(path.join(out, "check.txt"), (report.length ? report.join("\n") : "没有发现问题。") + "\n");
  for (const working of [picture, music, mix, project]) await rm(working, { recursive: true });

  console.log(`\n完成：${video}（${Math.round(duration)} 秒）\n描述文案：${path.join(out, "caption.txt")}\n封面：${path.join(out, "cover.png")}\n每张卡片：${path.join(out, "contact-sheet.jpg")}`);
  if (report.length) console.log(`\n自检发现 ${report.length} 处要看一下（也在 check.txt）：\n${report.map((r) => `  · ${r}`).join("\n")}\n念错的名字可以在工作台把这段改写成中文说法，再合成一次。`);
  else console.log("\n自检：每段都听写对上了。");
  console.log("在视频号助手（channels.weixin.qq.com）或手机上发表：上传 mp4，粘贴描述，可选封面。");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
