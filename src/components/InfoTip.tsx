import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { useI18n } from '../i18n';

export interface InfoTipProps {
  /** Localised explanation shown in the tooltip (one or two plain sentences). */
  text: string;
  /** Accessible name of the button. Default "More information". */
  label?: string;
  /** Preferred side. The tooltip flips when there is no room. Default "top". */
  placement?: 'top' | 'bottom';
  className?: string;
}

const MARGIN = 8;
const GAP = 8;

/**
 * Small "i" button that explains a box. Opens on hover or keyboard focus, toggles on tap or click,
 * closes on outside click or Escape. The bubble is rendered in a fixed layer and kept inside the
 * viewport, so it never clips at the screen edges in either direction.
 */
export function InfoTip({ text, label, placement = 'top', className = '' }: InfoTipProps) {
  const { t, isRtl } = useI18n();
  const id = useId();
  const tipId = `infotip-${id.replace(/:/g, '')}`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || focus || pinned;
  const [pos, setPos] = useState<{ top: number; left: number; arrow: number; side: 'top' | 'bottom' } | null>(null);

  const place = useCallback(() => {
    const btn = btnRef.current;
    const tip = tipRef.current;
    if (!btn || !tip) return;
    const r = btn.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const cx = r.left + r.width / 2;
    let left = cx - tw / 2;
    left = Math.max(MARGIN, Math.min(left, vw - MARGIN - tw));
    const roomTop = r.top - GAP - MARGIN;
    const roomBottom = vh - r.bottom - GAP - MARGIN;
    let side: 'top' | 'bottom' = placement;
    if (side === 'top' && th > roomTop && roomBottom > roomTop) side = 'bottom';
    else if (side === 'bottom' && th > roomBottom && roomTop > roomBottom) side = 'top';
    const top = side === 'top' ? r.top - GAP - th : r.bottom + GAP;
    const arrow = Math.max(10, Math.min(cx - left, tw - 10));
    setPos({ top, left, arrow, side });
  }, [placement]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text, isRtl]);

  useEffect(() => {
    if (!open) return;
    const onMove = () => place();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { setPinned(false); setHover(false); setFocus(false); }
    };
    const onDown = (e: globalThis.PointerEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || tipRef.current?.contains(target)) return;
      setPinned(false); setHover(false); setFocus(false);
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open, place]);

  const onClick = (e: MouseEvent) => {
    // Never trigger a clickable parent (a KPI tile that links to a page).
    e.stopPropagation();
    e.preventDefault();
    setPinned((p) => !p);
    setHover(false);
    setFocus(false);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
  };
  const onEnter = (e: PointerEvent) => { if (e.pointerType === 'mouse') setHover(true); };
  const onLeave = (e: PointerEvent) => { if (e.pointerType === 'mouse') setHover(false); };

  const style: CSSProperties = pos
    ? { top: pos.top, left: pos.left, ['--infotip-arrow' as string]: `${pos.arrow}px` }
    : { top: 0, left: 0 };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`infotip${open ? ' is-open' : ''} ${className}`.trim()}
        aria-label={label ?? t('common.moreInfo')}
        aria-describedby={tipId}
        aria-expanded={pinned}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onPointerEnter={onEnter}
        onPointerLeave={onLeave}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setFocus(true); }}
        onBlur={() => { setFocus(false); }}
      >
        <Info aria-hidden />
      </button>
      {typeof document !== 'undefined' && createPortal(
        <div
          ref={tipRef}
          id={tipId}
          role="tooltip"
          dir={isRtl ? 'rtl' : 'ltr'}
          className={`infotip__bubble infotip__bubble--${pos?.side ?? placement}${open && pos ? ' is-open' : ''}`}
          style={style}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse' && open) setHover(true); }}
          onPointerLeave={onLeave}
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
