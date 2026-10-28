import { useEffect, useState, type RefObject } from 'react';

/*
  Small hooks shared by the Swimming pool and Jacuzzis pages (both owned by the wellness pages):
  WebGL detection, reduced motion, tab visibility and on-screen detection, so the 3D views draw frames
  only while they are animating, visible and on screen.
*/

export function hasWebgl(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export function useWebgl(): boolean {
  const [ok] = useState(hasWebgl);
  return ok;
}

export function useReducedMotion(): boolean {
  const q = '(prefers-reduced-motion: reduce)';
  const [reduce, setReduce] = useState(() => { try { return window.matchMedia(q).matches; } catch { return false; } });
  useEffect(() => {
    let m: MediaQueryList;
    try { m = window.matchMedia(q); } catch { return; }
    const on = () => setReduce(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduce;
}

/** False while the browser tab is hidden. */
export function usePageVisible(): boolean {
  const [vis, setVis] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const on = () => setVis(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return vis;
}

/** True while the element is at least partly on screen. */
export function useInView(ref: RefObject<Element>): boolean {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => { for (const e of entries) setInView(e.isIntersecting); }, { threshold: 0.01 });
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

/** "18:00" style hour label (Latin digits in both languages, as elsewhere in the app). */
export const hourLabel = (h: number | string) => `${String(Number(h) % 24).padStart(2, '0')}:00`;
