import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';
import { useChartTokens } from '../theme/theme';

export interface HeatmapRow { key: string; label: ReactNode; values: number[] }

/**
 * Rows x columns grid on the sequential ramp (yellow = busiest). Mirrors in RTL (CSS grid follows direction).
 * Use for busy-by-club-and-hour and similar matrices.
 */
export function Heatmap({ rows, columns, format, ariaLabel, legendLow, legendHigh, max }: {
  rows: HeatmapRow[]; columns: string[]; format?: (v: number) => string; ariaLabel: string; legendLow?: string; legendHigh?: string; max?: number;
}) {
  const ct = useChartTokens();
  const { fmtNumber } = useI18n();
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const hi = max ?? Math.max(1, ...rows.flatMap((r) => r.values));
  const colour = (v: number) => ct.seq[Math.min(ct.seq.length - 1, Math.round((v / hi) * (ct.seq.length - 1)))];
  const fmt = format ?? ((v: number) => fmtNumber(v));
  return (
    <div className="heatmap" role="figure" aria-label={ariaLabel}>
      <div className="heatmap__scroll">
        <div className="heatmap__grid" style={{ gridTemplateColumns: `minmax(110px, max-content) repeat(${columns.length}, minmax(22px, 1fr))` }}>
          <span />
          {columns.map((c, i) => <span key={i} className="heatmap__collabel num">{c}</span>)}
          {rows.map((r) => [
            <span key={`${r.key}:l`} className="heatmap__rowlabel">{r.label}</span>,
            ...r.values.map((v, i) => (
              <button key={`${r.key}:${i}`} type="button" className="heatmap__cell" style={{ background: colour(v) }}
                aria-label={`${typeof r.label === 'string' ? r.label : r.key}, ${columns[i]}: ${fmt(v)}`}
                onMouseEnter={(e) => { const b = e.currentTarget.getBoundingClientRect(); setTip({ x: b.left + b.width / 2, y: b.top, text: `${columns[i]} · ${fmt(v)}` }); }}
                onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)} />
            )),
          ])}
        </div>
      </div>
      <div className="heatmap__legend">
        <span>{legendLow}</span>
        <span className="heatmap__ramp">{ct.seq.map((c) => <span key={c} style={{ background: c }} />)}</span>
        <span>{legendHigh}</span>
      </div>
      {tip && createPortal(<div className="heatmap__float viz-tip" style={{ left: tip.x, top: tip.y - 8, transform: 'translate(-50%, -100%)' }}>{tip.text}</div>, document.body)}
    </div>
  );
}
