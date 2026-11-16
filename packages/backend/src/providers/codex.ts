// The Codex CLI on the worker's machine (CODEX_BIN), signed in with ChatGPT: the official client, never a
// subscription turned into an API. It draws pictures (`codex exec` with its image generation tool, in a
// scratch directory the picture is saved into) and answers the text steps a site gives a Codex model
// (site/models.ts, through providers/llm.ts). Both spend the account's quota, so every run goes through
// receipts and a budget: "codex" for drawings, the model preset's own service for text.
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "../config.ts";
import { putObject } from "../lib/objects.ts";
import { shutdownSignal } from "../lib/shutdown.ts";
import { paidRequest, ProviderRejectedError } from "./receipts.ts";

/** A drawing takes one to four minutes; past this the run is stopped and its outcome is unknown. */
const DRAW_TIMEOUT_MS = 8 * 60_000;
/** Wide enough for a phone at 3x, small enough for the 公众号's 1 MB limit on pictures in an article. */
const WIDTH = 1280;
const IMAGE = /\.(png|jpe?g|webp)$/i;

export const codexConfigured = () => !!config.codexBin;

/** The CLI's own words when it fails, without the prompt it echoes first. */
const tail = (text: string) => text.trim().split("\n").slice(-6).join("\n").slice(-600);

/** A text answer's events are kept whole up to this size (a long translation is well under it). */
const STDOUT_MAX = 4_000_000;

/** Runs the CLI; resolves with its standard output. `input` is written to its standard input. */
function run(bin: string, args: string[], cwd: string, opts: { timeoutMs: number; input?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    const signal = AbortSignal.any([shutdownSignal.signal, AbortSignal.timeout(opts.timeoutMs)]);
    const child = spawn(bin, args, { cwd, stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"], signal, killSignal: "SIGTERM" });
    let stdout = "";
    let out = "";
    child.stdout!.on("data", (chunk) => {
      if (stdout.length < STDOUT_MAX) stdout += chunk;
      out = (out + chunk).slice(-20_000);
    });
    child.stderr!.on("data", (chunk) => { out = (out + chunk).slice(-20_000); });
    if (opts.input !== undefined) child.stdin!.end(opts.input);
    child.on("error", (error: NodeJS.ErrnoException) => {
      // Never started: nothing was asked of the account.
      if (error.code === "ENOENT" || error.code === "EACCES") reject(new ProviderRejectedError(`codex 启动不了（${error.code}）：${bin}`, null, false));
      else reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      // The CLI answered with a failure (signed out, refused, quota): the same request may be tried again.
      else if (code !== null) reject(new ProviderRejectedError(`codex 退出码 ${code}：${tail(out)}`, null, false));
    });
  });
}

/** The newest picture under `dir`, wherever in it the CLI saved one. */
async function newestImage(dir: string): Promise<string | null> {
  let best: { file: string; at: number } | null = null;
  for (const name of await readdir(dir, { recursive: true })) {
    if (!IMAGE.test(name)) continue;
    const file = path.join(dir, name);
    const info = await stat(file);
    if (info.isFile() && (!best || info.mtimeMs > best.at)) best = { file, at: info.mtimeMs };
  }
  return best?.file ?? null;
}

/** A picture as the article prints it: at most WIDTH wide, JPEG, stored as `<folder>/<name>` (lib/objects.ts) named by its content. */
export async function saveJpeg(image: Buffer, folder: string): Promise<{ file: string; width: number; height: number; bytes: number }> {
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(image, { limitInputPixels: 64_000_000 })
    .rotate().resize({ width: WIDTH, withoutEnlargement: true }).flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const file = `${createHash("sha256").update(data).digest("hex").slice(0, 32)}.jpg`;
  await putObject(`${folder}/${file}`, data, "image/jpeg");
  return { file, width: info.width, height: info.height, bytes: data.length };
}

/**
 * Draws one picture from `instruction` (which tells the CLI to save it in its working directory) and
 * stores it in `folder` (saveJpeg). `attemptTag` makes a new request of the same instruction draw again; a recovered
 * request reuses the saved picture.
 */
export async function codexImage(opts: { instruction: string; folder: string; purpose: string; subject: string; attemptTag: string }): Promise<{ file: string; receiptId: number }> {
  const bin = config.codexBin;
  if (!bin) throw new Error("CODEX_BIN is not configured");
  const receipt = await paidRequest(
    { service: "codex", model: null, purpose: opts.purpose, subject: opts.subject, identity: { instruction: opts.instruction }, attemptTag: opts.attemptTag, requestSummary: { chars: opts.instruction.length } },
    async () => {
      const work = await mkdtemp(path.join(tmpdir(), "codex-draw-"));
      try {
        await run(bin, ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--cd", work, opts.instruction], work, { timeoutMs: DRAW_TIMEOUT_MS });
        const drawn = await newestImage(work);
        if (!drawn) throw new ProviderRejectedError("codex 跑完了，但没有在工作目录里留下图片", null, false);
        return { response: await saveJpeg(await readFile(drawn), opts.folder) };
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    },
  );
  const file = (receipt.response as { file?: unknown } | null)?.file;
  if (typeof file !== "string") throw new Error(`codex receipt ${receipt.receiptId} holds no picture`);
  return { file, receiptId: receipt.receiptId };
}

/**
 * Everything that would let the agent act rather than answer is switched off for text: the articles it
 * reads are untrusted, and with a shell even a read-only sandbox reads this machine's files (its .env).
 * A tool call fails closed (checked against codex-cli 0.162).
 */
const TEXT_ONLY = [
  "shell_tool", "unified_exec", "code_mode_host", "image_generation", "view_image", "multi_agent", "multi_agent_v2", "apps",
  "plugins", "browser_use", "computer_use", "in_app_browser", "in_app_local_automation", "hooks", "skill_search", "tool_suggest",
  "sleep_tool", "goals",
].flatMap((feature) => ["--disable", feature]);

/** The CLI's JSONL events of one run: the last answer, the usage and the thread, or why it failed. */
export function codexAnswer(stdout: string): { text: string; usage: Record<string, unknown> | null; threadId: string | null } {
  let text: string | null = null;
  let usage: Record<string, unknown> | null = null;
  let threadId: string | null = null;
  let failure: string | null = null;
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    let event: { type?: string; thread_id?: string; usage?: Record<string, unknown>; item?: { type?: string; text?: string }; error?: { message?: string }; message?: string };
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type === "thread.started") threadId = event.thread_id ?? null;
    else if (event.type === "item.completed" && event.item?.type === "agent_message") text = event.item.text ?? "";
    else if (event.type === "turn.completed") usage = event.usage ?? null;
    else if (event.type === "turn.failed" || event.type === "error") failure = event.error?.message ?? event.message ?? event.type;
  }
  // A failed turn (quota, refusal) answered nothing usable: the same request may be tried again.
  if (failure && text === null) throw new ProviderRejectedError(`codex 没有回答：${failure.slice(0, 500)}`, null, false);
  if (text === null) throw new ProviderRejectedError("codex 跑完了，但没有回答", null, false);
  return { text, usage, threadId };
}

/**
 * One answer to `prompt` from `model` (the account's default without one), with no tools, in an empty
 * scratch directory, keeping no session. `webSearch` lets the model search the web live; it still cannot
 * fetch or run anything, so what it reads there can only change its answer.
 */
export async function codexText(opts: { model?: string; reasoningEffort?: string; prompt: string; timeoutMs: number; webSearch?: boolean }) {
  const bin = config.codexBin;
  if (!bin) throw new Error("CODEX_BIN is not configured");
  const work = await mkdtemp(path.join(tmpdir(), "codex-text-"));
  try {
    const args = [
      "exec", "--json", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "--cd", work, ...(opts.model ? ["-m", opts.model] : []),
      ...(opts.reasoningEffort ? ["-c", `model_reasoning_effort="${opts.reasoningEffort}"`] : []),
      "-c", `web_search="${opts.webSearch ? "live" : "disabled"}"`, ...TEXT_ONLY, "-",
    ];
    return codexAnswer(await run(bin, args, work, { timeoutMs: opts.timeoutMs, input: opts.prompt }));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
