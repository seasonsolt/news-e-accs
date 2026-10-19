import type { LbPricingRow } from "@aihot/leaderboard/contracts";

/** Typical request sizes, shared by the pricing calculator and the comparison pages. */
export const PRESETS = [
  { key: "chat", label: "聊天消息", input: 1_000, output: 500 },
  { key: "document", label: "长文档", input: 100_000, output: 2_000 },
  { key: "agent", label: "Agent 会话", input: 500_000, output: 50_000 },
] as const;

/** USD for one request of `input` and `output` tokens at the row's uncached prices; null without both. */
export function requestCost(row: LbPricingRow, input: number, output: number): number | null {
  return row.usd.input !== null && row.usd.output !== null ? (input * row.usd.input + output * row.usd.output) / 1e6 : null;
}

/** "3.2" below ten, whole numbers above, for "n× cheaper". */
export function times(ratio: number): string {
  return ratio < 10 ? String(Number(ratio.toFixed(1))) : String(Math.round(ratio));
}
