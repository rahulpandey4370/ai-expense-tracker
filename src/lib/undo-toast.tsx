"use client";

import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

// Matches the toast's 3s limit, so Undo is available exactly as long as it is shown.
const UNDO_MS = 3000;

/**
 * Gmail-style delete: hide the item now, offer Undo, and only send the delete
 * once the toast runs out. Undo just un-hides; the server never heard about it.
 *
 * ponytail: closing the tab inside the 3s window cancels the delete (the safe
 * direction). Flush on `pagehide` with sendBeacon if that ever matters.
 */
export function deleteWithUndo({ title, hide, restore, commit, onCommitted }: {
  title: string;
  hide: () => void;
  restore: () => void;
  commit: () => Promise<unknown>;
  onCommitted?: () => void;
}) {
  hide();
  let undone = false;
  const timer = setTimeout(async () => {
    if (undone) return;
    try {
      await commit();
      onCommitted?.();
    } catch (e: any) {
      restore();
      toast({ title: 'Delete failed', description: e?.message ?? 'Nothing was deleted.', variant: 'destructive' });
    }
  }, UNDO_MS);

  toast({
    title,
    duration: UNDO_MS,
    action: (
      <ToastAction altText="Undo the delete" onClick={() => { undone = true; clearTimeout(timer); restore(); }}>
        Undo
      </ToastAction>
    ),
  });
}
