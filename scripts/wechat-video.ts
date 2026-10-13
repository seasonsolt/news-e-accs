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
// (with VOICE_REF_TEXT, its transcript) of someone who agreed to have their voice used.
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SITE } from "@aihot/site";
import { calendarDate } from "@aihot/contracts/time";
import { renderVideoFrame, type VideoFrame } from "../packages/backend/src/media/wechat-video-frames.ts";
import type { WechatVideoSpec } from "../packages/backend/src/newsletter/wechat-video.ts";

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

/** Silence before the first line, between lines and after the last, in seconds. */
const LEAD = 0.4;
const GAP = 0.45;
const TAIL = 1.2;
/** A subtitle shows at most this many characters, one line at the frame's size. */
const SUBTITLE_MAX = 18;
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

/** Speaks every line in one run of the voice model; the seconds of each. */
function speak(lines: Array<{ text: string; out: string }>): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, ["-I", path.join(HERE, "wechat-video-tts.py")], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, HF_HUB_OFFLINE: process.env.HF_HUB_OFFLINE ?? "1" } });
    const seconds: number[] = [];
    let err = "";
    child.stderr.on("data", (d: Buffer) => { err = (err + d.toString()).slice(-4000); });
    createInterface({ input: child.stdout }).on("line", (raw) => {
      const msg = JSON.parse(raw) as { seconds?: number; done?: boolean };
      if (msg.seconds === undefined) return;
      seconds.push(msg.seconds);
      console.log(`  配音 ${seconds.length}/${lines.length}（${msg.seconds.toFixed(1)} 秒）`);
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 && seconds.length === lines.length ? resolve(seconds) : reject(new Error(`voice model exited ${code}\n${err}`))));
    child.stdin.end(JSON.stringify({ ...voice, lines }));
  });
}

/**
 * A spoken line cut into subtitles of at most SUBTITLE_MAX characters, at its punctuation where it can,
 * each with its share of the line's time by length. The punctuation that ends a subtitle is not shown.
 */
export function subtitles(text: string, seconds: number): Array<{ text: string; seconds: number }> {
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
  const total = parts.reduce((n, p) => n + Array.from(p).length, 0);
  return parts.map((p) => ({ text: p.replace(/[，。；：,.;:]+$/, ""), seconds: (seconds * Array.from(p).length) / total }));
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
  console.log(`配音：VoxCPM2，${voiceName}，共 ${cards.length} 段（每段约需它时长的 1.5 倍）`);
  const wavs = cards.map((_, k) => path.join(out, "voice", `${String(k).padStart(3, "0")}.wav`));
  const seconds = await speak(cards.map((c, k) => ({ text: c.line.trim(), out: wavs[k]! })));

  console.log("渲染画面");
  const list: string[] = [];
  let n = 0;
  for (const [k, card] of cards.entries()) {
    const subs = subtitles(card.line.trim(), seconds[k]!);
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

  console.log("合成视频");
  const audio = path.join(out, "voice.m4a");
  const pads = wavs.map((_, k) => `[${k}:a]aformat=sample_rates=48000:channel_layouts=mono,apad=pad_dur=${k === wavs.length - 1 ? TAIL : GAP}[a${k}]`);
  await run("ffmpeg", [
    "-y", "-loglevel", "error", ...wavs.flatMap((w) => ["-i", w]),
    "-filter_complex", `${pads.join(";")};${wavs.map((_, k) => `[a${k}]`).join("")}concat=n=${wavs.length}:v=0:a=1,adelay=${LEAD * 1000}:all=1,loudnorm=I=-16:TP=-1.5:LRA=11[out]`,
    "-map", "[out]", "-ar", "48000", "-c:a", "aac", "-b:a", "160k", audio,
  ]);
  const video = path.join(out, `AI早报-${date}.mp4`);
  await run("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", path.join(out, "frames.txt"), "-i", audio,
    "-vf", `fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "copy",
    "-shortest", "-movflags", "+faststart", video,
  ]);
  await writeFile(path.join(out, "caption.txt"), spec.caption + "\n");
  await rm(path.join(out, "frames"), { recursive: true });
  const total = LEAD + seconds.reduce((a, b) => a + b, 0) + GAP * (seconds.length - 1) + TAIL;
  console.log(`\n完成：${video}（约 ${Math.round(total)} 秒）\n描述文案：${path.join(out, "caption.txt")}\n封面：${path.join(out, "cover.png")}`);
  console.log("在视频号助手（channels.weixin.qq.com）或手机上发表：上传 mp4，粘贴描述，可选封面。");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
}
