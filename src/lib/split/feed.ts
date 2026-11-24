// Home feed filters: group, person, date range (inclusive YYYY-MM-DD). Pure, shared by the UI and its check.
import type { ActivityItem } from './types';

export interface FeedFilter { groupId?: string; person?: string; from?: string; to?: string }

export function filterActivity(items: ActivityItem[], f: FeedFilter): ActivityItem[] {
  return items.filter(i =>
    (!f.groupId || i.groupId === f.groupId)
    && (!f.person || i.people.includes(f.person))
    && (!f.from || i.date >= f.from)
    && (!f.to || i.date <= f.to));
}

/** My net across these entries (+ = owed to me). A payment's myImpact is "received/paid back", the opposite sign. */
export const feedNet = (items: ActivityItem[]) =>
  Math.round(items.reduce((s, a) => s + (a.kind === 'settlement' ? -a.myImpact : a.myImpact), 0) * 100) / 100;

/** Months with activity, newest first (YYYY-MM). */
export const feedMonths = (items: ActivityItem[]) => [...new Set(items.map(i => i.date.slice(0, 7)))].sort().reverse();

export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}

/** One page of a list (default 50); an out-of-range page snaps to the nearest real one. */
export function pageOf<T>(items: T[], page: number, size = 50): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(p * size, (p + 1) * size), page: p, pages };
}
