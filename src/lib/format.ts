/**
 * Single source of truth for how money, percentages, and counts are rendered.
 *
 * Before this existed the app mixed `toFixed(2)`, `toFixed(0)`, and raw
 * `toLocaleString()` across pages, so the same ₹1,40,619 showed up as
 * "₹140619.00" on the dashboard and "₹1,40,619.00" two screens later.
 * Everything user-facing should go through these helpers.
 */

const INR = 'en-IN';

const currencyFull = new Intl.NumberFormat(INR, {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyWhole = new Intl.NumberFormat(INR, {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const decimalWhole = new Intl.NumberFormat(INR, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * ₹1,40,619.00 — use where exact paise matter (transaction rows, ledgers).
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '₹0.00';
  return currencyFull.format(value);
}

/**
 * ₹1,40,619 — use for totals and KPI values where paise are noise.
 */
export function formatCurrencyWhole(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '₹0';
  return currencyWhole.format(value);
}

/**
 * ₹1.41L / ₹12.4Cr / ₹8,450 — Indian short scale, for tight spaces like KPI
 * tiles on a phone and chart axis ticks. Falls back to the grouped form below
 * ₹1 lakh, where abbreviating costs precision without saving space.
 */
export function formatCurrencyCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '₹0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_00_00_000) return `${sign}₹${trim(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${trim(abs / 1_00_000)}L`;
  if (abs >= 1_000) return `${sign}₹${decimalWhole.format(Math.round(abs))}`;
  return `${sign}₹${trim(abs)}`;
}

/** Compact form without the ₹, for chart axes that already label the unit. */
export function formatNumberCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  return formatCurrencyCompact(value).replace('₹', '');
}

/** 34.9% — one decimal by default, since budget ratios turn on tenths. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0%';
  return `${value.toFixed(digits)}%`;
}

/** +12.4% / −8.0% — signed, for month-over-month deltas. */
export function formatDelta(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

/**
 * Percentage change from `previous` to `current`.
 * Returns null when there's no baseline — a jump from ₹0 to ₹500 isn't
 * "infinity percent", it's "new", and callers should say so.
 */
export function percentChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

/** 1,234 — grouped integer, for transaction counts and holdings counts. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  return decimalWhole.format(value);
}

function trim(n: number): string {
  // 1.4 not 1.40, but 1.41 stays 1.41 — two significant decimals, no trailing zeros.
  return String(Number(n.toFixed(2)));
}
