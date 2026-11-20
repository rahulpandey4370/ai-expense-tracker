// Browser-side exports: CSV of any list, and a one-page monthly statement PDF.
import type { AppTransaction } from '@/lib/types';
import { netAmount } from '@/lib/split-utils';

/** One CSV cell: quoted when needed, and never read as a formula by Excel or Sheets. */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: unknown[][]): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

/** Saves a file. The BOM makes Excel read ₹ and emoji as UTF-8. */
export function downloadFile(name: string, content: string | Blob, type = 'text/csv;charset=utf-8') {
  const blob = typeof content === 'string' ? new Blob(['﻿', content], { type }) : content;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// jsPDF's built-in font has no ₹ or emoji, so the PDF writes "Rs" and drops emoji.
const rs = (n: number) => `Rs ${Math.round(n).toLocaleString('en-IN')}`;
const plain = (s: string) => s.replace(/[^\x20-\x7E]/g, '').replace(/\s+/g, ' ').trim();

/** One A4 page: totals, needs/wants/investments, top categories, largest expenses. */
export async function downloadMonthlyStatement(txs: AppTransaction[], label: string, fileName: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const L = 48, R = W - 48;
  let y = 56;

  const expenses = txs.filter(t => t.type === 'expense');
  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const spent = expenses.reduce((s, t) => s + netAmount(t), 0);
  const byType = (k: string) => expenses.filter(t => t.expenseType === k).reduce((s, t) => s + netAmount(t), 0);
  const cats = new Map<string, number>();
  expenses.forEach(t => cats.set(t.category?.name ?? 'Other', (cats.get(t.category?.name ?? 'Other') ?? 0) + netAmount(t)));

  const text = (s: string, x: number, opts: { size?: number; bold?: boolean; right?: boolean; color?: number } = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size ?? 10);
    doc.setTextColor(opts.color ?? 20);
    doc.text(s, x, y, opts.right ? { align: 'right' } : undefined);
  };
  const rule = () => { doc.setDrawColor(210); doc.line(L, y, R, y); };
  const heading = (s: string) => { y += 26; text(s, L, { size: 11, bold: true }); y += 6; rule(); y += 14; };

  text('FinWise statement', L, { size: 18, bold: true });
  text(label, R, { size: 12, right: true, color: 90 });
  y += 14;
  text(`${txs.length} transactions. Amounts are your share, net of splits.`, L, { size: 9, color: 110 });

  heading('Summary');
  const savings = income - spent;
  [
    ['Income', rs(income)],
    ['Expenses', rs(spent)],
    ['Saved', `${rs(savings)}${income > 0 ? `  (${Math.round((savings / income) * 100)}% of income)` : ''}`],
    ['Needs / Wants / Investments', `${rs(byType('need'))} / ${rs(byType('want'))} / ${rs(byType('investment'))}`],
  ].forEach(([k, v]) => { text(k, L); text(v, R, { right: true, bold: true }); y += 16; });

  heading('Top categories');
  [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([name, amt]) => {
    text(plain(name) || 'Other', L);
    text(spent > 0 ? `${Math.round((amt / spent) * 100)}%` : '', R - 110, { right: true, color: 110 });
    text(rs(amt), R, { right: true });
    y += 15;
  });

  heading('Largest expenses');
  [...expenses].sort((a, b) => netAmount(b) - netAmount(a)).slice(0, 12).forEach(t => {
    const d = new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
    text(d, L, { color: 110 });
    const desc = plain(t.description) || plain(t.category?.name ?? '') || 'Expense';
    text(doc.splitTextToSize(desc, R - L - 170)[0], L + 50);
    text(rs(netAmount(t)), R, { right: true });
    y += 15;
  });

  y = doc.internal.pageSize.getHeight() - 36;
  text(`Made by FinWise on ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}. The full list is in the CSV export.`, L, { size: 8, color: 140 });
  downloadFile(fileName, doc.output('blob'));
}
