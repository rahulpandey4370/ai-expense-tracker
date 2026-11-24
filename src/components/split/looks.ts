import { useEffect, useState } from 'react';

// Our own four looks. Sidekicks are standard emoji; taglines are ours.
export const LOOKS = [
  { id: 'onyx', name: 'Onyx', sidekick: '🐈‍⬛', tagline: 'Quiet. Keeps every rupee in line.', bg: '#111111', fg: '#ffffff' },
  { id: 'lagoon', name: 'Lagoon', sidekick: '🐢', tagline: 'Easy-going. Rolls with every plan.', bg: '#0b6f72', fg: '#ffffff' },
  { id: 'coral', name: 'Coral', sidekick: '🦩', tagline: 'Bright. First to say “let’s split it”.', bg: '#c4334c', fg: '#ffffff' },
  { id: 'grape', name: 'Grape', sidekick: '🦄', tagline: 'Never forgets who still owes.', bg: '#4f2aa6', fg: '#ffffff' },
] as const;
export type LookId = (typeof LOOKS)[number]['id'];

const KEY = 'split-look';
const listeners = new Set<(l: LookId) => void>();

/** The viewer's chosen look (per device), shared by every split screen on the page. */
export function useLook(): [LookId, (l: LookId) => void] {
  const [look, setLookState] = useState<LookId>('lagoon');
  useEffect(() => {
    try { const v = localStorage.getItem(KEY) as LookId | null; if (v && LOOKS.some(l => l.id === v)) setLookState(v); } catch {}
    listeners.add(setLookState);
    return () => { listeners.delete(setLookState); };
  }, []);
  const setLook = (l: LookId) => {
    try { localStorage.setItem(KEY, l); } catch {}
    listeners.forEach(fn => fn(l));
  };
  return [look, setLook];
}

export const sidekickOf = (l: LookId) => LOOKS.find(x => x.id === l)!.sidekick;
