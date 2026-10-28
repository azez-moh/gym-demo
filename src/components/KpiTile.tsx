import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingDown, TrendingUp, Minus, type LucideIcon } from 'lucide-react';
import { useI18n } from '../i18n';
import { InfoTip } from './InfoTip';
import { Sparkline } from './Sparkline';
import { LiveTag } from './LiveTag';

/**
 * Keeps a signed leading number ("−1", "+0.5", "−5.0%") in left-to-right order while any unit after it
 * ("ث", "نقطة", "min") follows the paragraph direction, so Arabic reads "−1 ث" and English "−1 s".
 */
// eslint-disable-next-line react-refresh/only-export-components
export function isolateLead(txt: string): string {
  const clean = txt.replace(/\u200e/g, '');
  return clean.replace(/^([+−-]?\s*[\d.,]+%?)/, '\u2066$1\u2069');
}

export interface KpiDelta {
  /** Signed change, e.g. -4.2 */
  value: number;
  /** Suffix after the number. Default "%". Use "pp" for percentage points or "" for absolute. */
  unit?: string;
  /** Which direction is good. "up" (default): increase is green. "down": decrease is green. "none": neutral colour. */
  goodWhen?: 'up' | 'down' | 'none';
  /** Comparison text after the chip. Default "vs previous period". */
  label?: string;
  /** Custom formatted delta text, replaces the number. */
  text?: string;
}

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  unit?: string;
  icon?: LucideIcon;
  delta?: KpiDelta;
  spark?: number[];
  /** Palette slot for the sparkline. */
  sparkSlot?: number;
  /** Required: localised explanation for the "i" button (what the box measures and how). */
  info: string;
  /** Small line under the value, e.g. a tariff note or target. */
  hint?: ReactNode;
  /** Shows the green "Live" tag at the top inline-end (before the "i") for current-moment figures. */
  live?: boolean;
  /** Makes the whole tile a link. */
  to?: string;
  className?: string;
}

export function KpiTile({ label, value, unit, icon: Icon, delta, spark, sparkSlot = 0, info, hint, live, to, className = '' }: KpiTileProps) {
  const { t, fmtNumber } = useI18n();
  const navigate = useNavigate();
  let deltaNode: ReactNode = null;
  if (delta) {
    // Direction and sign follow the displayed (rounded) value, so "0 s" or "0.0%" is never coloured.
    const shown = delta.text != null ? Math.round(delta.value) : Math.round(delta.value * 10) / 10;
    const v = shown;
    const dir = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    const good = delta.goodWhen ?? 'up';
    const tone = good === 'none' || dir === 'flat' ? 'neutral' : dir === good ? 'good' : 'bad';
    const DIcon = dir === 'up' ? TrendingUp : dir === 'down' ? TrendingDown : Minus;
    // Shared unit translation: "pp" (percentage points) reads "نقطة" in Arabic.
    const unitStr = delta.unit === 'pp' ? t('common.pp') : (delta.unit ?? '%');
    // Shares and changes in % or points always show one decimal ("−5.0%"); other units at most one.
    const fixed1 = delta.unit === undefined || delta.unit === '%' || delta.unit === 'pp';
    const num = fmtNumber(Math.abs(v), fixed1 ? 1 : { maximumFractionDigits: 1 });
    const txt = delta.text ?? `${v > 0 ? '+' : v < 0 ? '−' : ''}${num}${unitStr === '%' ? '%' : unitStr ? ` ${unitStr}` : ''}`;
    deltaNode = (
      <>
        <span className={`delta delta--${tone}`}><DIcon aria-hidden className="flip-rtl" /><span className="num">{isolateLead(txt)}</span></span>
        <span>{delta.label ?? t('common.vsPrev')}</span>
      </>
    );
  }
  const content = (
    <>
      <div className="kpi__top">
        <div className="kpi__label">
          {Icon && <span className="kpi__icon"><Icon aria-hidden /></span>}
          <span>{label}</span>
        </div>
        {(info || live) && <span className="kpi__end">{live && <LiveTag />}{info && <InfoTip text={info} />}</span>}
      </div>
      <div className="kpi__value-row">
        <div className="kpi__value">
          <span className="num">{value}</span>
          {unit && <span className="kpi__unit">{unit}</span>}
        </div>
        {spark && spark.length > 1 && <div className="kpi__spark"><Sparkline data={spark} slot={sparkSlot} /></div>}
      </div>
      {(deltaNode || hint) && (
        <div className="stack" style={{ gap: 4 }}>
          {deltaNode && <div className="kpi__foot">{deltaNode}</div>}
          {hint && <div className="kpi__hint">{hint}</div>}
        </div>
      )}
    </>
  );
  if (to) {
    return (
      <div role="link" tabIndex={0} className={`card card--pad-md kpi kpi--link ${className}`.trim()}
        onClick={() => navigate(to)} onKeyDown={(e) => { if (e.key === 'Enter') navigate(to); }}>
        {content}
      </div>
    );
  }
  return <div className={`card card--pad-md kpi ${className}`.trim()}>{content}</div>;
}
