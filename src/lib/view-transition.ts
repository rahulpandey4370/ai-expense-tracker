import { flushSync } from 'react-dom';

/**
 * Run a React state update inside a view transition where supported and motion
 * is welcome. flushSync makes React commit (and run effects) before the browser
 * takes the "after" snapshot.
 */
export function withViewTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}
