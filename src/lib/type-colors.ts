// One colour per money bucket, everywhere: the allocation bar, the badges and the pies.
// Tailwind's 500 shades, matching the bar's 400→600 gradients and the Need/Want badges.
export const TYPE_COLORS = {
  need: '#3b82f6', // blue-500
  want: '#a855f7', // purple-500
  investment: '#eab308', // yellow-500
  savings: '#22c55e', // green-500
} as const;

export type ExpenseKind = 'need' | 'want' | 'investment' | 'investment_expense';
const LABELS: Record<ExpenseKind, string> = { need: 'Need', want: 'Want', investment: 'Investment', investment_expense: 'Investment expense' };

/** Colour + label for a transaction's expense type (investment expenses share the investment colour). */
export function expenseKind(t?: string | null): { color: string; label: string } | null {
  if (!t || !(t in LABELS)) return null;
  const k = t as ExpenseKind;
  return { color: k === 'investment_expense' ? TYPE_COLORS.investment : TYPE_COLORS[k], label: LABELS[k] };
}
