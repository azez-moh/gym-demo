import { useMemo, useState } from 'react';
import { Box, Eye, Layers, MoveVertical, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { EmptyState, PageHeader, Segmented } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { acOf, areasOf, focusClub, lightsOf, presenceOf, useDemo } from '../../data';
import { BuildingViewer, LAYERS, buildZones, type ColorBy, type LayerId, type ViewMode } from './BuildingViewer';
import { SystemsTable, type SysTab } from './SystemsTable';
import { CheckRow, Popover } from './Popover';
import { floorsOf } from './bms';
import './bms.css';

const TAB_KEY = 'opt.bmsOverview.tab';
function readTab(): SysTab {
  try { const v = localStorage.getItem(TAB_KEY); if (v === 'hvac' || v === 'lighting' || v === 'presence' || v === 'zones') return v; } catch { /* ignore */ }
  return 'hvac';
}

export default function BmsOverviewPage() {
  const { t, pick, fmtNumber } = useI18n();
  const data = useDemo();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const areas = areasOf(data, club.id);
  const ac = acOf(data, club.id);
  const lights = lightsOf(data, club.id);
  const presence = presenceOf(data, club.id);
  const zones = useMemo(() => buildZones(areas, ac, lights, presence), [areas, ac, lights, presence]);
  const floors = floorsOf(areas);

  const [shownFloors, setShownFloors] = useState<number[] | null>(null);
  const visibleFloors = shownFloors ?? floors.map((f) => f.index);
  const [layers, setLayers] = useState<Set<LayerId>>(new Set(LAYERS));
  const [view, setView] = useState<ViewMode>('iso');
  const [colorBy, setColorBy] = useState<ColorBy>('state');
  const [spread, setSpread] = useState(0.6);
  const [tableOpen, setTableOpen] = useState(true);
  const [tab, setTabState] = useState<SysTab>(readTab);
  const [selected, setSelected] = useState<string | undefined>();
  const setTab = (v: SysTab) => { setTabState(v); try { localStorage.setItem(TAB_KEY, v); } catch { /* ignore */ } };

  const toggleFloor = (i: number, on: boolean) => {
    const next = on ? [...new Set([...visibleFloors, i])] : visibleFloors.filter((x) => x !== i);
    setShownFloors(next.length ? next : visibleFloors);
  };
  const toggleLayer = (l: LayerId, on: boolean) => {
    const n = new Set(layers);
    if (on) n.add(l); else n.delete(l);
    setLayers(n);
  };

  const name = pick(club.nameEn, club.nameAr);
  const city = data.districts.find((d) => d.id === club.district);
  const floorsLabel = t(floors.length === 1 ? 'bmsOverview.floorsOne' : 'bmsOverview.floorsMany', { n: fmtNumber(floors.length) });

  const legend = colorBy === 'occupancy'
    ? [{ cls: 'seq-0', label: t('bmsOverview.legend.empty') }, { cls: 'seq-2', label: t('bmsOverview.legend.some') }, { cls: 'seq-4', label: t('bmsOverview.legend.busiest') }]
    : colorBy === 'temperature'
      ? [{ cls: 'cool', label: t('bmsOverview.legend.cool') }, { cls: 'on', label: t('bmsOverview.legend.inBand') }, { cls: 'watch', label: t('bmsOverview.legend.warm') }, { cls: 'alarm', label: t('bmsOverview.legend.hot') }]
      : [{ cls: 'on', label: t('bmsOverview.state.on') }, { cls: 'off', label: t('bmsOverview.state.off') }, { cls: 'watch', label: t('bmsOverview.state.watch') }, { cls: 'alarm', label: t('bmsOverview.state.alarm') }];

  const hasModel = areas.length > 0;

  return (
    <div className="page bms">
      <PageHeader eyebrow={<span>{city ? pick(city.cityEn, city.cityAr) : ''} · {floorsLabel}</span>} title={name} />

      <div className="bms-toolbar" role="toolbar" aria-label={t('bmsOverview.toolbar')}>
        <Popover icon={Layers} label={t('bmsOverview.floorsOf', { n: fmtNumber(visibleFloors.length), of: fmtNumber(floors.length) })}>
          <p className="bpop__title">{t('bmsOverview.showFloors')}</p>
          {floors.map((f) => (
            <CheckRow key={f.index} checked={visibleFloors.includes(f.index)} onChange={(v) => toggleFloor(f.index, v)}>{pick(f.nameEn, f.nameAr)}</CheckRow>
          ))}
        </Popover>
        <Popover icon={Box} label={t('bmsOverview.layersOf', { n: fmtNumber(layers.size), of: fmtNumber(LAYERS.length) })}>
          <p className="bpop__title">{t('bmsOverview.layers')}</p>
          {LAYERS.map((l) => <CheckRow key={l} checked={layers.has(l)} onChange={(v) => toggleLayer(l, v)}>{t(`bmsOverview.layer.${l}`)}</CheckRow>)}
        </Popover>
        <Popover icon={Eye} label={t('bmsOverview.viewLabel', { v: t(`bmsOverview.view.${view}`) })}>
          <p className="bpop__title">{t('bmsOverview.camera')}</p>
          <Segmented size="sm" ariaLabel={t('bmsOverview.camera')} value={view} onChange={setView}
            options={(['iso', 'top', 'front'] as ViewMode[]).map((v) => ({ value: v, label: t(`bmsOverview.view.${v}`) }))} />
          <p className="bpop__title">{t('bmsOverview.colourBy')}</p>
          <Segmented size="sm" ariaLabel={t('bmsOverview.colourBy')} value={colorBy} onChange={setColorBy}
            options={(['state', 'temperature', 'occupancy'] as ColorBy[]).map((v) => ({ value: v, label: t(`bmsOverview.colour.${v}`) }))} />
        </Popover>
        <label className="bms-spread">
          <MoveVertical aria-hidden />
          <span>{t('bmsOverview.spread')}</span>
          <input type="range" min={0} max={1} step={0.05} value={spread} onChange={(e) => setSpread(Number(e.target.value))} aria-label={t('bmsOverview.spread')} />
        </label>
        <button type="button" className="btn btn--sm bms-toolbar__end" aria-pressed={!tableOpen} onClick={() => setTableOpen((o) => !o)}>
          {tableOpen ? <PanelRightClose aria-hidden className="flip-rtl" /> : <PanelRightOpen aria-hidden className="flip-rtl" />}
          {tableOpen ? t('bmsOverview.hideTable') : t('bmsOverview.showTable')}
        </button>
      </div>

      <div className={`bms-main ${tableOpen ? '' : 'bms-main--full'}`}>
        <section className="card card--pad-none bms-viewer" aria-label={t('bmsOverview.viewerLabel')}>
          {hasModel ? (
            <>
              <BuildingViewer zones={zones} floors={visibleFloors} layers={layers} spread={spread} view={view} colorBy={colorBy}
                selected={selected} onSelect={(id) => { setSelected(id); }} height="100%" ariaLabel={t('bmsOverview.viewerAria', { name })} />
              <div className="bms-legend" aria-label={t('bmsOverview.legendLabel')}>
                {legend.map((l) => <span key={l.cls} className="bms-legend__item"><i className={`sw sw--${l.cls}`} aria-hidden />{l.label}</span>)}
              </div>
              <p className="bms-hint">{t('bmsOverview.hint')}</p>
            </>
          ) : (
            <EmptyState icon={Box} title={t('bmsOverview.noModelTitle')} body={t('bmsOverview.noModelBody')} />
          )}
        </section>
        {tableOpen && (
          <section className="card card--pad-md bms-side" aria-label={t('bmsOverview.tablesLabel')}>
            <SystemsTable zones={zones} ac={ac} lights={lights} tab={tab} onTab={setTab} selected={selected}
              onClearSelected={() => setSelected(undefined)} buildingName={name} />
          </section>
        )}
      </div>
    </div>
  );
}
