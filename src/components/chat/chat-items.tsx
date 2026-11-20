import { useState } from 'react';
import { Brain, Check, CheckCircle2, FileText, Loader2, Undo2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MarkdownContent } from '@/components/markdown-content';
import { ModelInfoBadge } from '@/components/model-info-badge';
import { cn } from '@/lib/utils';
import type { ChatItem } from '@/lib/chat-types';

/*
 * How each piece of a conversation renders. Tables scroll sideways inside their
 * own box with readable column widths (like the ChatGPT/Claude apps), and a
 * paused action is a card with Confirm/Cancel.
 */

const looksNumeric = (v: string) => /^[+\-−]?\s?₹?\s?[\d,]+(\.\d+)?%?$/.test(v.trim());
const looksDate = (v: string) => /^\d{1,2} [A-Z][a-z]{2}( \d{4})?$|^\d{4}-\d{2}-\d{2}$/.test(v.trim());

export function ChatTable({ title, columns, rows }: { title?: string; columns: string[]; rows: string[][] }) {
  const kind = columns.map((_, j) => {
    const vals = rows.map(r => r[j] ?? '').filter(Boolean);
    if (vals.length && vals.every(looksNumeric)) return 'num';
    if (vals.length && vals.every(v => looksDate(v) || v.length <= 14)) return 'short';
    return 'text';
  });
  return (
    <div className="my-1 max-w-full">
      {title && <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{title}</p>}
      <div className="max-w-full overflow-x-auto overscroll-x-contain rounded-lg border bg-background/50">
        <Table className="w-max min-w-full text-[13px] leading-snug">
          <TableHeader className="bg-muted/50">
            <TableRow className="hover:bg-transparent">
              {columns.map((c, j) => (
                <TableHead key={j} className={cn('h-9 whitespace-nowrap px-3 font-semibold text-foreground', kind[j] === 'num' && 'text-right')}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => (
              <TableRow key={i} className="hover:bg-transparent">
                {columns.map((_, j) => (
                  <TableCell key={j} className={cn('px-3 py-2 align-top',
                    kind[j] === 'num' && 'whitespace-nowrap text-right font-medium tabular-nums',
                    kind[j] === 'short' && 'whitespace-nowrap',
                    kind[j] === 'text' && 'min-w-[9rem] max-w-[15rem] break-words')}>
                    {r[j] ?? ''}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export function ConfirmCard({ item, busy, onAnswer }: {
  item: Extract<ChatItem, { kind: 'confirm' }>;
  busy: boolean;
  onAnswer: (confirmed: boolean) => void;
}) {
  const { preview, status } = item;
  return (
    <div className={cn('rounded-lg border p-3', preview.danger ? 'border-destructive/40 bg-destructive/5' : 'border-primary/30 bg-primary/5')}>
      <p className="text-sm font-semibold text-foreground">{preview.title}</p>
      {preview.lines.length > 0 && (
        <dl className="mt-2 space-y-1 text-sm">
          {preview.lines.map((l, i) => (
            <div key={i} className="flex gap-2">
              <dt className="w-24 shrink-0 text-muted-foreground">{l.label}</dt>
              <dd className="min-w-0 break-words text-foreground">{l.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {preview.rows && preview.rows.length > 0 && (
        <div className="mt-2">
          <ChatTable columns={['Date', 'Amount', 'Description', 'Category', 'Paid with', 'Type']} rows={preview.rows} />
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        {status === 'pending' ? (
          <>
            <Button size="sm" variant={preview.danger ? 'destructive' : 'default'} disabled={busy} onClick={() => onAnswer(true)}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Check className="mr-1.5 h-4 w-4" />}
              Confirm
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onAnswer(false)}>
              <X className="mr-1.5 h-4 w-4" /> Cancel
            </Button>
          </>
        ) : (
          <span className={cn('text-xs font-medium', status === 'confirmed' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
            {status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
          </span>
        )}
      </div>
    </div>
  );
}

export function ResultLine({ item, onUndo }: { item: Extract<ChatItem, { kind: 'result' }>; onUndo?: () => Promise<void> }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-green-700 dark:text-green-400">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      <span>{item.text}</span>
      {item.undo && onUndo && state !== 'done' && (
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={state === 'busy'}
          onClick={async () => { setState('busy'); try { await onUndo(); setState('done'); } catch { setState('idle'); } }}>
          <Undo2 className="mr-1 h-3.5 w-3.5" /> Undo
        </Button>
      )}
      {state === 'done' && <span className="text-xs text-muted-foreground">Restored</span>}
    </div>
  );
}

export function UserText({ item }: { item: Extract<ChatItem, { kind: 'user' }> }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <p className="whitespace-pre-wrap break-words text-sm">{item.text}</p>
      {item.attachments && item.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {item.attachments.map((a, i) => (
            <span key={i} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
              <FileText className="h-3 w-3 shrink-0" /><span className="truncate">{a}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function AssistantText({ item }: { item: Extract<ChatItem, { kind: 'assistant' }> }) {
  return (
    <div className="w-full min-w-0 break-words text-sm">
      <MarkdownContent content={item.text} />
      {item.model && <div className="mt-2 flex justify-end"><ModelInfoBadge model={item.model} /></div>}
    </div>
  );
}

export function MemoryLine({ text }: { text: string }) {
  return <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Brain className="h-3.5 w-3.5 shrink-0" />{text}</p>;
}

export function CompactedDivider() {
  return (
    <div className="flex items-center gap-2 py-1 text-[11px] text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-border" />
      Earlier messages summarised to keep the chat fast
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
