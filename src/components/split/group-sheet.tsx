import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import type { GroupDetail, GroupKind } from '@/lib/split/types';
import { useToast } from '@/hooks/use-toast';
import { KIND_EMOJI, KIND_LABEL, SplitSheet } from './bits';
import { useSplitAction } from './use-split';

const KINDS: GroupKind[] = ['trip', 'home', 'couple', 'other'];

/** Edit a group's name, emoji and type, or delete it with everything in it. */
export function GroupSheet({ open, onOpenChange, detail, onDeleted }: { open: boolean; onOpenChange: (o: boolean) => void; detail: GroupDetail; onDeleted?: () => void }) {
  const { toast } = useToast();
  const action = useSplitAction();
  const g = detail.group;
  const [name, setName] = useState(g.name);
  const [emoji, setEmoji] = useState(g.emoji ?? '');
  const [kind, setKind] = useState<GroupKind>(g.kind);

  useEffect(() => {
    if (open) { setName(g.name); setEmoji(g.emoji ?? ''); setKind(g.kind); }
  }, [open, g.name, g.emoji, g.kind]);

  const save = async () => {
    if (!name.trim()) return toast({ title: 'Name the group', variant: 'destructive' });
    try {
      await action.mutateAsync({ op: 'updateGroup', groupId: g.id, name: name.trim(), emoji: emoji.trim() || null, kind });
      toast({ title: 'Group updated' });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  const remove = async () => {
    if (!confirm(`Delete "${g.name}" and all its expenses and payments? This can't be undone.`)) return;
    try {
      await action.mutateAsync({ op: 'deleteGroup', groupId: g.id });
      toast({ title: 'Group deleted' });
      onOpenChange(false);
      onDeleted?.();
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  return (
    <SplitSheet open={open} onOpenChange={onOpenChange} title={<>Edit <em>group</em></>}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="w-16 shrink-0">
            <input className="s-input text-center text-2xl" aria-label="Group emoji" value={emoji} maxLength={8}
              placeholder={KIND_EMOJI[kind]} onChange={e => setEmoji(e.target.value)} />
          </div>
          <input className="s-input" aria-label="Group name" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
        </div>
        {g.kind !== 'direct' && (
          <div className="flex flex-wrap gap-2">
            {KINDS.map(k => <button key={k} type="button" className="s-chip" data-on={kind === k} onClick={() => setKind(k)}>{KIND_EMOJI[k]} {KIND_LABEL[k]}</button>)}
          </div>
        )}
        <button type="button" className="s-pill s-pill-primary w-full" onClick={save} disabled={action.isPending}>
          {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </button>
        {g.id !== 'legacy' && (
          <button type="button" className="s-owe flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold" onClick={remove} disabled={action.isPending}>
            <Trash2 className="h-4 w-4" /> Delete group
          </button>
        )}
      </div>
    </SplitSheet>
  );
}
