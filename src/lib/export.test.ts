// Run: npx tsx --test src/lib/export.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from './export';

test('CSV cells are quoted and cannot run as formulas', () => {
  assert.equal(csvCell('🛒 Swiggy: Milk, Curd'), '"🛒 Swiggy: Milk, Curd"');
  assert.equal(csvCell('Say "hi"'), '"Say ""hi"""');
  assert.equal(csvCell('Order #42'), 'Order #42');
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('-120.50'), '-120.50');
  assert.equal(csvCell(null), '');
  assert.equal(toCsv([['a', 1], ['b', 2]]), 'a,1\r\nb,2');
});
