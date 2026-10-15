// Cuts the 视频号 video of a day's 「AI 早报」 on the editor's Mac: reads the script written and edited in
// the 公众号 workbench (newsletter/wechat-video.ts) from the site, speaks it with VoxCPM2 on this machine
// (scripts/wechat-video-tts.py), renders the frames (media/wechat-video-frames.ts) and joins them with
// ffmpeg into a 1080×1920 mp4, beside the caption to paste into 视频号. 视频号 has no upload API: the
// editor uploads the mp4 in 视频号助手 (channels.weixin.qq.com) or on the phone.
//
//   npm run wechat-video -- [YYYY-MM-DD] [--base https://e-acc.ai] [--out <folder>]
//
// Needs ffmpeg (with libx264) on PATH, WECHAT_VIDEO_TOKEN (the server's value), and a venv with
// mlx-audio (VOXCPM_PYTHON). The voice is VOICE_DESCRIPTION in words, or a recording VOICE_REF_AUDIO
// (with VOICE_REF_TEXT, its transcript) of someone who agreed to have their voice used. Each line is
// spoken as a continuation of the line before it. VOXCPM_TIMESTEPS defaults to 18. With faster-whisper
// installed in that venv, subtitles follow the recording and a too-different line is printed; without
// it, each subtitle takes a share of its line by length.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { characterErrorRate, forSpeech, stripMarkup } from "@aihot/industry/speech";
import { SITE } from "@aihot/site";
import { calendarDate } from "@aihot/contracts/time";
import { renderVideoFrame, type VideoFrame } from "../packages/backend/src/media/wechat-video-frames.ts";
import type { WechatVideoSpec } from "../packages/backend/src/newsletter/wechat-video.ts";
import { absoluteCues, formatSrt, loudnormFilter, parseLoudnorm, subtitles, type WhisperWord } from "./wechat-video-speech.ts";

export { subtitles } from "./wechat-video-speech.ts";

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
const steps = Number(process.env.VOXCPM_TIMESTEPS);
const loudness = Number(process.env.VOICE_LOUDNESS_LUFS);
const cerLimit = Number(process.env.VOICE_CER_WARN);
const voice = {
  model: process.env.VOXCPM_MODEL ?? "mlx-community/VoxCPM2-bf16",
  timesteps: Number.isFinite(steps) && steps >= 4 && steps <= 30 ? steps : 18,
  instruct: process.env.VOICE_DESCRIPTION ?? "沉稳清晰的普通话男声，语速适中，新闻播报风格",
  refAudio: process.env.VOICE_REF_AUDIO ? expand(process.env.VOICE_REF_AUDIO) : null,
  refText: process.env.VOICE_REF_TEXT ?? null,
};
const whisperName = process.env.WHISPER_MODEL ?? "small";
const whisperModel = whisperName === "off" || whisperName === "0" ? null : whisperName;
/** Integrated loudness of the finished track, LUFS. */
const LOUDNESS = Number.isFinite(loudness) && loudness >= -36 && loudness <= -5 ? loudness : -16;
/** A transcript this far from its line is printed so the editor can speak that line again. */
const CER_WARN = Number.isFinite(cerLimit) && cerLimit > 0 && cerLimit < 1 ? cerLimit : 0.18;

/** Silence before the first line, between lines and after the last, in seconds. */
const LEAD = 0.4;
const GAP = 0.45;
const TAIL = 1.2;
const FPS = 30;

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
function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-4000); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}\n${err}`))));
  });
}

function runCollect(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d: Buffer) => { err += d.toString(); if (err.length > 200_000) err = err.slice(-100_000); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(err) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-4000)}`))));
  });
}

interface SpokenLine {
  seconds: number;
  transcript: string | null;
  words: WhisperWord[] | null;
}

/**
 * Speaks every line in one run of the voice model. The text already has the pronunciation lexicon and
 * the pause marks applied; `scripts` is the line the viewer reads, which the transcript is checked against.
 */
function speak(lines: Array<{ text: string; script: string; out: string }>): Promise<{ spoken: SpokenLine[]; warnings: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-I", path.join(HERE, "wechat-video-tts.py")], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? "1" } });
    const spoken: SpokenLine[] = [];
    let warnings = 0;
    let whisperReady = whisperModel !== null;
    let err = "";
    child.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-4000); });
    createInterface({ input: child.stdout }).on("line", (raw) => {
      const msg = JSON.parse(raw) as { seconds?: number; done?: boolean; notice?: string; transcript?: string | null; words?: WhisperWord[] | null };
      if (msg.notice) {
        console.log(`  ${msg.notice}`);
        if (/未安装|没能加载|未启用|按字数/.test(msg.notice)) whisperReady = false;
        return;
      }
      if (msg.seconds === undefined) return;
      const transcript = msg.transcript ?? null;
      const words = msg.words?.length ? msg.words : null;
      spoken.push({ seconds: msg.seconds, transcript, words });
      const n = spoken.length;
      console.log(`  配音 ${n}/${lines.length}（${msg.seconds.toFixed(1)} 秒）`);
      if (whisperReady && !words) console.log(`  配音 ${n} 没有转写，这一段字幕按字数对齐。`);
      if (transcript && words) {
        const cer = characterErrorRate(lines[n - 1]!.script, transcript);
        if (cer > CER_WARN) {
          warnings += 1;
          const preview = stripMarkup(lines[n - 1]!.script).slice(0, 42);
          const heard = transcript.replace(/\s+/g, " ").trim().slice(0, 42);
          console.log(`  核对 ${n}/${lines.length} 字错率 ${Math.round(cer * 100)}%，超过 ${Math.round(CER_WARN * 100)}%。稿：「${preview}」听成：「${heard}」。建议重跑这一段。`);
        }
      }
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 && spoken.length === lines.length ? resolve({ spoken, warnings }) : reject(new Error(`voice model exited ${code}\n${err}`))));
    child.stdin.end(JSON.stringify({ ...voice, whisperModel, lines: lines.map(({ text, out }) => ({ text, out })) }));
  });
}

async function main() {
  if (!token) fail("没有 WECHAT_VIDEO_TOKEN：写进 .env，值和服务器上的一样。");
  console.log(`读取 ${date} 的口播稿（${base}）`);
  const res = await get(`/api/wechat-video/${date}`);
  if (!res.ok) fail(`${res.status} ${await res.text()}`);
  const spec = (await res.json()) as WechatVideoSpec;
  if (!spec.segments.length) fail("口播稿里没有条目。");

  await mkdir(path.join(out, "frames"), { recursive: true });
  await mkdir(path.join(out, "voice"), { recursive: true });
  const images = new Map<string, Buffer>();
  for (const s of spec.segments.filter((x) => x.hasImage)) {
    const img = await get(`/api/wechat-video/${date}/illustration.jpg?entry=${encodeURIComponent(s.key)}`);
    if (img.ok) images.set(s.key, Buffer.from(await img.arrayBuffer()));
  }

  // Each card and the line spoken over it.
  const common = { theme: spec.theme, date: spec.date };
  const cards: Array<{ line: string; frame: (subtitle: string) => VideoFrame }> = [
    { line: spec.opening, frame: (subtitle: string): VideoFrame => ({ ...common, subtitle, kind: "opening", issueNumber: spec.issueNumber, headlines: spec.segments.map((s) => s.title) }) },
    ...spec.segments.map((s) => ({
      line: s.narration,
      frame: (subtitle: string): VideoFrame => ({ ...common, subtitle, kind: "entry", number: s.number, total: spec.segments.length, section: s.section, sourceName: s.sourceName, title: s.title, image: images.get(s.key) ?? null }),
    })),
    { line: spec.closing, frame: (subtitle: string): VideoFrame => ({ ...common, subtitle, kind: "closing" }) },
  ].filter((c) => c.line.trim());

  const voiceName = voice.refAudio ? `参考录音 ${path.basename(voice.refAudio)}` : `声音描述「${voice.instruct}」`;
  console.log(`配音：VoxCPM2，${voiceName}，${voice.timesteps} 步，共 ${cards.length} 段（每段接着上一段）`);
  const wavs = cards.map((_, k) => path.join(out, "voice", `${String(k).padStart(3, "0")}.wav`));
  const { spoken, warnings } = await speak(cards.map((c, k) => ({ text: forSpeech(c.line.trim()), script: c.line.trim(), out: wavs[k]! })));
  const seconds = spoken.map((s) => s.seconds);

  console.log("渲染画面");
  const list: string[] = [];
  let n = 0;
  for (const [k, card] of cards.entries()) {
    const subs = subtitles(card.line.trim(), seconds[k]!, spoken[k]!.words);
    for (const [j, sub] of subs.entries()) {
      const file = path.join(out, "frames", `${String(n++).padStart(4, "0")}.png`);
      await writeFile(file, await renderVideoFrame(card.frame(sub.text)));
      const pause = (k === 0 && j === 0 ? LEAD : 0) + (j === subs.length - 1 ? (k === cards.length - 1 ? TAIL : GAP) : 0);
      list.push(`file '${file}'`, `duration ${(sub.seconds + pause).toFixed(3)}`);
      if (k === 0 && j === 0) await writeFile(path.join(out, "cover.png"), await renderVideoFrame(card.frame("")));
    }
  }
  // The concat demuxer holds the last picture only if it is listed again.
  list.push(list.at(-2)!);
  await writeFile(path.join(out, "frames.txt"), list.join("\n") + "\n");
  const srt = path.join(out, `AI早报-${date}.srt`);
  await writeFile(srt, formatSrt(absoluteCues(cards.map((c, k) => ({ text: c.line.trim(), seconds: seconds[k]!, words: spoken[k]!.words })), LEAD, GAP)));

  console.log("合成视频");
  const mixed = path.join(out, "voice-concat.wav");
  const pads = wavs.map((_, k) => `[${k}:a]aformat=sample_rates=48000:channel_layouts=mono,apad=pad_dur=${k === wavs.length - 1 ? TAIL : GAP}[a${k}]`);
  await run("ffmpeg", [
    "-y", "-loglevel", "error", ...wavs.flatMap((w) => ["-i", w]),
    "-filter_complex", `${pads.join(";")};${wavs.map((_, k) => `[a${k}]`).join("")}concat=n=${wavs.length}:v=0:a=1,adelay=${LEAD * 1000}:all=1[out]`,
    "-map", "[out]", "-ar", "48000", "-c:a", "pcm_s16le", mixed,
  ]);
  const measured = parseLoudnorm(await runCollect("ffmpeg", ["-hide_banner", "-i", mixed, "-af", `loudnorm=I=${LOUDNESS}:TP=-1.5:LRA=11:print_format=json`, "-f", "null", "-"]));
  if (!measured) console.log("  响度测量没读到，改用单遍 loudnorm。");
  const audio = path.join(out, "voice.m4a");
  await run("ffmpeg", ["-y", "-loglevel", "error", "-i", mixed, "-af", loudnormFilter(LOUDNESS, measured), "-ar", "48000", "-c:a", "aac", "-b:a", "160k", audio]);
  await rm(mixed, { force: true });
  const video = path.join(out, `AI早报-${date}.mp4`);
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(out, "frames.txt"), "-i", audio,
    "-vf", `fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "copy",
    "-shortest", "-movflags", "+faststart", video,
  ]);
  await writeFile(path.join(out, "caption.txt"), spec.caption + "\n");
  await rm(path.join(out, "frames"), { recursive: true });
  const total = LEAD + seconds.reduce((a, b) => a + b, 0) + GAP * (seconds.length - 1) + TAIL;
  const check = warnings ? `；${warnings} 段字错率超过 ${Math.round(CER_WARN * 100)}%，建议重跑` : "";
  console.log(`\n完成：${video}（约 ${Math.round(total)} 秒）\n描述文案：${path.join(out, "caption.txt")}\n封面：${path.join(out, "cover.png")}\n字幕：${srt}${check}`);
  console.log("在视频号助手（channels.weixin.qq.com）或手机上发表：上传 mp4，粘贴描述，可选封面。");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
