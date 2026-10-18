import { sql } from "../db.ts";

export const MCP_OUTCOMES = ["success", "invalid_request", "not_found", "edition_unavailable", "busy", "internal_error", "tool_error", "rejected"] as const;
export type McpOutcome = typeof MCP_OUTCOMES[number];
export interface McpUsage {
  operation: "initialize" | "tools/list" | "tools/call";
  tool: string;
  outcome: McpOutcome;
  isCheck: boolean;
  durationMs: number;
}

/** No request identifiers, client names, arguments or result bodies are persisted. */
export async function recordMcpUsage(event: McpUsage): Promise<void> {
  await sql`
    INSERT INTO mcp_usage_daily (day, operation, tool, outcome, is_check, calls, duration_ms, max_duration_ms)
    VALUES ((now() AT TIME ZONE 'Asia/Taipei')::date, ${event.operation}, ${event.tool}, ${event.outcome}, ${event.isCheck}, 1, ${event.durationMs}, ${event.durationMs})
    ON CONFLICT (day, operation, tool, outcome, is_check) DO UPDATE SET
      calls = mcp_usage_daily.calls + 1,
      duration_ms = mcp_usage_daily.duration_ms + EXCLUDED.duration_ms,
      max_duration_ms = greatest(mcp_usage_daily.max_duration_ms, EXCLUDED.max_duration_ms),
      last_seen_at = now()`;
}
