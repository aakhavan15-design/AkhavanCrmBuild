/**
 * Smart Island header — compact on scroll-down, expand on scroll-up / idle (2026)
 */
import { useEffect, useState } from 'react';

export function useSmartIslandHeader(scrollSelector = '#main-scroll-container') {
  const [compact, setCompact] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = document.querySelector(scrollSelector) as HTMLElement | null;
    if (!el) return;

    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = el.scrollTop;
        setScrolled(y > 12);
        ticking = false;
      });
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
    };
  }, [scrollSelector]);

  return { compact, scrolled };
}

