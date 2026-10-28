import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { ConfirmDialog, DataTable, InfoTip, LiveTag, Tabs, Toggle, type Column } from '../../components';
import { useI18n } from '../../i18n';
import { useDemo } from '../../data';
import type { AcRow, LightRow } from '../../data/selectors';
import type { ZoneInfo } from './BuildingViewer';
import { acStatus } from './bms';
import { StatusChip } from './StatusChip';

export type SysTab = 'hvac' | 'lighting' | 'presence' | 'zones';

interface Pending { title: string; body: string; confirm: string; run: () => void }

export function SystemsTable({ zones, ac, lights, tab, onTab, selected, onClearSelected, buildingName }: {
  zones: ZoneInfo[]; ac: AcRow[]; lights: LightRow[]; tab: SysTab; onTab: (t: SysTab) => void;
  selected?: string; onClearSelected: () => void; buildingName: string;
}) {
  const { t, pick, fmtNumber } = useI18n();
  const { patch } = useDemo();
  const [find, setFind] = useState('');
  const [pending, setPending] = useState<Pending | null>(null);
  const q = find.trim().toLowerCase();
  const selZone = zones.find((z) => z.area.id === selected);
  const match = (...txt: string[]) => !q || txt.some((x) => x.toLowerCase().includes(q));
  const inSel = (areaId: string) => !selected || areaId === selected;

  const acRows = useMemo(() => ac.filter((u) => inSel(u.areaId) && match(u.nameEn, u.nameAr, u.area?.nameEn ?? '', u.area?.nameAr ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ac, q, selected]);
  const lightRows = useMemo(() => lights.filter((l) => inSel(l.areaId) && match(l.nameEn, l.nameAr)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lights, q, selected]);
  const zoneRows = useMemo(() => zones.filter((z) => inSel(z.area.id) && match(z.area.nameEn, z.area.nameAr, z.area.floorEn, z.area.floorAr)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zones, q, selected]);

  const running = ac.filter((u) => u.live?.on).length;
  const fittings = lights.reduce((a, l) => a + l.fittings, 0);
  const lit = lights.reduce((a, l) => a + (l.live?.lit ?? 0), 0);
  const peopleNow = zones.reduce((a, z) => a + z.people, 0);
  const occupied = zones.filter((z) => z.people > 0).length;

  const setAc = (u: AcRow, on: boolean) => {
    if (on) { patch('acLive', u.id, { on: true }); return; }
    setPending({
      title: t('bmsOverview.confirm.acOffTitle', { name: pick(u.nameEn, u.nameAr) }),
      body: t('bmsOverview.confirm.acOffBody'),
      confirm: t('bmsOverview.confirm.switchOff'),
      run: () => patch('acLive', u.id, { on: false, powerKw: 0 }),
    });
  };
  const setLight = (l: LightRow, on: boolean) => {
    if (on) { patch('lightLive', l.id, { on: true, lit: l.fittings, level: 100 }); return; }
    setPending({
      title: t('bmsOverview.confirm.lightOffTitle', { name: pick(l.nameEn, l.nameAr) }),
      body: t('bmsOverview.confirm.lightOffBody'),
      confirm: t('bmsOverview.confirm.switchOff'),
      run: () => patch('lightLive', l.id, { on: false, lit: 0, level: 0 }),
    });
  };
  const allAcOn = () => setPending({
    title: t('bmsOverview.confirm.allAcTitle'),
    body: t('bmsOverview.confirm.allAcBody', { n: fmtNumber(ac.length - running), building: buildingName }),
    confirm: t('bmsOverview.allOn'),
    run: () => ac.filter((u) => !u.live?.on).forEach((u) => patch('acLive', u.id, { on: true })),
  });
  const allLightsOn = () => setPending({
    title: t('bmsOverview.confirm.allLightsTitle'),
    body: t('bmsOverview.confirm.allLightsBody', { n: fmtNumber(lights.filter((l) => !l.live?.on).length), building: buildingName }),
    confirm: t('bmsOverview.allSwitchesOn'),
    run: () => lights.filter((l) => !l.live?.on).forEach((l) => patch('lightLive', l.id, { on: true, lit: l.fittings, level: 100 })),
  });

  const deg = (v?: number) => (v == null ? '–' : `${fmtNumber(v, { maximumFractionDigits: 1 })}°C`);

  const acCols: Column<AcRow>[] = [
    { key: 'unit', header: t('bmsOverview.col.unit'), value: (u) => pick(u.nameEn, u.nameAr), render: (u) => <UnitName full={pick(u.nameEn, u.nameAr)} /> },
    { key: 'on', header: t('bmsOverview.col.on'), sortable: false, render: (u) => <span onClick={(e) => e.stopPropagation()}><Toggle checked={!!u.live?.on} onChange={(v) => setAc(u, v)} label={t('bmsOverview.toggleUnit', { name: pick(u.nameEn, u.nameAr) })} /></span> },
    { key: 'mode', header: t('bmsOverview.col.modeFan'), value: (u) => u.live?.mode ?? '', render: (u) => u.live?.on ? <span className="muted">{t(`bmsOverview.mode.${u.live.mode}`)} · {t(`bmsOverview.fan.${u.live.fan}`)}</span> : <span className="faint">{t('common.off')}</span>, hideOnMobile: true },
    { key: 'set', header: t('bmsOverview.col.setpoint'), align: 'end', value: (u) => u.live?.setpoint, render: (u) => <span className="num ltr">{deg(u.live?.setpoint)}</span> },
    { key: 'reads', header: t('bmsOverview.col.reading'), align: 'end', value: (u) => u.live?.reading, render: (u) => { const s = acStatus(u.live); return <span className={`num ltr ${s === 'alarm' ? 'txt-danger' : s === 'watch' ? 'txt-warning' : ''}`}>{deg(u.live?.reading)}</span>; } },
  ];
  const lightCols: Column<LightRow>[] = [
    { key: 'switch', header: t('bmsOverview.col.switch'), value: (l) => pick(l.nameEn, l.nameAr), render: (l) => <UnitName full={pick(l.nameEn, l.nameAr)} /> },
    { key: 'on', header: t('bmsOverview.col.on'), sortable: false, render: (l) => <span onClick={(e) => e.stopPropagation()}><Toggle checked={!!l.live?.on} onChange={(v) => setLight(l, v)} label={t('bmsOverview.toggleUnit', { name: pick(l.nameEn, l.nameAr) })} /></span> },
    { key: 'lit', header: t('bmsOverview.col.lit'), align: 'end', value: (l) => l.live?.lit ?? 0, render: (l) => <span className="num">{t('bmsOverview.litOf', { n: fmtNumber(l.live?.lit ?? 0), of: fmtNumber(l.fittings) })}</span> },
  ];
  const presenceCols: Column<ZoneInfo>[] = [
    { key: 'area', header: t('bmsOverview.col.area'), value: (z) => pick(z.area.nameEn, z.area.nameAr), render: (z) => <span className="sys-name">{pick(z.area.nameEn, z.area.nameAr)}</span> },
    { key: 'floor', header: t('bmsOverview.col.floor'), value: (z) => z.area.floorEn, render: (z) => <span className="muted">{pick(z.area.floorEn, z.area.floorAr)}</span>, hideOnMobile: true },
    { key: 'people', header: t('bmsOverview.col.peopleNow'), align: 'end', value: (z) => z.people, render: (z) => <span className="num">{fmtNumber(z.people)}</span> },
    { key: 'state', header: t('bmsOverview.col.presence'), value: (z) => (z.people > 0 ? 1 : 0), render: (z) => <span className={z.people > 0 ? '' : 'faint'}>{z.people > 0 ? t('bmsOverview.occupied') : t('bmsOverview.vacant')}</span> },
  ];
  const zoneCols: Column<ZoneInfo>[] = [
    { key: 'zone', header: t('bmsOverview.col.zone'), value: (z) => pick(z.area.nameEn, z.area.nameAr), render: (z) => <span className="sys-name">{pick(z.area.nameEn, z.area.nameAr)}</span> },
    { key: 'status', header: t('bmsOverview.col.status'), value: (z) => z.status, render: (z) => <StatusChip status={z.status} /> },
    { key: 'm2', header: t('bmsOverview.col.size'), align: 'end', value: (z) => z.area.m2, render: (z) => <span className="num ltr">{fmtNumber(z.area.m2)} m²</span>, hideOnMobile: true },
    { key: 'temp', header: t('bmsOverview.col.temperature'), align: 'end', value: (z) => z.temp, render: (z) => <span className="num ltr">{deg(z.temp)}</span> },
  ];

  const tabs = [
    { id: 'hvac' as const, label: t('bmsOverview.tab.hvac') },
    { id: 'lighting' as const, label: t('bmsOverview.tab.lighting') },
    { id: 'presence' as const, label: t('bmsOverview.tab.presence') },
    { id: 'zones' as const, label: t('bmsOverview.tab.zones') },
  ];

  let summary: { text: string; info: string } = { text: '', info: '' };
  let action: { label: string; run: () => void; disabled: boolean } | null = null;
  if (tab === 'hvac') {
    summary = { text: t('bmsOverview.runningOf', { n: fmtNumber(running), of: fmtNumber(ac.length) }), info: t('bmsOverview.info.running') };
    action = { label: t('bmsOverview.allOn'), run: allAcOn, disabled: !ac.length || running === ac.length };
  } else if (tab === 'lighting') {
    summary = { text: t('bmsOverview.fittingsLit', { n: fmtNumber(lit), of: fmtNumber(fittings) }), info: t('bmsOverview.info.lit') };
    action = { label: t('bmsOverview.allSwitchesOn'), run: allLightsOn, disabled: !lights.length || lights.every((l) => l.live?.on) };
  } else if (tab === 'presence') {
    summary = { text: t('bmsOverview.peopleIn', { n: fmtNumber(peopleNow), areas: fmtNumber(occupied) }), info: t('bmsOverview.info.presence') };
  } else {
    summary = { text: (zones.length === 1 ? t('bmsOverview.zonesCountOne') : t('bmsOverview.zonesCount', { n: fmtNumber(zones.length) })), info: t('bmsOverview.info.zones') };
  }

  return (
    <div className="sys">
      <Tabs tabs={tabs} value={tab} onChange={(v) => { onTab(v); }} ariaLabel={t('bmsOverview.tablesLabel')} />
      <div className="sys__tools">
        <div className="field field--with-icon sys__find">
          <label className="visually-hidden" htmlFor="bms-find">{t('bmsOverview.find')}</label>
          <div className="field__wrap">
            <Search className="field__icon" aria-hidden />
            <input id="bms-find" className="field__input" value={find} placeholder={t('bmsOverview.find')} onChange={(e) => setFind(e.target.value)} />
          </div>
        </div>
        <div className="sys__summary">
          <span className="sys__chip num">{summary.text}<LiveTag /><InfoTip text={summary.info} /></span>
          {action && <button type="button" className="btn btn--link btn--sm" disabled={action.disabled} onClick={action.run}>{action.label}</button>}
        </div>
      </div>
      {selZone && (
        <div className="sys__filter">
          <span>{t('bmsOverview.showing', { name: pick(selZone.area.nameEn, selZone.area.nameAr) })}</span>
          <button type="button" className="btn btn--ghost btn--sm btn--icon" aria-label={t('bmsOverview.clearSelection')} onClick={onClearSelected}><X aria-hidden /></button>
        </div>
      )}
      <div className="sys__table">
        {tab === 'hvac' && <DataTable dense rows={acRows} columns={acCols} rowKey={(u) => u.id} pageSize={50}
          empty={ac.length ? t('common.noResults') : t('bmsOverview.empty.hvac')} caption={t('bmsOverview.tab.hvac')} />}
        {tab === 'lighting' && <DataTable dense rows={lightRows} columns={lightCols} rowKey={(l) => l.id} pageSize={50}
          empty={lights.length ? t('common.noResults') : t('bmsOverview.empty.lighting')} caption={t('bmsOverview.tab.lighting')} />}
        {tab === 'presence' && <DataTable dense rows={zoneRows} columns={presenceCols} rowKey={(z) => z.area.id} pageSize={50}
          empty={zones.length ? t('common.noResults') : t('bmsOverview.empty.presence')} caption={t('bmsOverview.tab.presence')} />}
        {tab === 'zones' && <DataTable dense rows={zoneRows} columns={zoneCols} rowKey={(z) => z.area.id} pageSize={50}
          empty={zones.length ? t('common.noResults') : t('bmsOverview.empty.zones')} caption={t('bmsOverview.tab.zones')} />}
      </div>
      <ConfirmDialog open={!!pending} title={pending?.title ?? ''} body={pending?.body} confirmLabel={pending?.confirm}
        tone={pending?.confirm === t('bmsOverview.confirm.switchOff') ? 'danger' : 'primary'}
        onCancel={() => setPending(null)} onConfirm={() => { pending?.run(); setPending(null); }} />
    </div>
  );
}

/** "Cardio area, AC unit 1" shown as "AC unit 1" with the area as a quiet second line. */
export function UnitName({ full }: { full: string }) {
  const i = Math.max(full.lastIndexOf(', '), full.lastIndexOf('، '));
  if (i < 0) return <span className="sys-name">{full}</span>;
  return (
    <span className="sys-name sys-name--2">
      <span>{full.charAt(i + 2).toUpperCase() + full.slice(i + 3)}</span>
      <span className="faint">{full.slice(0, i)}</span>
    </span>
  );
}
