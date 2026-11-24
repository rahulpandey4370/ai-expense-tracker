// Run: npx tsx src/lib/split-utils.check.ts
import assert from 'node:assert/strict';
import { netAmount, othersShare } from './split-utils';

const paidSplit: any = { amount: 100, myShare: 40, netAmount: 100 }; // switch on: server says full amount
assert.equal(netAmount(paidSplit), 100, 'spend follows the server value');
assert.equal(othersShare(paidSplit), 60, "others' share is still amount − my share");
assert.equal(netAmount({ amount: 100, myShare: 40 } as any), 40, 'no server value: my share');
assert.equal(netAmount({ amount: 100 } as any), 100);
console.log('ok');
