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

/** Months with activity, newest first (YYYY-MM). */
export const feedMonths = (items: ActivityItem[]) => [...new Set(items.map(i => i.date.slice(0, 7)))].sort().reverse();

export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, '0')}` };
}
