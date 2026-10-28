import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { ChipGroup, DataTable, InfoTip, Segmented, TextField, Toggle, type Column } from '../../components';
import { useI18n } from '../../i18n';
import type { ControlModel, Kind, Source, Thing } from './model';
import type { Commit } from './index';

type Filter = 'all' | 'with' | 'without';
const PATTERNS = ['hours', 'occupancy', 'always', 'random'] as const;

/** Reading text of a thing, from its source (live link or simulation). */
export function readingOf(x: Thing, ctl: ControlModel, t: (k: string, v?: Record<string, string | number>) => string, fmtNumber: (n: number, o?: number) => string): string {
  const s = ctl.sourceOf(x);
  if (!s.sim && !s.entity) return t('control.data.noReading');
  if (x.kind === 'ac') {
    const a = ctl.data.live.ac[x.id];
    return a ? `${a.on ? t('control.state.on') : t('control.state.off')} · ${fmtNumber(a.reading, 1)} °C` : t('control.data.noReading');
  }
  if (x.kind === 'light') { const l = ctl.data.live.lights[x.id]; return l ? `${l.on ? t('control.state.on') : t('control.state.off')} · ${fmtNumber(l.level, 0)}%` : t('control.data.noReading'); }
  if (x.kind === 'sensor') { const n = ctl.presence.get(x.areaId) ?? 0; return n > 0 ? t('control.state.people', { n: fmtNumber(n, 0) }) : t('control.state.empty'); }
  const on = ctl.isOn(x);
  return on ? t('control.state.on') : t('control.state.off');
}

export function DataTab({ ctl, commit }: { ctl: ControlModel; commit: Commit }) {
  const { t, pick, fmtNumber } = useI18n();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [kind, setKind] = useState<'all' | Kind>('all');

  const things = ctl.things.filter((x) => x.kind !== 'detector' && x.kind !== 'head');
  const src = (x: Thing) => ctl.sourceOf(x);
  const has = (s: Source) => Boolean(s.sim || s.entity);
  const nLive = things.filter((x) => { const s = src(x); return !s.sim && s.entity; }).length;
  const nSim = things.filter((x) => src(x).sim).length;
  const nNone = things.length - nLive - nSim;

  const kinds = useMemo(() => [...new Set(things.map((x) => x.kind))], [things]);
  const rows = things.filter((x) => {
    const s = src(x);
    const qq = q.trim().toLowerCase();
    return (kind === 'all' || x.kind === kind)
      && (filter === 'all' || (filter === 'with' ? has(s) : !has(s)))
      && (!qq || x.nameEn.toLowerCase().includes(qq) || x.nameAr.includes(qq) || (s.entity ?? '').toLowerCase().includes(qq));
  });

  const set = (x: Thing, next: Source) => {
    const name = pick(x.nameEn, x.nameAr);
    commit(t('control.history.link', { name }), [ctl.ctlOp(`src:${x.id}`, next)]);
  };

  const cols: Column<Thing>[] = [
    { key: 'name', header: t('control.data.colAppliance'), value: (x) => pick(x.nameEn, x.nameAr), sortable: true, render: (x) => pick(x.nameEn, x.nameAr) },
    { key: 'where', header: t('control.data.colWhere'), hideOnMobile: true, value: (x) => pick(x.areaEn, x.areaAr), render: (x) => <span className="muted">{pick(x.areaEn, x.areaAr)} · {pick(x.floorEn, x.floorAr)}</span> },
    {
      key: 'entity', sortable: false, header: t('control.data.colEntity'), render: (x) => {
        const s = src(x);
        const name = pick(x.nameEn, x.nameAr);
        return <EntityInput value={s.entity ?? ''} label={t('control.data.entityLabel', { name })} placeholder={t('control.data.entityPh')}
          onCommit={(v) => { if (v !== (s.entity ?? '')) set(x, { ...s, entity: v || undefined }); }} />;
      },
    },
    {
      key: 'sim', sortable: false, header: <span className="row" style={{ gap: 4 }}>{t('control.data.colSimulate')}<InfoTip text={t('control.data.simulateWins')} /></span>, align: 'center',
      render: (x) => { const s = src(x); return <Toggle checked={!!s.sim} label={t('control.data.simLabel', { name: pick(x.nameEn, x.nameAr) })} onChange={(v) => set(x, { ...s, sim: v, pattern: s.pattern ?? 'hours' })} />; },
    },
    {
      key: 'pattern', sortable: false, header: t('control.data.colPattern'), hideOnMobile: true, render: (x) => {
        const s = src(x);
        return (
          <select className="ctl__inlinesel" aria-label={t('control.data.patternLabel', { name: pick(x.nameEn, x.nameAr) })} disabled={!s.sim} value={s.pattern ?? 'hours'}
            onChange={(e) => set(x, { ...s, pattern: e.target.value as Source['pattern'] })}>
            {PATTERNS.map((p) => <option key={p} value={p}>{t(`control.pattern.${p}`)}</option>)}
          </select>
        );
      },
    },
    { key: 'reading', sortable: false, header: t('control.data.colReading'), align: 'end', render: (x) => <span className={has(src(x)) ? '' : 'faint'}>{readingOf(x, ctl, t, fmtNumber)}</span> },
  ];

  return (
    <div className="stack">
      <div className="ctl__toolbar">
        <div className="ctl__search"><TextField label={t('control.findThingEntity')} hideLabel placeholder={t('control.findThingEntity')} value={q} onChange={setQ} icon={Search} /></div>
        <Segmented ariaLabel={t('control.data.filter')} value={filter} onChange={setFilter}
          options={[{ value: 'all', label: t('control.data.all') }, { value: 'with', label: t('control.data.with') }, { value: 'without', label: t('control.data.without') }]} />
      </div>
      <div className="ctl__summary">
        <span className="ctl__chip is-ok"><span className="ctl__dot" aria-hidden />{t('control.data.live', { n: fmtNumber(nLive) })}<InfoTip text={t('control.data.liveInfo')} /></span>
        <span className="ctl__chip"><span className="ctl__dot ctl__dot--sim" aria-hidden />{t('control.data.simulated', { n: fmtNumber(nSim) })}<InfoTip text={t('control.data.simInfo')} /></span>
        <span className="ctl__chip">{t('control.data.noSource', { n: fmtNumber(nNone) })}<InfoTip text={t('control.data.noneInfo')} /></span>
      </div>
      <ChipGroup scroll ariaLabel={t('control.sched.kind')} value={kind} onChange={setKind}
        options={[{ value: 'all' as const, label: t('control.data.everything'), count: things.length },
          ...kinds.map((k) => ({ value: k, label: t(`control.kind.${k}`), count: things.filter((x) => x.kind === k).length }))]} />
      <DataTable rows={rows} columns={cols} rowKey={(x) => x.id} dense pageSize={20} empty={t('control.noMatch')} />
    </div>
  );
}

function EntityInput({ value, label, placeholder, onCommit }: { value: string; label: string; placeholder: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  const [focus, setFocus] = useState(false);
  return (
    <input className="ctl__entity ltr" dir="ltr" aria-label={label} placeholder={placeholder} value={focus ? v : value}
      onFocus={() => { setV(value); setFocus(true); }}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => { setFocus(false); onCommit(v.trim()); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
