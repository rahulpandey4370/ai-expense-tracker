// Run: npx tsx --test src/lib/goal-forecast.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalForecast } from './goal-forecast';

const now = new Date('2026-11-20T00:00:00Z');

test('pace, finish date and the monthly amount needed', () => {
  // ₹1,20,000 saved in 12 months = ₹10,000/month; ₹80,000 left → 8 more months.
  const f = goalForecast({ targetAmount: 200_000, amountSavedSoFar: 120_000, targetDurationMonths: 16, createdAt: '2025-11-20T00:00:00Z' }, now)!;
  assert.ok(Math.abs(f.pacePerMonth - 10_000) < 50);
  assert.equal(f.reachBy!.toISOString().slice(0, 7), '2027-07');
  assert.equal(f.targetDate.toISOString().slice(0, 7), '2027-03');
  assert.equal(f.onTrack, false);
  assert.equal(f.neededPerMonth, 20_000); // ₹80,000 over the 4 months left
  assert.ok(Math.abs(f.extraPerMonth - 10_000) < 50);
});

test('on track, nothing saved, date passed, and done', () => {
  assert.equal(goalForecast({ targetAmount: 100, amountSavedSoFar: 90, targetDurationMonths: 24, createdAt: '2025-11-20' }, now)!.onTrack, true);
  const none = goalForecast({ targetAmount: 100, amountSavedSoFar: 0, targetDurationMonths: 24, createdAt: '2026-11-01' }, now)!;
  assert.equal(none.reachBy, null);
  assert.equal(none.onTrack, false);
  assert.equal(goalForecast({ targetAmount: 100, amountSavedSoFar: 10, targetDurationMonths: 1, createdAt: '2025-01-01' }, now)!.neededPerMonth, null);
  assert.equal(goalForecast({ targetAmount: 100, amountSavedSoFar: 100, targetDurationMonths: 1, createdAt: '2025-01-01' }, now), null);
});
