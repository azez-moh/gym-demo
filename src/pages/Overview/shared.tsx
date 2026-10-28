/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '../../components';
import { useI18n, LOCALE } from '../../i18n';
import { useScope } from '../../layout/filters';
import { scopeLabel } from '../../layout/scopeLabel';
import { useDemo, type Club, type ClubLive, type Scope } from '../../data';
import './overview.css';

/** "6 PM" / "6 م" for an hour of the day. */
export function useFmtHour() {
  const { lang } = useI18n();
  const f = new Intl.DateTimeFormat(LOCALE[lang], { hour: 'numeric', hour12: true, timeZone: 'UTC' });
  return (h: number) => {
    const out = f.format(new Date(Date.UTC(2000, 0, 1, ((h % 24) + 24) % 24)));
    return lang === 'en' ? out.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase()) : out;
  };
}

/** Megawatt hours with one decimal: "1.8 MWh" / "1.8 ميغاواط ساعة". */
export function useFmtMwh() {
  const { lang, fmtNumber } = useI18n();
  return {
    unit: lang === 'ar' ? 'ميغاواط ساعة' : 'MWh',
    value: (kwh: number) => fmtNumber(kwh / 1000, 1),
    full: (kwh: number) => `${fmtNumber(kwh / 1000, 1)} ${lang === 'ar' ? 'ميغاواط ساعة' : 'MWh'}`,
  };
}

/** Compact SAR: "SAR 96.2k" / "96.2 ألف ر.س". */
export function useFmtSarCompact() {
  const { lang, fmtNumber } = useI18n();
  return (sar: number) => {
    if (sar < 10_000) return lang === 'ar' ? `${fmtNumber(Math.round(sar))} ر.س` : `SAR ${fmtNumber(Math.round(sar))}`;
    if (sar < 1_000_000) {
      const v = fmtNumber(sar / 1000, 1);
      return lang === 'ar' ? `${v} ألف ر.س` : `SAR ${v}k`;
    }
    const v = fmtNumber(sar / 1_000_000, 2);
    return lang === 'ar' ? `${v} مليون ر.س` : `SAR ${v}m`;
  };
}

/** Riyadh date and time of the simulated clock, in the active language. */
export function useAsAt(): string {
  const { lang, t } = useI18n();
  const { now } = useDemo();
  const d = new Intl.DateTimeFormat(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Riyadh' }).format(now);
  let tm = new Intl.DateTimeFormat(LOCALE[lang], { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Riyadh' }).format(now);
  if (lang === 'en') tm = tm.replace(/\b(am|pm)\b/g, (m) => m.toUpperCase());
  return t('overview.asAt', { date: d, time: tm });
}

/** "As at" line: live dot, date and time, scope, club count (CV-11). */
export function AsAtLine({ scope: forced, count }: { scope?: Scope; count?: number } = {}) {
  const i18n = useI18n();
  const sc = useScope();
  const scope = forced ?? sc.scope;
  const clubs = { length: count ?? sc.clubs.length };
  const data = useDemo();
  const label = scopeLabel(scope, i18n, data.clubs, data.districts);
  const when = useAsAt();
  return (
    <p className="ov-asat">
      <span className="live-dot" aria-hidden />
      <span>{when}</span>
      <span aria-hidden>·</span>
      <span>{label}</span>
      {scope.level !== 'club' && (<><span aria-hidden>·</span><span>{i18n.fmtClubs(clubs.length)}</span></>)}
    </p>
  );
}

export function ClubStatus({ status }: { status: ClubLive['status'] }) {
  const { t } = useI18n();
  const map = { critical: { tone: 'danger' as const, icon: AlertOctagon }, warning: { tone: 'warning' as const, icon: AlertTriangle }, ok: { tone: 'success' as const, icon: CheckCircle2 } };
  const m = map[status];
  return <Badge tone={m.tone} icon={m.icon}>{t(`overview.status.${status}`)}</Badge>;
}

export const STATUS_RANK: Record<ClubLive['status'], number> = { critical: 0, warning: 1, ok: 2 };

/** Animated number: counts up from 0 on first show, then glides between live updates. Respects reduced motion. */
export function useCountUp(target: number, duration = 1400): number {
  const [v, setV] = useState(0);
  const from = useRef(0);
  const shown = useRef(0);
  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { shown.current = target; setV(target); return; }
    from.current = shown.current;
    const start = performance.now();
    const d = from.current === 0 ? duration : 600;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / d);
      const e = 1 - Math.pow(1 - p, 3);
      const x = from.current + (target - from.current) * e;
      shown.current = x;
      setV(x);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

export function CountUp({ value, format }: { value: number; format: (v: number) => string }) {
  const v = useCountUp(value);
  return <span aria-label={format(value)}><span aria-hidden>{format(v)}</span></span>;
}

/** Horizontal bar list (grows from the reading start; mirrors in Arabic). */
export interface HBarItem { key: string; label: ReactNode; value: number; display: string; tag?: ReactNode; highlight?: boolean; onClick?: () => void; ariaLabel?: string }

export function HBarList({ items, ariaLabel, max }: { items: HBarItem[]; ariaLabel: string; max?: number }) {
  const hi = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="ov-hbars" role="figure" aria-label={ariaLabel}>
      {items.map((it) => {
        const body = (
          <>
            <span className="ov-hbars__label">{it.label}</span>
            <span className="ov-hbars__track" aria-hidden>
              <span className={`ov-hbars__fill ${it.highlight ? 'is-hi' : ''}`} style={{ inlineSize: `${Math.max(1.5, (it.value / hi) * 100)}%` }} />
            </span>
            <span className="ov-hbars__val num">{it.display}</span>
            {it.tag && <span className="ov-hbars__tag">{it.tag}</span>}
          </>
        );
        return (
          <li key={it.key}>
            {it.onClick
              ? <button type="button" className="ov-hbars__row" onClick={it.onClick} aria-label={it.ariaLabel}>{body}</button>
              : <div className="ov-hbars__row">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

export function clubName(c: Club, pick: (en: string, ar: string) => string) {
  return pick(c.nameEn, c.nameAr);
}
