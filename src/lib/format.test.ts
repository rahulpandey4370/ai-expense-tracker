// Run: npx tsx --test src/lib/format.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatCurrency } from './format';

test('formatCurrency drops .00 only when paise are zero', () => {
  assert.equal(formatCurrency(140619), '₹1,40,619');
  assert.equal(formatCurrency(140619.5), '₹1,40,619.50');
  assert.equal(formatCurrency(-250), '-₹250');
  assert.equal(formatCurrency(0.004), '₹0');
  assert.equal(formatCurrency(null), '₹0');
});
