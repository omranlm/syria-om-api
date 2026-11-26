// Run with `npm test` (Node's own test runner, which strips the TypeScript types).
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {addDays, allTimeZones, formatOffset, offsetMinutes, todayIn, zonedDayStart} from './time.ts';

test('a day starts at local midnight of the chosen zone', () => {
  assert.equal(zonedDayStart('2026-11-25', 'Asia/Damascus'), '2026-11-24T21:00:00.000Z');
  assert.equal(zonedDayStart('2026-11-25', 'UTC'), '2026-11-25T00:00:00.000Z');
  assert.equal(zonedDayStart('2026-11-25', 'America/New_York'), '2026-11-25T05:00:00.000Z');
  assert.equal(zonedDayStart('2026-11-25', 'Asia/Kolkata'), '2026-11-24T18:30:00.000Z');
});

test('daylight saving time uses the offset in force at that midnight', () => {
  assert.equal(zonedDayStart('2026-07-01', 'Europe/Berlin'), '2026-06-30T22:00:00.000Z');
  assert.equal(zonedDayStart('2026-03-29', 'Europe/Berlin'), '2026-03-28T23:00:00.000Z');
});

test('offsets are labelled with sign and minutes', () => {
  const noon = new Date('2026-11-25T12:00:00Z');
  assert.equal(formatOffset(offsetMinutes('Asia/Kathmandu', noon)), 'UTC+05:45');
  assert.equal(formatOffset(offsetMinutes('America/St_Johns', noon)), 'UTC−03:30');
  assert.equal(formatOffset(0), 'UTC+00:00');
});

test('calendar day arithmetic', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.match(todayIn('Pacific/Kiritimati'), /^\d{4}-\d{2}-\d{2}$/);
});

test('every standard zone is offered, UTC included', () => {
  const zones = allTimeZones();
  assert.ok(zones.length > 300);
  assert.ok(zones.includes('UTC'));
  assert.ok(zones.includes('Asia/Damascus'));
});
