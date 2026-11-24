// Run: npx tsx src/lib/split/bridge.check.ts
// Same fixtures as the SQL import check (supabase/split-groups.sql), so both paths agree.
import assert from 'node:assert/strict';
import { bridgeShares } from './bridge';

// I paid 300, split 3 ways with Asha (u1) and Ben (u2)
assert.deepEqual(
  bridgeShares({ amount: 300, myShare: 100, paidById: null }, [{ userId: 'u1', shareAmount: 100 }, { userId: 'u2', shareAmount: 100 }]),
  { paidBy: 'legacy_me', shares: { legacy_u1: 100, legacy_u2: 100, legacy_me: 100 } },
);
// Ben paid 500, my share 200 → the unrecorded 300 is Ben's own share
assert.deepEqual(
  bridgeShares({ amount: 500, myShare: 200, paidById: 'u2' }, []),
  { paidBy: 'legacy_u2', shares: { legacy_me: 200, legacy_u2: 300 } },
);
// Not mine: Asha's 50 on my card
assert.deepEqual(
  bridgeShares({ amount: 50, myShare: 0, paidById: null }, [{ userId: 'u1', shareAmount: 50 }]),
  { paidBy: 'legacy_me', shares: { legacy_u1: 50 } },
);
// Not split at all → nothing to bridge
assert.equal(bridgeShares({ amount: 80, myShare: null, paidById: null }, []), null);
// paise stay exact
const r = bridgeShares({ amount: 100, myShare: 33.34, paidById: null }, [{ userId: 'a', shareAmount: 33.33 }, { userId: 'b', shareAmount: 33.33 }])!;
assert.equal(Object.values(r.shares).reduce((x, y) => x + y, 0).toFixed(2), '100.00');

console.log('ok');
