import { useMemo, useState } from 'react';
import { FileUp, Loader2 } from 'lucide-react';
import { parseSplitwise, splitwiseToLedger } from '@/lib/split/splitwise';
import { useToast } from '@/hooks/use-toast';
import { Avatar, SplitSheet, inr } from './bits';
import { useSplitAction } from './use-split';

const MAX_BYTES = 4 * 1024 * 1024;

/** Splitwise group export (.csv) → a new group, previewed before anything is saved. */
export function ImportSheet({ open, onOpenChange, onImported, myName }: { open: boolean; onOpenChange: (o: boolean) => void; onImported: (groupId: string) => void; myName: string }) {
  const { toast } = useToast();
  const action = useSplitAction();
  const [csv, setCsv] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [me, setMe] = useState<number | null>(null);
  const [emails, setEmails] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(() => {
    if (!csv) return null;
    try {
      const parsed = parseSplitwise(csv);
      return { parsed, ledger: splitwiseToLedger(parsed), error: null };
    } catch (e: any) {
      return { parsed: null, ledger: null, error: e.message as string };
    }
  }, [csv]);

  const pickFile = async (file?: File) => {
    setError(null); setCsv(null); setMe(null); setEmails({});
    if (!file) return;
    if (file.size > MAX_BYTES) return setError('That file is over 4 MB. Export one group at a time.');
    const text = await file.text();
    setCsv(text);
    setName(file.name.replace(/\.csv$/i, '').replace(/[_-]?(export|splitwise)[_-]?/gi, ' ').replace(/[_-]+/g, ' ').trim().slice(0, 60) || 'Splitwise group');
    try {
      const members = parseSplitwise(text).members;
      const first = myName.split(' ')[0]?.toLowerCase();
      const guess = members.findIndex(m => m.toLowerCase() === myName.toLowerCase() || m.toLowerCase().split(' ')[0] === first);
      if (guess >= 0) setMe(guess);
    } catch {}
  };

  const run = async () => {
    if (!csv || me === null) return;
    try {
      const res = await action.mutateAsync({
        op: 'importSplitwise', csv, groupName: name.trim() || 'Splitwise group', meIndex: me,
        emails: Object.entries(emails).filter(([, e]) => e.trim()).map(([i, email]) => ({ index: Number(i), email: email.trim() })),
      });
      toast({ title: `Imported ${res.expenses} expenses and ${res.settlements} payments` });
      onOpenChange(false);
      setCsv(null);
      onImported(res.groupId);
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    }
  };

  const p = preview?.parsed, l = preview?.ledger;

  return (
    <SplitSheet open={open} onOpenChange={onOpenChange} title={<>Import from <em>Splitwise</em></>}>
      <div className="space-y-4">
        <p className="s-muted text-sm">In Splitwise, open the group → settings → <strong>Export as spreadsheet</strong>. Pick that .csv here. Splitwise isn&apos;t changed.</p>
        <label className="s-hero flex cursor-pointer flex-col items-center gap-2 p-6 text-center">
          <FileUp className="h-7 w-7 text-[var(--s-deep)]" />
          <span className="font-semibold">{csv ? 'Choose a different file' : 'Choose CSV file'}</span>
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => pickFile(e.target.files?.[0])} />
        </label>
        {(error ?? preview?.error) && <p className="s-owe text-sm font-medium">{error ?? preview?.error}</p>}

        {p && l && (
          <>
            <input className="s-input" aria-label="Group name" value={name} maxLength={60} onChange={e => setName(e.target.value)} />
            <section className="s-card">
              <p className="s-muted px-4 pt-3 text-xs font-semibold uppercase tracking-wide">Which one is you?</p>
              {p.members.map((m, i) => (
                <div key={i} className="s-row">
                  <button type="button" className="flex flex-1 items-center gap-3 text-left" onClick={() => setMe(i)} aria-pressed={me === i}>
                    <span className={`h-5 w-5 rounded-full border ${me === i ? 'border-[6px] border-[var(--s-deep)]' : 'border-[var(--s-line)]'}`} />
                    <Avatar name={m} size={30} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m}{me === i ? ' (you)' : ''}</span>
                      <span className={`text-xs ${l.balances[i] > 0 ? 's-owed' : l.balances[i] < 0 ? 's-owe' : 's-muted'}`}>
                        {Math.abs(l.balances[i]) < 0.01 ? 'settled' : l.balances[i] > 0 ? `gets back ${inr(l.balances[i])}` : `owes ${inr(l.balances[i])}`}
                      </span>
                    </span>
                  </button>
                  {me !== null && me !== i && (
                    <input className="s-input w-40 py-1.5 text-xs" type="email" placeholder="Email (optional)" aria-label={`${m} email`}
                      value={emails[i] ?? ''} onChange={e => setEmails(x => ({ ...x, [i]: e.target.value }))} />
                  )}
                </div>
              ))}
            </section>
            <p className="s-muted text-sm">
              {l.expenses.length} expenses · {l.settlements.length} payments · {p.currency}
              {l.skipped.otherCurrency > 0 && ` · ${l.skipped.otherCurrency} in other currencies skipped`}
              {l.skipped.zero > 0 && ` · ${l.skipped.zero} with no effect skipped`}
            </p>
            {l.balanceMismatch && <p className="s-owe text-sm">Balances don&apos;t exactly match Splitwise&apos;s totals; check the group after importing.</p>}
            <p className="s-muted text-xs">Receipts, comments and recurring schedules aren&apos;t in the export, so they aren&apos;t imported.</p>
            <button type="button" className="s-pill s-pill-primary w-full py-3 text-base" disabled={me === null || action.isPending} onClick={run}>
              {action.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {me === null ? 'Pick which one is you' : 'Import group'}
            </button>
          </>
        )}
      </div>
    </SplitSheet>
  );
}
