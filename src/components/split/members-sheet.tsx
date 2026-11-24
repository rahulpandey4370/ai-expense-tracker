import { useState } from 'react';
import { Copy, Link2, Loader2, MessageCircle, Trash2, UserPlus } from 'lucide-react';
import type { GroupDetail } from '@/lib/split/types';
import { useToast } from '@/hooks/use-toast';
import { Avatar, BalanceText, SplitSheet } from './bits';
import { useSplitAction } from './use-split';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: GroupDetail;
  token?: string;
  onDeleted?: () => void;
}

export function MembersSheet({ open, onOpenChange, detail, token, onDeleted }: Props) {
  const { toast } = useToast();
  const action = useSplitAction(token);
  const me = detail.meMemberId;
  const [form, setForm] = useState({ name: '', email: '' });
  const [myUpi, setMyUpi] = useState<string | null>(null);
  const members = detail.members.filter(m => !m.removed);
  const mine = members.find(m => m.id === me);
  const link = detail.shareToken && typeof window !== 'undefined' ? `${window.location.origin}/s/${detail.shareToken}` : null;

  const run = async (args: { op: string } & Record<string, unknown>, ok: string) => {
    try {
      const res = await action.mutateAsync({ groupId: detail.group.id, ...args });
      toast({ title: ok });
      return res;
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  const add = async () => {
    if (!form.name.trim()) return;
    const res = await run({ op: 'addMember', name: form.name.trim(), email: form.email.trim() || undefined }, `${form.name.trim()} added`);
    if (res) setForm({ name: '', email: '' });
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: 'Link copied' }); } catch { toast({ title: text }); }
  };

  return (
    <SplitSheet open={open} onOpenChange={onOpenChange} title={<>People &amp; <em>link</em></>}>
      <div className="space-y-5">
        <ul className="s-card">
          {members.map(m => (
            <li key={m.id} className="s-row">
              <Avatar name={m.name} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{m.id === me ? `${m.name} (you)` : m.name}</p>
                <p className="s-muted truncate text-xs">
                  {m.hasAccount ? 'Has an account' : m.email ? `Invited · ${m.email}` : 'No account'}
                  {m.upiId ? ` · UPI ${m.upiId}` : ''}
                </p>
              </div>
              <BalanceText value={detail.balances[m.id] ?? 0} className="text-xs" owedLabel="gets" oweLabel="owes" />
              {detail.canManage && m.id !== me && (
                <button type="button" aria-label={`Remove ${m.name}`} className="s-muted p-1"
                  onClick={() => confirm(`Remove ${m.name} from the group?`) && run({ op: 'removeMember', memberId: m.id }, `${m.name} removed`)}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>

        <section className="s-card space-y-2 p-3">
          <p className="text-sm font-semibold">Add someone</p>
          <input className="s-input" placeholder="Name" aria-label="Name" value={form.name} maxLength={60} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className="s-input" type="email" placeholder="Google email (optional — lets them sign in and see this group)" aria-label="Email"
            value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <button type="button" className="s-pill w-full" onClick={add} disabled={action.isPending || !form.name.trim()}>
            <UserPlus className="h-4 w-4" /> Add to group
          </button>
        </section>

        {mine && detail.canManage && (
          <section className="s-card space-y-2 p-3">
            <p className="text-sm font-semibold">Your UPI ID</p>
            <p className="s-muted text-xs">Friends see a &ldquo;Pay via UPI&rdquo; button when they owe you.</p>
            <div className="flex gap-2">
              <input className="s-input" placeholder="name@bank" aria-label="Your UPI ID" value={myUpi ?? mine.upiId ?? ''} onChange={e => setMyUpi(e.target.value.trim())} />
              <button type="button" className="s-pill" disabled={action.isPending || myUpi === null}
                onClick={() => run({ op: 'updateMember', memberId: mine.id, upiId: myUpi || null }, 'UPI ID saved').then(() => setMyUpi(null))}>Save</button>
            </div>
          </section>
        )}

        {detail.canManage && (
          <section className="s-hero space-y-3 p-4">
            <p className="split-display text-xl">Share a <em>private link</em></p>
            <p className="s-muted text-sm">Anyone with the link can view and add to this group without an account. Turn it off any time.</p>
            {link ? (
              <>
                <div className="s-input truncate text-xs">{link}</div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="s-pill s-pill-primary" onClick={() => copy(link)}><Copy className="h-4 w-4" /> Copy</button>
                  <a className="s-pill" target="_blank" rel="noopener noreferrer"
                    href={`https://wa.me/?text=${encodeURIComponent(`Join "${detail.group.name}" to split expenses: ${link}`)}`}>
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                  <button type="button" className="s-pill" onClick={() => run({ op: 'shareLink', action: 'revoke' }, 'Link turned off')}>Turn off</button>
                </div>
              </>
            ) : (
              <button type="button" className="s-pill s-pill-primary" disabled={action.isPending} onClick={() => run({ op: 'shareLink', action: 'create' }, 'Link created')}>
                {action.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create link
              </button>
            )}
          </section>
        )}

        {detail.canManage && (
          <button type="button" className="s-owe w-full py-2 text-sm font-semibold"
            onClick={async () => {
              if (!confirm(`Delete "${detail.group.name}" and all its expenses? This can't be undone.`)) return;
              const ok = await run({ op: 'deleteGroup' }, 'Group deleted');
              if (ok) { onOpenChange(false); onDeleted?.(); }
            }}>
            Delete group
          </button>
        )}
      </div>
    </SplitSheet>
  );
}
