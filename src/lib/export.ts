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

type Row = { name: string; amount: number; count: number };
const groupBy = (txs: AppTransaction[], key: (t: AppTransaction) => string, amount: (t: AppTransaction) => number): Row[] => {
  const m = new Map<string, Row>();
  for (const t of txs) {
    const k = key(t) || 'Other';
    const r = m.get(k) ?? { name: k, amount: 0, count: 0 };
    r.amount += amount(t); r.count++;
    m.set(k, r);
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
};

/**
 * The monthly statement: headline numbers, then needs/wants/investments, categories,
 * payment methods, income sources, split expenses and the largest expenses. Expense
 * amounts are the user's share (net of splits). Flows onto more pages when needed.
 */
export async function monthlyStatementPdf(txs: AppTransaction[], label: string, fileName: string): Promise<File> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const L = 44, R = W - 44, BOTTOM = H - 48;
  const TEAL: [number, number, number] = [20, 140, 140];
  let y = 0;

  const expenses = txs.filter(t => t.type === 'expense');
  const incomes = txs.filter(t => t.type === 'income');
  const income = incomes.reduce((s, t) => s + t.amount, 0);
  const spent = expenses.reduce((s, t) => s + netAmount(t), 0);
  const saved = income - spent;
  // Days in the month, or the days so far when it is the current month.
  const ref = new Date(txs[0]?.date ?? Date.now()), now = new Date();
  const days = ref.getFullYear() === now.getFullYear() && ref.getMonth() === now.getMonth()
    ? now.getDate() : new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '');

  const text = (str: string, x: number, o: { size?: number; bold?: boolean; right?: boolean; gray?: number; maxW?: number } = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size ?? 9.5);
    doc.setTextColor(o.gray ?? 30);
    const s = o.maxW ? doc.splitTextToSize(str, o.maxW)[0] : str;
    doc.text(s, x, y, o.right ? { align: 'right' } : undefined);
  };
  const ensure = (space: number) => { if (y + space > BOTTOM) { doc.addPage(); y = 52; } };
  const section = (title: string, sub?: string) => {
    ensure(70);
    y += 26;
    text(title, L, { size: 12, bold: true, gray: 20 });
    if (sub) text(sub, R, { size: 8.5, right: true, gray: 120 });
    y += 7; doc.setDrawColor(215); doc.setLineWidth(0.6); doc.line(L, y, R, y); y += 14;
  };
  const bar = (x: number, w: number, frac: number) => {
    doc.setFillColor(232, 238, 238); doc.rect(x, y - 6.5, w, 6, 'F');
    doc.setFillColor(...TEAL); doc.rect(x, y - 6.5, Math.max(1, w * Math.min(1, frac)), 6, 'F');
  };
  // name | count | bar | % | amount
  const table = (all: Row[], total: number, unit = 'txns', max = 10) => {
    // Beyond `max` rows, the tail folds into one "Other" line.
    const rows = all.length > max
      ? [...all.slice(0, max - 1), all.slice(max - 1).reduce((o, r) => ({ name: `${all.length - max + 1} more`, amount: o.amount + r.amount, count: o.count + r.count }), { name: '', amount: 0, count: 0 })]
      : all;
    const top = Math.max(1, ...rows.map(r => r.amount));
    for (const r of rows) {
      ensure(18);
      text(plain(r.name) || 'Other', L, { maxW: 170 });
      text(`${r.count} ${r.count === 1 ? unit.replace(/s$/, '') : unit}`, L + 220, { right: true, gray: 120, size: 8.5 });
      bar(L + 232, 150, r.amount / top);
      text(pct(r.amount, total), R - 78, { right: true, gray: 110, size: 8.5 });
      text(rs(r.amount), R, { right: true, bold: true });
      y += 17;
    }
    if (!rows.length) { text('Nothing this month.', L, { gray: 130 }); y += 17; }
  };

  // Header band
  doc.setFillColor(...TEAL); doc.rect(0, 0, W, 64, 'F');
  y = 30; doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.text('FinWise', L, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text('Monthly statement', L, y + 16);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(label, R, y, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(`${txs.length} transactions`, R, y + 16, { align: 'right' });

  // Headline numbers
  y = 96;
  const tiles: [string, string, string][] = [
    ['Income', rs(income), `${incomes.length} credits`],
    ['Spent', rs(spent), `${expenses.length} debits`],
    ['Saved', rs(saved), income > 0 ? `${pct(saved, income)} of income` : ''],
    ['Daily average', rs(spent / Math.max(1, days)), `spent per day over ${days} days`],
  ];
  const tw = (R - L - 3 * 10) / 4;
  tiles.forEach(([k, v, sub], i) => {
    const x = L + i * (tw + 10);
    doc.setDrawColor(220); doc.setFillColor(248, 250, 250); doc.roundedRect(x, y - 18, tw, 52, 4, 4, 'FD');
    const yy = y; y = yy - 3; text(k, x + 8, { size: 8, gray: 110 });
    y = yy + 14; text(v, x + 8, { size: 12, bold: true });
    y = yy + 27; text(sub, x + 8, { size: 7.5, gray: 120 });
    y = yy;
  });
  y += 40;

  const byType = (k: string) => expenses.filter(t => t.expenseType === k);
  section('Where the money went', 'needs, wants and investments');
  table(
    [['Needs', 'need'], ['Wants', 'want'], ['Investments', 'investment']]
      .map(([name, k]) => ({ name, amount: byType(k).reduce((s, t) => s + netAmount(t), 0), count: byType(k).length }))
      .filter(r => r.count),
    spent,
  );

  const cats = groupBy(expenses, t => t.category?.name ?? 'Other', netAmount);
  section('Categories', `${cats.length} used`);
  table(cats, spent);

  section('Payment methods', 'how you paid');
  table(groupBy(expenses, t => t.paymentMethod?.name ?? 'Not set', netAmount), spent);

  section('Income', 'by source');
  table(groupBy(incomes, t => t.source || t.category?.name || 'Other', t => t.amount), income, 'credits', 6);

  const splits = expenses.filter(t => t.isSplit);
  if (splits.length) {
    const paid = splits.reduce((s, t) => s + t.amount, 0);
    const mine = splits.reduce((s, t) => s + netAmount(t), 0);
    const open = splits.flatMap(t => (t.splits ?? []).filter(x => !x.isSettled)).reduce((s, x) => s + (x.shareAmount ?? 0), 0);
    section('Split expenses', `${splits.length} shared`);
    ([['Total of shared bills', paid], ['Your share', mine], ['Still owed to you', open]] as const).forEach(([k, v]) => {
      ensure(18); text(k, L); text(rs(v), R, { right: true, bold: true }); y += 17;
    });
  }

  section('Largest expenses');
  ensure(16);
  text('Date', L, { size: 8, gray: 120 }); text('Description', L + 50, { size: 8, gray: 120 });
  text('Category · paid with', L + 300, { size: 8, gray: 120 }); text('Amount', R, { size: 8, gray: 120, right: true });
  y += 15;
  [...expenses].sort((a, b) => netAmount(b) - netAmount(a)).slice(0, 12).forEach(t => {
    ensure(17);
    text(new Date(t.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' }), L, { gray: 110 });
    text(plain(t.description) || 'Expense', L + 50, { maxW: 240 });
    text([t.category?.name, t.paymentMethod?.name].filter(Boolean).map(s => plain(s!)).join(' · '), L + 300, { size: 8, gray: 110, maxW: 150 });
    text(rs(netAmount(t)), R, { right: true, bold: true });
    y += 17;
  });

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    y = H - 24;
    text(`FinWise statement, ${label}. Amounts in rupees; expenses are your share after splits.`, L, { size: 7.5, gray: 140 });
    text(`Page ${i} of ${pages}`, R, { size: 7.5, gray: 140, right: true });
  }
  return new File([doc.output('blob')], fileName, { type: 'application/pdf' });
}
