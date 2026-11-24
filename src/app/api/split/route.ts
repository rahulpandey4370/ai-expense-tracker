// Single endpoint for the split ledger, used by the owner tab, the friend app and share links.
// POST { op, ...args }. Auth: Supabase session cookie and/or `x-split-token` share-link header.
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth/supabase-server';
import type { Access } from '@/lib/split/access';
import * as svc from '@/lib/split/service';

const id = z.string().min(1).max(64);
const name = z.string().trim().min(1).max(60);
const email = z.string().trim().email().max(200);
const money = z.number().positive().max(100_000_000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const kind = z.enum(['trip', 'home', 'couple', 'other', 'direct']);
const emoji = z.string().max(16).nullable().optional();
const asMember = id.nullable().optional();
const spending = z.object({
  categoryId: id, paymentMethodId: id, expenseType: z.enum(['need', 'want', 'investment', 'investment_expense']),
});

const Op = z.discriminatedUnion('op', [
  z.object({ op: z.literal('home') }),
  z.object({ op: z.literal('person'), key: z.string().min(1).max(220) }),
  z.object({ op: z.literal('group'), groupId: id.optional(), asMember }), // link guests omit groupId
  z.object({ op: z.literal('createGroup'), name, emoji, kind,
    members: z.array(z.object({ name, email: email.optional() })).max(50) }),
  z.object({ op: z.literal('updateGroup'), groupId: id, name: name.optional(), emoji, kind: kind.optional(), archived: z.boolean().optional() }),
  z.object({ op: z.literal('deleteGroup'), groupId: id }),
  z.object({ op: z.literal('addMember'), groupId: id, name, email: email.optional(), upiId: z.string().max(100).optional() }),
  z.object({ op: z.literal('updateMember'), groupId: id, memberId: id, name: name.optional(),
    email: email.nullable().optional(), upiId: z.string().max(100).nullable().optional() }),
  z.object({ op: z.literal('removeMember'), groupId: id, memberId: id }),
  z.object({ op: z.literal('saveExpense'), groupId: id, id: id.optional(), description: z.string().trim().min(1).max(120), said: z.string().max(600).optional(),
    amount: money, date, emoji, method: z.enum(['equal', 'exact', 'percent', 'shares', 'items', 'cover']), paidBy: id,
    participants: z.array(id).max(50), values: z.record(id, z.number().min(0).max(100_000_000)).optional(),
    items: z.array(z.object({ name: z.string().trim().max(80), amount: z.number().min(0).max(100_000_000), memberIds: z.array(id).max(50) })).max(100).optional(),
    coveredBy: id.optional(), asMember, spending: spending.optional(),
    paidWith: z.object({ id: id.optional(), name: z.string().trim().min(1).max(60) }).nullable().optional(),
    linkTransactionId: id.optional() }),
  z.object({ op: z.literal('expenseForTransaction'), transactionId: id }),
  z.object({ op: z.literal('deleteExpense'), groupId: id, expenseId: id }),
  z.object({ op: z.literal('linkToSpending'), groupId: id, expenseId: id, spending }),
  z.object({ op: z.literal('settle'), groupId: id, from: id, to: id, amount: money, date, note: z.string().max(200).optional(), asMember }),
  z.object({ op: z.literal('deleteSettlement'), groupId: id, settlementId: id }),
  z.object({ op: z.literal('shareLink'), groupId: id, action: z.enum(['create', 'revoke']) }),
  z.object({ op: z.literal('attachReceipt'), groupId: id, expenseId: id, dataUri: z.string().max(4_300_000) }),
  z.object({ op: z.literal('receiptUrl'), groupId: id, expenseId: id }),
  z.object({ op: z.literal('scanReceipt'), groupId: id, dataUri: z.string().max(4_300_000), text: z.string().max(400).optional(), today: date, asMember }),
  z.object({ op: z.literal('parseVoice'), groupId: id, text: z.string().trim().min(2).max(600), today: date, asMember }),
  z.object({ op: z.literal('importSplitwise'), csv: z.string().min(10).max(4_000_000), groupName: name, meIndex: z.number().int().min(0).max(200),
    emails: z.array(z.object({ index: z.number().int().min(0).max(200), email })).max(200).optional() }),
]);

export async function POST(req: Request) {
  const parsed = Op.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const body = parsed.data;

  try {
    const user = (await getSessionUser()) ?? undefined;
    const access: Access = { user, tokenGroupId: await svc.groupIdForToken(req.headers.get('x-split-token')) };
    if (!access.user && !access.tokenGroupId) throw new svc.SplitError(401, 'Sign in or use a valid group link.');
    const needUser = () => { if (!user) throw new svc.SplitError(401, 'Sign in to do this.'); return user; };
    const data = await (async () => {
      switch (body.op) {
        case 'home': return svc.getHome(needUser());
        case 'person': return svc.getPerson(needUser(), body.key);
        case 'group': return svc.getGroup(access, body.groupId ?? access.tokenGroupId ?? '', body.asMember);
        case 'createGroup': return svc.createGroup(needUser(), body);
        case 'updateGroup': return svc.updateGroup(access, body.groupId, body);
        case 'deleteGroup': return svc.deleteGroup(access, body.groupId);
        case 'addMember': return svc.addMember(access, body.groupId, body);
        case 'updateMember': return svc.updateMember(access, body.groupId, body.memberId, body);
        case 'removeMember': return svc.removeMember(access, body.groupId, body.memberId);
        case 'saveExpense': return svc.saveExpense(access, body);
        case 'deleteExpense': return svc.deleteExpense(access, body.groupId, body.expenseId);
        case 'linkToSpending': return svc.linkToSpending(access, body.groupId, body.expenseId, body.spending);
        case 'settle': return svc.settle(access, body);
        case 'deleteSettlement': return svc.deleteSettlement(access, body.groupId, body.settlementId);
        case 'shareLink': return svc.shareLink(access, body.groupId, body.action);
        case 'parseVoice': return svc.parseVoice(access, body);
        case 'attachReceipt': return svc.attachReceipt(access, body);
        case 'receiptUrl': return svc.receiptUrl(access, body.groupId, body.expenseId);
        case 'scanReceipt': return svc.scanReceipt(access, body);
        case 'importSplitwise': return svc.importSplitwise(needUser(), body);
        case 'expenseForTransaction': return svc.expenseForTransaction(needUser(), body.transactionId);
      }
    })();
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof svc.SplitError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('split api error:', (e as Error).message);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
