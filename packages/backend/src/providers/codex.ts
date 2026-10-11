// The Codex CLI on the worker's machine (CODEX_BIN), for drawing pictures: `codex exec` with its image
// generation tool, in a scratch directory the picture is saved into. It spends the quota of the account
// the CLI is signed in with, so every drawing goes through receipts and the budget (service "codex").
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { config } from "../config.ts";
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

function run(bin: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const signal = AbortSignal.any([shutdownSignal.signal, AbortSignal.timeout(DRAW_TIMEOUT_MS)]);
    const child = spawn(bin, args, { cwd, stdio: ["ignore", "pipe", "pipe"], signal, killSignal: "SIGTERM" });
    let out = "";
    child.stdout.on("data", (chunk) => { out = (out + chunk).slice(-20_000); });
    child.stderr.on("data", (chunk) => { out = (out + chunk).slice(-20_000); });
    child.on("error", (error: NodeJS.ErrnoException) => {
      // Never started: nothing was asked of the account.
      if (error.code === "ENOENT" || error.code === "EACCES") reject(new ProviderRejectedError(`codex 启动不了（${error.code}）：${bin}`, null, false));
      else reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(out);
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

/** A picture as the article prints it: at most WIDTH wide, JPEG, saved under `dir` by its content. */
export async function saveJpeg(image: Buffer, dir: string): Promise<{ file: string; width: number; height: number; bytes: number }> {
  const { data, info } = await sharp(image, { limitInputPixels: 64_000_000 })
    .rotate().resize({ width: WIDTH, withoutEnlargement: true }).flatten({ background: "#ffffff" })
    .jpeg({ quality: 82, mozjpeg: true }).toBuffer({ resolveWithObject: true });
  const file = `${createHash("sha256").update(data).digest("hex").slice(0, 32)}.jpg`;
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, file), data);
  return { file, width: info.width, height: info.height, bytes: data.length };
}

/**
 * Draws one picture from `instruction` (which tells the CLI to save it in its working directory) and
 * saves it under `dir`. `attemptTag` makes a new request of the same instruction draw again; a recovered
 * request reuses the saved picture.
 */
export async function codexImage(opts: { instruction: string; dir: string; purpose: string; subject: string; attemptTag: string }): Promise<{ file: string; receiptId: number }> {
  const bin = config.codexBin;
  if (!bin) throw new Error("CODEX_BIN is not configured");
  const receipt = await paidRequest(
    { service: "codex", model: null, purpose: opts.purpose, subject: opts.subject, identity: { instruction: opts.instruction }, attemptTag: opts.attemptTag, requestSummary: { chars: opts.instruction.length } },
    async () => {
      const work = await mkdtemp(path.join(tmpdir(), "codex-draw-"));
      try {
        await run(bin, ["exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--cd", work, opts.instruction], work);
        const drawn = await newestImage(work);
        if (!drawn) throw new ProviderRejectedError("codex 跑完了，但没有在工作目录里留下图片", null, false);
        return { response: await saveJpeg(await readFile(drawn), opts.dir) };
      } finally {
        await rm(work, { recursive: true, force: true });
      }
    },
  );
  const file = (receipt.response as { file?: unknown } | null)?.file;
  if (typeof file !== "string") throw new Error(`codex receipt ${receipt.receiptId} holds no picture`);
  return { file, receiptId: receipt.receiptId };
}
