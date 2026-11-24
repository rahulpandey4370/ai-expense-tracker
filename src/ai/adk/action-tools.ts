import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { addTransaction, deleteTransaction, getCategories, getPaymentMethods, getTransactionById, updateTransaction } from '@/lib/actions/transactions';
import { getSplitBalances, settleAllForUser, settleSplitShare } from '@/lib/actions/splits';
import { getRecurringRules, updateRecurringRule } from '@/lib/actions/recurring';
import { canonicalizeDescription } from '@/lib/merchants';
import type { AppTransaction, TransactionInput } from '@/lib/types';
import type { ActionPreview } from '@/lib/chat-types';
import { getSessionUser } from '@/lib/auth/supabase-server';
import { attachReceipt, getGroup, getHome, saveExpense, type SaveExpenseInput } from '@/lib/split/service';
import { resolveShares } from '@/lib/split/math';
import { emojiFor } from '@/lib/split/emoji';

/*
 * Tools that change data. Each one is gated by ADK's requireConfirmation: the
 * run pauses, the chat shows a Confirm/Cancel card, and the tool only runs once
 * the user taps Confirm. Bad input (an unknown category, a missing id) skips the
 * card and comes straight back to the model as an error, so the user is never
 * asked to approve something that cannot work.
 */

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD');
const expenseTypes = ['need', 'want', 'investment'] as const;

const txFields = {
  type: z.enum(['income', 'expense']),
  date: ymd,
  amount: z.number().positive(),
  description: z.string().min(1).max(300).describe('Written in the TRANSACTION DESCRIPTIONS format from your instructions, e.g. "🍽️ Zomato: Chicken Biryani"'),
  categoryName: z.string().optional().describe('Exact category name; required for expenses'),
  paymentMethodName: z.string().optional().describe('Exact payment method name; required for expenses'),
  expenseType: z.enum(expenseTypes).optional().describe('Required for expenses'),
  source: z.string().optional().describe('Income source, e.g. "Salary"'),
};
const NewTx = z.object(txFields);
type NewTx = z.infer<typeof NewTx>;

/** Noon IST keeps the calendar day the same wherever the server runs. */
const toDate = (d: string) => new Date(`${d}T12:00:00+05:30`);

async function lookups() {
  const [cats, pms] = await Promise.all([getCategories(), getPaymentMethods()]);
  const cat = (name: string | undefined, type: 'income' | 'expense') =>
    name ? cats.find(c => c.type === type && c.name.toLowerCase() === name.toLowerCase()) : undefined;
  const pm = (name: string | undefined) => (name ? pms.find(p => p.name.toLowerCase() === name.toLowerCase()) : undefined);
  return { cat, pm };
}

/** Resolves names to ids; returns either a TransactionInput or the reasons it can't be one. */
async function toInput(t: NewTx): Promise<{ input?: TransactionInput; problems: string[] }> {
  const { cat, pm } = await lookups();
  const problems: string[] = [];
  const category = cat(t.categoryName, t.type);
  const method = pm(t.paymentMethodName);
  if (t.categoryName && !category) problems.push(`no ${t.type} category named "${t.categoryName}"`);
  if (t.paymentMethodName && !method) problems.push(`no payment method named "${t.paymentMethodName}"`);
  if (t.type === 'expense') {
    if (!t.categoryName) problems.push('expenses need a categoryName');
    if (!t.paymentMethodName) problems.push('expenses need a paymentMethodName');
    if (!t.expenseType) problems.push('expenses need an expenseType');
  }
  if (problems.length) return { problems };
  return {
    problems,
    input: {
      type: t.type, date: toDate(t.date), amount: t.amount, description: canonicalizeDescription(t.description),
      categoryId: category?.id, paymentMethodId: method?.id,
      source: t.type === 'income' ? t.source : undefined,
      expenseType: t.type === 'expense' ? t.expenseType : undefined,
    },
  };
}

/** What the Undo button needs to put a deleted transaction back. */
export function snapshotOf(t: AppTransaction): TransactionInput {
  return {
    type: t.type, date: t.date, amount: t.amount, description: t.description,
    categoryId: t.category?.id, paymentMethodId: t.paymentMethod?.id, source: t.source,
    expenseType: t.expenseType, myShare: t.myShare, paidById: t.paidBy?.id ?? t.paidById,
    splitMethod: t.splitMethod, splits: (t.splits ?? []).map(s => ({ userId: s.userId, shareAmount: s.shareAmount })),
  };
}

// ADK types zod against its own bundled copy; same runtime API, so bridge once.
const gated = (opts: { name: string; description: string; parameters: z.ZodTypeAny; valid: (i: any) => Promise<boolean>; execute: (i: any) => Promise<unknown> }) =>
  new FunctionTool({
    name: opts.name, description: opts.description, parameters: opts.parameters as any,
    requireConfirmation: (async (i: any) => opts.valid(i)) as any,
    execute: opts.execute as any,
  });

export const addTransactionsTool = gated({
  name: 'add_transactions',
  description:
    'Add one or more transactions (max 50). The user sees a Confirm card first; only call it with the final values. ' +
    'Use exact category and payment method names from list_categories_and_payment_methods. ' +
    'If an earlier call returned problems, fix them before calling again.',
  parameters: z.object({ transactions: z.array(NewTx).min(1).max(50) }),
  valid: async ({ transactions }) => (await Promise.all(transactions.map(toInput))).every(r => r.problems.length === 0),
  execute: async ({ transactions }: { transactions: NewTx[] }) => {
    const resolved = await Promise.all(transactions.map(toInput));
    const problems = resolved.flatMap((r, i) => r.problems.map(p => `row ${i + 1}: ${p}`));
    if (problems.length) return { added: 0, problems };
    const added = [];
    for (const r of resolved) {
      const t = await addTransaction(r.input!);
      added.push({ id: t.id, description: t.description, amount: t.amount });
    }
    return { added: added.length, transactions: added };
  },
});

export const updateTransactionTool = gated({
  name: 'update_transaction',
  description:
    'Change fields of one existing transaction (get its id from search_transactions). Only pass the fields that change. ' +
    'The user sees a Confirm card with old and new values first.',
  parameters: z.object({
    id: z.string(),
    changes: z.object({
      date: ymd.optional(), amount: z.number().positive().optional(), description: z.string().min(1).max(300).optional().describe('Written in the TRANSACTION DESCRIPTIONS format from your instructions, e.g. "🍽️ Zomato: Chicken Biryani"'),
      categoryName: z.string().optional(), paymentMethodName: z.string().optional(),
      expenseType: z.enum(expenseTypes).optional(), source: z.string().optional(),
    }),
  }),
  valid: async ({ id, changes }) => {
    const current = await getTransactionById(id);
    if (!current || !Object.keys(changes ?? {}).length) return false;
    const { cat, pm } = await lookups();
    return (!changes.categoryName || !!cat(changes.categoryName, current.type)) && (!changes.paymentMethodName || !!pm(changes.paymentMethodName));
  },
  execute: async ({ id, changes }) => {
    const current = await getTransactionById(id);
    if (!current) return { updated: false, problem: `No transaction with id ${id}. Search again for the right id.` };
    const { cat, pm } = await lookups();
    const patch: Partial<TransactionInput> = {};
    if (changes.date) patch.date = toDate(changes.date);
    if (changes.amount != null) patch.amount = changes.amount;
    if (changes.description) patch.description = canonicalizeDescription(changes.description);
    if (changes.source != null) patch.source = changes.source;
    if (changes.expenseType) patch.expenseType = changes.expenseType;
    if (changes.categoryName) {
      const c = cat(changes.categoryName, current.type);
      if (!c) return { updated: false, problem: `No ${current.type} category named "${changes.categoryName}".` };
      patch.categoryId = c.id;
    }
    if (changes.paymentMethodName) {
      const p = pm(changes.paymentMethodName);
      if (!p) return { updated: false, problem: `No payment method named "${changes.paymentMethodName}".` };
      patch.paymentMethodId = p.id;
    }
    if (!Object.keys(patch).length) return { updated: false, problem: 'Nothing to change.' };
    const t = await updateTransaction(id, patch);
    return { updated: true, id: t.id, description: t.description, amount: t.amount };
  },
});

export const deleteTransactionTool = gated({
  name: 'delete_transaction',
  description: 'Delete one transaction by id (from search_transactions). The user sees a Confirm card, and gets an Undo button afterwards.',
  parameters: z.object({ id: z.string() }),
  valid: async ({ id }) => !!(await getTransactionById(id)),
  execute: async ({ id }) => {
    const current = await getTransactionById(id);
    if (!current) return { deleted: false, problem: `No transaction with id ${id}.` };
    await deleteTransaction(id);
    return { deleted: true, description: current.description, amount: current.amount, undo: snapshotOf(current) };
  },
});

export const settleSplitTool = gated({
  name: 'settle_split',
  description:
    'Mark money a person owes the user as paid back. With transactionId, settles that person\'s share of one split expense; ' +
    'without it, settles everything that person owes. Person names come from get_split_balances.',
  parameters: z.object({ personName: z.string(), transactionId: z.string().optional() }),
  valid: async ({ personName }) => (await getSplitBalances()).some(b => b.userName.toLowerCase() === String(personName).toLowerCase()),
  execute: async ({ personName, transactionId }) => {
    const person = (await getSplitBalances()).find(b => b.userName.toLowerCase() === personName.toLowerCase());
    if (!person) return { settled: false, problem: `No open balance with "${personName}".` };
    if (transactionId) {
      await settleSplitShare(transactionId, person.userId);
      return { settled: true, person: person.userName, transactionId };
    }
    const { successCount } = await settleAllForUser(person.userId);
    return { settled: true, person: person.userName, sharesSettled: successCount };
  },
});

// ---------- group split expenses ----------

const SplitArgs = z.object({
  groupName: z.string().describe('Exact split group name from list_split_groups (fuzzy is OK: "goa" → "Goa trip")'),
  description: z.string().min(1).max(120).describe('Short, e.g. "Dinner at Ramiro"'),
  amount: z.number().positive().describe('Total in INR'),
  date: ymd.optional(),
  paidByName: z.string().optional().describe('Who paid; omit if the user paid'),
  participantNames: z.array(z.string()).max(50).optional().describe('Who shares it (the user is "me"); omit = everyone in the group'),
  method: z.enum(['equal', 'exact', 'percent', 'shares', 'cover']).default('equal'),
  values: z.array(z.object({ name: z.string(), value: z.number().min(0) })).optional().describe('exact rupees / percent / share weights per person (name "me" = the user)'),
  coveredByName: z.string().optional().describe('For method "cover": who owes the whole bill'),
  categoryName: z.string().optional().describe('To also count the user\'s share in their spending (with paymentMethodName + expenseType)'),
  paymentMethodName: z.string().optional(),
  expenseType: z.enum(expenseTypes).optional(),
  receiptFilename: z.string().optional().describe('An attached receipt photo to keep on the expense, e.g. attachment-1.jpeg'),
});
type SplitArgs = z.infer<typeof SplitArgs>;

const norm = (x: string) => x.trim().toLowerCase();

/** Names → ids in the user's groups; never creates people. Returns the save input or the problems. */
async function resolveSplit(a: SplitArgs): Promise<{ problems: string[]; input?: SaveExpenseInput; groupName?: string; names?: Record<string, string> }> {
  const user = await getSessionUser();
  if (!user?.isOwner) return { problems: ['only the owner can add split expenses from chat'] };
  const groups = (await getHome(user)).groups.filter(g => !g.archived);
  const want = norm(a.groupName);
  const g = groups.find(x => norm(x.name) === want) ?? groups.find(x => norm(x.name).includes(want) || want.includes(norm(x.name)));
  if (!g) return { problems: [`no split group named "${a.groupName}" (groups: ${groups.map(x => x.name).join(', ') || 'none'})`] };
  const d = await getGroup({ user }, g.id);
  const active = d.members.filter(m => !m.removed);
  const me = d.meMemberId!;
  const find = (n?: string) => {
    if (!n) return undefined;
    const k = norm(n);
    if (['me', 'i', 'myself', 'you', user.name.toLowerCase()].includes(k)) return me;
    return (active.find(m => norm(m.name) === k) ?? active.find(m => norm(m.name).split(' ')[0] === k.split(' ')[0]))?.id;
  };
  const problems: string[] = [];
  const unknown = (n: string) => problems.push(`"${n}" isn't in ${g.name} (members: ${active.map(m => m.name).join(', ')})`);
  const paidBy = a.paidByName ? find(a.paidByName) : me;
  if (!paidBy) unknown(a.paidByName!);
  const participants = a.participantNames?.length
    ? [...new Set(a.participantNames.map(n => find(n) ?? (unknown(n), '')).filter(Boolean))]
    : active.map(m => m.id);
  const values: Record<string, number> = {};
  for (const v of a.values ?? []) { const id = find(v.name); if (id) values[id] = v.value; else unknown(v.name); }
  const coveredBy = a.method === 'cover' ? find(a.coveredByName) : undefined;
  if (a.method === 'cover' && !coveredBy) problems.push('method "cover" needs coveredByName from the group');
  if (problems.length) return { problems };
  const parts = a.method === 'exact' || a.method === 'percent' || a.method === 'shares' ? [...new Set([...participants, ...Object.keys(values)])] : participants;
  const check = resolveShares(a.amount, a.method, { participants: parts, values, coveredBy });
  if (check.error) return { problems: [check.error] };

  let spending: SaveExpenseInput['spending'];
  if (a.categoryName || a.paymentMethodName) {
    const { cat, pm } = await lookups();
    const c = cat(a.categoryName, 'expense'), p = pm(a.paymentMethodName);
    if (!c || !p || !a.expenseType) return { problems: ['to count it in spending give an exact categoryName, paymentMethodName and expenseType (or omit all three)'] };
    spending = { categoryId: c.id, paymentMethodId: p.id, expenseType: a.expenseType };
  }
  const names = Object.fromEntries(active.map(m => [m.id, m.id === me ? 'You' : m.name]));
  return {
    problems: [], groupName: g.name, names,
    input: {
      groupId: g.id, description: a.description, amount: a.amount, date: a.date ?? new Date().toISOString().slice(0, 10),
      emoji: emojiFor(a.description), method: a.method, paidBy: paidBy!, participants: parts, values, coveredBy, spending,
    },
  };
}

export const addSplitExpenseTool = gated({
  name: 'add_split_expense',
  description:
    'Log a shared expense in one of the user\'s split groups (everyone in the group sees it). The user sees a Confirm card first. ' +
    'Use when the user says to split something / add it to a group. Names are matched to group members; never invent people. ' +
    'If a receipt photo is attached, pass receiptFilename so it is kept on the expense.',
  parameters: SplitArgs,
  valid: async (a: SplitArgs) => (await resolveSplit(a)).problems.length === 0,
  execute: async (a: SplitArgs, ctx?: any) => {
    const r = await resolveSplit(a);
    if (r.problems.length) return { added: false, problems: r.problems };
    const user = (await getSessionUser())!;
    const { id } = await saveExpense({ user }, { ...r.input!, said: undefined });
    let receipt = 'none';
    if (a.receiptFilename && ctx?.loadArtifact) {
      const part = await ctx.loadArtifact(a.receiptFilename).catch(() => null);
      const data = part?.inlineData;
      if (data?.data) {
        receipt = await attachReceipt({ user }, { groupId: r.input!.groupId, expenseId: id, dataUri: `data:${data.mimeType};base64,${data.data}` })
          .then(() => 'attached', (e: Error) => `not attached: ${e.message}`);
      }
    }
    return { added: true, group: r.groupName, expenseId: id, inSpending: !!r.input!.spending, receipt };
  },
});

export const listSplitGroupsTool = new FunctionTool({
  name: 'list_split_groups',
  description: "The user's split groups with their members and the user's balance in each (positive = they're owed).",
  parameters: z.object({}) as any,
  execute: async () => {
    const user = await getSessionUser();
    if (!user) return { groups: [] };
    const home = await getHome(user);
    return { groups: home.groups.filter(g => !g.archived).map(g => ({ name: g.name, members: g.memberNames, myBalance: g.myBalance })) };
  },
});

export const setRecurringActiveTool = gated({
  name: 'set_recurring_active',
  description: 'Pause (active=false) or resume (active=true) a recurring rule by id, from get_recurring_rules.',
  parameters: z.object({ ruleId: z.string(), active: z.boolean() }),
  valid: async ({ ruleId }) => (await getRecurringRules()).some(r => r.id === ruleId),
  execute: async ({ ruleId, active }) => {
    const rule = await updateRecurringRule(ruleId, { isActive: active });
    return { updated: true, description: rule.description, active: rule.isActive };
  },
});

export const ACTION_TOOLS = [addTransactionsTool, updateTransactionTool, deleteTransactionTool, settleSplitTool, addSplitExpenseTool, listSplitGroupsTool, setRecurringActiveTool];


const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const day = (d: Date | string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const human = (t: AppTransaction) => `${t.description} · ${inr(t.amount)} · ${day(t.date)}`;

export async function previewAction(name: string, args: any): Promise<ActionPreview> {
  switch (name) {
    case 'add_split_expense': {
      const r = await resolveSplit(SplitArgs.parse(args));
      const i = r.input;
      if (!i) return { title: 'Add this split?', lines: [{ label: 'Problem', value: r.problems.join('; ') }] };
      const who = (id: string) => r.names?.[id] ?? id;
      const how = i.method === 'cover' ? `${who(i.coveredBy!)} covers it`
        : i.method === 'equal' ? `Equally: ${i.participants.map(who).join(', ')}`
        : `${i.method}: ${Object.entries(i.values ?? {}).map(([k, v]) => `${who(k)} ${v}`).join(', ')}`;
      return {
        title: `Add this to ${r.groupName}?`,
        lines: [
          { label: 'Amount', value: inr(i.amount) },
          { label: 'Description', value: i.description },
          { label: 'Paid by', value: who(i.paidBy) },
          { label: 'Split', value: how },
          ...(i.spending ? [{ label: 'Your spending', value: 'Your share is added to transactions' }] : []),
          ...(args.receiptFilename ? [{ label: 'Receipt', value: 'Attached photo is kept' }] : []),
        ],
      };
    }
    case 'add_transactions': {
      const txs: NewTx[] = args.transactions ?? [];
      if (txs.length === 1) {
        // One transaction reads better as labelled lines than as a sideways-scrolling table.
        const t = txs[0];
        return {
          title: 'Add this transaction?',
          lines: [
            { label: 'Date', value: day(t.date) },
            { label: 'Amount', value: `${t.type === 'income' ? '+' : '−'}${inr(t.amount)}` },
            { label: 'Description', value: canonicalizeDescription(t.description) },
            { label: t.type === 'income' ? 'Source' : 'Category', value: (t.type === 'income' ? t.source ?? t.categoryName : t.categoryName) ?? '—' },
            ...(t.paymentMethodName ? [{ label: 'Paid with', value: t.paymentMethodName }] : []),
            ...(t.expenseType ? [{ label: 'Type', value: t.expenseType[0].toUpperCase() + t.expenseType.slice(1) }] : []),
          ],
        };
      }
      return {
        title: txs.length === 1 ? 'Add this transaction?' : `Add these ${txs.length} transactions?`,
        lines: [],
        rows: txs.map(t => [day(t.date), `${t.type === 'income' ? '+' : '−'}${inr(t.amount)}`, canonicalizeDescription(t.description), t.categoryName ?? t.source ?? '', t.paymentMethodName ?? '', t.expenseType ?? '']),
      };
    }
    case 'update_transaction': {
      const current = await getTransactionById(args.id);
      const c = args.changes ?? {};
      const before: Record<string, string | undefined> = current ? {
        date: day(current.date), amount: inr(current.amount), description: current.description,
        categoryName: current.category?.name, paymentMethodName: current.paymentMethod?.name, expenseType: current.expenseType, source: current.source,
      } : {};
      const label: Record<string, string> = { date: 'Date', amount: 'Amount', description: 'Description', categoryName: 'Category', paymentMethodName: 'Paid with', expenseType: 'Type', source: 'Source' };
      return {
        title: 'Change this transaction?',
        lines: [
          ...(current ? [{ label: 'Transaction', value: human(current) }] : []),
          ...Object.entries(c).map(([k, v]) => ({
            label: label[k] ?? k,
            value: `${before[k] ?? '—'} → ${k === 'amount' ? inr(Number(v)) : k === 'date' ? day(String(v)) : k === 'description' ? canonicalizeDescription(String(v)) : String(v)}`,
          })),
        ],
      };
    }
    case 'delete_transaction': {
      const current = await getTransactionById(args.id);
      return { title: 'Delete this transaction?', lines: [{ label: 'Transaction', value: current ? human(current) : args.id }], danger: true };
    }
    case 'settle_split': {
      const person = (await getSplitBalances()).find(b => b.userName.toLowerCase() === String(args.personName).toLowerCase());
      const t = args.transactionId ? await getTransactionById(args.transactionId) : null;
      return {
        title: `Mark ${person?.userName ?? args.personName} as paid back?`,
        lines: t ? [{ label: 'For', value: human(t) }] : [{ label: 'Settles', value: `everything they owe${person ? ` (${inr(person.theyOweMe)})` : ''}` }],
      };
    }
    case 'set_recurring_active': {
      const rule = (await getRecurringRules()).find(r => r.id === args.ruleId);
      return {
        title: `${args.active ? 'Resume' : 'Pause'} this recurring entry?`,
        lines: [{ label: 'Rule', value: rule ? `${rule.description} · ${inr(rule.amount)} on day ${rule.dayOfMonth}` : args.ruleId }],
      };
    }
    default:
      return { title: `Run ${name}?`, lines: [] };
  }
}
