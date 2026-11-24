import { useMemo, useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import type { GroupDetail } from '@/lib/split/types';
import { monthRange, type PersonData } from '@/lib/split/report';
import { ShareFileDialog, type ShareFiles } from '@/components/share-file-dialog';
import { useToast } from '@/hooks/use-toast';
import { SplitSheet, todayYmd } from './bits';

const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

/** Month or custom-range report for a group or a person → PDF to view, share (WhatsApp…) or download. */
export function ReportSheet({ open, onOpenChange, group, person }: {
  open: boolean; onOpenChange: (o: boolean) => void; group?: GroupDetail; person?: PersonData;
}) {
  const { toast } = useToast();
  const dates = useMemo(() => (group ? [...group.expenses.map(e => e.date), ...group.settlements.map(x => x.date)] : person?.items.map(i => i.date) ?? []), [group, person]);
  const months = useMemo(() => {
    const set = new Set([todayYmd().slice(0, 7), ...dates.map(d => d.slice(0, 7))]);
    return [...set].sort().reverse();
  }, [dates]);
  const [mode, setMode] = useState<'month' | 'range'>('month');
  const [month, setMonth] = useState(months[0]);
  const [from, setFrom] = useState(`${todayYmd().slice(0, 7)}-01`);
  const [to, setTo] = useState(todayYmd());
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<ShareFiles | null>(null);

  const generate = async () => {
    const range = mode === 'month' ? monthRange(month ?? months[0]) : { from, to };
    if (!range.from || !range.to) return toast({ title: 'Pick both dates', variant: 'destructive' });
    if (range.from > range.to) return toast({ title: 'The start date is after the end date', variant: 'destructive' });
    const label = mode === 'month' ? monthLabel(month ?? months[0]) : `${range.from} to ${range.to}`;
    setBusy(true);
    try {
      const { groupReportPdf, personReportPdf } = await import('@/lib/pdf/split-report');
      const pdf = group ? await groupReportPdf(group, range.from, range.to, label) : await personReportPdf(person!, range.from, range.to, label);
      setFiles({ title: `${group ? group.group.name : `You & ${person!.name}`} · ${label}`, pdf });
    } catch (e: any) {
      console.error('[report] PDF failed:', e);
      toast({ title: "Couldn't make the report", description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SplitSheet open={open && !files} onOpenChange={onOpenChange} title={<>Make a <em>report</em></>}>
        <div className="space-y-4">
          <p className="s-muted text-sm">A PDF with totals, each person&apos;s share, every expense by date, payments and who still owes whom.</p>
          <div className="flex gap-2">
            <button type="button" className="s-chip" data-on={mode === 'month'} onClick={() => setMode('month')}>By month</button>
            <button type="button" className="s-chip" data-on={mode === 'range'} onClick={() => setMode('range')}>Custom dates</button>
          </div>
          {mode === 'month' ? (
            <div className="flex flex-wrap gap-2">
              {months.slice(0, 12).map(m => (
                <button key={m} type="button" className="s-chip" data-on={m === (month ?? months[0])} onClick={() => setMonth(m)}>{monthLabel(m)}</button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold s-muted">From<input type="date" className="s-input mt-1" value={from} max={to} onChange={e => setFrom(e.target.value)} /></label>
              <label className="text-xs font-semibold s-muted">To<input type="date" className="s-input mt-1" value={to} min={from} onChange={e => setTo(e.target.value)} /></label>
            </div>
          )}
          <button type="button" className="s-pill s-pill-primary w-full py-3 text-base" onClick={generate} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Make PDF
          </button>
        </div>
      </SplitSheet>
      <ShareFileDialog files={files} onClose={() => { setFiles(null); onOpenChange(false); }} />
    </>
  );
}
