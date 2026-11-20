import { useEffect, useState } from 'react';
import { Brain, CalendarCheck, Check, MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { ChatSummary } from '@/lib/chat-types';
import { deleteChat, deleteMemory, getChatList, getMemoryFacts, renameChat } from '@/ai/flows/chat-actions';

/** The last 10 chats (rename, delete, open) and the facts the assistant remembers. */
export function ChatHistorySheet({ open, onOpenChange, currentId, onOpen, onNew, onDeleted }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentId?: string;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDeleted: (id: string) => void;
}) {
  const [chats, setChats] = useState<ChatSummary[] | null>(null);
  const [facts, setFacts] = useState<{ id: string; fact: string }[]>([]);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [toDelete, setToDelete] = useState<ChatSummary | null>(null);

  const refresh = async () => {
    const [c, f] = await Promise.all([getChatList(), getMemoryFacts()]);
    setChats(c);
    setFacts(f);
  };
  useEffect(() => { if (open) refresh().catch(() => setChats([])); }, [open]);

  const saveRename = async () => {
    if (!editing) return;
    const title = editing.title.trim();
    if (title) {
      await renameChat(editing.id, title);
      setChats(cs => cs?.map(c => (c.id === editing.id ? { ...c, title } : c)) ?? null);
    }
    setEditing(null);
  };

  const when = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex w-[88vw] max-w-sm flex-col gap-0 p-0">
        <SheetHeader className="border-b px-4 pb-3 pt-4 text-left">
          <SheetTitle>Chats</SheetTitle>
          <SheetDescription className="text-xs">Your last 10 chats are kept. The assistant can look back through them.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          <Button variant="outline" size="sm" className="mb-2 w-full justify-start" onClick={() => { onNew(); onOpenChange(false); }}>
            <Plus className="mr-2 h-4 w-4" /> New chat
          </Button>
          {chats === null && <p className="px-2 py-3 text-sm text-muted-foreground">Loading…</p>}
          {chats?.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No saved chats yet.</p>}
          <ul className="space-y-0.5">
            {chats?.map(c => (
              <li key={c.id} className={cn('group flex items-center gap-1 rounded-md pr-1', c.id === currentId && 'bg-muted')}>
                {editing?.id === c.id ? (
                  <form className="flex flex-1 items-center gap-1 p-1" onSubmit={e => { e.preventDefault(); saveRename(); }}>
                    <Input autoFocus onFocus={e => e.currentTarget.select()} value={editing.title} maxLength={80} aria-label="Chat name"
                      onChange={e => setEditing({ ...editing, title: e.target.value })} className="h-8 text-base md:text-sm" voice={false} />
                    <Button type="submit" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Save name"><Check className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" aria-label="Cancel rename" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
                  </form>
                ) : (
                  <>
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => { onOpen(c.id); onOpenChange(false); }}>
                      {c.kind === 'review' ? <CalendarCheck className="h-4 w-4 shrink-0 text-accent" /> : <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{c.title}</span>
                        <span className="block text-[11px] text-muted-foreground">{when(c.updatedAt)}</span>
                      </span>
                    </button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground" aria-label={`Rename ${c.title}`} onClick={() => setEditing({ id: c.id, title: c.title })}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Delete ${c.title}`} onClick={() => setToDelete(c)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-4 border-t px-2 pt-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Brain className="h-3.5 w-3.5" /> Remembered facts</p>
            {facts.length === 0 ? (
              <p className="mt-1.5 text-xs text-muted-foreground">Nothing yet. Say “remember that…” in a chat.</p>
            ) : (
              <ul className="mt-1.5 space-y-1">
                {facts.map(f => (
                  <li key={f.id} className="flex items-start gap-1 text-sm">
                    <span className="min-w-0 flex-1 break-words py-1">{f.fact}</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" aria-label={`Forget: ${f.fact}`}
                      onClick={async () => { await deleteMemory(f.id); setFacts(fs => fs.filter(x => x.id !== f.id)); }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <AlertDialog open={toDelete !== null} onOpenChange={o => !o && setToDelete(null)}>
          {/* Above the drawer (both default to z-50). */}
          <AlertDialogContent className="z-[60] w-[calc(100vw-2rem)] rounded-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
              <AlertDialogDescription>“{toDelete?.title}” will be removed for good, and the assistant won’t remember it.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!toDelete) return;
                  await deleteChat(toDelete.id);
                  setChats(cs => cs?.filter(c => c.id !== toDelete.id) ?? null);
                  onDeleted(toDelete.id);
                  setToDelete(null);
                }}>
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
