import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Badge, ConfirmDialog, DataTable, Drawer, InfoTip, LiveTag, PageHeader, Segmented, Toggle, type Column } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { areasOf, boardsOf, focusClub, lightsOf, useDemo } from '../../data';
import type { LightRow } from '../../data/selectors';
import { floorIndex, floorsOf } from '../BmsOverview/bms';
import { UnitName } from '../BmsOverview/SystemsTable';
import { ApplianceEmpty } from '../BmsOverview/ApplianceEmpty';
import { CheckCircle2, MinusCircle, SunDim } from 'lucide-react';
import '../BmsOverview/bms.css';

type LState = 'on' | 'dimmed' | 'off';
const stateOf = (l: LightRow): LState => (!l.live?.on ? 'off' : l.live.level < 100 ? 'dimmed' : 'on');
const RANK: Record<LState, number> = { on: 0, dimmed: 1, off: 2 };

function LightChip({ s }: { s: LState }) {
  const { t } = useI18n();
  const m = s === 'on' ? { tone: 'success' as const, icon: CheckCircle2 } : s === 'dimmed' ? { tone: 'info' as const, icon: SunDim } : { tone: 'neutral' as const, icon: MinusCircle };
  return <Badge tone={m.tone} icon={m.icon}>{t(`lights.state.${s}`)}</Badge>;
}

export default function LightsPage() {
  const { t, pick, fmtNumber } = useI18n();
  const data = useDemo();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const building = pick(club.nameEn, club.nameAr);
  const lights = lightsOf(data, club.id);
  const boards = boardsOf(data, club.id);
  const floors = floorsOf(areasOf(data, club.id));
  const [floor, setFloor] = useState('all');
  const [status, setStatus] = useState<'all' | LState>('all');
  const [find, setFind] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<LightRow | null>(null);

  const rows = useMemo(() => lights.map((l) => ({ ...l, state: stateOf(l) })), [lights]);
  type Row = (typeof rows)[number];
  const counts = { on: 0, dimmed: 0, off: 0 } as Record<LState, number>;
  rows.forEach((r) => { counts[r.state]++; });
  const fittings = rows.reduce((a, r) => a + r.fittings, 0);
  const lit = rows.reduce((a, r) => a + (r.live?.lit ?? 0), 0);
  const q = find.trim().toLowerCase();
  const view = rows.filter((r) => (floor === 'all' || String(floorIndex(r.area)) === floor)
    && (status === 'all' || r.state === status)
    && (!q || [r.nameEn, r.nameAr].some((x) => x.toLowerCase().includes(q))));
  const open = rows.find((r) => r.id === openId);
  const boardName = (id: string) => { const b = boards.find((x) => x.id === id); return b ? pick(b.nameEn, b.nameAr) : '–'; };

  const setOn = (r: LightRow, on: boolean) => {
    if (on) data.patch('lightLive', r.id, { on: true, lit: r.fittings, level: 100 });
    else setConfirmOff(r);
  };
  const setLevel = (r: LightRow, level: number) => data.patch('lightLive', r.id, { on: level > 0, level, lit: Math.round(r.fittings * (level / 100)) });

  const cols: Column<Row>[] = [
    { key: 'name', header: t('lights.col.switch'), value: (r) => pick(r.nameEn, r.nameAr), render: (r) => <UnitName full={pick(r.nameEn, r.nameAr)} /> },
    { key: 'where', header: t('lights.col.where'), value: (r) => r.area?.floorEn ?? '', render: (r) => <span className="muted">{r.area ? pick(r.area.floorEn, r.area.floorAr) : '–'}</span>, hideOnMobile: true },
    { key: 'board', header: t('lights.col.entity'), value: (r) => boardName(r.board), render: (r) => <span className="apl-entity">{boardName(r.board)}</span>, hideOnMobile: true },
    { key: 'state', header: t('lights.col.status'), value: (r) => RANK[r.state], render: (r) => <LightChip s={r.state} />, hideOnMobile: true },
    { key: 'on', header: t('lights.col.on'), sortable: false, render: (r) => <span onClick={(e) => e.stopPropagation()}><Toggle checked={!!r.live?.on} onChange={(v) => setOn(r, v)} label={t('bmsOverview.toggleUnit', { name: pick(r.nameEn, r.nameAr) })} /></span> },
    { key: 'level', header: t('lights.col.level'), align: 'end', value: (r) => r.live?.level ?? 0, render: (r) => <span className="num ltr">{fmtNumber(r.live?.level ?? 0)}%</span>, hideOnMobile: true },
    { key: 'lit', header: t('lights.col.lit'), align: 'end', value: (r) => r.live?.lit ?? 0, render: (r) => <span className="num" style={{ whiteSpace: 'nowrap' }}>{t('bmsOverview.litOf', { n: fmtNumber(r.live?.lit ?? 0), of: fmtNumber(r.fittings) })}</span> },
  ];

  const opts: { value: 'all' | LState; label: string }[] = [
    { value: 'all', label: t('lights.mapped', { n: fmtNumber(rows.length) }) },
    { value: 'on', label: t('lights.countOn', { n: fmtNumber(counts.on) }) },
    { value: 'dimmed', label: t('lights.countDimmed', { n: fmtNumber(counts.dimmed) }) },
    { value: 'off', label: t('lights.countOff', { n: fmtNumber(counts.off) }) },
  ];

  return (
    <div className="page bms">
      <PageHeader eyebrow={building} title={t('nav.lights')} />
      {rows.length === 0 ? (
        <ApplianceEmpty title={t('lights.emptyTitle')} building={building} />
      ) : (
        <>
          <div className="apl-filters">
            <div className="row">
              <div className="chip-group" role="radiogroup" aria-label={t('hvac.filterStatus')}>
                {opts.map((o) => (
                  <button key={o.value} type="button" role="radio" aria-checked={status === o.value} className="chip" onClick={() => setStatus(o.value)}>
                    {o.value !== 'all' && <i className={`sw sw--${o.value === 'dimmed' ? 'cool' : o.value}`} aria-hidden />}{o.label}
                  </button>
                ))}
              </div>
              <span className="apl-count num">{t('bmsOverview.fittingsLit', { n: fmtNumber(lit), of: fmtNumber(fittings) })}<LiveTag /><InfoTip text={t('bmsOverview.info.lit')} /></span>
            </div>
            <Segmented size="sm" ariaLabel={t('hvac.filterFloor')} value={floor} onChange={setFloor}
              options={[{ value: 'all', label: t('hvac.allFloors') }, ...floors.map((f) => ({ value: String(f.index), label: pick(f.nameEn, f.nameAr) }))]} />
          </div>
          <section className="card card--pad-md">
            <DataTable rows={view} columns={cols} rowKey={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} pageSize={40}
              csvName={`lights-${club.id}`} caption={t('nav.lights')}
              toolbar={(
                <div className="field field--with-icon">
                  <label className="visually-hidden" htmlFor="lights-find">{t('bmsOverview.find')}</label>
                  <div className="field__wrap"><Search className="field__icon" aria-hidden />
                    <input id="lights-find" className="field__input" value={find} placeholder={t('lights.find')} onChange={(e) => setFind(e.target.value)} /></div>
                </div>
              )} />
          </section>
        </>
      )}

      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open ? pick(open.nameEn, open.nameAr) : ''}
        subtitle={open?.area ? `${pick(open.area.floorEn, open.area.floorAr)} · ${pick(open.area.nameEn, open.area.nameAr)}` : undefined}>
        {open && (
          <div className="stack-lg">
            <div className="row-between">
              <LightChip s={open.state} />
              <Toggle checked={!!open.live?.on} onChange={(v) => setOn(open, v)} label={t('bmsOverview.toggleUnit', { name: pick(open.nameEn, open.nameAr) })} />
            </div>
            <div className="stack" style={{ gap: 4 }}>
              <span className="muted">{t('lights.col.lit')}</span>
              <span className="apl-big num">{t('bmsOverview.litOf', { n: fmtNumber(open.live?.lit ?? 0), of: fmtNumber(open.fittings) })}</span>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <span className="muted">{t('lights.col.level')}</span>
              <Segmented size="sm" ariaLabel={t('lights.col.level')} value={String(open.live?.level ?? 0)}
                onChange={(v) => { const n = Number(v); if (n === 0) setConfirmOff(open); else setLevel(open, n); }}
                options={[0, 40, 70, 100].map((n) => ({ value: String(n), label: n === 0 ? t('common.off') : `${fmtNumber(n)}%` }))} />
            </div>
            <dl className="apl-detail">
              <div><dt>{t('lights.col.entity')}</dt><dd>{boardName(open.board)}</dd></div>
              <div><dt>{t('lights.fittings')}</dt><dd className="num">{fmtNumber(open.fittings)}</dd></div>
              <div><dt>{t('lights.load')}</dt><dd className="num ltr">{fmtNumber(open.watts)} W</dd></div>
              <div><dt>{t('lights.drawing')}</dt><dd className="num ltr">{fmtNumber(Math.round(open.watts * ((open.live?.on ? open.live.level : 0) / 100)))} W</dd></div>
            </dl>
          </div>
        )}
      </Drawer>

      <ConfirmDialog open={!!confirmOff} title={t('bmsOverview.confirm.lightOffTitle', { name: confirmOff ? pick(confirmOff.nameEn, confirmOff.nameAr) : '' })}
        body={t('bmsOverview.confirm.lightOffBody')} confirmLabel={t('bmsOverview.confirm.switchOff')}
        onCancel={() => setConfirmOff(null)} onConfirm={() => { if (confirmOff) data.patch('lightLive', confirmOff.id, { on: false, lit: 0, level: 0 }); setConfirmOff(null); }} />
    </div>
  );
}
