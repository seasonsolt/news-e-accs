// A picture under an entry of the 公众号 column 「AI 早报」, one per day and entry (wechat_illustrations).
// The workbench asks for one (admin/wechat.ts), the worker draws it with the Codex CLI (providers/codex.ts)
// and keeps the file under AIHOT_DATA_DIR/uploads/wechat-illustrations, or the editor uploads one. Each ask or
// upload is a new `request`: a drawing that finishes after a newer ask is paid for but not shown, and
// the picture already there stays until the new one is ready.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.ts";
import { sql } from "../db.ts";
import { promptText } from "../editorial/prompts.ts";
import { logError } from "../lib/log-error.ts";
import { codexConfigured, codexImage } from "../providers/codex.ts";
import { BudgetExceededError, completeReceipt, ReceiptBusyError, ReceiptUnknownError } from "../providers/receipts.ts";

/** Under uploads/, so backups keep them; the public /contact/ route reads only files at the top of uploads/. */
export const illustrationDir = () => path.join(config.dataDir, "uploads", "wechat-illustrations");

export interface IllustrationRow {
  entryKey: string;
  status: "queued" | "drawing" | "done" | "failed";
  origin: "drawn" | "uploaded";
  prompt: string | null;
  request: string;
  file: string | null;
  error: string | null;
  wechatUrl: string | null;
  requestedBy: string | null;
  updatedAt: string;
}

/** The day's pictures by entry key. */
export async function wechatIllustrations(key: string): Promise<Map<string, IllustrationRow>> {
  const rows = await sql<IllustrationRow[]>`
    SELECT entry_key AS "entryKey", status, origin, prompt, request, file, error, wechat_url AS "wechatUrl", requested_by AS "requestedBy", updated_at AS "updatedAt"
    FROM wechat_illustrations WHERE report_key = ${key}`;
  return new Map(rows.map((r) => [r.entryKey, r]));
}

/** The entry's picture as JPEG bytes; null without one. */
export async function illustrationJpeg(key: string, entry: string): Promise<Buffer | null> {
  const [row] = await sql<{ file: string | null }[]>`SELECT file FROM wechat_illustrations WHERE report_key = ${key} AND entry_key = ${entry}`;
  // Names are written here as <hash>.jpg; anything else is not read from disk.
  if (!row?.file || !/^[0-9a-f]{32}\.jpg$/.test(row.file)) return null;
  return readFile(path.join(illustrationDir(), row.file)).catch(() => null);
}

/** Why the worker cannot draw here, or null when it can. */
export function drawingUnavailable(): string | null {
  if (!codexConfigured()) return "没有配置 CODEX_BIN，只能上传配图。";
  if (!config.modelCallsEnabled) return "模型调用没有打开（MODEL_CALLS_ENABLED），只能上传配图。";
  return null;
}

/** What the drawing is of: the editor's words, else the entry itself. */
export const illustrationSubject = (entry: { title: string; body: string | null }, prompt: string | null) =>
  prompt?.trim() || `${entry.title}\n${entry.body ?? ""}`.trim();

function failure(error: unknown): string {
  if (error instanceof BudgetExceededError) return "codex 的画图预算用完了，稍后再试，或在后台「设置 → 预算」里调高。";
  if (error instanceof ReceiptBusyError) return "同一张图正在画，等它画完。";
  // Each ask is a request of its own, so asking again draws anew.
  if (error instanceof ReceiptUnknownError) return "画图中断了（超时或 worker 重启），没有拿到图，可以重画。";
  return String(error instanceof Error ? error.message : error).slice(0, 600);
}

/** The worker's job: draws the picture `request` asked for, unless a newer ask or upload replaced it. */
export async function drawWechatIllustration(job: { date: string; entry: string; request: string; subject: string }): Promise<{ status: string }> {
  const mine = sql`report_key = ${job.date} AND entry_key = ${job.entry} AND request = ${job.request}`;
  const unavailable = drawingUnavailable();
  if (unavailable) {
    await sql`UPDATE wechat_illustrations SET status = 'failed', error = ${unavailable}, updated_at = now() WHERE ${mine} AND status IN ('queued', 'drawing')`;
    return { status: "disabled" };
  }
  const claimed = await sql`UPDATE wechat_illustrations SET status = 'drawing', updated_at = now() WHERE ${mine} AND status IN ('queued', 'drawing') RETURNING 1`;
  if (!claimed.length) return { status: "superseded" };
  try {
    const drawn = await codexImage({
      instruction: promptText("wechat-illustration", { subject: job.subject }), dir: illustrationDir(),
      purpose: "wechat_illustration", subject: `wechat:${job.date}:${job.entry}`.slice(0, 200), attemptTag: job.request,
    });
    const kept = await sql.begin(async (tx) => {
      const updated = await tx`
        UPDATE wechat_illustrations SET status = 'done', file = ${drawn.file}, wechat_url = NULL, error = NULL, receipt_id = ${drawn.receiptId}, updated_at = now()
        WHERE ${mine}`;
      await completeReceipt(tx, drawn.receiptId);
      return updated.count > 0;
    });
    return { status: kept ? "done" : "superseded" };
  } catch (error) {
    console.error("[wechat.illustrate]", logError(error));
    await sql`UPDATE wechat_illustrations SET status = 'failed', error = ${failure(error)}, updated_at = now() WHERE ${mine}`;
    return { status: "failed" };
  }
}
