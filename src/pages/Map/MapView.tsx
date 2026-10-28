import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapContainer, Marker, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import type { Club, District, RegionId } from '../../data/types';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme/theme';
import { dumbbellSvg, gymFrontSvg, gymIsoSvg } from './markers';
import { SAUDI_BOUNDS, boundsOf, districtPlaces, levelOf, regionPlaces, type Selection } from './geo';

const TILE_URL = {
  light: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
};
const ATTRIBUTION = 'Tiles © Esri';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

type Kind = 'region' | 'district' | 'club';
type Nudge = '' | 'up' | 'down';
type Side = 'left' | 'right' | 'below' | 'above';
interface LabelSlot { side: Side; nudge: Nudge }
interface Rect { x1: number; y1: number; x2: number; y2: number }

const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1));

const SIZE: Record<Kind, [number, number]> = {
  region: [60, Math.round((60 * 56) / 64)],
  district: [42, Math.round((42 * 56) / 48)],
  club: [46, Math.round((46 * 56) / 48)],
};

/**
 * Greedy collision-aware label placement in screen pixels: each label tries its preferred sides (and
 * nudged variants) and takes the one that overlaps the fewest markers, placed labels and map edges.
 */
function layoutLabels(
  pts: { key: string; x: number; y: number; lw: number; lh: number }[],
  mw: number, mh: number, width: number, height: number, prefer: Side[],
): Record<string, LabelSlot> {
  const out: Record<string, LabelSlot> = {};
  const markers: Rect[] = pts.map((p) => ({ x1: p.x - mw / 2 - 4, y1: p.y - mh - 6, x2: p.x + mw / 2 + 4, y2: p.y + 2 }));
  const placed: Rect[] = [];
  const view: Rect = { x1: 4, y1: 4, x2: width - 4, y2: height - 4 };
  const order = pts.map((p) => ({ p, n: pts.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 140).length })).sort((a, b) => b.n - a.n);
  for (const { p } of order) {
    const cy = p.y - mh / 2;
    const cands: { slot: LabelSlot; r: Rect }[] = [];
    for (const side of prefer) for (const nudge of (side === 'left' || side === 'right' ? (['', 'up', 'down'] as Nudge[]) : (['' ] as Nudge[]))) {
      const dy = nudge === 'up' ? -16 : nudge === 'down' ? 16 : 0;
      let r: Rect;
      if (side === 'right') r = { x1: p.x + mw / 2 + 10, y1: cy - p.lh / 2 + dy, x2: p.x + mw / 2 + 10 + p.lw, y2: cy + p.lh / 2 + dy };
      else if (side === 'left') r = { x1: p.x - mw / 2 - 10 - p.lw, y1: cy - p.lh / 2 + dy, x2: p.x - mw / 2 - 10, y2: cy + p.lh / 2 + dy };
      else if (side === 'below') r = { x1: p.x - p.lw / 2, y1: p.y + 6, x2: p.x + p.lw / 2, y2: p.y + 6 + p.lh };
      else r = { x1: p.x - p.lw / 2, y1: p.y - mh - 10 - p.lh, x2: p.x + p.lw / 2, y2: p.y - mh - 10 };
      cands.push({ slot: { side, nudge }, r });
    }
    let best = cands[0], bestScore = Infinity;
    cands.forEach((c, idx) => {
      let score = idx * 0.5;
      for (const m of markers) score += overlap(c.r, m) * 3;
      for (const l of placed) score += overlap(c.r, l) * 4;
      const area = (c.r.x2 - c.r.x1) * (c.r.y2 - c.r.y1);
      score += (area - overlap(c.r, view)) * 5;
      if (score < bestScore) { bestScore = score; best = c; }
    });
    out[p.key] = best.slot;
    placed.push(best.r);
  }
  return out;
}

function markerIcon(kind: Kind, o: { label: string; sub?: string; count?: number; accent: boolean; side: Side; nudge: Nudge; dir: string; selected?: boolean; connected?: boolean; tag?: string }): L.DivIcon {
  const [w0, h0] = SIZE[kind];
  const scale = o.selected ? 1.18 : 1;
  const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
  const art = kind === 'region' ? gymIsoSvg(w, o.accent) : kind === 'district' ? dumbbellSvg(w, o.accent) : gymFrontSvg(w, o.accent, o.connected !== false);
  const badge = o.count != null ? `<span class="mk__badge${o.accent ? ' mk__badge--accent' : ''}">${o.count}</span>` : '';
  const tag = o.tag ? `<span class="mk__tag${o.accent ? ' mk__tag--accent' : ''}">${esc(o.tag)}</span>` : '';
  return L.divIcon({
    className: `mk-wrap mk-wrap--${kind} mk-wrap--${o.side}${o.nudge ? ` mk-wrap--${o.nudge}` : ''}${o.selected ? ' is-selected' : ''}`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h],
    tooltipAnchor: [0, -h],
    html:
      `<div class="mk" style="width:${w}px;height:${h}px">${art}${badge}</div>` +
      `<div class="mk__label" dir="${o.dir}"><span class="mk__name">${esc(o.label)}${tag}</span>${o.sub ? `<span class="mk__sub">${esc(o.sub)}</span>` : ''}</div>`,
  });
}

interface PlaceItem { key: string; lat: number; lng: number; label: string; sub: string; count?: number; accent: boolean; title: string; onClick: () => void; tag?: string; selected?: boolean; connected?: boolean }

/** Markers of one kind with labels laid out to avoid collisions, recomputed when the view moves. */
function PlaceMarkers({ kind, items, compact, renderTip }: { kind: Kind; items: PlaceItem[]; compact: boolean; renderTip?: (key: string) => ReactNode }) {
  const { dir } = useI18n();
  const map = useMap();
  const [tick, setTick] = useState(0);
  useMapEvents({ zoomend: () => setTick((n) => n + 1), moveend: () => setTick((n) => n + 1), resize: () => setTick((n) => n + 1) });
  const [mw, mh] = SIZE[kind];
  const slots = useMemo(() => {
    const size = map.getSize();
    const pts = items.map((d) => {
      const pt = map.latLngToContainerPoint([d.lat, d.lng]);
      const lw = Math.max((d.label.length + (d.tag ? d.tag.length + 3 : 0)) * 7.2, d.sub.length * 6.2) + 22;
      const lh = d.sub ? 38 : 24;
      return { key: d.key, x: pt.x, y: pt.y, lw, lh };
    });
    const prefer: Side[] = compact ? ['below', 'right', 'left', 'above'] : ['right', 'left', 'below', 'above'];
    return layoutLabels(pts, mw, mh, size.x, size.y, prefer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, map, tick, compact, mw, mh]);
  return (
    <>
      {items.map((d) => (
        <Marker
          key={`${kind}-${d.key}-${d.selected ? 1 : 0}`}
          position={[d.lat, d.lng]}
          icon={markerIcon(kind, { label: d.label, sub: d.sub, count: d.count, accent: d.accent, side: slots[d.key]?.side ?? 'below', nudge: slots[d.key]?.nudge ?? '', dir, selected: d.selected, connected: d.connected, tag: d.tag })}
          title={d.title}
          alt={d.title}
          keyboard
          zIndexOffset={d.selected ? 1000 : 0}
          eventHandlers={{ click: d.onClick }}
        >
          {renderTip && !compact && (
            <Tooltip direction="top" offset={[0, -6]} opacity={1} className="mapv__tip">{renderTip(d.key)}</Tooltip>
          )}
        </Marker>
      ))}
    </>
  );
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Moves the view when the drill-down level changes. The first frame opens wide over the Gulf region and
 * flies into the Kingdom; every level change after that is a smooth fly-to (skipped with reduced motion).
 */
function ViewController({ sel, clubs, districts, compact }: { sel: Selection; clubs: Club[]; districts: District[]; compact: boolean }) {
  const map = useMap();
  const first = useRef(true);
  const key = `${sel.region ?? ''}|${sel.district ?? ''}|${sel.clubId ?? ''}|${compact ? 1 : 0}`;
  useEffect(() => {
    const reduce = reducedMotion();
    const isFirst = first.current;
    first.current = false;
    const level = levelOf(sel);
    let bounds: L.LatLngBounds;
    let pad: [number, number];
    let maxZoom = 16;
    if (level === 'kingdom') {
      bounds = L.latLngBounds(compact ? boundsOf(clubs) : SAUDI_BOUNDS);
      pad = compact ? [70, 70] : [24, 24];
      maxZoom = 6;
    } else if (level === 'region') {
      const pts = districtPlaces(clubs, districts, sel.region!);
      bounds = L.latLngBounds(pts.map((p) => [p.lat, p.lng] as [number, number]));
      pad = compact ? [56, 70] : [130, 90];
      maxZoom = 12;
    } else {
      const sel2 = sel.clubId ? clubs.filter((c) => c.id === sel.clubId) : clubs.filter((c) => c.district === sel.district);
      const pts = sel2.length ? sel2 : clubs.filter((c) => c.district === sel.district);
      bounds = L.latLngBounds(pts.map((c) => [c.lat, c.lng] as [number, number]));
      pad = compact ? [70, 90] : [150, 120];
      maxZoom = 16;
    }
    if (!bounds.isValid()) return;
    const target = map.getBoundsZoom(bounds.pad(0), false, L.point(pad[0] * 2, pad[1] * 2));
    const z = Math.min(maxZoom, target);
    let center = bounds.getCenter();
    if (compact && sel.clubId) {
      // keep the selected pin in the upper part of the map, above the bottom sheet
      const p = map.project(center, z).add([0, map.getSize().y * 0.18]);
      center = map.unproject(p, z);
    }
    if (reduce) { map.setView(center, z, { animate: false }); return; }
    if (isFirst) {
      // the arrival: start wide and fly into the current level
      map.setView([24, 45], compact ? 3 : 4, { animate: false });
      const id = window.setTimeout(() => map.flyTo(center, z, { duration: 1.1, easeLinearity: 0.2 }), 60);
      return () => window.clearTimeout(id);
    }
    map.flyTo(center, z, { duration: level === 'district' && sel.clubId ? 0.8 : 1.3, easeLinearity: 0.2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

/** Scroll-wheel zoom stays off until the map is clicked, and turns off again when the pointer leaves. */
function WheelGuard() {
  const map = useMapEvents({
    click: () => map.scrollWheelZoom.enable(),
    mouseout: () => map.scrollWheelZoom.disable(),
  });
  return null;
}

/** Keeps Leaflet's size in sync with its container. */
function SizeSync() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

export interface MapViewProps {
  clubs: Club[];
  districts: District[];
  sel: Selection;
  onRegion: (r: RegionId) => void;
  onDistrict: (id: string) => void;
  onClub: (id: string) => void;
  isConnected: (c: Club) => boolean;
  compact?: boolean;
}

export function MapView({ clubs, districts, sel, onRegion, onDistrict, onClub, isConnected, compact = false }: MapViewProps) {
  const { t, pick, dir, isRtl, fmtClubs } = useI18n();
  const { theme } = useTheme();
  const level = levelOf(sel);

  const regionItems = useMemo<PlaceItem[]>(() => regionPlaces(clubs, districts).map((r) => {
    const name = t(`region.${r.id}`);
    return {
      key: r.id, lat: r.lat, lng: r.lng, accent: true,
      label: `${name} · ${fmtClubs(r.clubs.length)}`,
      sub: compact || r.cityEn.toLowerCase() === r.id ? '' : pick(r.cityEn, r.cityAr),
      title: `${name}, ${fmtClubs(r.clubs.length)}`,
      onClick: () => onRegion(r.id),
    };
  }), [clubs, districts, t, pick, fmtClubs, compact, onRegion]);

  const districtItems = useMemo<PlaceItem[]>(() => (sel.region ? districtPlaces(clubs, districts, sel.region) : []).map((d) => {
    const name = pick(d.district.nameEn, d.district.nameAr);
    return {
      key: d.id, lat: d.lat, lng: d.lng, accent: true, count: d.clubs.length,
      label: name,
      sub: compact ? '' : fmtClubs(d.clubs.length),
      title: `${name}, ${fmtClubs(d.clubs.length)}`,
      onClick: () => onDistrict(d.id),
    };
  }), [clubs, districts, sel.region, pick, t, fmtClubs, compact, onDistrict]);

  const districtClubs = useMemo(() => (level === 'district' ? clubs.filter((c) => c.district === sel.district) : []), [clubs, level, sel.district]);
  const clubItems = useMemo<PlaceItem[]>(() => districtClubs.map((c) => {
    const name = pick(c.nameEn, c.nameAr);
    const on = isConnected(c);
    return {
      key: c.id, lat: c.lat, lng: c.lng, accent: true, selected: c.id === sel.clubId, connected: on,
      label: t(`gender.${c.gender}`),
      sub: compact ? '' : on ? pick(c.hours.labelEn, c.hours.labelAr) : t('map.notConnected'),
      title: `${name}. ${t('map.openClubHint')}`,
      onClick: () => onClub(c.id),
    };
  }), [districtClubs, pick, t, compact, sel.clubId, onClub, isConnected]);

  const clubTip = (id: string) => {
    const c = districtClubs.find((x) => x.id === id);
    if (!c) return null;
    return (
      <div dir={dir} className="mapv__tipbody">
        <strong>{pick(c.nameEn, c.nameAr)}</strong>
        <dl className="mapv__tiprows">
          <div><dt>{t('map.card.gender')}</dt><dd>{t(`gender.${c.gender}`)}</dd></div>
          <div><dt>{t('map.card.hours')}</dt><dd>{pick(c.hours.labelEn, c.hours.labelAr)}</dd></div>
        </dl>
        <span className="mapv__tiphint">{isConnected(c) ? t('map.openClubHint') : t('map.notConnected')}</span>
      </div>
    );
  };

  return (
    <div className="mapv" dir="ltr">
      <MapContainer
        className="mapv__map"
        bounds={SAUDI_BOUNDS}
        scrollWheelZoom={false}
        zoomControl={false}
        minZoom={3}
        maxZoom={18}
        zoomSnap={0.25}
        zoomDelta={0.5}
        worldCopyJump={false}
        attributionControl
      >
        <TileLayer key={theme} url={TILE_URL[theme === 'light' ? 'light' : 'dark']} attribution={ATTRIBUTION} maxNativeZoom={16} />
        <ZoomControl key={isRtl ? 'rtl' : 'ltr'} position={isRtl ? 'topright' : 'topleft'} />
        <ViewController sel={sel} clubs={clubs} districts={districts} compact={compact} />
        <WheelGuard />
        <SizeSync />
        {level === 'kingdom' && <PlaceMarkers kind="region" items={regionItems} compact={compact} />}
        {level === 'region' && <PlaceMarkers kind="district" items={districtItems} compact={compact} />}
        {level === 'district' && <PlaceMarkers kind="club" items={clubItems} compact={compact} renderTip={clubTip} />}
      </MapContainer>
    </div>
  );
}
