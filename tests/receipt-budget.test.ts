// Daily spend excludes definite unbilled refusals, while traffic limits, reservations and uncertain
// billing remain bounded. The admin's numbers must agree with the gate that actually sends requests.
import { gate, tag } from './setup.ts';
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { closeDb, sql } from '@aihot/backend/db';
import { listBudgets } from '@aihot/backend/admin/settings';
import { AUTO_RELEASE_NOTE, autoReleaseUnknownReceipts, releaseReceipt } from '@aihot/backend/operations/recover';
import { BudgetExceededError, paidRequest, ProviderRejectedError, rejectReceivedResponse } from '@aihot/backend/providers/receipts';
import { repairReleasedReceiptAttempts } from '../scripts/repair-released-receipt-attempts.ts';

after(closeDb);

async function budget(perMinute = 100, perHour = 100) {
  const service = `budget-${tag()}`;
  await sql`INSERT INTO budgets(service,per_minute,per_hour,per_day) VALUES(${service},${perMinute},${perHour},1)`;
  return { service, purpose: 'invariant_test', identity: tag() };
}
async function used(service: string) {
  const row = (await listBudgets()).find(row => row.service === service)!;
  return { hour: row.used_hour, day: row.used_day };
}
const ok = async () => ({ response: { ok: true } });
const lost = async () => { throw new Error('connection lost after sending'); };
const refused = async () => { throw new ProviderRejectedError('Codex usage limit reached', null, false); };

test('quota refusals remain recorded but release the daily slot for a successful retry', async () => {
  const request = await budget();
  await assert.rejects(paidRequest(request, refused), ProviderRejectedError);
  await assert.rejects(paidRequest(request, refused), ProviderRejectedError);
  assert.deepEqual(await used(request.service), { hour: 2, day: 0 });
  const answer = await paidRequest(request, ok);
  assert.deepEqual(await used(request.service), { hour: 3, day: 1 });
  const rows = await sql`SELECT status FROM receipt_attempts WHERE receipt_id=${answer.receiptId} ORDER BY attempt`;
  assert.deepEqual(rows.map(row => row.status), ['failed','failed','received']);
  assert.equal((await paidRequest(request, ok)).reused, true);
  await assert.rejects(paidRequest({ ...request, identity: 'another' }, ok), BudgetExceededError);
});

for (const window of ['minute','hour'] as const) test(`unbilled failures still obey the ${window} request limit`, async () => {
  const request = await budget(window === 'minute' ? 1 : 100, window === 'hour' ? 1 : 100);
  await assert.rejects(paidRequest(request, refused), ProviderRejectedError);
  await assert.rejects(paidRequest(request, ok), error => error instanceof BudgetExceededError && error.message.endsWith(`(${window})`));
  assert.deepEqual(await used(request.service), { hour: 1, day: 0 });
});

test('in-flight attempts reserve the daily budget before the provider answers', async () => {
  const request = await budget();
  const started = gate(), finish = gate();
  const running = paidRequest(request, async () => { started.open(); await finish.promise; return ok(); });
  await started.promise;
  try {
    assert.deepEqual(await used(request.service), { hour: 1, day: 1 });
    await assert.rejects(paidRequest({ ...request, identity: 'another' }, ok), BudgetExceededError);
  } finally { finish.open(); await running; }
});

test('an unusable received answer still consumes the daily budget', async () => {
  const request = await budget();
  const result = await paidRequest(request, ok);
  await rejectReceivedResponse(result.receiptId, 'unusable JSON');
  assert.deepEqual(await used(request.service), { hour: 1, day: 1 });
  await assert.rejects(paidRequest(request, ok), BudgetExceededError);
});

for (const billed of [null,true,false] as const) test(`releasing an unknown outcome with billed=${billed} preserves its billing meaning`, async () => {
  const request = await budget();
  await assert.rejects(paidRequest(request, lost));
  const [receipt] = await sql`SELECT id FROM receipts WHERE service=${request.service}`;
  await releaseReceipt(receipt!.id, { billed, note: 'verified test decision' }, 'test');
  const [attempt] = await sql`SELECT status FROM receipt_attempts WHERE receipt_id=${receipt!.id}`;
  assert.equal(attempt!.status, billed === false ? 'failed' : 'unknown');
  assert.deepEqual(await used(request.service), { hour: 1, day: billed === false ? 0 : 1 });
  if (billed === false) await paidRequest(request, ok);
  else await assert.rejects(paidRequest(request, ok), BudgetExceededError);
});

test('a later release preserves earlier unknown charges and the automatic-release marker', async () => {
  const request = await budget();
  await sql`UPDATE budgets SET per_day=3 WHERE service=${request.service}`;
  await assert.rejects(paidRequest(request, lost));
  const [receipt] = await sql`SELECT id FROM receipts WHERE service=${request.service}`;
  await sql`UPDATE receipts SET updated_at=now()-interval '31 minutes' WHERE id=${receipt!.id}`;
  assert.equal((await autoReleaseUnknownReceipts()).released,1);
  await assert.rejects(paidRequest(request, lost));
  await releaseReceipt(receipt!.id,{billed:false,note:'second request was not billed'},'test');
  const attempts = await sql`SELECT status,error FROM receipt_attempts WHERE receipt_id=${receipt!.id} ORDER BY attempt`;
  assert.deepEqual(attempts.map(row => row.status),['unknown','failed']);
  assert.equal(attempts[0]!.error,AUTO_RELEASE_NOTE);
  assert.deepEqual(await used(request.service),{hour:2,day:1});
  await assert.rejects(paidRequest(request,lost));
  await sql`UPDATE receipts SET updated_at=now()-interval '31 minutes' WHERE id=${receipt!.id}`;
  assert.equal((await autoReleaseUnknownReceipts()).released,0,'an earlier automatic release must not be forgotten');
});

test('the legacy repair is previewable, audited and idempotent, and does not refund unknown billing', async () => {
  const ids: number[] = [];
  for (const billed of [null,true,false] as const) {
    const request = await budget();
    await assert.rejects(paidRequest(request,lost));
    const [receipt] = await sql`SELECT id FROM receipts WHERE service=${request.service}`;
    await releaseReceipt(receipt!.id,{billed,note:'legacy release'},'test');
    const [attempt] = await sql`UPDATE receipt_attempts SET status='failed' WHERE receipt_id=${receipt!.id} RETURNING id`;
    if (billed !== false) ids.push(attempt!.id);
  }
  const preview=await repairReleasedReceiptAttempts();
  assert.deepEqual(preview.attempts.map(row=>row.id),ids);
  assert.equal((await sql`SELECT count(*)::int AS n FROM receipt_attempts WHERE id IN ${sql(ids)} AND status='failed'`)[0]!.n,2);
  assert.equal((await repairReleasedReceiptAttempts(true)).count,2);
  assert.equal((await repairReleasedReceiptAttempts(true)).count,0);
  assert.equal((await sql`SELECT count(*)::int AS n FROM receipt_attempts WHERE id IN ${sql(ids)} AND status='unknown'`)[0]!.n,2);
  assert.equal((await sql`SELECT count(*)::int AS n FROM audit_log WHERE action='receipts.repair-budget'`)[0]!.n,1);
});
