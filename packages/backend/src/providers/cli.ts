// A signed-in official CLI on the worker's machine (providers/codex.ts, providers/agy.ts), run once per
// request: what it prints, or why it failed in a way the receipt can record.
import { spawn } from "node:child_process";
import { shutdownSignal } from "../lib/shutdown.ts";
import { ProviderRejectedError } from "./receipts.ts";

/** The CLI's own words when it fails, without the prompt it echoes first. */
const tail = (text: string) => text.trim().split("\n").slice(-6).join("\n").slice(-600);

/** An answer's events are kept whole up to this size (a long translation is well under it). */
const STDOUT_MAX = 4_000_000;

/** Runs `name`'s CLI at `bin`; resolves with its standard output. `input` is written to its standard input. */
export function runCli(name: string, bin: string, args: string[], cwd: string, opts: { timeoutMs: number; input?: string }): Promise<string> {
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
      if (error.code === "ENOENT" || error.code === "EACCES") reject(new ProviderRejectedError(`${name} 启动不了（${error.code}）：${bin}`, null, false));
      else reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      // The CLI answered with a failure (signed out, refused, quota): the same request may be tried again.
      else if (code !== null) reject(new ProviderRejectedError(`${name} 退出码 ${code}：${tail(out)}`, null, false));
    });
  });
}
