// One bounded repair of the old release bookkeeping; dry-run unless --apply. No provider calls.
import { sql } from '../packages/backend/src/db.ts';
import { audit } from '../packages/backend/src/audit.ts';
import { AUTO_RELEASE_NOTE } from '../packages/backend/src/operations/recover.ts';

export async function repairReleasedReceiptAttempts(apply = false) {
  return sql.begin(async tx => {
    const rows = await tx<{ id: number; receipt_id: number; attempt: number }[]>`
      SELECT a.id,a.receipt_id,a.attempt FROM receipt_attempts a
      WHERE a.status='failed'
        AND (a.error=${AUTO_RELEASE_NOTE}
          OR a.error LIKE '人工放行：计费未知，按授权恢复。%'
          OR a.error LIKE '人工核对：供应商已计费但结果未取回。%')
        AND EXISTS (SELECT 1 FROM audit_log l WHERE l.action='receipt.release'
          AND l.subject='receipt:' || a.receipt_id AND l.created_at >= a.started_at
          AND l.after->'billed' IS DISTINCT FROM 'false'::jsonb)
      ORDER BY a.id LIMIT 200 ${apply ? tx`FOR UPDATE OF a SKIP LOCKED` : tx``}`;
    if (apply && rows.length) {
      await tx`UPDATE receipt_attempts SET status='unknown' WHERE id IN ${tx(rows.map(row => row.id))}`;
      await audit('repair-released-receipt-attempts','receipts.repair-budget',null,
        'Restore unknown billing outcomes previously marked failed on release; retain attempts in the daily budget.',
        { status: 'failed', attempts: rows }, { status: 'unknown' }, { db: tx });
    }
    return { apply, count: rows.length, attempts: rows };
  });
}

if (import.meta.main) {
  if (process.argv.slice(2).some(arg => arg !== '--apply')) throw new Error('usage: node scripts/repair-released-receipt-attempts.ts [--apply]');
  try { console.log(JSON.stringify(await repairReleasedReceiptAttempts(process.argv.includes('--apply')))); }
  finally { await sql.end(); }
}
