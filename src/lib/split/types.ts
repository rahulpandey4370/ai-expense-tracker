// Shapes returned by /api/split — shared by server and client.
import type { SplitItem, SplitMethod, Transfer } from './math';

export type { SplitItem, SplitMethod, Transfer };
export type GroupKind = 'trip' | 'home' | 'couple' | 'other' | 'direct';

export interface Member {
  id: string;
  name: string;
  email: string | null;
  upiId: string | null;
  isOwner: boolean;
  hasAccount: boolean;
  removed: boolean;
}

export interface ExpenseMeta {
  participants?: string[];
  values?: Record<string, number>;
  items?: SplitItem[];
  coveredBy?: string;
  imported?: string | boolean;
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  emoji: string | null;
  method: SplitMethod;
  paidBy: string;
  createdBy: string | null;
  shares: Record<string, number>;
  meta: ExpenseMeta;
  inMySpending: boolean;
  createdAt: string;
}

export interface Settlement {
  id: string;
  from: string;
  to: string;
  amount: number;
  date: string;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface GroupInfo {
  id: string;
  name: string;
  emoji: string | null;
  kind: GroupKind;
  currency: string;
  archived: boolean;
}

export interface GroupDetail {
  group: GroupInfo;
  members: Member[];
  expenses: Expense[];
  settlements: Settlement[];
  balances: Record<string, number>;
  transfers: Transfer[];
  meMemberId: string | null;
  /** Signed-in members can manage the link, members and the group; link guests cannot. */
  canManage: boolean;
  isOwnerViewer: boolean;
  shareToken: string | null;
}

export interface GroupSummary extends GroupInfo {
  myBalance: number;
  myShareTotal: number;
  memberCount: number;
  totalSpent: number;
  lastActivity: string;
}

export interface PersonBalance {
  key: string;
  name: string;
  net: number; // positive = they owe me
  groups: { groupId: string; groupName: string; net: number }[];
}

export interface ActivityItem {
  id: string;
  groupId: string;
  groupName: string;
  kind: 'expense' | 'settlement';
  title: string;
  who: string;
  amount: number;
  myImpact: number; // + I get back / lent, − I owe / paid back
  at: string;
}

export interface HomeData {
  me: { name: string; email: string; isOwner: boolean };
  totals: { owed: number; owe: number };
  groups: GroupSummary[];
  people: PersonBalance[];
  activity: ActivityItem[];
  /** My share of group spending per month, oldest first. */
  spentByMonth: { month: string; amount: number }[];
  /** Expenses that include me but aren't in my personal spending yet (owner only). */
  unlinked: { groupId: string; groupName: string; expenseId: string; description: string; myShare: number; date: string }[];
}
