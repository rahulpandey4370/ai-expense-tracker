"use client";

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

interface VoiceInputButtonProps {
  /** Called with the recognized text to append to the field. */
  onResult: (text: string) => void;
  disabled?: boolean;
}

/**
 * Dictation via the browser-native Web Speech API — no model call, no API
 * key, works entirely offline of our AI provider stack. Only renders where
 * the browser actually supports it (Chrome desktop/Android, Safari 14.5+);
 * everything else sees no button and the textarea behaves exactly as before.
 */
export function VoiceInputButton({ onResult, disabled }: VoiceInputButtonProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  const handleClick = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setIsSupported(false);
        toast({ title: "Microphone blocked", description: "Allow microphone access to use voice entry.", variant: "destructive" });
      } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
        toast({ title: "Voice input error", description: "Couldn't hear that — please try again.", variant: "destructive" });
      }
    };
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as ArrayLike<any>)
        .map((r: any) => r[0].transcript)
        .join(' ');
      if (transcript.trim()) onResult(transcript.trim());
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  if (!isSupported) return null;

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      onClick={handleClick}
      disabled={disabled}
      className={cn("shrink-0", isListening && "border-red-500 text-red-500 animate-pulse")}
      title={isListening ? "Stop dictation" : "Dictate with your voice"}
    >
      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      <span className="sr-only">{isListening ? "Stop dictation" : "Dictate with your voice"}</span>
    </Button>
  );
}
