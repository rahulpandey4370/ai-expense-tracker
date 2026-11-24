import { useEffect, useState } from 'react';
import { AudioLines, Pencil, ScanLine } from 'lucide-react';
import { inr } from './bits';

/** "Dinner was *96*, split three ways": numbers get the italic accent. */
function Accent({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,.]*)/);
  return <>{parts.map((p, i) => (/^\d/.test(p) ? <em key={i} className="text-[var(--s-ink)]">{p}</em> : <span key={i}>{p}</span>))}</>;
}

/** Types each line out, holds it, then moves on. Static (first line) for reduced-motion users. */
function useTyped(lines: string[]) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const key = lines.join('|');
  useEffect(() => { setI(0); setN(0); }, [key]);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setN(Infinity); return; }
    const line = lines[i % lines.length] ?? '';
    const t = n < line.length ? setTimeout(() => setN(n + 1), 38) : setTimeout(() => { setI(i + 1); setN(0); }, 2600);
    return () => clearTimeout(t);
  }, [i, n, key]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = lines[i % lines.length] ?? '';
  return { text: line.slice(0, n), done: n >= line.length };
}

/** The big Settl-style card: balance on top, a typed line in the middle, capture buttons at the bottom. */
export function Hero({ net, lines, onScan, onType, onVoice, children }: {
  net: number; lines: string[]; onScan: () => void; onType: () => void; onVoice: () => void; children?: React.ReactNode;
}) {
  const { text, done } = useTyped(lines);
  return (
    <section className="s-hero flex min-h-[26rem] flex-col p-5 sm:min-h-[22rem]">
      <div className="flex items-baseline justify-between gap-3">
        <p className="split-display text-xl">{Math.abs(net) < 0.01 ? <>All <em>square</em></> : net > 0 ? <>You&apos;re <em>owed</em></> : <>You <em>owe</em></>}</p>
        <p className={`text-[1.7rem] font-bold tabular-nums ${net > 0 ? 's-owed' : net < 0 ? 's-owe' : ''}`}>{inr(net)}</p>
      </div>
      <div className="flex flex-1 items-center py-6">
        <p className="split-display min-h-[2.2em] text-[2.5rem] leading-[1.08] text-[color-mix(in_srgb,var(--s-ink)_70%,transparent)]" aria-hidden>
          <Accent text={text} />
          <span className={`ml-0.5 inline-block h-[0.9em] w-[2px] translate-y-[0.1em] bg-[var(--s-deep)] ${done ? 'motion-safe:animate-pulse' : ''}`} aria-hidden />
        </p>
        <span className="sr-only">{lines[0]}</span>
      </div>
      {children}
      <div className="flex items-end justify-between">
        <button type="button" className="s-icon-btn h-14 w-14 rounded-[18px]" aria-label="Scan a receipt" onClick={onScan}><ScanLine className="h-5 w-5" /></button>
        <div className="flex items-center gap-3">
          <button type="button" className="s-icon-btn h-14 w-14 rounded-[18px]" aria-label="Type an expense" onClick={onType}><Pencil className="h-5 w-5" /></button>
          <button type="button" className="s-voice-btn h-16 w-16" aria-label="Say an expense" onClick={onVoice}><AudioLines className="h-7 w-7" /></button>
        </div>
      </div>
    </section>
  );
}

/** Example lines — our own wording, in rupees. */
export const EXAMPLE_LINES = [
  'Dinner was 960, split three ways',
  'Cab 450, I paid, half with Asha',
  'Snap the bill, then say who had what',
];

/** The feed sits on a sheet that tucks under the hero, with a little handle. */
export function FeedSheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="s-card -mt-3 overflow-hidden rounded-t-[26px] pt-2 shadow-[0_-6px_24px_rgba(0,0,0,0.04)]">
      <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-[var(--s-line)]" aria-hidden />
      {children}
    </div>
  );
}
