"use client";

import * as React from 'react';
import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

type Field = HTMLInputElement | HTMLTextAreaElement;

// Shared with the AI composer's language picker, so one choice applies everywhere.
const LANG_STORAGE_KEY = 'finwise.dictationLang';

// Only one mic may be hot at a time; starting another stops this one.
let active: { stop: () => void } | null = null;

function getRecognition(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

/** Postel's law: "₹1,200", "1200 rupees", "1,200.50" all mean a number; anything else is ignored. */
export function spokenNumber(text: string): string | null {
  const match = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

/**
 * Write into a controlled React field the way typing would: set the value via
 * the native setter, then fire `input` so the field's onChange runs.
 */
function writeInto(el: Field, spoken: string): boolean {
  let next: string;
  if (el.type === 'number') {
    const n = spokenNumber(spoken);
    if (n === null) return false;
    next = n;
  } else {
    const cur = el.value;
    next = cur && !/\s$/.test(cur) ? `${cur} ${spoken}` : cur + spoken;
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
}

/**
 * Dictation for any text field, via the browser's free Web Speech API.
 * Renders nothing where the browser has no speech recognition.
 */
export function FieldMic({ target, multiline }: { target: React.RefObject<Field | null>; multiline?: boolean }) {
  const [supported, setSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const recRef = React.useRef<any>(null);

  React.useEffect(() => setSupported(!!getRecognition()), []);
  React.useEffect(() => () => recRef.current?.abort?.(), []);

  if (!supported) return null;

  const stop = () => recRef.current?.stop();

  const start = () => {
    const SR = getRecognition();
    const el = target.current;
    if (!SR || !el) return;
    active?.stop();

    const rec = new SR();
    let lang = 'en-IN';
    try { lang = localStorage.getItem(LANG_STORAGE_KEY) || lang; } catch { /* storage blocked */ }
    rec.lang = lang;
    // Long fields keep listening across pauses until tapped again; short ones stop after one phrase.
    rec.continuous = !!multiline;
    rec.interimResults = false;

    rec.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const said = event.results[i][0]?.transcript?.trim();
        if (!said || !event.results[i].isFinal) continue;
        if (!writeInto(el, said)) {
          toast({ title: "Didn't catch a number", description: `Heard “${said}”. Try saying just the amount, like “450”.` });
        }
      }
    };
    rec.onerror = (event: any) => {
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        toast({
          title: 'Microphone unavailable',
          description: 'Allow microphone access to dictate. On iPhone, the Home Screen app can block it; Safari works.',
          variant: 'destructive',
        });
      }
    };
    rec.onend = () => {
      setListening(false);
      if (recRef.current === rec) recRef.current = null;
      if (active?.stop === stop) active = null;
    };

    recRef.current = rec;
    active = { stop: () => rec.stop() };
    try {
      rec.start();
      setListening(true);
      el.focus();
    } catch {
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      // Keep focus (and the mobile keyboard) on the field while tapping the mic.
      onMouseDown={(e) => e.preventDefault()}
      onClick={listening ? stop : start}
      aria-pressed={listening}
      aria-label={listening ? 'Stop dictation' : 'Dictate'}
      title={listening ? 'Stop dictation' : 'Dictate'}
      className={cn(
        // Shares the field's grid cell (see Input/Textarea), so no positioned wrapper is
        // needed and icons a page lays over the field keep painting on top of it.
        'relative mr-1 flex h-7 w-7 items-center justify-center justify-self-end rounded-full transition-colors [grid-area:1/1]',
        // Hit slop: the visible button is 28px, the tappable area is 44px tall.
        "after:absolute after:-inset-y-2 after:-left-2 after:right-0 after:content-['']",
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        multiline ? 'mb-1 self-end' : 'self-center',
        listening
          ? 'animate-pulse bg-red-500/15 text-red-600 dark:text-red-400'
          : 'text-muted-foreground/60 hover:bg-muted hover:text-foreground'
      )}
    >
      <Mic className="h-3.5 w-3.5" />
    </button>
  );
}

// Classes that place the field in its parent's layout; they belong on the wrapper, not the field.
const LAYOUT_CLASS = /^(?:[\w-]+:)*-?(?:m[trblxy]?-|flex-(?:1|auto|initial|none|\[)|grow|shrink|basis-|w-|min-w-|max-w-|col-|row-|self-|order-|justify-self-)/;

export function splitLayoutClasses(className?: string): [wrapper: string, field: string] {
  const wrapper: string[] = [];
  const field: string[] = [];
  for (const c of (className ?? '').split(/\s+/).filter(Boolean)) (LAYOUT_CLASS.test(c) ? wrapper : field).push(c);
  return [wrapper.join(' '), field.join(' ')];
}
