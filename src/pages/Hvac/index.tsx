import { useMemo, useState } from 'react';
import { Minus, Plus, Search } from 'lucide-react';
import { ConfirmDialog, DataTable, Drawer, InfoTip, LiveTag, PageHeader, Segmented, Toggle, type Column } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { acOf, areasOf, focusClub, integrationsOf, useDemo } from '../../data';
import type { AcLive } from '../../data/types';
import type { AcRow } from '../../data/selectors';
import { STATUS_RANK, acStatus, floorIndex, floorsOf, linkedEntity, type UnitStatus } from '../BmsOverview/bms';
import { StatusChip } from '../BmsOverview/StatusChip';
import { UnitName } from '../BmsOverview/SystemsTable';
import { ApplianceEmpty } from '../BmsOverview/ApplianceEmpty';
import '../BmsOverview/bms.css';

type FloorFilter = 'all' | string;
type StatusFilter = 'all' | UnitStatus;

/** "BACnet COV, AC controller 1" reads "AC controller 1" in the table. */
const shortCtrl = (s: string) => { const i = Math.max(s.lastIndexOf(', '), s.lastIndexOf('، ')); return i < 0 ? s : s.slice(i + 2); };

export default function HvacPage() {
  const { t, pick, fmtNumber } = useI18n();
  const data = useDemo();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const building = pick(club.nameEn, club.nameAr);
  const ac = acOf(data, club.id);
  const ints = integrationsOf(data, club.id);
  const floors = floorsOf(areasOf(data, club.id));
  const [floor, setFloor] = useState<FloorFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [find, setFind] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<AcRow | null>(null);

  const rows = useMemo(() => ac.map((u, i) => ({ ...u, status: acStatus(u.live), link: linkedEntity(i, ints) })), [ac, ints]);
  const counts = { on: 0, off: 0, watch: 0, alarm: 0 } as Record<UnitStatus, number>;
  rows.forEach((r) => { counts[r.status]++; });
  const q = find.trim().toLowerCase();
  const view = rows.filter((r) => (floor === 'all' || String(floorIndex(r.area)) === floor)
    && (status === 'all' || r.status === status)
    && (!q || [r.nameEn, r.nameAr, r.area?.nameEn ?? '', r.area?.nameAr ?? ''].some((x) => x.toLowerCase().includes(q))));
  type Row = (typeof rows)[number];
  const open = rows.find((r) => r.id === openId);

  const deg = (v?: number) => (v == null ? '–' : `${fmtNumber(v, { maximumFractionDigits: 1 })}°C`);
  const entity = (r: Row) => r.link.integration
    ? t('hvac.entity', { ctrl: shortCtrl(pick(r.link.integration.nameEn, r.link.integration.nameAr)), n: fmtNumber(r.link.point) })
    : t('hvac.entityPoint', { n: fmtNumber(r.link.point) });
  const modeFan = (l?: AcLive) => (l?.on ? `${t(`bmsOverview.mode.${l.mode}`)} · ${t(`bmsOverview.fan.${l.fan}`)}` : t('common.off'));
  const setOn = (r: AcRow, on: boolean) => { if (on) data.patch('acLive', r.id, { on: true }); else setConfirmOff(r); };
  const nudge = (r: AcRow, d: number) => {
    const sp = Math.max(18, Math.min(28, Math.round(((r.live?.setpoint ?? 23) + d) * 2) / 2));
    data.patch('acLive', r.id, { setpoint: sp });
  };

  const cols: Column<Row>[] = [
    { key: 'name', header: t('hvac.col.appliance'), value: (r) => pick(r.nameEn, r.nameAr), render: (r) => <UnitName full={pick(r.nameEn, r.nameAr)} /> },
    { key: 'where', header: t('hvac.col.where'), value: (r) => r.area?.floorEn ?? '', render: (r) => <span className="muted">{r.area ? pick(r.area.floorEn, r.area.floorAr) : '–'}</span>, hideOnMobile: true },
    { key: 'entity', header: t('hvac.col.entity'), value: (r) => entity(r), render: (r) => <span className="apl-entity">{entity(r)}</span>, hideOnMobile: true },
    { key: 'status', header: t('hvac.col.status'), value: (r) => STATUS_RANK[r.status], render: (r) => <StatusChip status={r.status} /> },
    { key: 'on', header: t('hvac.col.on'), sortable: false, hideOnMobile: true, render: (r) => <span onClick={(e) => e.stopPropagation()}><Toggle checked={!!r.live?.on} onChange={(v) => setOn(r, v)} label={t('bmsOverview.toggleUnit', { name: pick(r.nameEn, r.nameAr) })} /></span> },
    { key: 'mode', header: t('hvac.col.modeFan'), value: (r) => modeFan(r.live), render: (r) => <span className={r.live?.on ? 'muted' : 'faint'}>{modeFan(r.live)}</span>, hideOnMobile: true },
    { key: 'set', header: t('hvac.col.setpoint'), align: 'end', hideOnMobile: true, value: (r) => r.live?.setpoint, render: (r) => (
      <span className="apl-set" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="btn btn--sm btn--icon btn--ghost" aria-label={t('hvac.lower', { name: pick(r.nameEn, r.nameAr) })} onClick={() => nudge(r, -0.5)}><Minus aria-hidden /></button>
        <span className="num ltr apl-set__v">{deg(r.live?.setpoint)}</span>
        <button type="button" className="btn btn--sm btn--icon btn--ghost" aria-label={t('hvac.raise', { name: pick(r.nameEn, r.nameAr) })} onClick={() => nudge(r, 0.5)}><Plus aria-hidden /></button>
      </span>
    ) },
    { key: 'read', header: t('hvac.col.reading'), align: 'end', value: (r) => r.live?.reading, render: (r) => <span className={`num ltr ${r.status === 'alarm' ? 'txt-danger' : r.status === 'watch' ? 'txt-warning' : ''}`}>{deg(r.live?.reading)}</span> },
  ];

  const statusOpts: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('hvac.mapped', { n: fmtNumber(rows.length) }) },
    { value: 'on', label: t('hvac.countOn', { n: fmtNumber(counts.on) }) },
    { value: 'watch', label: t('hvac.countWatch', { n: fmtNumber(counts.watch) }) },
    { value: 'alarm', label: t('hvac.countAlarm', { n: fmtNumber(counts.alarm) }) },
    { value: 'off', label: t('hvac.countOff', { n: fmtNumber(counts.off) }) },
  ];

  return (
    <div className="page bms">
      <PageHeader eyebrow={building} title={t('nav.hvac')} />
      {rows.length === 0 ? (
        <ApplianceEmpty title={t('hvac.emptyTitle')} building={building} />
      ) : (
        <>
          <div className="apl-filters">
            <div className="row">
              <div className="chip-group" role="radiogroup" aria-label={t('hvac.filterStatus')}>
                {statusOpts.map((o) => (
                  <button key={o.value} type="button" role="radio" aria-checked={status === o.value} className="chip" onClick={() => setStatus(o.value)}>
                    {o.value !== 'all' && <i className={`sw sw--${o.value}`} aria-hidden />}{o.label}
                  </button>
                ))}
              </div>
              <span className="row" style={{ gap: 8 }}><LiveTag /><InfoTip text={t('hvac.info.status')} /></span>
            </div>
            <Segmented size="sm" ariaLabel={t('hvac.filterFloor')} value={floor} onChange={setFloor}
              options={[{ value: 'all', label: t('hvac.allFloors') }, ...floors.map((f) => ({ value: String(f.index), label: pick(f.nameEn, f.nameAr) }))]} />
          </div>
          <section className="card card--pad-md">
            <DataTable rows={view} columns={cols} rowKey={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} pageSize={40}
              initialSort={{ key: 'status', dir: 'asc' }} csvName={`hvac-${club.id}`} caption={t('nav.hvac')}
              toolbar={(
                <div className="field field--with-icon">
                  <label className="visually-hidden" htmlFor="hvac-find">{t('bmsOverview.find')}</label>
                  <div className="field__wrap"><Search className="field__icon" aria-hidden />
                    <input id="hvac-find" className="field__input" value={find} placeholder={t('hvac.find')} onChange={(e) => setFind(e.target.value)} /></div>
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
              <StatusChip status={open.status} />
              <label className="row" style={{ gap: 8 }}>
                <span className="muted">{open.live?.on ? t('common.on') : t('common.off')}</span>
                <Toggle checked={!!open.live?.on} onChange={(v) => setOn(open, v)} label={t('bmsOverview.toggleUnit', { name: pick(open.nameEn, open.nameAr) })} />
              </label>
            </div>
            <div className="row" style={{ gap: 32, alignItems: 'flex-end' }}>
              <div className="stack" style={{ gap: 4 }}><span className="muted">{t('hvac.col.reading')}</span><span className={`apl-big num ltr ${open.status === 'alarm' ? 'txt-danger' : ''}`}>{deg(open.live?.reading)}</span></div>
              <div className="stack" style={{ gap: 4 }}><span className="muted">{t('hvac.col.setpoint')}</span>
                <span className="apl-set">
                  <button type="button" className="btn btn--sm btn--icon" aria-label={t('hvac.lower', { name: '' })} onClick={() => nudge(open, -0.5)}><Minus aria-hidden /></button>
                  <span className="num ltr apl-set__v" style={{ fontSize: 'var(--fs-xl)' }}>{deg(open.live?.setpoint)}</span>
                  <button type="button" className="btn btn--sm btn--icon" aria-label={t('hvac.raise', { name: '' })} onClick={() => nudge(open, 0.5)}><Plus aria-hidden /></button>
                </span>
              </div>
            </div>
            <div className="stack" style={{ gap: 8 }}>
              <span className="muted">{t('hvac.mode')}</span>
              <Segmented size="sm" ariaLabel={t('hvac.mode')} value={open.live?.mode ?? 'cool'} onChange={(v) => data.patch('acLive', open.id, { mode: v })}
                options={(['cool', 'fan', 'auto'] as const).map((m) => ({ value: m, label: t(`bmsOverview.mode.${m}`), disabled: !open.live?.on }))} />
              <span className="muted">{t('hvac.fan')}</span>
              <Segmented size="sm" ariaLabel={t('hvac.fan')} value={open.live?.fan ?? 'auto'} onChange={(v) => data.patch('acLive', open.id, { fan: v })}
                options={(['low', 'mid', 'high', 'auto'] as const).map((m) => ({ value: m, label: t(`bmsOverview.fan.${m}`), disabled: !open.live?.on }))} />
            </div>
            <dl className="apl-detail">
              <div><dt>{t('hvac.col.entity')}</dt><dd>{entity(open)}</dd></div>
              <div><dt>{t('hvac.rated')}</dt><dd className="num ltr">{fmtNumber(open.ratedKw, 1)} kW</dd></div>
              <div><dt>{t('hvac.drawing')}</dt><dd className="num ltr">{fmtNumber(open.live?.powerKw ?? 0, 1)} kW</dd></div>
              <div><dt>{t('hvac.gap')}</dt><dd className="num ltr">{open.live ? `${open.live.reading - open.live.setpoint > 0 ? '+' : ''}${fmtNumber(open.live.reading - open.live.setpoint, 1)}°C` : '–'}</dd></div>
            </dl>
          </div>
        )}
      </Drawer>

      <ConfirmDialog open={!!confirmOff} title={t('bmsOverview.confirm.acOffTitle', { name: confirmOff ? pick(confirmOff.nameEn, confirmOff.nameAr) : '' })}
        body={t('bmsOverview.confirm.acOffBody')} confirmLabel={t('bmsOverview.confirm.switchOff')}
        onCancel={() => setConfirmOff(null)} onConfirm={() => { if (confirmOff) data.patch('acLive', confirmOff.id, { on: false, powerKw: 0 }); setConfirmOff(null); }} />
    </div>
  );
}
