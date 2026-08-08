"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Mic, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface VoiceInputButtonProps {
  /** Called with each finalised chunk of speech, to append to the field. */
  onResult: (text: string) => void;
  disabled?: boolean;
}

/**
 * Languages worth offering this app's users.
 *
 * `en-IN` is the default and the one that handles Hinglish: Indian-English
 * acoustic models are trained on heavily code-switched speech, so
 * "Zepto pe 500 kharch kiye" comes back transcribed in Latin script — which is
 * exactly what the downstream parser reads best. `hi-IN` is there for people
 * who want pure Hindi returned in Devanagari instead.
 */
const LANGUAGES = [
  { code: 'en-IN', short: 'EN', label: 'English / Hinglish' },
  { code: 'hi-IN', short: 'हि', label: 'हिन्दी (Hindi)' },
  { code: 'en-US', short: 'US', label: 'English (US)' },
] as const;

const LANG_STORAGE_KEY = 'finwise.dictationLang';

/**
 * Dictation via the browser-native Web Speech API — no model call, no API key,
 * nothing billed. Renders only where the browser supports it (Chrome on
 * desktop/Android, Safari 14.5+ including iOS); elsewhere the field is
 * untouched.
 *
 * The API stops listening by itself after a short silence even with
 * `continuous = true`, and unconditionally on iOS. Since the point is to dictate
 * a whole multi-transaction sentence at your own pace, every `onend` is
 * restarted automatically and we only truly stop when the user says so.
 *
 * Designed to sit inside the composer's bottom-right corner, so it reads as
 * part of the input rather than a control bolted alongside it.
 */
export function VoiceInputButton({ onResult, disabled }: VoiceInputButtonProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [lang, setLang] = useState<string>('en-IN');

  const recognitionRef = useRef<any>(null);
  /** True only while the user wants to keep dictating; gates the auto-restart. */
  const wantListeningRef = useRef(false);
  const { toast } = useToast();

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SR);
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && LANGUAGES.some(l => l.code === stored)) setLang(stored);
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setIsListening(false);
    setInterim('');
    try {
      recognitionRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recognitionRef.current = null;
  }, []);

  const start = useCallback(
    (language: string) => {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return;

      const recognition = new SR();
      recognition.lang = language;
      // Keep the mic open across pauses so a long sentence isn't cut in half.
      recognition.continuous = true;
      recognition.interimResults = true;
      // We only read the top result, but asking for alternatives widens the
      // decoder's search, which measurably helps code-switched speech.
      recognition.maxAlternatives = 3;

      recognition.onstart = () => setIsListening(true);

      recognition.onresult = (event: any) => {
        let finalText = '';
        let interimText = '';
        // resultIndex is the first result that changed since the last event;
        // iterating from 0 would re-emit everything already committed.
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0]?.transcript ?? '';
          if (result.isFinal) finalText += transcript;
          else interimText += transcript;
        }
        if (finalText.trim()) {
          onResult(finalText.trim());
          setInterim('');
        } else {
          setInterim(interimText);
        }
      };

      recognition.onerror = (event: any) => {
        const code = event?.error;
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          // Permission denied, or blocked in an iOS standalone PWA — stop
          // offering a control that cannot work in this context.
          wantListeningRef.current = false;
          setIsSupported(false);
          setIsListening(false);
          toast({
            title: 'Microphone unavailable',
            description:
              'Allow microphone access to dictate. On iPhone this can also be blocked when the app runs from the home screen — try it in Safari.',
            variant: 'destructive',
          });
          return;
        }
        // 'no-speech' and 'aborted' are routine during pauses; onend restarts.
        if (code !== 'no-speech' && code !== 'aborted') {
          console.warn('[dictation] recognition error:', code);
        }
      };

      recognition.onend = () => {
        setInterim('');
        if (!wantListeningRef.current) {
          setIsListening(false);
          return;
        }
        // Silence-triggered stop while the user still wants to talk: restart.
        try {
          recognition.start();
        } catch {
          // Some engines refuse an immediate restart; back off one tick.
          setTimeout(() => {
            if (!wantListeningRef.current) return;
            try {
              recognition.start();
            } catch {
              wantListeningRef.current = false;
              setIsListening(false);
            }
          }, 250);
        }
      };

      recognitionRef.current = recognition;
      wantListeningRef.current = true;
      try {
        recognition.start();
      } catch {
        wantListeningRef.current = false;
        setIsListening(false);
      }
    },
    [onResult, toast]
  );

  const handleLanguageChange = (code: string) => {
    window.localStorage.setItem(LANG_STORAGE_KEY, code);
    setLang(code);
    // Re-open the mic in the new language if we're mid-dictation.
    if (wantListeningRef.current) {
      stop();
      setTimeout(() => start(code), 150);
    }
  };

  // Never leave the mic hot after the form unmounts.
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      try {
        recognitionRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  if (!isSupported) return null;

  const active = LANGUAGES.find(l => l.code === lang) ?? LANGUAGES[0];

  // Recording: the control expands into a single pill — live level bars, the
  // words as they land, and one obvious tap target to finish.
  if (isListening) {
    return (
      <button
        type="button"
        onClick={stop}
        className={cn(
          'group flex h-8 max-w-[min(20rem,60vw)] items-center gap-2 rounded-full pl-2.5 pr-3',
          'border border-red-500/40 bg-red-500/10 text-red-600 shadow-sm dark:text-red-400',
          'transition-colors hover:bg-red-500/20',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50'
        )}
        title="Stop dictation"
      >
        <span className="flex h-3.5 items-center gap-[2px]" aria-hidden>
          {[0, 1, 2, 3].map(i => (
            <span
              key={i}
              className="h-full w-[2px] animate-waveform rounded-full bg-current"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-xs">
          {interim || 'Listening…'}
        </span>
        <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70 group-hover:opacity-100">
          Stop
        </span>
      </button>
    );
  }

  // Idle: one round mic button, with the language as a tiny adjacent chip so
  // the current dictation language is legible without spending a whole control.
  return (
    <div className="flex items-center gap-0.5">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
              'text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              'disabled:pointer-events-none disabled:opacity-40'
            )}
            title={`Dictation language: ${active.label}`}
          >
            {active.short}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel className="text-xs">Dictation language</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {LANGUAGES.map(l => (
            <DropdownMenuItem key={l.code} onClick={() => handleLanguageChange(l.code)} className="text-sm">
              <Check className={cn('mr-2 h-3.5 w-3.5', lang === l.code ? 'opacity-100' : 'opacity-0')} />
              {l.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => start(lang)}
        disabled={disabled}
        className="h-8 w-8 rounded-full text-muted-foreground hover:bg-accent/10 hover:text-accent"
        title="Dictate with your voice"
      >
        <Mic className="h-4 w-4" />
        <span className="sr-only">Dictate with your voice</span>
      </Button>
    </div>
  );
}
