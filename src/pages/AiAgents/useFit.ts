import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * How many children of a clipped list fit fully inside it (wall screen: no scrolling).
 * Every item stays rendered, items past the fit are hidden with visibility, so the count can be measured
 * again whenever the box or the content changes.
 */
export function useFit<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [fit, setFit] = useState(Infinity);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setTick((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measure after every render (content can change every 10 s) and after each resize.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const limit = el.clientHeight;
    const top = el.getBoundingClientRect().top;
    let n = 0;
    for (const child of Array.from(el.children) as HTMLElement[]) {
      const bottom = child.getBoundingClientRect().bottom - top;
      if (bottom > limit + 0.5) break;
      n++;
    }
    if (n !== fit) setFit(n);
  });
  void tick;

  return [ref, fit];
}
