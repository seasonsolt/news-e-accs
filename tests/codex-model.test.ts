// A Codex model preset answers through the CLI signed in with ChatGPT (here a fake CLI that prints the
// CLI's JSONL events): the prompt goes in on standard input, every tool is switched off, and the call is
// a receipt of the preset's own service like any API call.
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { z } from "zod";
import { config } from "@aihot/backend/config";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { chatJson, MODELS } from "@aihot/backend/providers/llm";

const T = tag();
let dir = "";
const saved = { codexBin: config.codexBin, modelCallsEnabled: config.modelCallsEnabled };

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "codex-model-"));
  const bin = path.join(dir, "codex");
  await writeFile(bin, `#!/bin/sh
printf '%s\\n' "$@" > "${dir}/args"
cat > "${dir}/stdin"
if [ -n "$FAKE_CODEX_QUOTA" ]; then echo '{"type":"turn.failed","error":{"message":"usage limit reached"}}'; exit 1; fi
echo '{"type":"thread.started","thread_id":"thread-${T}"}'
echo '{"type":"turn.started"}'
echo '{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"{\\"label\\":\\"PASS\\"}"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":13506,"cached_input_tokens":11008,"output_tokens":17}}'
`);
  await chmod(bin, 0o755);
  Object.assign(config, { codexBin: bin, modelCallsEnabled: true });
});
after(async () => {
  Object.assign(config, saved);
  delete process.env.FAKE_CODEX_QUOTA;
  await rm(dir, { recursive: true, force: true });
  await stopBoss();
  await closeDb();
});

const ask = (subject: string) => chatJson({
  model: "codex-luna", purpose: "prefilter_article", subject, promptVersion: "test",
  system: "Decide whether the article belongs on the site.", user: JSON.stringify({ title: `A launch ${subject}` }),
  schema: z.object({ label: z.enum(["PASS", "DROP"]) }),
});

test("the site's Codex presets are registered as text-only models on their own service", () => {
  const spec = MODELS["codex-luna"]!;
  assert.equal(spec.transport, "codex");
  assert.equal(spec.service, "codex-text");
  assert.notEqual(spec.vision, true);
});

test("a Codex model answers from the CLI's events, with the prompt on standard input and no tools", async () => {
  const subject = `codex:${T}:ok`;
  const result = await ask(subject);
  assert.deepEqual(result.data, { label: "PASS" });
  assert.equal(result.model, "codex-luna");
  assert.deepEqual(result.usage && [result.usage.prompt_tokens, result.usage.completion_tokens], [13506, 17], "usage under the chat API's names");

  const stdin = await readFile(path.join(dir, "stdin"), "utf8");
  assert.match(stdin, /^Decide whether the article belongs on the site\./);
  assert.match(stdin, /A launch codex:/);
  assert.match(stdin, /JSON object only/);
  const args = (await readFile(path.join(dir, "args"), "utf8")).trim().split("\n");
  assert.deepEqual(args.slice(0, 2), ["exec", "--json"]);
  assert.equal(args.at(-1), "-", "the prompt is read from standard input, never from the command line");
  assert.equal(args[args.indexOf("-m") + 1], "gpt-6-luna");
  assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
  for (const feature of ["shell_tool", "unified_exec", "code_mode_host", "multi_agent", "browser_use", "computer_use"]) {
    assert.ok(args.some((a, i) => a === feature && args[i - 1] === "--disable"), `${feature} is switched off`);
  }

  const [receipt] = await sql<{ service: string; model: string; status: string; request_id: string }[]>`
    SELECT service, model, status, request_id FROM receipts WHERE subject = ${subject}`;
  // Received: the caller completes it once the answer's effects are saved, as with an API call.
  assert.deepEqual(receipt, { service: "codex-text", model: "gpt-6-luna", status: "received", request_id: `thread-${T}` });
  const again = await ask(subject);
  assert.equal(again.reused, true, "the same request reuses its received answer instead of spending quota again");
});

test("a spent quota fails the receipt, so a later run can ask again", async () => {
  const subject = `codex:${T}:quota`;
  process.env.FAKE_CODEX_QUOTA = "1";
  try {
    await assert.rejects(ask(subject), /usage limit reached/);
  } finally {
    delete process.env.FAKE_CODEX_QUOTA;
  }
  const [receipt] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE subject = ${subject}`;
  assert.equal(receipt!.status, "failed");
});
