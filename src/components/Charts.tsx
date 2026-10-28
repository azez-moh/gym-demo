import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import {
  Area, AreaChart as RAreaChart, Bar, BarChart as RBarChart, CartesianGrid, Line, LineChart as RLineChart,
  ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis,
} from 'recharts';
import { useI18n } from '../i18n';
import { useChartTokens } from '../theme/theme';
import type { ChartTokens } from '../theme/chartTokens';

/*
  Chart wrappers. They read the active theme's chart tokens, mirror in Arabic (time runs right to left,
  value axis on the right), keep marks thin, gridlines recessive, a legend for 2+ series, and a hover tooltip.
  Colours: series take palette slots in their array order (slot 0 = brand yellow, the single highlight). Pass `slot` to pin an entity
  to a slot so a filter never repaints survivors.
*/

export type Datum = Record<string, string | number | null | undefined>;

export interface SeriesDef {
  key: string;
  label: string;
  /** 0-based palette slot. Default: the series index. */
  slot?: number;
  /** Explicit colour (use sparingly, e.g. a muted comparison line). */
  color?: string;
  /** Dashed line (e.g. last month / last year comparison). */
  dashed?: boolean;
}

export interface BaseChartProps {
  data: Datum[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  /** Formats y-axis ticks and tooltip values. */
  yFormat?: (v: number) => string;
  /** Formats x-axis ticks and tooltip title. */
  xFormat?: (v: string | number) => string;
  /** Horizontal target / reference line. */
  reference?: { value: number; label?: string };
  yDomain?: [number | 'auto', number | 'auto'];
  /** Explicit y ticks (e.g. durationTicks / niceTicks); the domain follows them unless yDomain is set. */
  yTicks?: number[];
  /** Show every (n+1)th x label. Default: thinned to about 12 labels (6 on phones), the same in both directions. */
  xInterval?: number;
  /** Force legend on/off. Default: shown for 2+ series. */
  legend?: boolean;
  /** Space-saving: hide the y axis. */
  hideYAxis?: boolean;
  ariaLabel: string;
  /** Extra content under the chart (notes). */
  footer?: ReactNode;
}

const colorOf = (s: SeriesDef, i: number, ct: ChartTokens) => s.color ?? ct.series[(s.slot ?? i) % ct.series.length];

function Legend({ series, ct, kind }: { series: SeriesDef[]; ct: ChartTokens; kind: 'line' | 'bar' }) {
  return (
    <div className="chart__legend">
      {series.map((s, i) => (
        <span key={s.key} className="chart__legend-item">
          <span className={`chart__sw ${kind === 'bar' ? 'chart__sw--bar' : ''} ${s.dashed ? 'chart__sw--dashed' : ''}`}
            style={{ background: colorOf(s, i, ct), color: colorOf(s, i, ct) }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

interface TipPayload { dataKey?: string | number; value?: number | string; color?: string; payload?: Datum }

function makeTooltip(series: SeriesDef[], ct: ChartTokens, yFormat: (v: number) => string, xFormat: (v: string | number) => string, showTotal: boolean, totalLabel: string) {
  return function ChartTip(props: { active?: boolean; payload?: readonly TipPayload[]; label?: string | number }) {
    const { active, payload, label } = props;
    if (!active || !payload || !payload.length) return null;
    const byKey = new Map(payload.map((p) => [String(p.dataKey), p]));
    let total = 0;
    return (
      <div className="viz-tip">
        {label !== undefined && <div className="viz-tip__title">{xFormat(label)}</div>}
        {series.map((s, i) => {
          const p = byKey.get(s.key);
          if (!p || p.value === null || p.value === undefined) return null;
          const v = Number(p.value);
          total += v;
          return (
            <div key={s.key} className="viz-tip__row">
              <span className="viz-tip__key"><span className="viz-tip__sw" style={{ background: colorOf(s, i, ct) }} />{s.label}</span>
              <span className="viz-tip__val num">{yFormat(v)}</span>
            </div>
          );
        })}
        {showTotal && (
          <div className="viz-tip__row" style={{ borderBlockStart: '1px solid var(--border)', marginBlockStart: 4, paddingBlockStart: 6 }}>
            <span className="viz-tip__key">{totalLabel}</span>
            <span className="viz-tip__val num">{yFormat(total)}</span>
          </div>
        )}
      </div>
    );
  };
}

/**
 * Target-line label drawn inside the plot on the reading-start side (left in English, right in Arabic),
 * 8px in from the edge and just above the line. Anchoring is computed in LTR coordinates so it never clips.
 */
function RefLabel({ viewBox, text, rtl, ct }: { viewBox?: unknown; text: string; rtl: boolean; ct: ChartTokens }) {
  const vb = (viewBox ?? {}) as { x?: number; y?: number; width?: number };
  if (vb.x === undefined || vb.y === undefined || vb.width === undefined) return null;
  const x = rtl ? vb.x + vb.width - 8 : vb.x + 8;
  return (
    <text x={x} y={vb.y - 6} textAnchor={rtl ? 'end' : 'start'} fill={ct.text} fontSize={11} fontWeight={700}
      stroke={ct.surface} strokeWidth={3} paintOrder="stroke" strokeLinejoin="round" style={{ direction: 'ltr', unicodeBidi: 'plaintext' }}>
      {text}
    </text>
  );
}

function useNarrow(): boolean {
  const q = '(max-width: 600px)';
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

function useAxes(props: BaseChartProps) {
  const ct = useChartTokens();
  const { isRtl, fmtNumber, t } = useI18n();
  const narrow = useNarrow();
  const yFormat = props.yFormat ?? ((v: number) => fmtNumber(v, { notation: Math.abs(v) >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 }));
  const xFormat = props.xFormat ?? ((v: string | number) => String(v));
  const tick = { fill: ct.axis, fontSize: narrow ? 10 : 11 };
  const maxX = narrow ? 6 : 12;
  const n = props.data.length;
  const interval = props.xInterval ?? (n > maxX ? Math.ceil(n / maxX) - 1 : 0);
  const xAxis = (
    <XAxis dataKey={props.xKey} reversed={isRtl} tick={tick} tickFormatter={xFormat} tickLine={false}
      axisLine={{ stroke: ct.baseline }} interval={interval} tickMargin={8} />
  );
  const yTicks = props.yTicks;
  const domain = props.yDomain ?? (yTicks && yTicks.length ? [yTicks[0], yTicks[yTicks.length - 1]] as [number, number] : [0, 'auto'] as [number, 'auto']);
  const yAxis = (
    <YAxis orientation={isRtl ? 'right' : 'left'} tick={tick} tickFormatter={yFormat} tickLine={false} axisLine={false}
      width={props.hideYAxis ? 0 : narrow ? 46 : 56} hide={props.hideYAxis} domain={domain} ticks={yTicks} interval={0} tickMargin={4} allowDecimals={!yTicks} />
  );
  const grid = <CartesianGrid vertical={false} stroke={ct.grid} strokeDasharray="0" />;
  const ref = props.reference ? (
    <ReferenceLine y={props.reference.value} stroke={ct.target} strokeDasharray="5 4" strokeWidth={1.5}
      label={props.reference.label ? (lp: { viewBox?: unknown }) => <RefLabel viewBox={lp.viewBox} text={props.reference!.label!} rtl={isRtl} ct={ct} /> : undefined} />
  ) : null;
  const margin = { top: 8, right: isRtl ? 0 : 8, left: isRtl ? 8 : 0, bottom: 0 };
  return { ct, yFormat, xFormat, xAxis, yAxis, grid, ref, margin, totalLabel: t('common.total') };
}

function Frame({ props, kind, children }: { props: BaseChartProps; kind: 'line' | 'bar'; children: ReactNode }) {
  const ct = useChartTokens();
  const showLegend = props.legend ?? props.series.length >= 2;
  return (
    <div className="chart" role="figure" aria-label={props.ariaLabel}>
      {showLegend && <Legend series={props.series} ct={ct} kind={kind} />}
      <div className="chart__canvas" style={{ height: props.height ?? 260 }}>
        <ResponsiveContainer width="100%" height="100%">{children as ReactElement}</ResponsiveContainer>
      </div>
      {props.footer}
    </div>
  );
}

/** Lines over time. Use dashed series for comparisons (last month, last year). */
export function LineChart(props: BaseChartProps) {
  const a = useAxes(props);
  const Tip = makeTooltip(props.series, a.ct, a.yFormat, a.xFormat, false, a.totalLabel);
  return (
    <Frame props={props} kind="line">
      <RLineChart data={props.data} margin={a.margin}>
        {a.grid}{a.xAxis}{a.yAxis}
        <RTooltip content={(p) => <Tip {...(p as object)} />} cursor={{ stroke: a.ct.axis, strokeWidth: 1, strokeDasharray: '3 3' }} />
        {a.ref}
        {props.series.map((s, i) => (
          <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={colorOf(s, i, a.ct)} strokeWidth={2}
            strokeDasharray={s.dashed ? '5 4' : undefined} dot={false} connectNulls
            activeDot={{ r: 4.5, strokeWidth: 2, stroke: a.ct.surface }} isAnimationActive={false} />
        ))}
      </RLineChart>
    </Frame>
  );
}

export interface BarChartProps extends BaseChartProps {
  /** Stack series (default true). */
  stacked?: boolean;
  /** Max bar thickness in px. */
  barSize?: number;
}

/** Vertical bars, stacked by default, with a 1px surface gap between segments and square ends (brand). */
export function BarChart(props: BarChartProps) {
  const a = useAxes(props);
  const stacked = props.stacked ?? true;
  const Tip = makeTooltip(props.series, a.ct, a.yFormat, a.xFormat, stacked && props.series.length > 1, a.totalLabel);
    return (
    <Frame props={props} kind="bar">
      <RBarChart data={props.data} margin={a.margin} barCategoryGap="22%" barGap={2}>
        {a.grid}{a.xAxis}{a.yAxis}
        <RTooltip content={(p) => <Tip {...(p as object)} />} cursor={{ fill: a.ct.grid, opacity: 0.6 }} />
        {a.ref}
        {props.series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId={stacked ? 'a' : undefined} fill={colorOf(s, i, a.ct)}
            stroke={a.ct.surface} strokeWidth={stacked ? 1 : 0} maxBarSize={props.barSize ?? 36}
            radius={0} isAnimationActive={false} />
        ))}
      </RBarChart>
    </Frame>
  );
}

export interface AreaChartProps extends BaseChartProps {
  stacked?: boolean;
}

/** Filled area over time. Single series reads as volume; stacked shows composition. */
export function AreaChart(props: AreaChartProps) {
  const a = useAxes(props);
  const stacked = props.stacked ?? false;
  const Tip = makeTooltip(props.series, a.ct, a.yFormat, a.xFormat, stacked && props.series.length > 1, a.totalLabel);
  return (
    <Frame props={props} kind="line">
      <RAreaChart data={props.data} margin={a.margin}>
        <defs>
          {props.series.map((s, i) => (
            <linearGradient key={s.key} id={`area-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={colorOf(s, i, a.ct)} stopOpacity={stacked ? 0.55 : 0.28} />
              <stop offset="100%" stopColor={colorOf(s, i, a.ct)} stopOpacity={stacked ? 0.35 : 0.02} />
            </linearGradient>
          ))}
        </defs>
        {a.grid}{a.xAxis}{a.yAxis}
        <RTooltip content={(p) => <Tip {...(p as object)} />} cursor={{ stroke: a.ct.axis, strokeWidth: 1, strokeDasharray: '3 3' }} />
        {a.ref}
        {props.series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stackId={stacked ? 'a' : undefined}
            stroke={colorOf(s, i, a.ct)} strokeWidth={2} fill={`url(#area-${s.key})`} strokeDasharray={s.dashed ? '5 4' : undefined}
            activeDot={{ r: 4.5, strokeWidth: 2, stroke: a.ct.surface }} isAnimationActive={false} connectNulls />
        ))}
      </RAreaChart>
    </Frame>
  );
}
