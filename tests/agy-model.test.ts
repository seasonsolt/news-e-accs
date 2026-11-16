// An agy model preset answers through the Antigravity CLI signed in on the worker's machine (here a fake
// CLI printing agy's stream-json events): the prompt goes in on standard input, every file, web, command
// and MCP action is denied, an answer that used any tool is refused, and the call is a receipt of the
// preset's own service like any API call.
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
const saved = { agyBin: config.agyBin, modelCallsEnabled: config.modelCallsEnabled };

before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "agy-model-"));
  const bin = path.join(dir, "agy");
  await writeFile(bin, `#!/bin/sh
printf '%s\\n' "$@" > "${dir}/args"
cat > "${dir}/stdin"
echo '{"event":"init","conversation_id":"conv-${T}","init":{"model":"claude-opus-5-5-high"}}'
case "$FAKE_AGY" in
  tool) echo '{"event":"step_update","step_update":{"step_index":2,"state":"DONE","step_type":"tool","tool_name":"search_web"}}' ;;
  error) echo '{"event":"result","result":{"conversation_id":"conv-${T}","status":"ERROR","response":"","error":"quota exhausted"}}'; exit 1 ;;
esac
echo '{"event":"step_update","step_update":{"step_index":3,"state":"DONE","step_type":"agent_response"}}'
echo '{"event":"result","result":{"conversation_id":"conv-${T}","status":"SUCCESS","response":"{\\"label\\":\\"PASS\\"}","usage":{"input_tokens":9612,"output_tokens":9,"thinking_tokens":40,"cache_read_tokens":0}}}'
`);
  await chmod(bin, 0o755);
  Object.assign(config, { agyBin: bin, modelCallsEnabled: true });
});
after(async () => {
  Object.assign(config, saved);
  delete process.env.FAKE_AGY;
  await rm(dir, { recursive: true, force: true });
  await stopBoss();
  await closeDb();
});

const ask = (subject: string) => chatJson({
  model: "agy-opus", purpose: "prefilter_article", subject, promptVersion: "test",
  system: "Decide whether the article belongs on the site.", user: JSON.stringify({ title: `A launch ${subject}` }),
  schema: z.object({ label: z.enum(["PASS", "DROP"]) }),
});

async function failing(mode: string, subject: string, message: RegExp) {
  process.env.FAKE_AGY = mode;
  try {
    await assert.rejects(ask(subject), message);
  } finally {
    delete process.env.FAKE_AGY;
  }
  const [receipt] = await sql<{ status: string }[]>`SELECT status FROM receipts WHERE subject = ${subject}`;
  assert.equal(receipt!.status, "failed", "a later run may ask again");
}

test("the site's agy presets are text-only models on their own service", () => {
  const spec = MODELS["agy-opus"]!;
  assert.equal(spec.transport, "agy");
  assert.equal(spec.service, "agy-text");
  assert.notEqual(spec.vision, true);
});

test("an agy model answers from the CLI's events, with the prompt on standard input and every tool denied", async () => {
  const subject = `agy:${T}:ok`;
  const result = await ask(subject);
  assert.deepEqual(result.data, { label: "PASS" });
  assert.deepEqual(result.usage && [result.usage.prompt_tokens, result.usage.completion_tokens], [9612, 9], "usage under the chat API's names");

  const message = JSON.parse(await readFile(path.join(dir, "stdin"), "utf8"));
  assert.equal(message.event, "user");
  assert.match(message.message.content, /^Decide whether the article belongs on the site\./);
  assert.match(message.message.content, /JSON object only/);
  const args = (await readFile(path.join(dir, "args"), "utf8")).trim().split("\n");
  assert.ok(!args.some((a) => a.includes("A launch")), "the prompt never goes on the command line");
  assert.equal(args.at(-1), "-p=");
  assert.equal(args[args.indexOf("--model") + 1], "claude-opus-5-5-high");
  assert.equal(args[args.indexOf("--input-format") + 1], "stream-json");
  assert.ok(args.includes("--sandbox") && args.includes("--disable-slash-commands"));
  const settings = JSON.parse(args[args.indexOf("--settings") + 1]!);
  for (const action of ["read_file", "write_file", "read_url", "execute_url", "command", "mcp"]) {
    assert.ok(settings.permissions.deny.includes(`${action}(*)`), `${action} is denied`);
  }

  const [receipt] = await sql<{ service: string; model: string; status: string; request_id: string }[]>`
    SELECT service, model, status, request_id FROM receipts WHERE subject = ${subject}`;
  assert.deepEqual(receipt, { service: "agy-text", model: "claude-opus-5-5-high", status: "received", request_id: `conv-${T}` });
  assert.equal((await ask(subject)).reused, true, "the same request reuses its received answer instead of spending quota again");
});

test("an answer that used a tool is refused, as is a run that failed", async () => {
  await failing("tool", `agy:${T}:tool`, /agy 用了工具（search_web）/);
  await failing("error", `agy:${T}:error`, /agy 退出码 1/);
});

test("without AGY_BIN an agy model is unavailable and nothing is spent", async () => {
  const subject = `agy:${T}:off`;
  config.agyBin = null;
  try {
    await assert.rejects(ask(subject), /not configured \(AGY_BIN\)/);
  } finally {
    config.agyBin = path.join(dir, "agy");
  }
  assert.equal((await sql`SELECT 1 FROM receipts WHERE subject = ${subject}`).length, 0);
});
