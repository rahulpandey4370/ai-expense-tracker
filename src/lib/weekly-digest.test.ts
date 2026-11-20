// Run: npx tsx --test src/lib/weekly-digest.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyDigest } from './weekly-digest';

const x = (amount: number, category: string, description = category) => ({ amount, category, description });

test('totals, change vs last week, budgets and the category that jumped', () => {
  const d = weeklyDigest({
    week: [x(3000, 'Food and Dining'), x(1000, 'Groceries')],
    lastWeek: [x(2000, 'Groceries')],
    priorFourWeeks: [x(1000, 'Food and Dining'), x(4000, 'Groceries')],
    budgets: [{ name: 'Wants', limit: 10000, spent: 12000 }, { name: 'Groceries', limit: 5000, spent: 4200 }, { name: 'Needs', limit: 20000, spent: 5000 }],
  });
  assert.equal(d.title, '🗓️ Your week: ₹4,000 spent');
  assert.equal(d.body, 'Spent ₹4,000 this week, 100% more than last week. Budgets: Wants over; Groceries above 80%. Worth a look: Food and Dining was ₹3,000, usually ₹250 a week.');
});

test('quiet week falls back to the biggest spend; no budgets line when there are none', () => {
  const d = weeklyDigest({ week: [x(400, 'Cafe', '☕ Starbucks')], lastWeek: [], priorFourWeeks: [x(1600, 'Cafe')], budgets: [] });
  assert.equal(d.body, 'Spent ₹400 this week. Biggest spend: ☕ Starbucks ₹400.');
});
