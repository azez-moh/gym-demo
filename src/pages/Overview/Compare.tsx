import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowLeftRight, ArrowUp, ArrowRight, Columns2 } from 'lucide-react';
import { Card, Drawer, InfoTip, LiveTag, Select } from '../../components';
import { useI18n } from '../../i18n';
import { useDemo, TARIFF_SAR_PER_KWH, type Club, type MachineType } from '../../data';
import { FAMILIES } from '../../data/fleet';
import type { ClubRow } from './metrics';
import { HIGH_PCT, LOW_PCT, type GymStats, type Insight } from './insights';
import { ClubStatus } from './shared';
import { describe, KindChip, useTx } from './Insights';
import './insights.css';

/** One gym in the comparison: live row plus 4-week stats. */
export interface GymCmp { club: Club; row: ClubRow; stats: GymStats; oos: number; machines: number }

type ColKey = 'people' | 'machine' | 'sessions' | 'energy' | 'kwhM2' | 'alarms' | 'oos';
const COLS: ColKey[] = ['people', 'machine', 'sessions', 'energy', 'kwhM2', 'alarms', 'oos'];
/** Which direction is better ('up' higher is better, 'down' lower is better, null no judgement). */
const DIR: Record<ColKey, 'up' | 'down' | null> = { people: null, machine: 'up', sessions: 'up', energy: 'down', kwhM2: 'down', alarms: 'down', oos: 'down' };

function valueOf(g: GymCmp, k: ColKey): number {
  switch (k) {
    case 'people': return g.row.pctFull;
    case 'machine': return g.stats.utilPct;
    case 'sessions': return g.stats.sessionsPerMachineDay;
    case 'energy': return g.stats.kwhPerVisit;
    case 'kwhM2': return g.stats.kwhPerM2;
    case 'alarms': return g.row.alerts.length;
    case 'oos': return g.oos;
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Best and worst gym per directional column (only when the values differ). */
function extremes(gyms: GymCmp[]) {
  const out: Partial<Record<ColKey, { best: string; worst: string }>> = {};
  for (const k of COLS) {
    const dir = DIR[k];
    if (!dir || gyms.length < 2) continue;
    const vs = gyms.map((g) => valueOf(g, k));
    if (Math.max(...vs) === Math.min(...vs)) continue;
    const sorted = [...gyms].sort((a, b) => (dir === 'up' ? valueOf(b, k) - valueOf(a, k) : valueOf(a, k) - valueOf(b, k)));
    out[k] = { best: sorted[0].club.id, worst: sorted[sorted.length - 1].club.id };
  }
  return out;
}

function useFmtCell() {
  const { t, fmtNumber, lang } = useI18n();
  const sar = (v: number) => (lang === 'ar' ? `${fmtNumber(v, 2)} ر.س` : `SAR ${fmtNumber(v, 2)}`);
  const kwh = lang === 'ar' ? 'كيلوواط ساعة' : 'kWh';
  return (g: GymCmp, k: ColKey): ReactNode => {
    switch (k) {
      case 'people': return <><span>{fmtNumber(g.row.peopleIn)}</span><span className="cmp-sub">{fmtNumber(g.row.pctFull)}%</span></>;
      case 'machine': return `${fmtNumber(g.stats.utilPct, 1)}%`;
      case 'sessions': return fmtNumber(g.stats.sessionsPerMachineDay, 1);
      case 'energy': return <><span>{fmtNumber(g.stats.kwhPerVisit, 2)} {kwh}</span><span className="cmp-sub">{sar(g.stats.sarPerVisit)}</span></>;
      case 'kwhM2': return fmtNumber(g.stats.kwhPerM2, 1);
      case 'alarms': return <span className={g.row.critical ? 'ov-crit' : ''}>{fmtNumber(g.row.alerts.length)}</span>;
      case 'oos': return <><span>{fmtNumber(g.oos)}</span><span className="cmp-sub">{t('insights.cmp.of', { n: fmtNumber(g.machines) })}</span></>;
    }
  };
}

// ---------- gym comparison table ----------

export function GymComparison({ gyms, scopeIds, isAll, onCompare }: {
  gyms: GymCmp[]; scopeIds: string[]; isAll: boolean; onCompare: (a?: string) => void;
}) {
  const { t, pick, fmtNumber, fmtCurrency } = useI18n();
  const navigate = useNavigate();
  const cell = useFmtCell();
  const [sort, setSort] = useState<{ k: ColKey | 'name'; desc: boolean }>({ k: 'name', desc: false });
  const ext = useMemo(() => extremes(gyms), [gyms]);
  const sorted = useMemo(() => {
    if (sort.k === 'name') return gyms;
    const k = sort.k;
    return [...gyms].sort((a, b) => (sort.desc ? valueOf(b, k) - valueOf(a, k) : valueOf(a, k) - valueOf(b, k)));
  }, [gyms, sort]);
  const onSort = (k: ColKey) => setSort((s) => (s.k === k ? (s.desc ? { k, desc: false } : { k: 'name', desc: false }) : { k, desc: true }));
  const avg = {
    people: mean(gyms.map((g) => g.row.peopleIn)), pct: mean(gyms.map((g) => g.row.pctFull)),
    machine: mean(gyms.map((g) => g.stats.utilPct)), sessions: mean(gyms.map((g) => g.stats.sessionsPerMachineDay)),
    energy: mean(gyms.map((g) => g.stats.kwhPerVisit)), kwhM2: mean(gyms.map((g) => g.stats.kwhPerM2)),
    alarms: mean(gyms.map((g) => g.row.alerts.length)), oos: mean(gyms.map((g) => g.oos)),
  };
  const colLabel = (k: ColKey) => t(`insights.cmp.${k}`);

  return (
    <Card className="cmp" title={<span className="ov-card-title">{t('insights.cmp.title')}</span>}
      info={t('insights.cmp.info', { tariff: fmtCurrency(TARIFF_SAR_PER_KWH, 2) })}
      actions={<button type="button" className="btn btn--sm" onClick={() => onCompare()}><Columns2 aria-hidden />{t('insights.cmp.compareTwo')}</button>}>
      <div className="cmp__scroll" tabIndex={0} role="region" aria-label={t('insights.cmp.title')}>
        <table className="cmp__table">
          <thead>
            <tr>
              <th scope="col" className="cmp__gymcol">{t('insights.cmp.gym')}</th>
              {COLS.map((k) => (
                <th key={k} scope="col" aria-sort={sort.k === k ? (sort.desc ? 'descending' : 'ascending') : 'none'}>
                  <span className="cmp__th">
                    <button type="button" className="cmp__sort" onClick={() => onSort(k)} aria-label={t('insights.cmp.sortBy', { col: colLabel(k) })}>
                      {colLabel(k)}
                      {sort.k === k && (sort.desc ? <ArrowDown aria-hidden /> : <ArrowUp aria-hidden />)}
                    </button>
                    {k === 'people' && <LiveTag />}
                    <InfoTip text={t(`insights.cmp.${k}Info`)} />
                  </span>
                </th>
              ))}
              <th scope="col"><span className="visually-hidden">{t('insights.cmp.compare')}</span></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => {
              const inScope = !isAll && scopeIds.includes(g.club.id);
              const name = pick(g.club.nameEn, g.club.nameAr);
              return (
                <tr key={g.club.id} className={inScope ? 'is-scope' : ''} aria-current={inScope ? 'true' : undefined}>
                  <th scope="row" className="cmp__gymcol">
                    <button type="button" className="cmp__gym" onClick={() => navigate(`/branches?club=${encodeURIComponent(g.club.id)}`)}>
                      <span className="cmp__gymname">{name}</span>
                    </button>
                    <span className="cmp__gymtags">
                      {inScope && <span className="ov-mark ov-mark--hi">{t('insights.cmp.inScope')}</span>}
                    </span>
                  </th>
                  {COLS.map((k) => {
                    const e = ext[k];
                    const mark = e?.best === g.club.id ? 'best' : e?.worst === g.club.id ? 'worst' : null;
                    return (
                      <td key={k} className={`num ${mark ? `is-${mark}` : ''}`}>
                        <span className="cmp__cell">{cell(g, k)}</span>
                        {mark && <span className={`cmp__mark cmp__mark--${mark}`}>{t(`insights.cmp.${mark}`)}</span>}
                      </td>
                    );
                  })}
                  <td className="cmp__act">
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => onCompare(g.club.id)} aria-label={t('insights.cmp.compareWith', { name })}>
                      <ArrowLeftRight aria-hidden />{t('insights.cmp.compare')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="cmp__gymcol">{t('insights.cmp.avg')}</th>
              <td className="num"><span className="cmp__cell"><span>{fmtNumber(Math.round(avg.people))}</span><span className="cmp__sub cmp-sub">{fmtNumber(Math.round(avg.pct))}%</span></span></td>
              <td className="num">{fmtNumber(avg.machine, 1)}%</td>
              <td className="num">{fmtNumber(avg.sessions, 1)}</td>
              <td className="num"><span className="cmp__cell"><span>{fmtNumber(avg.energy, 2)}</span><span className="cmp-sub">{fmtCurrency(avg.energy * TARIFF_SAR_PER_KWH, 2)}</span></span></td>
              <td className="num">{fmtNumber(avg.kwhM2, 1)}</td>
              <td className="num">{fmtNumber(avg.alarms, 1)}</td>
              <td className="num">{fmtNumber(avg.oos, 1)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}

// ---------- equipment matrix ----------

const TYPE_ORDER: MachineType[] = FAMILIES.flatMap((f) => f.types);

export function EquipmentMatrix({ gyms, insights, scopeIds, isAll, onCell }: {
  gyms: GymCmp[]; insights: Insight[]; scopeIds: string[]; isAll: boolean; onCell: (type: MachineType, clubId: string) => void;
}) {
  const { t, fmtNumber } = useI18n();
  const x = useTx();
  const types = TYPE_ORDER.filter((ty) => gyms.some((g) => g.stats.byType.some((u) => u.type === ty)));
  const has = (ty: MachineType, id: string) => insights.some((i) => i.type === ty && i.clubIds.includes(id));
  const tone = (u: number) => (u < LOW_PCT ? 'low' : u > HIGH_PCT ? 'high' : u >= 30 ? 'mid2' : 'mid');
  return (
    <Card className="mx" title={<span className="ov-card-title">{t('insights.matrix.title')}</span>} info={t('insights.matrix.info')}>
      <div className="mx__scroll">
        <div className="mx__grid" role="table" aria-label={t('insights.matrix.title')} style={{ gridTemplateColumns: `minmax(130px, 1.3fr) repeat(${gyms.length}, minmax(64px, 1fr))` }}>
          <div role="row" className="mx__row">
            <span role="columnheader" />
            {gyms.map((g) => (
              <span key={g.club.id} role="columnheader" className={`mx__col ${!isAll && scopeIds.includes(g.club.id) ? 'is-scope' : ''}`}>{x.gym(g.club.id)}</span>
            ))}
          </div>
          {types.map((ty) => (
            <div role="row" className="mx__row" key={ty}>
              <span role="rowheader" className="mx__label">{x.typeLabel(ty)}</span>
              {gyms.map((g) => {
                const u = g.stats.byType.find((v) => v.type === ty);
                if (!u) {
                  return <span key={g.club.id} role="cell" className="mx__cell is-none" title={t('insights.matrix.cellNone', { type: x.typeLabel(ty), gym: x.gym(g.club.id) })}><span className="visually-hidden">{t('insights.matrix.none')}</span></span>;
                }
                const label = t('insights.matrix.cell', { type: x.typeLabel(ty), gym: x.gym(g.club.id), util: fmtNumber(u.utilPct), units: fmtNumber(u.units) });
                const rec = has(ty, g.club.id);
                const body = (
                  <>
                    <span className="mx__val num">{fmtNumber(Math.round(u.utilPct))}%</span>
                    <span className="mx__units num">×{fmtNumber(u.units)}</span>
                    {rec && <span className="mx__dot" aria-hidden />}
                  </>
                );
                return rec
                  ? <button key={g.club.id} type="button" role="cell" className={`mx__cell is-${tone(u.utilPct)} has-rec`} title={label} aria-label={`${label}. ${t('insights.matrix.rec')}`} onClick={() => onCell(ty, g.club.id)}>{body}</button>
                  : <span key={g.club.id} role="cell" className={`mx__cell is-${tone(u.utilPct)}`} title={label} aria-label={label}>{body}</span>;
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mx__legend">
        <span><i className="mx__sw is-low" />{t('insights.matrix.low')}</span>
        <span><i className="mx__sw is-mid" />{t('insights.matrix.mid')}</span>
        <span><i className="mx__sw is-high" />{t('insights.matrix.high')}</span>
        <span><i className="mx__sw is-none" />{t('insights.matrix.none')}</span>
        <span><i className="mx__dot mx__dot--legend" />{t('insights.matrix.rec')}</span>
      </div>
    </Card>
  );
}

// ---------- compare two gyms ----------

function familyUse(g: GymCmp, types: MachineType[]): number | null {
  const us = g.stats.byType.filter((u) => types.includes(u.type));
  if (!us.length) return null;
  const open = us.reduce((a, u) => a + u.openMin, 0);
  return open ? Math.round((us.reduce((a, u) => a + u.usedMin, 0) / open) * 1000) / 10 : 0;
}

export function CompareDrawer({ open, a, b, gyms, insights, onChange, onClose }: {
  open: boolean; a: string; b: string; gyms: GymCmp[]; insights: Insight[]; onChange: (a: string, b: string) => void; onClose: () => void;
}) {
  const { t, pick, fmtNumber, lang } = useI18n();
  const x = useTx();
  const ga = gyms.find((g) => g.club.id === a) ?? gyms[0];
  const gb = gyms.find((g) => g.club.id === b) ?? gyms[1] ?? gyms[0];
  const options = gyms.map((g) => ({ value: g.club.id, label: pick(g.club.nameEn, g.club.nameAr) }));
  const kwh = lang === 'ar' ? 'كيلوواط ساعة' : 'kWh';
  const sarU = (v: number) => (lang === 'ar' ? `${fmtNumber(v, 2)} ر.س` : `SAR ${fmtNumber(v, 2)}`);

  interface Row { key: string; label: string; va: number; vb: number; fmt: (v: number) => string; dir: 'up' | 'down' | null; dp: number; pp?: boolean }
  const rows: Row[] = [
    { key: 'people', label: t('insights.cmp.people'), va: ga.row.peopleIn, vb: gb.row.peopleIn, fmt: (v) => fmtNumber(v), dir: null, dp: 0 },
    { key: 'full', label: `${t('insights.cmp.people')} (%)`, va: ga.row.pctFull, vb: gb.row.pctFull, fmt: (v) => `${fmtNumber(v)}%`, dir: null, dp: 0, pp: true },
    { key: 'machine', label: t('insights.cmp.machine'), va: ga.stats.utilPct, vb: gb.stats.utilPct, fmt: (v) => `${fmtNumber(v, 1)}%`, dir: 'up', dp: 1, pp: true },
    { key: 'sessions', label: t('insights.cmp.sessions'), va: ga.stats.sessionsPerMachineDay, vb: gb.stats.sessionsPerMachineDay, fmt: (v) => fmtNumber(v, 1), dir: 'up', dp: 1 },
    { key: 'energy', label: t('insights.cmp.energy'), va: ga.stats.kwhPerVisit, vb: gb.stats.kwhPerVisit, fmt: (v) => `${fmtNumber(v, 2)} ${kwh}`, dir: 'down', dp: 2 },
    { key: 'energySar', label: `${t('insights.cmp.energy')} (SAR)`, va: ga.stats.sarPerVisit, vb: gb.stats.sarPerVisit, fmt: sarU, dir: 'down', dp: 2 },
    { key: 'kwhM2', label: t('insights.cmp.kwhM2'), va: ga.stats.kwhPerM2, vb: gb.stats.kwhPerM2, fmt: (v) => fmtNumber(v, 1), dir: 'down', dp: 1 },
    { key: 'visits', label: t('insights.two.visits'), va: ga.stats.visits, vb: gb.stats.visits, fmt: (v) => fmtNumber(v), dir: null, dp: 0 },
    { key: 'machines', label: t('insights.two.machines'), va: ga.machines, vb: gb.machines, fmt: (v) => fmtNumber(v), dir: null, dp: 0 },
    { key: 'alarms', label: t('insights.cmp.alarms'), va: ga.row.alerts.length, vb: gb.row.alerts.length, fmt: (v) => fmtNumber(v), dir: 'down', dp: 0 },
    { key: 'oos', label: t('insights.cmp.oos'), va: ga.oos, vb: gb.oos, fmt: (v) => fmtNumber(v), dir: 'down', dp: 0 },
  ];
  const diff = (r: Row) => {
    const dv = Math.round((r.va - r.vb) * 10 ** r.dp) / 10 ** r.dp;
    const pct = r.vb ? ((r.va - r.vb) / r.vb) * 100 : null;
    const tone = !r.dir || dv === 0 ? 'neutral' : (dv > 0) === (r.dir === 'up') ? 'good' : 'bad';
    const sign = dv > 0 ? '+' : dv < 0 ? '−' : '';
    const abs = r.pp ? `${fmtNumber(Math.abs(dv), r.dp)} ${t('common.pp')}`
      : r.key === 'energySar' ? fmtNumber(Math.abs(dv), 2) : r.fmt(Math.abs(dv)).replace(/ (kWh|كيلوواط ساعة)$/, '');
    return (
      <span className={`two__diff two__diff--${tone}`}>
        <bdi className="num">{sign}{abs}</bdi>
        {pct != null && dv !== 0 && !r.pp && <bdi className="num two__pct">({sign}{fmtNumber(Math.abs(pct), 0)}%)</bdi>}
        {tone !== 'neutral' && <span className="visually-hidden">{t(`insights.two.${tone === 'good' ? 'better' : 'worse'}`)}</span>}
      </span>
    );
  };
  const related = insights.filter((i) => i.clubIds.includes(ga.club.id) || i.clubIds.includes(gb.club.id));
  const fams = FAMILIES.map((f) => ({ key: f.key, a: familyUse(ga, f.types), b: familyUse(gb, f.types) })).filter((f) => f.a != null || f.b != null);
  const hi = Math.max(10, ...fams.flatMap((f) => [f.a ?? 0, f.b ?? 0]));
  const same = ga.club.id === gb.club.id;

  return (
    <Drawer open={open} onClose={onClose} title={t('insights.two.title')} width={760}>
      <div className="two stack">
        <div className="two__pickers">
          <div className="two__pick"><span className="label" aria-hidden>{t('insights.two.first')}</span>
            <Select label={t('insights.two.first')} value={ga.club.id} options={options} onChange={(v) => onChange(v, gb.club.id)} /></div>
          <button type="button" className="btn btn--icon btn--ghost" aria-label={t('insights.two.swap')} title={t('insights.two.swap')} onClick={() => onChange(gb.club.id, ga.club.id)}>
            <ArrowLeftRight aria-hidden />
          </button>
          <div className="two__pick"><span className="label" aria-hidden>{t('insights.two.second')}</span>
            <Select label={t('insights.two.second')} value={gb.club.id} options={options} onChange={(v) => onChange(ga.club.id, v)} /></div>
        </div>
        {same && <p className="two__note">{t('insights.two.same')}</p>}
        <div className="two__scroll">
          <table className="two__table">
            <thead>
              <tr>
                <th scope="col">{t('insights.two.metric')}</th>
                <th scope="col" className="two__a">{x.gym(ga.club.id)}</th>
                <th scope="col">{x.gym(gb.club.id)}</th>
                <th scope="col">{t('insights.two.diff')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} data-key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td className="num two__a">{r.fmt(r.va)}</td>
                  <td className="num">{r.fmt(r.vb)}</td>
                  <td>{diff(r)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row">{t('insights.two.peakHour')}</th>
                <td className="num two__a">{x.hour(ga.stats.peakHour)}</td>
                <td className="num">{x.hour(gb.stats.peakHour)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        <section className="two__sec">
          <h3 className="two__h">{t('insights.two.families')} <InfoTip text={t('insights.two.familiesInfo')} /></h3>
          <div className="two__legend">
            <span><i className="two__sw two__sw--a" />{x.gym(ga.club.id)}</span>
            <span><i className="two__sw two__sw--b" />{x.gym(gb.club.id)}</span>
          </div>
          <ul className="two__fams">
            {fams.map((f) => (
              <li key={f.key}>
                <span className="two__fam">{t(`insights.two.fam.${f.key}`)}</span>
                <span className="two__bars">
                  {([['a', f.a], ['b', f.b]] as const).map(([s, v]) => (
                    <span key={s} className="two__barrow">
                      <span className="two__track"><span className={`two__fill two__fill--${s}`} style={{ inlineSize: v == null ? 0 : `${Math.max(1.5, (v / hi) * 100)}%` }} /></span>
                      <span className="two__val num">{v == null ? t('insights.two.none') : `${fmtNumber(v, 1)}%`}</span>
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="two__sec">
          <h3 className="two__h">{t('insights.two.recs')}</h3>
          {related.length === 0
            ? <p className="two__note">{t('insights.two.noRecs')}</p>
            : (
              <ul className="two__recs">
                {related.map((i) => (
                  <li key={i.id}><KindChip kind={i.kind} /><span>{describe(i, x).action}</span></li>
                ))}
              </ul>
            )}
        </section>
      </div>
    </Drawer>
  );
}

// ---------- this gym ----------

export function ThisGym({ g, gyms, recs, onCompare }: { g: GymCmp; gyms: GymCmp[]; recs: number; onCompare: () => void }) {
  const { t, pick, fmtNumber, lang } = useI18n();
  const navigate = useNavigate();
  const n = gyms.length;
  const rank = (val: (x: GymCmp) => number, higherBetter: boolean) =>
    1 + gyms.filter((o) => (higherBetter ? val(o) > val(g) : val(o) < val(g))).length;
  const items = [
    { k: 'machine', v: `${fmtNumber(g.stats.utilPct, 1)}%`, r: rank((x) => x.stats.utilPct, true) },
    { k: 'energy', v: `${fmtNumber(g.stats.kwhPerVisit, 2)} ${lang === 'ar' ? 'كيلوواط ساعة' : 'kWh'}`, r: rank((x) => x.stats.kwhPerVisit, false) },
    { k: 'people', v: `${fmtNumber(g.row.pctFull)}%`, r: rank((x) => x.row.pctFull, true) },
  ];
  return (
    <Card className="tg" pad="md">
      <div className="tg__wrap">
        <div className="tg__id">
          <span className="label">{t('insights.thisGym.title')} <InfoTip text={t('insights.thisGym.info')} /></span>
          <span className="tg__name">{pick(g.club.nameEn, g.club.nameAr)}</span>
          <span className="tg__tags"><ClubStatus status={g.row.live?.status ?? 'ok'} /></span>
        </div>
        <dl className="tg__stats">
          {items.map((it) => (
            <div key={it.k} className="tg__stat">
              <dt>{t(`insights.thisGym.${it.k}`)}</dt>
              <dd><span className="num">{it.v}</span><span className="tg__rank num">{t('insights.thisGym.rank', { r: fmtNumber(it.r), n: fmtNumber(n) })}</span></dd>
            </div>
          ))}
          <div className="tg__stat">
            <dt>{t('insights.thisGym.actions')}</dt>
            <dd><span className="num">{fmtNumber(recs)}</span></dd>
          </div>
        </dl>
        <div className="tg__btns">
          <button type="button" className="btn btn--sm" onClick={onCompare}><ArrowLeftRight aria-hidden />{t('insights.cmp.compare')}</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => navigate(`/branches?club=${encodeURIComponent(g.club.id)}`)}>{t('insights.thisGym.card')}</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => navigate('/bms-overview')}>{t('insights.thisGym.open')}<ArrowRight aria-hidden className="flip-rtl" /></button>
        </div>
      </div>
    </Card>
  );
}

export function useGymCmp(rows: ClubRow[], stats: Map<string, GymStats>): GymCmp[] {
  const data = useDemo();
  return useMemo(() => rows.map((row) => {
    const ms = data.machines.filter((m) => m.clubId === row.club.id);
    return { club: row.club, row, stats: stats.get(row.club.id)!, oos: ms.filter((m) => !m.enabled).length, machines: ms.length };
  }), [rows, stats, data.machines]);
}
