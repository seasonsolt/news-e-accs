import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { beijingDate, beijingDayEnd, calendarDate, calendarMidnight, calendarDayEnd, assertTimeZone,
  zonedDate, zonedTime, zonedMidnight, zonedDateTime } from '@aihot/contracts/time';

const NY = 'America/New_York';
test('New York dates cross UTC and Beijing dates independently', () => {
  const instant = '2026-03-08T04:30:00Z';
  assert.equal(calendarDate(instant, NY), '2026-03-07');
  assert.equal(calendarDate(instant, 'Asia/Shanghai'), '2026-03-08');
  assert.equal(beijingDate(instant), '2026-03-08');
});

test('spring DST calendar day contains 23 hours, fall contains 25 hours', () => {
  assert.equal(calendarMidnight('2026-03-08', NY).toISOString(), '2026-03-08T05:00:00.000Z');
  assert.equal(calendarDayEnd('2026-03-08', NY).toISOString(), '2026-03-09T03:59:59.999Z');
  assert.equal(calendarDayEnd('2026-03-08', NY).getTime() + 1 - calendarMidnight('2026-03-08', NY).getTime(), 23 * 3600_000);
  assert.equal(calendarMidnight('2026-11-01', NY).toISOString(), '2026-11-01T04:00:00.000Z');
  assert.equal(calendarDayEnd('2026-11-01', NY).toISOString(), '2026-11-02T04:59:59.999Z');
  assert.equal(calendarDayEnd('2026-11-01', NY).getTime() + 1 - calendarMidnight('2026-11-01', NY).getTime(), 25 * 3600_000);
});

test('Shanghai report helper agrees with unchanged historical Beijing slices', () => {
  for (const date of ['2026-03-08', '2026-11-01', '2026-12-31']) {
    assert.equal(calendarDayEnd(date, 'Asia/Shanghai').getTime(), beijingDayEnd(date).getTime());
  }
  assert.equal(calendarMidnight('2027-01-01', 'Asia/Shanghai').toISOString(), '2026-12-31T16:00:00.000Z');
});

test('08:00 uses the local offset at publication time across DST transitions', () => {
  assert.equal(zonedDateTime('2026-03-08', '08:00', NY).toISOString(), '2026-03-08T12:00:00.000Z');
  assert.equal(zonedDateTime('2026-11-01', '08:00', NY).toISOString(), '2026-11-01T13:00:00.000Z');
  assert.equal(zonedDateTime('2026-03-08', '08:00', 'Asia/Shanghai').toISOString(), '2026-03-08T00:00:00.000Z');
  assert.equal(zonedDateTime('2026-11-01', '08:00', 'Asia/Shanghai').toISOString(), '2026-11-01T00:00:00.000Z');
  assert.equal(zonedDate('2026-03-08T12:00:00Z', NY), '2026-03-08');
  assert.equal(zonedTime('2026-03-08T12:00:00Z', NY), '08:00');
  assert.equal(zonedMidnight('2026-03-08', NY).getTime(), calendarMidnight('2026-03-08', NY).getTime());
});

test('local wall times reject gaps and resolve overlaps to the earliest matching instant', () => {
  assert.throws(() => zonedDateTime('2026-03-08', '02:30', NY), /does not exist/);
  assert.equal(zonedDateTime('2026-11-01', '01:30', NY).toISOString(), '2026-11-01T05:30:00.000Z');
  assert.equal(zonedTime('2026-11-01T06:30:00Z', NY), '01:30');
  for (const time of ['8:00', '24:00', '12:60', '08:00:00']) assert.throws(() => zonedDateTime('2026-03-08', time, NY), /expected HH:mm/);
  assert.throws(() => zonedDateTime('2026-02-30', '08:00', NY), RangeError);
});

test('invalid calendar dates and nonexistent midnight are rejected', () => {
  assert.throws(() => calendarMidnight('2026-02-30', NY), RangeError);
  assert.throws(() => calendarDayEnd('2026-02-30', NY), RangeError);
  assert.throws(() => assertTimeZone('-05:00'), RangeError);
  assert.throws(() => assertTimeZone('America/Nowhere'), RangeError);
  assert.throws(() => calendarMidnight('2011-12-30', 'Pacific/Apia'), /does not exist/);
});


test('scheduled report callbacks use the configured local date for issue keys', { skip: !process.execArgv.includes('--experimental-test-module-mocks') }, async () => {
  const { config } = await import('@aihot/backend/config');
  const oldZone = config.reportTimeZone;
  const seen: string[] = [];
  const moduleMock = mock.module(new URL('../packages/backend/src/reports/compose.ts', import.meta.url).href, { namedExports: {
    composeDaily: async (key: string) => seen.push(`daily:${key}`),
    composeWeekly: async (key: string) => seen.push(`weekly:${key}`),
    composeMonthly: async (key: string) => seen.push(`monthly:${key}`),
    catchUpReports: async () => {},
  } });
  const clock = mock.method(Date, 'now', () => Date.parse('2026-03-01T03:30:00Z'));
  try {
    config.reportTimeZone = 'America/New_York';
    const { SCHEDULES } = await import('../apps/worker/src/schedules.ts');
    for (const name of ['reports.daily', 'reports.weekly', 'reports.monthly']) {
      const schedule = SCHEDULES.find(schedule => schedule.name === name)!;
      assert.equal(schedule.timeZone, 'America/New_York'); await schedule.run();
    }
    assert.deepEqual(seen, ['daily:2026-02-28', 'weekly:2026-W08', 'monthly:2026-01']);
    assert.equal(config.modelCallsEnabled, false);
  } finally { clock.mock.restore(); moduleMock.restore(); config.reportTimeZone = oldZone; }
});
