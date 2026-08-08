import type { AppTransaction, ParsedAITransaction, SplitUser, TransactionSplitInput } from '@/lib/types';

/** What counts as "my" spend for this transaction — the number every KPI/report should sum. */
export const netAmount = (t: AppTransaction): number => t.myShare ?? t.amount;

/** The portion of this transaction that belongs to other people. */
export const othersShare = (t: AppTransaction): number => t.amount - netAmount(t);

/** Sum of other people's shares on this transaction that haven't been settled yet. */
export const openReceivable = (t: AppTransaction): number =>
  (t.splits ?? []).filter(s => !s.isSettled).reduce((sum, s) => sum + s.shareAmount, 0);

/** True if a transaction has any split rows (equivalent to the server-derived isSplit flag). */
export const hasSplit = (t: AppTransaction): boolean => !!t.isSplit && (t.splits?.length ?? 0) > 0;

export interface ResolvedSplit {
  myShare: number;
  paidById?: string;
  splitMethod: 'equally' | 'shares' | 'custom' | 'not_mine';
  splits: TransactionSplitInput[];
  /** Names the AI mentioned that don't match anyone in `splitUsers` yet. */
  unmatchedNames: string[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Turns an AI-parsed `splitDetails` block into the shape `TransactionInput`
 * expects, resolving participant names against the known people directory
 * (case-insensitive). Returns null when there's nothing to split or the
 * transaction isn't an expense (splitting is expense-only).
 */
export function resolveParsedSplit(
  aiTx: Pick<ParsedAITransaction, 'type' | 'amount' | 'splitDetails'>,
  splitUsers: SplitUser[]
): ResolvedSplit | null {
  const details = aiTx.splitDetails;
  if (!details || aiTx.type !== 'expense' || !aiTx.amount) return null;

  const byName = new Map(splitUsers.map(u => [u.name.toLowerCase(), u]));
  const unmatchedNames: string[] = [];
  const resolveName = (name: string): SplitUser | undefined => {
    const match = byName.get(name.trim().toLowerCase());
    if (!match) unmatchedNames.push(name.trim());
    return match;
  };

  const paidBy = details.paidByName ? resolveName(details.paidByName) : undefined;
  const participants = details.participants
    .map(p => ({ user: resolveName(p.name), amount: p.amount }))
    .filter((p): p is { user: SplitUser; amount: number | undefined } => !!p.user);

  if (details.mode === 'not_mine') {
    if (participants.length === 0) return null;
    return {
      myShare: 0,
      paidById: undefined,
      splitMethod: 'not_mine',
      splits: [{ userId: participants[0].user.id, shareAmount: round2(aiTx.amount) }],
      unmatchedNames,
    };
  }

  if (participants.length === 0) return null;

  if (details.mode === 'custom') {
    const splits = participants.map(p => ({ userId: p.user.id, shareAmount: round2(p.amount ?? 0) }));
    const othersTotal = splits.reduce((sum, s) => sum + s.shareAmount, 0);
    const myShare = paidBy ? 0 : round2(aiTx.amount - othersTotal);
    return { myShare, paidById: paidBy?.id, splitMethod: 'custom', splits, unmatchedNames };
  }

  // 'equally' (default) / 'shares' both fall back to an equal split — the
  // model rarely emits 'shares' and there's no ratio field to act on yet.
  const n = participants.length + (paidBy ? 0 : 1);
  const base = Math.floor((aiTx.amount / n) * 100) / 100;
  const shares = new Array(n).fill(base);
  shares[0] = round2(shares[0] + (aiTx.amount - round2(base * n)));
  const splits = participants.map((p, i) => ({ userId: p.user.id, shareAmount: shares[i] }));
  const myShare = paidBy ? 0 : shares[participants.length];
  return { myShare, paidById: paidBy?.id, splitMethod: 'equally', splits, unmatchedNames };
}
