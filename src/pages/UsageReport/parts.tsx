import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, CircleDashed, CircleSlash } from 'lucide-react';
import { Badge, Card, InfoTip } from '../../components';
import { useI18n } from '../../i18n';
import { hhmm } from '../../data';
import { useChartTokens } from '../../theme/theme';
import { useTypeLabel } from '../Machines/shared/parts';
import type { CoverageKind, FamilyReport, MachineReport, Report } from '../Machines/shared/usage';

const RARE_PCT = 3;

// ---------- Peak hours ----------

export function PeakHours({ peak, closed }: { peak: number[]; closed: boolean[] }) {
  const { t, fmtNumber } = useI18n();
  const ct = useChartTokens();
  const [focus, setFocus] = useState<number | null>(null);
  const max = Math.max(...peak, 0.1);
  const top = [...peak].map((v, h) => ({ v, h })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const best = top[0]?.v ?? 0;
  const peaks = top.filter((x) => x.v >= best * 0.97).slice(0, 3).map((x) => x.h).sort((a, b) => a - b);
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return (
    <Card title={t('usageReport.peak.title')} info={t('usageReport.peak.info')}>
      <div className="stack" style={{ gap: 8 }}>
        <div className="ur-peak" role="img" aria-label={t('usageReport.peak.aria', { hours: peaks.map(hh).join(', ') })}>
          {peak.map((v, h) => {
            const isPeak = peaks.includes(h) && v > 0;
            return (
              <button key={h} type="button" className={`ur-peak__col ${closed[h] ? 'is-closed' : ''} ${focus === h ? 'is-focus' : ''}`}
                onMouseEnter={() => setFocus(h)} onMouseLeave={() => setFocus(null)} onFocus={() => setFocus(h)} onBlur={() => setFocus(null)}
                onClick={() => setFocus(focus === h ? null : h)} aria-label={`${hh(h)}: ${fmtNumber(v, 1)}`}>
                <span className="ur-peak__val num" style={{ color: isPeak ? 'var(--text)' : undefined }}>{v > 0 ? fmtNumber(v, { maximumFractionDigits: 0 }) : ''}</span>
                <span className="ur-peak__bar" style={{ height: `${(v / max) * 100}%`, background: isPeak ? ct.series[0] : ct.series[2] }} />
                <span className="ur-peak__lbl num">{String(h).padStart(2, '0')}</span>
                {focus === h && (
                  <span className="viz-tip ur-peak__tip" role="tooltip">
                    <span className="viz-tip__title">{hh(h)}</span>
                    <span className="viz-tip__row"><span className="viz-tip__key">{t('usageReport.peak.value')}</span><span className="viz-tip__val num">{fmtNumber(v, 1)}</span></span>
                    {closed[h] && <span className="faint">{t('usageReport.peak.closed')}</span>}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="muted mr-small">
          {peaks.length ? t('usageReport.peak.caption', { hours: peaks.map(hh).join(t('usageReport.and')), v: fmtNumber(best, { maximumFractionDigits: 0 }) }) : t('usageReport.noUsage')}
        </p>
      </div>
    </Card>
  );
}

// ---------- Utilisation by family ----------

export function FamilyBars({ families }: { families: FamilyReport[] }) {
  const { t, fmtNumber } = useI18n();
  const typeLabel = useTypeLabel();
  const n = families.length;
  return (
    <Card title={t('usageReport.family.title')} info={t('usageReport.family.info')}>
      <div className="stack" style={{ gap: 10 }}>
        <ul className="ur-bars">
          {families.map((f, i) => {
            const total = f.usedMin + f.idleMin + f.unknownMin || 1;
            const rare = i >= n - 2 && f.utilPct < RARE_PCT && n > 2;
            return (
              <li key={f.type} className="ur-bars__row">
                <span className="ur-bars__name">{typeLabel(f.type)}<span className="mr-sub num">{t('usageReport.family.sessions', { n: fmtNumber(f.sessions) })}</span></span>
                <span className="ur-stack" aria-hidden>
                  <span className={`ur-stack__used ${i === 0 ? 'is-top' : ''}`} style={{ width: `${(f.usedMin / total) * 100}%` }} />
                  <span className="ur-stack__idle" style={{ width: `${(f.idleMin / total) * 100}%` }} />
                  <span className="ur-stack__unknown" style={{ width: `${(f.unknownMin / total) * 100}%` }} />
                </span>
                <span className="ur-bars__val num">{fmtNumber(f.utilPct, 1)}%</span>
                <span className="ur-bars__flag">
                  {rare && <Badge tone="warning">{t('usageReport.family.rare')}</Badge>}
                  {f.coveragePct < 99.95 && <Badge tone="neutral" icon={CircleDashed}>{t('usageReport.family.noReading')}</Badge>}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="ur-legend">
          <span><i className="ur-sw ur-sw--top" />{t('usageReport.legend.top')}</span>
          <span><i className="ur-sw ur-sw--used" />{t('usageReport.legend.used')}</span>
          <span><i className="ur-sw ur-sw--idle" />{t('usageReport.legend.idle')}</span>
          <span><i className="ur-sw ur-sw--unknown" />{t('usageReport.legend.unknown')}</span>
        </div>
      </div>
    </Card>
  );
}

// ---------- Usage vs machine count ----------

export function CapacityBars({ families }: { families: FamilyReport[] }) {
  const { t, fmtNumber } = useI18n();
  const typeLabel = useTypeLabel();
  const n = families.length;
  return (
    <Card title={t('usageReport.count.title')} info={t('usageReport.count.info')}>
      <div className="stack" style={{ gap: 10 }}>
        <ul className="ur-bars">
          {families.map((f, i) => (
            <li key={f.type} className="ur-bars__row ur-bars__row--cap">
              <span className="ur-bars__name">{typeLabel(f.type)}<span className="mr-sub num">{t('usageReport.count.machines', { n: fmtNumber(f.machines) })}</span></span>
              <span className="ur-cap" aria-hidden>
                {Array.from({ length: f.machines }, (_, k) => (
                  <span key={k} className="ur-cap__slot">
                    <span className={`ur-cap__fill ${i === 0 ? 'is-top' : ''}`} style={{ width: `${Math.max(0, Math.min(1, f.avgInUse - k)) * 100}%` }} />
                  </span>
                ))}
              </span>
              <span className="ur-bars__text">
                <span className="num">{t('usageReport.count.line', { avg: fmtNumber(f.avgInUse, 2), n: fmtNumber(f.machines), pct: fmtNumber(f.capacityPct, 1) })}</span>
                <span className="mr-sub">
                  {t('usageReport.count.coverage', { pct: fmtNumber(f.coveragePct, 1) })}
                  {f.coveragePct < 99.95 && ` · ${t('usageReport.count.partNote')}`}
                </span>
              </span>
              <span className="ur-bars__flag">
                {i === 0 && <Badge tone="accent">{t('usageReport.count.busiest')}</Badge>}
                {i >= n - 2 && n > 2 && f.capacityPct < RARE_PCT && <Badge tone="warning">{t('usageReport.family.rare')}</Badge>}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted mr-small">{t('usageReport.count.note')}</p>
      </div>
    </Card>
  );
}

// ---------- Usage over time (small multiples) ----------

export function SmallMultiples({ report, splitBy }: { report: Report; splitBy: 'type' | 'machine' }) {
  const { t, pick, fmtNumber, fmtDate } = useI18n();
  const typeLabel = useTypeLabel();
  const items = splitBy === 'type'
    ? [...report.families].sort((a, b) => b.utilPct - a.utilPct).map((f) => ({ key: f.type, label: typeLabel(f.type), buckets: f.buckets, slots: f.machines }))
    : report.rows.map((r) => ({ key: r.machine.id, label: pick(r.machine.nameEn, r.machine.nameAr), buckets: r.buckets, slots: 1 }));
  const label = (i: number) => (report.hourlyBuckets ? `${report.bucketLabels[i]}:00` : fmtDate(`${report.bucketLabels[i]}T12:00:00+03:00`, 'short'));
  return (
    <div className="stack" style={{ gap: 10 }}>
      <div className="ur-multiples">
        {items.map((it) => (
          <div key={it.key} className="ur-mini">
            <span className="ur-mini__label">{it.label}</span>
            <div className="ur-mini__plot">
              {it.buckets.map((v, i) => {
                const cap = (report.bucketOpen[i] ?? 0) * it.slots;
                const share = cap > 0 ? Math.min(1, v / cap) : 0;
                return (
                  <span key={i} className={`ur-mini__col ${cap === 0 ? 'is-closed' : ''}`} title={`${label(i)}: ${fmtNumber(share * 100, 1)}%`}>
                    {cap > 0 && <span className="ur-mini__unused" style={{ height: `${(1 - share) * 100}%` }} />}
                    <span className="ur-mini__used" style={{ height: `${share * 100}%` }} />
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="ur-legend">
        <span><i className="ur-sw ur-sw--used" />{t('usageReport.legend.used')}</span>
        <span><i className="ur-sw ur-sw--pattern" />{t('usageReport.legend.unused')}</span>
        <span className="faint">{report.hourlyBuckets ? t('usageReport.over.byHour') : t('usageReport.over.byDay')}</span>
      </div>
    </div>
  );
}

// ---------- tables ----------

interface Col<T> { key: string; header: string; info?: string; end?: boolean; hideSm?: boolean; value: (r: T) => number | string; render: (r: T) => ReactNode }

function SortTable<T>({ rows, cols, rowKey, initial, caption }: { rows: T[]; cols: Col<T>[]; rowKey: (r: T) => string; initial: { key: string; dir: 'asc' | 'desc' }; caption: string }) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const c = cols.find((x) => x.key === sort.key);
    if (!c) return rows;
    return [...rows].sort((a, b) => {
      const x = c.value(a), y = c.value(b);
      const r = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, cols, sort]);
  return (
    <div className="dt mr-tablewrap">
      <div className="dt__scroll">
        <table>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {cols.map((c) => {
                const on = sort.key === c.key;
                return (
                  <th key={c.key} className={`${c.end ? 'dt--end' : ''} ${c.hideSm ? 'dt--hide-sm' : ''}`} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                    <span className="ur-th">
                      <button type="button" className="dt__sort" data-active={on} style={{ width: 'auto', paddingInlineEnd: 2 }}
                        onClick={() => setSort((s) => (s.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'desc' }))}>
                        {c.header}
                        {on ? (sort.dir === 'asc' ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />) : <ArrowUpDown aria-hidden />}
                      </button>
                      {c.info && <InfoTip text={c.info} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={rowKey(r)}>
                {cols.map((c) => <td key={c.key} className={`${c.end ? 'dt--end num' : ''} ${c.hideSm ? 'dt--hide-sm' : ''}`}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoveragePill({ kind }: { kind: CoverageKind }) {
  const { t } = useI18n();
  if (kind === 'observed') return <Badge tone="success" icon={CheckCircle2}>{t('usageReport.cov.observed')}</Badge>;
  if (kind === 'partial') return <Badge tone="warning" icon={CircleDashed}>{t('usageReport.cov.partial')}</Badge>;
  return <Badge tone="neutral" icon={CircleSlash}>{t('usageReport.cov.none')}</Badge>;
}

const hms = (min: number, fmt: (s: number) => string) => fmt(Math.round(min * 60));

export function BreakdownTable({ report }: { report: Report }) {
  const { t, pick, fmtNumber, fmtDuration } = useI18n();
  const typeLabel = useTypeLabel();
  const maxUsed = Math.max(1, ...report.rows.map((r) => r.usedMin));
  const cols: Col<MachineReport>[] = [
    { key: 'machine', header: t('usageReport.cols.machine'), value: (r) => pick(r.machine.nameEn, r.machine.nameAr),
      render: (r) => <span className="ur-namecol" style={{ display: 'block' }}>{pick(r.machine.nameEn, r.machine.nameAr)}<span className="mr-sub">{typeLabel(r.machine.type)}</span></span> },
    { key: 'sessions', header: t('usageReport.cols.sessions'), info: t('usageReport.cols.sessionsInfo'), end: true, value: (r) => r.sessions, render: (r) => fmtNumber(r.sessions) },
    { key: 'used', header: t('usageReport.cols.used'), info: t('usageReport.cols.usedInfo'), value: (r) => r.usedMin,
      render: (r) => (
        <span className="ur-usedcell">
          <span className="ur-usedcell__track" aria-hidden><span className="ur-usedcell__bar" style={{ width: `${(r.usedMin / maxUsed) * 100}%` }} /></span>
          <span className="num">{r.usedMin > 0 ? hms(r.usedMin, fmtDuration) : `0 ${t('usageReport.minShort')}`}</span>
        </span>
      ) },
    { key: 'idle', header: t('usageReport.cols.idle'), info: t('usageReport.cols.idleInfo'), end: true, hideSm: true, value: (r) => r.idleMin, render: (r) => hms(r.idleMin, fmtDuration) },
    { key: 'avg', header: t('usageReport.cols.avg'), info: t('usageReport.cols.avgInfo'), end: true, hideSm: true, value: (r) => r.avgSessionMin, render: (r) => (r.sessions ? hms(r.avgSessionMin, fmtDuration) : '0') },
    { key: 'gap', header: t('usageReport.cols.gap'), info: t('usageReport.cols.gapInfo'), end: true, hideSm: true, value: (r) => r.avgGapMin, render: (r) => (r.sessions > 1 ? hms(r.avgGapMin, fmtDuration) : '0') },
    { key: 'cov', header: t('usageReport.cols.coverage'), info: t('usageReport.cols.coverageInfo'), value: (r) => r.coverage,
      render: (r) => r.coverageKind === 'none' ? <CoveragePill kind="none" /> : (
        <span className="mr-fill"><span className="mr-fill__track" aria-hidden><span className="mr-fill__bar mr-fill__bar--muted" style={{ width: `${r.coverage * 100}%` }} /></span><span className="mr-fill__text num">{fmtNumber(r.coverage * 100, 1)}%</span></span>
      ) },
  ];
  return (
    <Card title={t('usageReport.breakdown.title')} info={t('usageReport.breakdown.info')} subtitle={t('usageReport.breakdown.sub', { n: fmtNumber(report.rows.length) })}>
      <SortTable rows={report.rows} cols={cols} rowKey={(r) => r.machine.id} initial={{ key: 'used', dir: 'desc' }} caption={t('usageReport.breakdown.title')} />
    </Card>
  );
}

export function TimelineTable({ report }: { report: Report }) {
  const { t, pick, fmtDuration, fmtDate } = useI18n();
  const multi = report.dates.length > 1;
  const when = (p?: { date: string; min: number }) => {
    if (!p) return <span className="faint">{t('usageReport.timeline.none')}</span>;
    return <span className="num">{multi ? `${fmtDate(`${p.date}T12:00:00+03:00`, 'short')}, ` : ''}{hhmm(p.min)}</span>;
  };
  const cols: Col<MachineReport>[] = [
    { key: 'machine', header: t('usageReport.cols.machine'), value: (r) => pick(r.machine.nameEn, r.machine.nameAr), render: (r) => <span className="ur-namecol" style={{ display: 'block' }}>{pick(r.machine.nameEn, r.machine.nameAr)}</span> },
    { key: 'first', header: t('usageReport.timeline.first'), value: (r) => (r.first ? `${r.first.date} ${hhmm(r.first.min)}` : 'z'), render: (r) => when(r.first) },
    { key: 'last', header: t('usageReport.timeline.last'), value: (r) => (r.last ? `${r.last.date} ${hhmm(r.last.min)}` : ''), render: (r) => when(r.last) },
    { key: 'used', header: t('usageReport.timeline.used'), end: true, value: (r) => r.usedMin, render: (r) => hms(r.usedMin, fmtDuration) },
    { key: 'gapb', header: t('usageReport.timeline.gapBefore'), info: t('usageReport.timeline.gapBeforeInfo'), end: true, hideSm: true, value: (r) => r.gapBeforeMin ?? -1, render: (r) => (r.gapBeforeMin != null ? hms(r.gapBeforeMin, fmtDuration) : '') },
    { key: 'cov', header: t('usageReport.cols.coverage'), value: (r) => r.coverage, render: (r) => <CoveragePill kind={r.coverageKind} /> },
  ];
  return (
    <Card title={t('usageReport.timeline.title')} info={t('usageReport.timeline.info')}>
      <SortTable rows={report.rows} cols={cols} rowKey={(r) => r.machine.id} initial={{ key: 'first', dir: 'asc' }} caption={t('usageReport.timeline.title')} />
    </Card>
  );
}
