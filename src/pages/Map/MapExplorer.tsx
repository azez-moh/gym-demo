import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Info, LayoutGrid, MapPin, ShieldAlert, Store, Users } from 'lucide-react';
import { KpiTile } from '../../components';
import { useI18n } from '../../i18n';
import { useDemo, totals } from '../../data';
import { REGIONS, useScope } from '../../layout/filters';
import type { Club, RegionId } from '../../data/types';
import { MapView } from './MapView';
import { ClubCard } from './ClubCard';
import { dumbbellSvg, gymFrontSvg, gymIsoSvg } from './markers';
import { clubsOfSelection, districtPlaces, levelOf, regionPlaces, scopeOfSelection, selectionFromScope, type Selection } from './geo';
import './map.css';

/**
 * Test fixture for clubs not yet on Primewave (EN-13): every club in the generated data is connected,
 * so a club id listed in localStorage "opt.test.notConnected" (JSON array) is treated as not connected.
 */
function readNotConnected(): Set<string> {
  try {
    const raw = localStorage.getItem('opt.test.notConnected');
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function useIsWide(min: number) {
  const q = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return wide;
}

/** Small marker artwork in list rows (static SVG strings, no user content). */
function ListIcon({ html }: { html: string }) {
  return <span className="maplist__icon" aria-hidden dangerouslySetInnerHTML={{ __html: html }} />;
}

function parseSel(p: URLSearchParams): Selection | null {
  const r = p.get('region') as RegionId | null;
  if (!r || !REGIONS.includes(r)) return null;
  const d = p.get('district') || undefined;
  const c = p.get('club') || undefined;
  return { region: r, district: d, clubId: d ? c : undefined };
}

/**
 * Kingdom map drill-down (Kingdom, region, district, gym fact card), the /map page.
 * The drill-down lives in the URL (?region=&district=&club=) so every level can be bookmarked. When the scope is
 * changed from the branch switcher by the logo, the map follows it.
 * Picking a gym sets the gym scope and opens its Overview; the "All branches" row opens the network Overview.
 */
export function MapExplorer() {
  const i18n = useI18n();
  const { t, pick, isRtl, fmtNumber, fmtClubs } = i18n;
  const data = useDemo();
  const { clubs, districts } = data;
  const { scope, setScope } = useScope();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const wide = useIsWide(1000);
  const notCompact = useIsWide(600);
  const notConnected = useMemo(readNotConnected, []);
  const isConnected = useCallback((c: Club) => !notConnected.has(c.id), [notConnected]);

  // Selection lives in the URL (?region=&district=&club=) so each level can be bookmarked; without it the
  // map opens at the current scope.
  const [sel, setSelState] = useState<Selection>(() => parseSel(params) ?? selectionFromScope(scope, clubs, districts));
  const setSel = useCallback((s: Selection) => {
    setSelState(s);
    const p = new URLSearchParams();
    if (s.region) p.set('region', s.region);
    if (s.district) p.set('district', s.district);
    if (s.clubId) p.set('club', s.clubId);
    setParams(p, { replace: true });
  }, [setParams]);

  // Follow scope changes made elsewhere (the branch switcher by the logo).
  const scopeKey = JSON.stringify(scope);
  const lastScope = useRef(scopeKey);
  useEffect(() => {
    if (scopeKey === lastScope.current) return;
    lastScope.current = scopeKey;
    setSel(selectionFromScope(scope, clubs, districts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey]);

  const level = levelOf(sel);
  const region = sel.region;
  const district = districts.find((d) => d.id === sel.district);
  const selected = sel.clubId ? clubs.find((c) => c.id === sel.clubId) : undefined;
  const inView = useMemo(() => clubsOfSelection(clubs, sel), [clubs, sel]);

  /** Totals for a set of clubs. Unconnected clubs count as clubs but not in people or open items. */
  const sum = useCallback((cs: Club[]) => {
    const live = totals(data, cs.filter(isConnected));
    const crit = live.criticalAlerts;
    return {
      clubs: cs.length,
      people: live.peopleIn,
      capacity: cs.filter(isConnected).reduce((n, c) => n + c.capacity, 0),
      pct: live.occupancyPct,
      open: live.openAlerts,
      critical: crit,
      watch: Math.max(0, live.openAlerts - crit),
    };
  }, [data, isConnected]);
  const k = sum(inView);
  const itemsText = (n: number) => (n === 0 ? t('map.openItemsNone') : n === 1 ? t('map.openItemsOne') : t('map.openItems', { n: fmtNumber(n) }));

  // ---------- navigation ----------
  const goKingdom = () => setSel({});
  const goRegion = useCallback((r: RegionId) => setSel({ region: r }), [setSel]);
  const goDistrict = useCallback((id: string) => {
    const d = districts.find((x) => x.id === id);
    if (d) setSel({ region: d.region, district: d.id });
  }, [districts, setSel]);
  const openClub = useCallback((id: string) => {
    const c = clubs.find((x) => x.id === id);
    if (!c) return;
    if (!isConnected(c)) {
      // not on Primewave yet: show what is pending instead of empty dashboards
      setSel({ region: c.region, district: c.district, clubId: c.id });
      return;
    }
    setScope({ level: 'club', clubId: c.id });
    navigate('/branch');
  }, [clubs, isConnected, setScope, navigate, setSel]);
  // "All branches" (and "All of <region>") opens the overview of all branches; a district with one gym opens
  // that gym's Branch overview.
  const openAll = () => {
    const s = scopeOfSelection(sel);
    const inSel = clubsOfSelection(clubs, sel).filter(isConnected);
    if (s.level === 'district' && inSel.length === 1) {
      setScope({ level: 'club', clubId: inSel[0].id });
      navigate('/branch');
      return;
    }
    setScope({ level: 'all' });
    navigate('/overview');
  };

  const infoBtn = useRef<Record<string, HTMLButtonElement | null>>({});
  const lastInfo = useRef<string | null>(null);
  const cardRef = useRef<HTMLElement>(null);
  const showInfo = (id: string) => {
    lastInfo.current = id;
    setSel({ ...sel, clubId: id });
  };
  const closeCard = useCallback(() => {
    setSel({ region: sel.region, district: sel.district });
    const id = lastInfo.current;
    window.setTimeout(() => { if (id) infoBtn.current[id]?.focus(); }, 0);
  }, [sel.region, sel.district, setSel]);
  useEffect(() => { if (selected) cardRef.current?.focus({ preventScroll: true }); }, [selected]);
  // Narrow screens: bring the map to the top so the selected pin stays visible above the bottom sheet.
  const mapBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selected || wide) return;
    const el = mapBox.current;
    if (!el) return;
    const head = document.querySelector('.shell__top')?.getBoundingClientRect().height ?? 0;
    const top = el.getBoundingClientRect().top + window.scrollY - head - 8;
    window.scrollTo({ top, behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [selected, wide]);

  const back = () => {
    if (sel.clubId) closeCard();
    else if (sel.district) setSel({ region: sel.region });
    else setSel({});
  };

  // ---------- breadcrumb ----------
  const Sep = isRtl ? ChevronLeft : ChevronRight;
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const crumbs: { label: string; onClick?: () => void }[] = [{ label: t('map.kingdom'), onClick: level !== 'kingdom' ? goKingdom : undefined }];
  if (region) crumbs.push({ label: t(`region.${region}`), onClick: level === 'district' ? () => setSel({ region }) : undefined });
  if (district) crumbs.push({ label: pick(district.nameEn, district.nameAr) });
  const title = district ? pick(district.nameEn, district.nameAr) : region ? t(`region.${region}`) : t('map.title');

  // ---------- side list ----------
  const topLabel = district ? t('map.allOf', { name: pick(district.nameEn, district.nameAr) })
    : region ? t('map.allOf', { name: t(`region.${region}`) }) : t('map.allBranches');
  const listTitle = level === 'kingdom' ? t('map.list.regions') : level === 'region' ? t('map.list.districts') : t('map.list.clubs');

  let rows: ReactNode;
  if (level === 'kingdom') {
    rows = regionPlaces(clubs, districts).map((r) => {
      const s = sum(r.clubs);
      return (
        <li key={r.id}>
          <button type="button" className="maplist__row" onClick={() => goRegion(r.id)}>
            <ListIcon html={gymIsoSvg(34, true, 'maplist__svg')} />
            <span className="maplist__main">
              <span className="maplist__name">{t(`region.${r.id}`)}</span>
              <span className="maplist__sub">{r.cityEn.toLowerCase() !== r.id ? `${pick(r.cityEn, r.cityAr)} · ` : ''}{fmtClubs(s.clubs)} · {itemsText(s.open)}</span>
            </span>
            <span className="maplist__count num">{fmtNumber(s.clubs)}</span>
            <Sep className="maplist__chev" aria-hidden />
          </button>
        </li>
      );
    });
  } else if (level === 'region' && region) {
    rows = districtPlaces(clubs, districts, region).map((d) => {
      const s = sum(d.clubs);
      const genders = new Set(d.clubs.map((c) => c.gender));
      const g = genders.size > 1 ? t('map.menAndWomen') : t(`gender.${d.clubs[0].gender}`);
      return (
        <li key={d.id}>
          <button type="button" className="maplist__row" onClick={() => goDistrict(d.id)}>
            <ListIcon html={dumbbellSvg(28, true, 'maplist__svg')} />
            <span className="maplist__main">
              <span className="maplist__name">{pick(d.district.nameEn, d.district.nameAr)}</span>
              <span className="maplist__sub">{g} · {itemsText(s.open)}</span>
            </span>
            <span className="maplist__count num">{fmtNumber(s.clubs)}</span>
            <Sep className="maplist__chev" aria-hidden />
          </button>
        </li>
      );
    });
  } else {
    rows = inView.map((c) => {
      const on = isConnected(c);
      const live = data.live.clubs[c.id];
      const name = pick(c.nameEn, c.nameAr);
      return (
        <li key={c.id} className="maplist__li">
          <button type="button" className={`maplist__row maplist__row--club${c.id === sel.clubId ? ' is-active' : ''}`} onClick={() => openClub(c.id)}
            title={on ? t('map.openClubHint') : t('map.notConnected')} aria-label={on ? t('map.openClub', { name }) : `${name}. ${t('map.notConnected')}`}>
            <ListIcon html={gymFrontSvg(28, true, on, 'maplist__svg')} />
            <span className="maplist__main">
              <span className="maplist__name">{name}</span>
              <span className="maplist__sub">
                <span className="maptag maptag--plain">{t(`gender.${c.gender}`)}</span>
                {on ? <span>{itemsText(live?.openAlerts ?? 0)}</span> : <span className="maplist__pending">{t('map.notConnected')}</span>}
              </span>
            </span>
            <Sep className="maplist__chev" aria-hidden />
          </button>
          <button type="button" ref={(el) => { infoBtn.current[c.id] = el; }} className="maplist__info" onClick={() => showInfo(c.id)}
            aria-pressed={c.id === sel.clubId} aria-label={t('map.infoFor', { name })} title={t('map.info')}>
            <Info aria-hidden />
          </button>
        </li>
      );
    });
  }

  const panelList = (
    <div className={`mappanel${wide ? '' : ' mappanel--sheet'}`}>
      {!wide && <span className="mappanel__grip" aria-hidden />}
      <button type="button" className="mapall" onClick={openAll} title={t('map.allHint')}>
        <LayoutGrid aria-hidden className="mapall__icon" />
        <span className="mapall__main">
          <span className="mapall__name">{topLabel}</span>
          <span className="mapall__sub">{t('map.totals', { clubs: fmtClubs(k.clubs), people: fmtNumber(k.people), items: itemsText(k.open) })}</span>
        </span>
        <Sep className="mapall__chev" aria-hidden />
      </button>
      <div className="maplist">
        <h2 className="maplist__title">{listTitle}</h2>
        <ul className="maplist__items">{rows}</ul>
      </div>
    </div>
  );

  const excludedNote = notConnected.size ? ` ${t('map.kpi.info.excluded')}` : '';
  const showPanelCard = !!selected && wide;
  const showSheet = !!selected && !wide;

  return (
    <div className={`mapx${showSheet ? ' has-sheet' : ''}`}>
      <div className="mapnav">
        {level !== 'kingdom' && (
          <button type="button" className="mapnav__back" onClick={back}><BackIcon aria-hidden />{t('map.back')}</button>
        )}
        <nav aria-label={t('map.breadcrumb')}>
          <ol className="mapcrumbs">
            {crumbs.map((c, i) => (
              <li key={i} className="mapcrumbs__item">
                {i === 0 ? <MapPin className="mapcrumbs__pin" aria-hidden /> : <Sep className="mapcrumbs__sep" aria-hidden />}
                {c.onClick
                  ? <button type="button" className="mapcrumbs__link" onClick={c.onClick}>{c.label}</button>
                  : <span className="mapcrumbs__current" aria-current="location">{c.label}</span>}
              </li>
            ))}
          </ol>
        </nav>
      </div>
      <h1 className="mappage__title">{title}</h1>

      <div className="mapgrid">
        <aside className="mapgrid__side" aria-label={listTitle}>
          {showPanelCard && selected
            ? <ClubCard ref={cardRef} club={selected} connected={isConnected(selected)} onClose={closeCard} onOpen={() => openClub(selected.id)} variant="panel" />
            : panelList}
        </aside>

        <section className="mapkpis" aria-label={title}>
          <KpiTile label={t('map.kpi.clubs')} icon={Store} value={fmtNumber(k.clubs)} info={t('map.kpi.info.clubs')}
            hint={[...new Set(inView.map((c) => t(`region.${c.region}`)))].join(' · ')} />
          <KpiTile live label={t('map.kpi.people')} icon={Users} value={fmtNumber(k.people)} unit={t('map.kpi.ofCapacity', { n: fmtNumber(k.capacity) })}
            info={t('map.kpi.info.people') + excludedNote} hint={t('map.kpi.full', { pct: fmtNumber(k.pct) })} />
          <KpiTile className={k.open > 0 ? 'mapkpi--alert' : ''} label={t('map.kpi.openItems')} icon={ShieldAlert} value={fmtNumber(k.open)}
            info={t('map.kpi.info.openItems') + excludedNote}
            hint={k.open > 0 ? t('map.kpi.severity', { c: fmtNumber(k.critical), w: fmtNumber(k.watch) }) : t('map.kpi.allClear')} />
        </section>

        <div className="mapgrid__map" ref={mapBox} role="region" aria-label={t('map.mapLabel')}>
          <MapView clubs={clubs} districts={districts} sel={sel} onRegion={goRegion} onDistrict={goDistrict} onClub={openClub}
            isConnected={isConnected} compact={!notCompact} />
          <div className="maplegend" aria-label={t('map.legend.label')}>
            <span className="maplegend__item"><span aria-hidden dangerouslySetInnerHTML={{ __html: gymFrontSvg(16, true, true, 'maplegend__svg') }} />{t('map.legend.gym')}</span>
            <span className="maplegend__hint">{t('map.legend.wheel')}</span>
          </div>
        </div>
      </div>

      {showSheet && selected && (
        <div className="mapsheet" role="dialog" aria-modal="false" aria-label={pick(selected.nameEn, selected.nameAr)}>
          <ClubCard ref={cardRef} club={selected} connected={isConnected(selected)} onClose={closeCard} onOpen={() => openClub(selected.id)} variant="sheet" />
        </div>
      )}
    </div>
  );
}
