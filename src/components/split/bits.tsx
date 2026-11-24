import { Newsreader } from 'next/font/google';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatCurrency } from '@/lib/format';
import type { GroupKind } from '@/lib/split/types';
export { emojiFor } from '@/lib/split/emoji';

export const splitSerif = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-split-serif' });

export const inr = (n: number) => formatCurrency(Math.abs(n));

const PALETTE = ['#0f9d99', '#e8604f', '#6c5ce7', '#f0a020', '#2d9cdb', '#d6437a', '#3f9142'];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Avatar({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const initials = name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
  return (
    <span
      aria-hidden
      className={cn('inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: PALETTE[hash(name) % PALETTE.length] }}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  return (
    <span className="flex -space-x-2">
      {names.slice(0, max).map((n, i) => <Avatar key={i} name={n} size={26} className="ring-2 ring-[var(--s-card)]" />)}
      {names.length > max && <span className="s-muted pl-3 text-xs">+{names.length - max}</span>}
    </span>
  );
}

/** "you lent ₹40" / "you owe ₹40" / "settled up" for a signed balance. */
export function BalanceText({ value, className, owedLabel = 'you get back', oweLabel = 'you owe' }: { value: number; className?: string; owedLabel?: string; oweLabel?: string }) {
  if (Math.abs(value) < 0.01) return <span className={cn('s-muted', className)}>all square</span>;
  return value > 0
    ? <span className={cn('s-owed font-semibold', className)}>{owedLabel} {inr(value)}</span>
    : <span className={cn('s-owe font-semibold', className)}>{oweLabel} {inr(value)}</span>;
}

export const KIND_LABEL: Record<GroupKind, string> = { trip: 'Trip', home: 'Home', couple: 'Couple', other: 'Other', direct: '1-on-1' };
export const KIND_EMOJI: Record<GroupKind, string> = { trip: '✈️', home: '🏠', couple: '💞', other: '👥', direct: '🤝' };

export const todayYmd = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const prettyDate = (ymd: string) =>
  new Date(`${ymd}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export const monthLabel = (ymd: string) =>
  new Date(`${ymd.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

export function EmptyState({ title, body, children }: { title: React.ReactNode; body: string; children?: React.ReactNode }) {
  return (
    <div className="s-card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="split-display text-2xl">{title}</p>
      <p className="s-muted max-w-xs text-sm">{body}</p>
      {children}
    </div>
  );
}

/** Bottom sheet carrying the split tokens (sheets portal outside .split-ui). */
export function SplitSheet({ open, onOpenChange, title, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn('split-ui s-sheet max-h-[92dvh] overflow-y-auto rounded-t-[28px] border-0 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 sm:mx-auto sm:max-w-lg', splitSerif.variable)}
      >
        <SheetHeader className="mb-3 text-left">
          <SheetTitle className="split-display text-[1.7rem] text-[var(--s-ink)]">{title}</SheetTitle>
          <SheetDescription className="sr-only">Split sheet</SheetDescription>
        </SheetHeader>
        {children}
      </SheetContent>
    </Sheet>
  );
}
