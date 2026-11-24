import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import type { GroupDetail } from '@/lib/split/types';
import type { VoiceDraft } from '@/lib/split/voice';
import { useToast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { SplitSheet, emojiFor, inr, todayYmd } from './bits';
import { splitApi, useSplitAction } from './use-split';

const SR = () => (typeof window === 'undefined' ? null : (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null);

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  detail: GroupDetail;
  token?: string;
  asMember?: string | null;
  /** Unclear entries open the review sheet prefilled. */
  onReview: (draft: VoiceDraft) => void;
}

/** "Say it": speak (or type) what happened; clear entries save at once with Undo, unclear ones go to review. */
export function VoiceSheet({ open, onOpenChange, detail, token, asMember, onReview }: Props) {
  const { toast } = useToast();
  const action = useSplitAction(token);
  const [text, setText] = useState('');
  const [interim, setInterim] = useState('');
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const supported = !!SR();

  useEffect(() => {
    if (open) { setText(''); setInterim(''); setQuestion(null); if (supported) start(); }
    else stop();
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

  const submit = async () => {
    stop();
    const said = `${text} ${interim}`.trim();
    if (said.length < 2) return toast({ title: "Didn't catch anything", description: 'Try: "Dinner was 960, I paid, split with everyone."' });
    setBusy(true);
    try {
      const draft = await splitApi<VoiceDraft>('parseVoice', { groupId: detail.group.id, text: said, today: todayYmd(), asMember }, token);
      if (!draft.confident || !draft.amount) {
        if (draft.question && !draft.amount) { setQuestion(draft.question); return; } // ask once, keep the words
        onOpenChange(false);
        onReview(draft);
        return;
      }
      const res = await action.mutateAsync({
        op: 'saveExpense', groupId: detail.group.id, description: draft.description, amount: draft.amount,
        date: draft.date ?? todayYmd(), emoji: emojiFor(draft.description), method: draft.method, paidBy: draft.paidBy,
        participants: draft.meta.participants ?? [], values: draft.meta.values, items: draft.meta.items,
        coveredBy: draft.meta.coveredBy, asMember,
      });
      onOpenChange(false);
      toast({
        title: `Saved · ${draft.description} ${inr(draft.amount)}`,
        description: 'Split worked out from what you said.',
        action: (
          <ToastAction altText="Undo" onClick={() => action.mutate({ op: 'deleteExpense', groupId: detail.group.id, expenseId: res.id })}>Undo</ToastAction>
        ),
      });
    } catch (e: any) {
      toast({ title: e.message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <SplitSheet open={open} onOpenChange={onOpenChange} title={<>Say <em>it</em></>}>
      <div className="space-y-4">
        <p className="s-muted text-sm">Who paid, how much, and who it&apos;s for. Like: &ldquo;Dinner was 960, I paid. Asha&apos;s wine was 300, split the rest with everyone.&rdquo;</p>

        {supported && (
          <button
            type="button" onClick={listening ? stop : start} aria-pressed={listening}
            aria-label={listening ? 'Stop listening' : 'Start listening'}
            className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition ${listening ? 'scale-105 animate-pulse bg-[var(--s-coral)]' : 'bg-[var(--s-deep)]'}`}
          >
            {listening ? <Square className="h-8 w-8" /> : <Mic className="h-9 w-9" />}
          </button>
        )}
        <p className="s-muted text-center text-xs">{supported ? (listening ? 'Listening… tap to stop' : 'Tap to talk') : 'Voice isn’t available in this browser — type it instead.'}</p>

        <textarea
          className="s-input min-h-[96px] resize-none" aria-label="What happened"
          placeholder="Or type it here" value={interim ? `${text} ${interim}`.trim() : text}
          onChange={e => { setText(e.target.value); setInterim(''); }} maxLength={600}
        />

        {question && <p className="s-hero p-3 text-sm font-medium">{question} <span className="s-muted">Add it above and tap again.</span></p>}

        <button type="button" className="s-pill s-pill-primary w-full py-3 text-base" onClick={submit} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Split it
        </button>
      </div>
    </SplitSheet>
  );
}
