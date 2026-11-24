import { useEffect, useRef, useState } from 'react';
import { Camera, Loader2, Mic, Square, X } from 'lucide-react';
import type { GroupDetail } from '@/lib/split/types';
import type { VoiceDraft } from '@/lib/split/voice';
import type { ReceiptDraft } from '@/lib/split/receipt';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { toDataUri } from '@/lib/attachment';
import { SplitSheet, emojiFor, inr, todayYmd } from './bits';
import type { ExpenseDraft } from './expense-sheet';
import { splitApi, useSplitAction } from './use-split';

const SR = () => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null);

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: GroupDetail;
  token?: string;
  asMember?: string | null;
  /** Unclear entries and every scan open the review sheet prefilled. */
  onReview: (draft: ExpenseDraft) => void;
  /** Open straight into "snap a receipt". */
  startWithPhoto?: boolean;
  header?: React.ReactNode;
}

/** Say it, type it, or snap the receipt (and say who had what). */
export function VoiceSheet({ open, onOpenChange, detail, token, asMember, onReview, startWithPhoto, header }: Props) {
  const { toast } = useToast();
  const action = useSplitAction(token);
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const supported = !!SR();
  const all = detail.members.filter(m => !m.removed).map(m => m.id);

  useEffect(() => {
    if (open) {
      setText(''); setInterim(''); setQuestion(null); setPhoto(null);
      if (startWithPhoto) setTimeout(() => fileRef.current?.click(), 50);
      else if (supported) start();
    } else stop();
    return () => recRef.current?.abort?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function start() {
    const Rec = SR();
    if (!Rec) return;
    const rec = new Rec();
    let lang = 'en-IN';
    try { lang = localStorage.getItem('finwise.dictationLang') || lang; } catch {}
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let finals = '', live = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0]?.transcript ?? '';
        if (e.results[i].isFinal) finals += t; else live += t;
      }
      if (finals) setText(prev => `${prev} ${finals}`.trim());
      setInterim(live);
    };
    rec.onerror = (e: any) => {
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        toast({ title: 'Microphone blocked', description: 'Allow the mic, or just type it below.', variant: 'destructive' });
      }
    };
    rec.onend = () => { setListening(false); setInterim(''); };
    recRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }

  function stop() { recRef.current?.stop?.(); setListening(false); }

  const pickPhoto = async (file?: File) => {
    if (!file) return;
    try { setPhoto(await toDataUri(file)); if (supported && !listening) start(); }
    catch (e: any) { toast({ title: e.message, variant: 'destructive' }); }
  };

  const submit = async () => {
    stop();
    const said = `${text} ${interim}`.trim();
    if (!photo && said.length < 2) return toast({ title: "Didn't catch anything", description: 'Try: "Dinner was 960, I paid, split with everyone."' });
    setBusy(true);
    try {
      if (photo) {
        const r = await splitApi<ReceiptDraft>('scanReceipt', { groupId: detail.group.id, dataUri: photo, text: said || undefined, today: todayYmd(), asMember }, token);
        if (!r.amount) { setQuestion("Couldn't read a total. Try a sharper, flatter photo, or type the amount."); return; }
        onOpenChange(false);
        onReview({
          description: r.description, amount: r.amount, date: r.date, paidBy: detail.meMemberId ?? all[0], method: 'items',
          meta: { participants: all, items: r.items }, said: said || undefined, receiptDataUri: photo,
        });
        return;
      }
      const draft = await splitApi<VoiceDraft>('parseVoice', { groupId: detail.group.id, text: said, today: todayYmd(), asMember }, token);
      if (!draft.confident || !draft.amount) {
        if (draft.question && !draft.amount) { setQuestion(draft.question); return; } // ask once, keep the words
        onOpenChange(false);
        onReview({ ...draft, said });
        return;
      }
      const res = await action.mutateAsync({
        op: 'saveExpense', groupId: detail.group.id, description: draft.description, amount: draft.amount,
        date: draft.date ?? todayYmd(), emoji: emojiFor(draft.description), method: draft.method, paidBy: draft.paidBy,
        participants: draft.meta.participants ?? [], values: draft.meta.values, items: draft.meta.items,
        coveredBy: draft.meta.coveredBy, asMember, said,
      });
      onOpenChange(false);
      toast({
        title: `Saved · ${draft.description} ${inr(draft.amount)}`,
        description: 'Split worked out from what you said.',
        action: <ToastAction altText="Undo" onClick={() => action.mutate({ op: 'deleteExpense', groupId: detail.group.id, expenseId: res.id })}>Undo</ToastAction>,
      });
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SplitSheet open={open} onOpenChange={onOpenChange} title={photo || startWithPhoto ? <>Snap the <em>receipt</em></> : <>Say <em>it</em></>}>
      <div className="space-y-4">
        {header}
        <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />

        {photo ? (
          <div className="relative">
            {photo.startsWith('data:application/pdf')
              ? <div className="s-card p-4 text-sm font-semibold">Receipt PDF ready</div>
              : <img src={photo} alt="Receipt" className="max-h-56 w-full rounded-2xl object-contain bg-[var(--s-tint)]" />}
            <button type="button" aria-label="Remove photo" onClick={() => setPhoto(null)} className="s-icon-btn absolute right-2 top-2 h-8 w-8"><X className="h-4 w-4" /></button>
            <p className="s-muted mt-2 text-sm">Now say or type who had what — or leave it and everything is shared.</p>
          </div>
        ) : (
          <p className="s-muted text-sm">Who paid, how much, and who it&apos;s for. Like: &ldquo;Dinner was 960, I paid. Asha&apos;s wine was 300, split the rest with everyone.&rdquo;</p>
        )}

        <div className="flex items-center justify-center gap-4">
          <button type="button" onClick={() => fileRef.current?.click()} aria-label="Snap or pick a receipt" className="s-icon-btn h-14 w-14"><Camera className="h-6 w-6" /></button>
          {supported && (
            <button
              type="button" onClick={listening ? stop : start} aria-pressed={listening}
              aria-label={listening ? 'Stop listening' : 'Start listening'}
              className={`flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition ${listening ? 'scale-105 animate-pulse bg-[var(--s-coral)]' : 'bg-[var(--s-deep)]'}`}
            >
              {listening ? <Square className="h-8 w-8" /> : <Mic className="h-9 w-9" />}
            </button>
          )}
        </div>
        <p className="s-muted text-center text-xs">{supported ? (listening ? 'Listening… tap to stop' : 'Tap to talk') : 'Voice isn’t available in this browser — type it instead.'}</p>

        <textarea
          className="s-input min-h-[88px] resize-none" aria-label="What happened"
          placeholder={photo ? 'e.g. Maya had the wine, rest shared' : 'Or type it here'} value={interim ? `${text} ${interim}`.trim() : text}
          onChange={e => { setText(e.target.value); setInterim(''); }} maxLength={600}
        />

        {question && <p className="s-hero p-3 text-sm font-medium">{question} <span className="s-muted">Add it above and tap again.</span></p>}

        <button type="button" className="s-pill s-pill-primary w-full py-3 text-base" onClick={submit} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} {photo ? 'Read receipt' : 'Split it'}
        </button>
      </div>
    </SplitSheet>
  );
}
