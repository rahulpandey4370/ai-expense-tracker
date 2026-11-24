import { useEffect, useState } from 'react';

/** True while the page is being scrolled down (past the top); false on any scroll up or near the bottom of the page. */
export function useHideOnScroll(threshold = 8) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let last = window.scrollY, ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY, nearEnd = window.innerHeight + y >= document.documentElement.scrollHeight - 48;
        if (y < 64 || nearEnd) setHidden(false);
        else if (y - last > threshold) setHidden(true);
        else if (last - y > threshold) setHidden(false);
        last = y;
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);
  return hidden;
}
