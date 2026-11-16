// The Antigravity CLI (agy) on the worker's machine (AGY_BIN), signed in with the owner's Google account:
// the official client run once per request, never a subscription turned into an API. It answers the text
// steps a site gives an agy model (site/models.ts, through providers/llm.ts); each run spends the account's
// quota and goes through receipts and the preset's service budget.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "../config.ts";
import { runCli } from "./cli.ts";
import { ProviderRejectedError } from "./receipts.ts";

/**
 * Settings for this run only (never saved): every file, web, command and MCP action is denied, which takes
 * those tools away from the model. The articles it reads are untrusted, and with a file or shell tool the
 * agent could read this machine's files (its .env). Its web search is not governed by any permission, so an
 * answer that used any tool at all is refused (agyAnswer). Checked against agy 1.5.9.
 */
const LOCKDOWN = JSON.stringify({
  toolPermission: "strict",
  allowNonWorkspaceAccess: false,
  permissions: { deny: ["read_file(*)", "write_file(*)", "read_url(*)", "execute_url(*)", "command(*)", "mcp(*)"] },
});

type AgyEvent = {
  event?: string;
  step_update?: { step_type?: string; tool_name?: string; state?: string };
  result?: { conversation_id?: string; status?: string; response?: string; error?: string; denied_actions?: unknown[]; usage?: Record<string, unknown> };
};

/** The CLI's stream-json events of one run: the answer, the usage and the conversation, or why it is refused. */
export function agyAnswer(stdout: string): { text: string; usage: Record<string, unknown> | null; conversationId: string | null } {
  let result: AgyEvent["result"] | null = null;
  const tools = new Set<string>();
  for (const line of stdout.split("\n")) {
    if (!line.startsWith("{")) continue;
    let event: AgyEvent;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.event === "step_update" && event.step_update?.step_type === "tool") tools.add(event.step_update.tool_name ?? "tool");
    else if (event.event === "result") result = event.result ?? null;
  }
  // Each refusal leaves the request free to be asked again, like a failed API call.
  if (!result) throw new ProviderRejectedError("agy 跑完了，但没有结果", null, false);
  if (result.status !== "SUCCESS") throw new ProviderRejectedError(`agy 没有回答：${String(result.error ?? result.status).slice(0, 500)}`, null, false);
  if (tools.size || result.denied_actions?.length) throw new ProviderRejectedError(`agy 用了工具（${[...tools].join("、") || "被拒的操作"}），回答不可信`, null, false);
  if (!result.response?.trim()) throw new ProviderRejectedError("agy 跑完了，但回答是空的", null, false);
  return { text: result.response, usage: result.usage ?? null, conversationId: result.conversation_id ?? null };
}

/** One answer to `prompt` from `model`, in an empty scratch directory, with every tool denied. */
export async function agyText(opts: { model: string; prompt: string; timeoutMs: number }) {
  const bin = config.agyBin;
  if (!bin) throw new Error("AGY_BIN is not configured");
  const work = await mkdtemp(path.join(tmpdir(), "agy-text-"));
  try {
    const args = [
      "--input-format", "stream-json", "--output-format", "stream-json", "--model", opts.model,
      "--disable-slash-commands", "--sandbox", "--settings", LOCKDOWN, `--print-timeout=${Math.ceil(opts.timeoutMs / 1000)}s`, "-p=",
    ];
    // The prompt goes in on standard input, never on the command line.
    const input = `${JSON.stringify({ event: "user", message: { role: "user", content: opts.prompt } })}\n`;
    return agyAnswer(await runCli("agy", bin, args, work, { timeoutMs: opts.timeoutMs + 30_000, input }));
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
