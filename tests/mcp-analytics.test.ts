import "./setup.ts";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { setTimeout } from "node:timers/promises";
import Fastify from "fastify";
import { z } from "zod";
import { EditionUnavailableError } from "@aihot/backend/publication/distribution";
import { SearchBusyError } from "@aihot/backend/publication/pool";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { closeDb, sql } from "@aihot/backend/db";
import { mcpAnalyticsOverview, siteAnalyticsOverview } from "@aihot/backend/admin/analytics";
import { dailyRetention } from "@aihot/backend/operations/retention";
import { installModules } from "@aihot/backend/modules";
import { SERVER_MODULES } from "@aihot/site/modules/server";
import { recordMcpUsage } from "@aihot/backend/site/mcp-analytics";
import { MCP_TOOL_NAMES as T, mcpToolName } from "@aihot/contracts/mcp";
import { buildApp } from "../apps/api/src/app.ts";
import { registerMcp } from "../apps/api/src/routes/mcp.ts";

installModules(SERVER_MODULES);
const app = await buildApp();
after(async () => { await app.close(); await closeDb(); });
beforeEach(async () => { await sql`TRUNCATE mcp_usage_daily`; });

function rpc(method: string, params: unknown = {}, headers: Record<string, string> = {}) {
  return app.inject({ method: "POST", url: "/api/mcp", headers: { host: "localhost", accept: "application/json, text/event-stream", ...headers },
    payload: { jsonrpc: "2.0", id: 1, method, params } });
}
async function settled(calls: number, checks = 0) {
  for (let i = 0; i < 200; i++) {
    const summary = await mcpAnalyticsOverview(7);
    if (summary.totals.calls === calls && summary.totals.checks === checks) return summary;
    await setTimeout(10);
  }
  assert.fail(`MCP counters did not settle to ${calls} calls / ${checks} checks`);
}

test("real SDK calls count cached answers individually and exclude explicitly marked checks", async () => {
  const address = await app.listen({ host: "127.0.0.1", port: 0 });
  const client = new Client({ name: "private-client-name", version: "1" });
  const check = new Client({ name: "contract-check", version: "1" });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`${address}/api/mcp`)));
    await client.listTools();
    const results = await Promise.all(Array.from({ length: 12 }, () => client.callTool({ name: T.latest, arguments: { lang: "zh", limit: 1 } })));
    assert.ok(results.every((r) => !r.isError));
    await check.connect(new StreamableHTTPClientTransport(new URL(`${address}/api/mcp`), { requestInit: { headers: { "X-MCP-Usage": "check" } } }));
    await check.listTools();
    await check.callTool({ name: T.latest, arguments: { lang: "zh" } });
    const summary = await settled(12, 3);
    assert.equal(summary.totals.successes, 12);
    assert.equal((await siteAnalyticsOverview(7)).mcp.totals.calls, 12, "the admin overview includes the MCP summary");
    assert.equal(summary.totals.initializes, 1);
    assert.equal(summary.totals.discoveries, 1);
    assert.equal(summary.totals.activeDays, 1);
    assert.equal(summary.daily.length, 7);
    assert.equal(summary.daily.at(-1)?.calls, 12);
    assert.equal(summary.tools[0]?.calls, 12);
    assert.ok(summary.totals.averageMs >= 0);
    assert.ok(summary.totals.maxMs >= summary.totals.averageMs);
    assert.ok(summary.totals.lastCallAt);
    const admin = await app.inject({ url: "/api/admin/analytics?days=7" });
    assert.equal(admin.statusCode, 401);
    const columns = await sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'mcp_usage_daily' ORDER BY ordinal_position`;
    assert.deepEqual(columns.map((r) => r.column_name), ["day", "operation", "tool", "outcome", "is_check", "calls", "duration_ms", "max_duration_ms", "last_seen_at"]);
  } finally { await client.close(); await check.close(); }
});

test("JSON and legacy SSE distinguish domain failures, schema rejection and unknown tools", async () => {
  const badDate = await rpc("tools/call", { name: T.daily, arguments: { date: "2026-02-30" } });
  assert.equal(badDate.statusCode, 200);
  assert.match(badDate.body, /invalid_request/);
  const missing = await rpc("tools/call", { name: T.story, arguments: { public_id: "private-story-that-does-not-exist" } });
  assert.match(missing.body, /not_found/);
  const invalid = await rpc("tools/call", { name: T.latest, arguments: { limit: 99 } });
  assert.match(invalid.body, /isError/);
  await rpc("tools/call", { name: "arbitrary-user-controlled-private-name", arguments: {} });
  const sse = await rpc("tools/call", { name: T.latest, arguments: { lang: "zh" } }, { "mcp-protocol-version": "2025-03-26" });
  assert.match(String(sse.headers["content-type"]), /text\/event-stream/);
  assert.match(sse.body, /event: message/);
  const module = await rpc("tools/call", { name: mcpToolName("get_cost_of_intelligence"), arguments: {} });
  assert.equal(module.statusCode, 200);
  assert.doesNotMatch(module.body, /"isError":true/);
  const summary = await settled(6);
  assert.equal(summary.totals.successes, 2);
  assert.equal(summary.totals.errors, 4);
  assert.deepEqual(summary.errors.map((r) => [r.outcome, r.calls]), [["rejected", 2], ["invalid_request", 1], ["not_found", 1]]);
  assert.ok(summary.tools.some((r) => r.tool === "__unknown__" && r.calls === 1));
  const stored = JSON.stringify(await sql`SELECT * FROM mcp_usage_daily`);
  assert.doesNotMatch(stored, /private-story|arbitrary-user-controlled/);
});

test("preflight, notifications and host/origin rejections are not tool usage", async () => {
  await app.inject({ method: "OPTIONS", url: "/api/mcp", headers: { host: "localhost", origin: "http://localhost:3000", "access-control-request-headers": "x-mcp-usage" } });
  await rpc("notifications/initialized");
  await rpc("tools/call", { name: T.latest }, { host: "evil.invalid" });
  await rpc("tools/call", { name: T.latest }, { origin: "https://evil.invalid" });
  await app.inject({ method: "POST", url: "/api/mcp", headers: { host: "localhost", accept: "application/json, text/event-stream" }, payload: { id: 1, method: "tools/call", params: { name: T.latest } } });
  await rpc("unknown/method");
  assert.equal((await mcpAnalyticsOverview()).totals.calls, 0);
  assert.equal((await sql`SELECT * FROM mcp_usage_daily`).length, 0);
});

test("aggregation uses weighted durations, zero-filled windows and excludes checks and out-of-window rows", async () => {
  await sql`INSERT INTO mcp_usage_daily (day, operation, tool, outcome, is_check, calls, duration_ms, max_duration_ms) VALUES
    ((now() AT TIME ZONE 'Asia/Taipei')::date, 'tools/call', ${T.latest}, 'success', false, 3, 60, 30),
    ((now() AT TIME ZONE 'Asia/Taipei')::date - 1, 'tools/call', ${T.latest}, 'internal_error', false, 1, 100, 100),
    ((now() AT TIME ZONE 'Asia/Taipei')::date, 'tools/call', ${T.latest}, 'success', true, 200, 20000, 100),
    ((now() AT TIME ZONE 'Asia/Taipei')::date - 7, 'tools/call', ${T.latest}, 'success', false, 999, 999, 1)`;
  const s = await mcpAnalyticsOverview(7);
  assert.equal(s.totals.calls, 4);
  assert.equal(s.totals.averageMs, 40);
  assert.equal(s.tools[0]?.averageMs, 40);
  assert.equal(s.totals.maxMs, 100);
  assert.equal(s.totals.checks, 200);
  assert.equal(s.totals.activeDays, 2);
  assert.equal(s.daily[0]?.calls, 0);
  assert.equal((await mcpAnalyticsOverview(500)).daily.length, 30);
});

test("daily retention keeps exactly the current 90 calendar days", async () => {
  await recordMcpUsage({ operation: "tools/call", tool: T.latest, outcome: "success", isCheck: false, durationMs: 1 });
  await sql`INSERT INTO mcp_usage_daily (day, operation, tool, outcome) VALUES
    ((now() AT TIME ZONE 'Asia/Taipei')::date - 89, 'tools/call', ${T.latest}, 'success'),
    ((now() AT TIME ZONE 'Asia/Taipei')::date - 90, 'tools/call', ${T.latest}, 'success')`;
  assert.equal((await dailyRetention()).deletedMcpUsage, 1);
  assert.equal((await sql`SELECT * FROM mcp_usage_daily`).length, 2);
});

test("a failed analytics write cannot change a successful MCP result", async () => {
  const isolated = Fastify();
  let writes = 0;
  registerMcp(isolated, async () => { writes++; throw new Error("analytics unavailable"); });
  try {
    const response = await isolated.inject({ method: "POST", url: "/api/mcp", headers: { host: "localhost", accept: "application/json, text/event-stream" },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    assert.equal(response.statusCode, 200);
    assert.match(response.body, /tools/);
    assert.equal(writes, 1);
  } finally { await isolated.close(); }
});

test("worker-publication and capacity failures remain failed tools even with HTTP 200", async () => {
  installModules([{ name: "usage-fixture", agent: { abilities: [{
    path: "/usage-fixture", title: "fixture", ask: "fixture", answer: async () => "fixture", etagPrefix: "fixture", cacheControl: "no-store",
    mcp: { tool: "usage_fixture", use: "for testing", description: "fixture", input: z.strictObject({ kind: z.enum(["edition", "busy", "internal"]) }),
      run: async ({ kind }) => { throw kind === "edition" ? new EditionUnavailableError() : kind === "busy" ? new SearchBusyError(5) : new Error("private backend details"); } },
  }] } }]);
  const isolated = Fastify();
  registerMcp(isolated, recordMcpUsage);
  try {
    for (const kind of ["edition", "busy", "internal"]) {
      const response = await isolated.inject({ method: "POST", url: "/api/mcp", headers: { host: "localhost", accept: "application/json, text/event-stream" },
        payload: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: mcpToolName("usage_fixture"), arguments: { kind } } } });
      assert.equal(response.statusCode, 200);
      assert.doesNotMatch(response.body, /private backend details/);
    }
    const summary = await settled(3);
    assert.equal(summary.totals.successes, 0);
    assert.deepEqual(summary.errors.map((r) => r.outcome), ["busy", "edition_unavailable", "internal_error"]);
  } finally { await isolated.close(); installModules(SERVER_MODULES); }
});
