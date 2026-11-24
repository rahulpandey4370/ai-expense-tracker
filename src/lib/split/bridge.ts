// Mirrors splits saved through the transaction form / AI entry (old transaction_splits model) into the
// "Quick splits" group, so they show up and settle in the Split tab. Same mapping as the SQL import.
import { getSupabase } from '@/lib/supabase';

const ME = 'legacy_me';
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Group shares for a split transaction; anything unrecorded is the payer's own share. Null = not split. */
export function bridgeShares(
  tx: { amount: number; myShare: number | null; paidById: string | null },
  splits: { userId: string; shareAmount: number }[],
): { paidBy: string; shares: Record<string, number> } | null {
  if (!tx.paidById && splits.length === 0) return null;
  const paidBy = tx.paidById ? `legacy_${tx.paidById}` : ME;
  const shares: Record<string, number> = {};
  for (const s of splits) if (s.shareAmount > 0) shares[`legacy_${s.userId}`] = r2((shares[`legacy_${s.userId}`] ?? 0) + s.shareAmount);
  if ((tx.myShare ?? 0) > 0) shares[ME] = r2((shares[ME] ?? 0) + (tx.myShare ?? 0));
  const rest = r2(tx.amount - Object.values(shares).reduce((a, b) => a + b, 0));
  if (rest > 0) shares[paidBy] = r2((shares[paidBy] ?? 0) + rest);
  return { paidBy, shares };
}

async function ensureQuickGroup(userIds: string[]) {
  const db = getSupabase();
  const now = new Date().toISOString();
  const ownerEmail = (process.env.OWNER_EMAILS ?? '').split(',')[0]?.trim().toLowerCase() || null;
  await db.from('split_groups').upsert({ id: 'legacy', name: 'Quick splits', emoji: '⚡', kind: 'other', created_at: now, updated_at: now }, { onConflict: 'id', ignoreDuplicates: true });
  await db.from('split_members').upsert({ id: ME, group_id: 'legacy', name: 'You', email: ownerEmail, is_owner: true, created_at: now }, { onConflict: 'id', ignoreDuplicates: true });
  if (userIds.length === 0) return;
  const { data: users } = await db.from('split_users').select('id, name').in('id', userIds);
  await db.from('split_members').upsert(
    (users ?? []).map(u => ({ id: `legacy_${u.id}`, group_id: 'legacy', name: u.name, created_at: now })),
    { onConflict: 'id', ignoreDuplicates: true },
  );
}

/** Call after a transaction + its splits are written. Never throws into the caller's save. */
export async function syncQuickSplit(
  row: { id: string; type: string; amount: number; my_share: number | null; paid_by_id: string | null; description: string; date: string },
  splits: { userId: string; shareAmount: number }[],
): Promise<void> {
  try {
    const db = getSupabase();
    const expenseId = `legacy_${row.id}`;
    // Already tied to a real group expense (owner's spending link)? That one is the source of truth.
    const { data: other, error } = await db.from('split_expenses').select('id').eq('transaction_id', row.id).neq('id', expenseId).limit(1);
    if (error) throw new Error(error.message);
    if (other?.length) return;

    const b = row.type === 'expense' ? bridgeShares({ amount: Number(row.amount), myShare: row.my_share, paidById: row.paid_by_id }, splits) : null;
    if (!b) {
      await db.from('split_expenses').delete().eq('id', expenseId);
      return;
    }
    await ensureQuickGroup([...new Set([...splits.map(s => s.userId), ...(row.paid_by_id ? [row.paid_by_id] : [])])]);
    const { error: saveError } = await db.rpc('split_save_expense', {
      p_expense: {
        id: expenseId, group_id: 'legacy', description: row.description, amount: row.amount, date: row.date,
        emoji: null, method: 'exact', paid_by: b.paidBy, created_by: ME, meta: { bridged: true }, transaction_id: row.id,
      },
      p_shares: Object.entries(b.shares).map(([member_id, amount]) => ({ member_id, amount })),
    });
    if (saveError) throw new Error(saveError.message);
  } catch (e) {
    console.error('Quick-split sync failed (transaction saved fine):', (e as Error).message);
  }
}
