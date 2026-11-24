// Splitwise group export ("Export as spreadsheet") → our ledger.
// Columns: Date, Description, Category, Cost, Currency, then one column per person holding
// (paid − owed) for that row, and a closing "Total balance" row per currency.
import { computeBalances } from './math';

const toPaise = (n: number) => Math.round(n * 100);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** RFC-4180-ish: quoted fields, "" escapes, CRLF, leading BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export interface SplitwiseRow { date: string; description: string; category: string; cost: number; currency: string; nets: number[] }
export interface ParsedSplitwise { members: string[]; rows: SplitwiseRow[]; currency: string; totals: number[] | null }

const num = (v: string) => {
  const n = parseFloat((v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};

function toYmd(v: string): string {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

export function parseSplitwise(text: string): ParsedSplitwise {
  const all = parseCsv(text).filter(r => r.some(c => c.trim() !== ''));
  const header = all[0]?.map(h => h.trim()) ?? [];
  const fixed = ['date', 'description', 'category', 'cost', 'currency'];
  if (header.length < 7 || fixed.some((f, i) => header[i]?.toLowerCase() !== f)) {
    throw new Error("This doesn't look like a Splitwise group export (expected Date, Description, Category, Cost, Currency, then people).");
  }
  const members = header.slice(5);
  const rows: SplitwiseRow[] = [];
  const totalsByCurrency = new Map<string, number[]>();
  for (const r of all.slice(1)) {
    const nets = members.map((_, i) => num(r[5 + i]));
    const currency = (r[4] ?? '').trim().toUpperCase();
    if ((r[1] ?? '').trim().toLowerCase() === 'total balance') { totalsByCurrency.set(currency, nets); continue; }
    rows.push({ date: toYmd(r[0] ?? ''), description: (r[1] ?? '').trim() || 'Expense', category: (r[2] ?? '').trim(), cost: num(r[3]), currency, nets });
  }
  const counts = new Map<string, number>();
  rows.forEach(r => counts.set(r.currency, (counts.get(r.currency) ?? 0) + 1));
  // The app is INR-only: import the INR rows; anything else is skipped and reported.
  const currency = counts.has('INR') ? 'INR' : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'INR';
  return { members, rows, currency, totals: totalsByCurrency.get(currency) ?? null };
}

export interface ImportedExpense { date: string; description: string; category: string; amount: number; paidBy: number; shares: Record<number, number> }
export interface ImportedSettlement { date: string; from: number; to: number; amount: number; note: string }

/**
 * Rebuilds expenses + payments that reproduce every row's (paid − owed) exactly.
 * One payer P = the largest positive net: debtors owe −net, P's share = cost − Σ(positive nets);
 * any other positive-net person Q paid part of the bill, recorded as a Q→P payment of net_Q.
 */
export function splitwiseToLedger(p: ParsedSplitwise) {
  const expenses: ImportedExpense[] = [];
  const settlements: ImportedSettlement[] = [];
  const skipped = { zero: 0, otherCurrency: 0 };

  for (const row of p.rows) {
    if (row.currency !== p.currency) { skipped.otherCurrency++; continue; }
    const nets = row.nets.map(toPaise);
    const pos = nets.map((v, i) => [i, v] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const neg = nets.map((v, i) => [i, v] as const).filter(([, v]) => v < 0);
    if (pos.length === 0 || neg.length === 0) { skipped.zero++; continue; }

    const isPayment = row.category.toLowerCase() === 'payment';
    if (isPayment) {
      // Typically one payer and one payee; pair them greedily if there are more.
      const credit = pos.map(([i, v]) => ({ i, v })), debit = neg.map(([i, v]) => ({ i, v: -v }));
      while (credit.length && debit.length) {
        const amt = Math.min(credit[0].v, debit[0].v);
        settlements.push({ date: row.date, from: credit[0].i, to: debit[0].i, amount: amt / 100, note: row.description });
        credit[0].v -= amt; debit[0].v -= amt;
        if (!credit[0].v) credit.shift();
        if (!debit[0].v) debit.shift();
      }
      continue;
    }

    const [payer] = pos[0];
    const sumPos = pos.reduce((a, [, v]) => a + v, 0);
    const debts = neg.reduce((a, [, v]) => a - v, 0);
    const cost = Math.max(toPaise(row.cost), debts); // never smaller than what's owed
    const shares: Record<number, number> = {};
    for (const [i, v] of neg) shares[i] = -v / 100;
    const payerShare = cost - sumPos;
    if (payerShare > 0) shares[payer] = payerShare / 100;
    expenses.push({ date: row.date, description: row.description, category: row.category, amount: cost / 100, paidBy: payer, shares: sortKeys(shares) });
    for (const [q, v] of pos.slice(1)) settlements.push({ date: row.date, from: q, to: payer, amount: v / 100, note: `${row.description} (paid part)` });
  }

  const rebuilt = computeBalances(p.members.map((_, i) => String(i)),
    expenses.map(e => ({ paidBy: String(e.paidBy), shares: Object.fromEntries(Object.entries(e.shares)) })),
    settlements.map(s => ({ from: String(s.from), to: String(s.to), amount: s.amount })));
  const balances = p.members.map((_, i) => r2(rebuilt[String(i)] ?? 0));
  const balanceMismatch = !!p.totals && p.totals.some((t, i) => Math.abs(t - balances[i]) > 0.05);
  return { expenses, settlements, skipped, balances, balanceMismatch };
}

const sortKeys = (o: Record<number, number>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => Number(a) - Number(b)));
