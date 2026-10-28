import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Camera as CameraIcon, ChevronLeft, Crosshair, Eye, Layers, Move, Pause, Play, Plus, RotateCw, Search, Settings2, Tag, Trash2, Undo2, Users, X,
} from 'lucide-react';
import {
  Badge, Button, ConfirmDialog, EmptyState, InfoTip, KpiTile, PageHeader, Segmented, Select, StatusBadge, TextField, Toggle,
} from '../../components';
import { useDemo, focusClub, machinesOf, usageReport, alertsIn, FLOOR_SIZE_M, DEMO_PLACEMENTS, LIVE_CLUB_ID, addDays, hhmm } from '../../data';
import type { Machine, MachineType } from '../../data/types';
import { useScope } from '../../layout/filters';
import { useAccess } from '../../layout/access';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme/theme';
import { FAMILY_ORDER, MAIN_CANVAS, locationOf, hourlyUse, openingMinute, readCanvases, seqColor, stateAt, writeCanvases, type FloorCanvasDef, type Placement, type ShownState } from './model';
import type { FloorMachine } from './FloorScene';
import { CamWindow } from './CamWindow';
import './liveFloor.css';

const FloorScene = lazy(() => import('./FloorScene'));

type ColourMode = 'state' | 'usage' | 'family';
type Period = 'today' | 'd7' | 'd30';
type PanelTab = 'machines' | 'settings';

const PREFS_KEY = 'opt.liveFloor.prefs.v1';
interface Prefs { labels: boolean; footprints: boolean; camera: boolean; colour: ColourMode; period: Period; view: '3d' | '2d' }
const DEFAULT_PREFS: Prefs = { labels: false, footprints: false, camera: false, colour: 'state', period: 'today', view: '3d' };

function readPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>) }; } catch { return DEFAULT_PREFS; }
}

function hasWebgl(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

const shortId = (id: string) => id.split(':').pop() ?? id;

export default function LiveFloorPage() {
  const d = useDemo();
  const { scope, setScope, clubs: scopeClubs } = useScope();
  // Facility Manager: no camera images or names, no layout editing, no floor create or delete.
  const { cameras: camAllowed, manage } = useAccess();
  const i18n = useI18n();
  const { t, pick, fmtNumber, fmtPercent, fmtDuration, lang } = i18n;
  const { theme, chart } = useTheme();
  const canvasLabel = (c: { id: string; name: string }) => (c.id === MAIN_CANVAS.id && c.name === MAIN_CANVAS.name ? t('liveFloor.canvas.defaultName') : c.name);
  const [params, setParams] = useSearchParams();

  // ---------- club context (AV-14) ----------
  const club = focusClub(d, scope);
  const isLive = club.id === LIVE_CLUB_ID;
  const several = scope.level !== 'club' && scopeClubs.length > 1;

  // ---------- preferences ----------
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs);
  const setPrefs = (p: Partial<Prefs>) => setPrefsState((cur) => {
    const next = { ...cur, ...p };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const [preview, setPreview] = useState(false);
  const [webgl] = useState(hasWebgl);
  const reducedMotion = useMemo(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  }, []);

  // ---------- canvases (AV-16) ----------
  const [canvases, setCanvases] = useState<FloorCanvasDef[]>(() => readCanvases(club.id));
  const [canvasId, setCanvasId] = useState<string>(() => readCanvases(club.id)[0].id);
  useEffect(() => { const l = readCanvases(club.id); setCanvases(l); setCanvasId(l[0].id); }, [club.id]);
  const canvas = canvases.find((c) => c.id === canvasId) ?? canvases[0] ?? MAIN_CANVAS;
  const isMain = canvas.id === MAIN_CANVAS.id || !canvas.placements;
  const [draftCanvas, setDraftCanvas] = useState<FloorCanvasDef>(canvas);
  useEffect(() => { setDraftCanvas(canvas); }, [canvas]);
  const saveCanvases = (list: FloorCanvasDef[]) => { setCanvases(list); writeCanvases(club.id, list); };

  // ---------- machines ----------
  const rows = useMemo(() => machinesOf(d, club.id), [d, club.id]);
  const libName = useCallback((type: MachineType) => {
    const lm = d.library.find((x) => x.id === type);
    return lm ? pick(lm.nameEn, lm.nameAr) : type;
  }, [d.library, pick]);

  const whereLabel = useCallback((x: number, z: number) => {
    const l = locationOf(x, z);
    if (l.row === 5) return t('liveFloor.loc.back');
    return t('liveFloor.loc.rowSide', { n: l.row, side: t(`liveFloor.loc.${l.side}`) });
  }, [t]);

  // edit layout draft
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, Placement>>({});
  const placementOf = useCallback((m: Machine): Placement | null => {
    if (draft[m.id]) return draft[m.id];
    if (isMain) return { x: m.x, z: m.z, rot: m.rot };
    return canvas.placements?.[m.id] ?? null;
  }, [draft, isMain, canvas.placements]);
  const placed = useMemo(() => rows.filter((m) => placementOf(m)), [rows, placementOf]);
  const unplaced = useMemo(() => rows.filter((m) => !placementOf(m)), [rows, placementOf]);

  // ---------- time (live or replay) ----------
  const today = d.live.date;
  const nowMin = d.live.hour * 60 + d.live.minute;
  const openMin = useMemo(() => openingMinute(club, today), [club, today]);
  const [replayMin, setReplayMin] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setReplayMin((m) => {
        const next = (m ?? openMin) + 6;
        if (next >= nowMin) { setPlaying(false); return null; }
        return next;
      });
    }, 110);
    return () => window.clearInterval(id);
  }, [playing, openMin, nowMin]);

  const states = useMemo(() => {
    const out: Record<string, { state: ShownState; sinceMin: number }> = {};
    for (const m of rows) {
      if (!m.enabled) out[m.id] = { state: 'out', sinceMin: 0 };
      else if (replayMin == null) out[m.id] = { state: m.live.state, sinceMin: m.live.sinceMin };
      else out[m.id] = stateAt(m, club, today, replayMin);
    }
    return out;
  }, [rows, replayMin, club, today]);

  // ---------- usage (period) ----------
  const periodFrom = prefs.period === 'today' ? today : addDays(today, prefs.period === 'd7' ? -6 : -29);
  const tickKey = `${club.id}|${today}|${Math.floor(nowMin / 5)}|${rows.length}|${rows.filter((m) => !m.enabled).length}`;
  const usage = useMemo(() => new Map(usageReport(d, club.id, periodFrom, today).map((u) => [u.machineId, u])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickKey, periodFrom]);
  const usageToday = useMemo(() => new Map(usageReport(d, club.id, today, today).map((u) => [u.machineId, u])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickKey]);
  const usage4w = useMemo(() => new Map(usageReport(d, club.id, addDays(today, -27), today).map((u) => [u.machineId, u])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [`${club.id}|${today}|${Math.floor(nowMin / 30)}|${rows.length}`]);
  const camerasById = useMemo(() => new Map(d.cameras.map((c) => [c.id, c])), [d.cameras]);
  const noReading = useCallback((m: Machine) => !m.enabled || !(camerasById.get(m.cameraId)?.online ?? false), [camerasById]);
  const familyUtil = useMemo(() => {
    const acc = new Map<MachineType, { used: number; open: number }>();
    for (const m of rows) {
      const u = usage.get(m.id);
      if (!u || noReading(m)) continue;
      const a = acc.get(m.type) ?? { used: 0, open: 0 };
      a.used += u.usedMin; a.open += u.openMin;
      acc.set(m.type, a);
    }
    return new Map([...acc].map(([k, v]) => [k, v.open ? (v.used / v.open) * 100 : 0]));
  }, [rows, usage, noReading]);
  const maxUtil = useMemo(() => {
    if (prefs.colour === 'family') return Math.max(1, ...familyUtil.values());
    return Math.max(1, ...rows.filter((m) => !noReading(m)).map((m) => usage.get(m.id)?.utilisationPct ?? 0));
  }, [prefs.colour, familyUtil, rows, usage, noReading]);

  // ---------- KPIs (live) ----------
  const kpi = useMemo(() => {
    const enabled = rows.filter((m) => m.enabled);
    const inUse = enabled.filter((m) => m.live.state === 'inUse').length;
    const sessions = enabled.reduce((s, m) => s + m.live.sessionsToday, 0);
    const used = enabled.reduce((s, m) => s + m.live.usedMinToday, 0);
    const open = [...usageToday.values()].reduce((s, u) => s + u.openMin, 0);
    return { inUse, total: rows.length, sessions, used, util: open ? (used / open) * 100 : 0 };
  }, [rows, usageToday]);

  // ---------- selection, focus, fit ----------
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fitSignal, setFitSignal] = useState(0);
  const [focus, setFocus] = useState<{ id: string | null; n: number }>({ id: null, n: 0 });
  const [panelTab, setPanelTab] = useState<PanelTab>('machines');
  const selected = rows.find((m) => m.id === selectedId) ?? null;

  // deep link /live-floor?machine=<id> (MR-09): select, highlight, fly to it
  const deepDone = useRef<string | null>(null);
  useEffect(() => {
    const q = params.get('machine');
    if (!q || deepDone.current === q) return;
    const all = d.machines;
    const target = all.find((m) => m.id === q) ?? all.find((m) => m.clubId === club.id && shortId(m.id) === shortId(q)) ?? all.find((m) => shortId(m.id) === shortId(q));
    if (!target) return;
    if (target.clubId !== club.id) { setScope({ level: 'club', clubId: target.clubId }); return; }
    deepDone.current = q;
    setCanvasId(MAIN_CANVAS.id);
    setSelectedId(target.id);
    setCamPopFor(target.id);
    setPanelTab('machines');
    // after the intro fly-in has settled (not cleared on re-run, so StrictMode cannot cancel it)
    window.setTimeout(() => setFocus((f) => ({ id: target.id, n: f.n + 1 })), reducedMotion ? 60 : 2700);
  }, [params, d.machines, club.id, setScope, reducedMotion]);

  // camera pop-up (the reference build): every new selection opens it for that machine's camera; X or Esc hides it until the next one
  const [camPopFor, setCamPopFor] = useState<string | null>(null);
  const select = useCallback((id: string | null, fly = false) => {
    setSelectedId(id);
    setCamPopFor(id);
    if (id) setPanelTab('machines');
    if (id && fly) setFocus((f) => ({ id, n: f.n + 1 }));
    if (!id && params.get('machine')) { params.delete('machine'); setParams(params, { replace: true }); }
  }, [params, setParams]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('.overlay')) return;
      select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, select]);

  // ---------- floor machines for the stage ----------
  const st = chart.state;
  const floorMachines: FloorMachine[] = useMemo(() => placed.map((m): FloorMachine => {
    const fm = buildFm(m);
    const p = placementOf(m)!;
    return { ...fm, tip: `${whereLabel(p.x, p.z)} · ${fm.tip}` };
  }), [placed, placementOf, whereLabel, buildFm]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  function buildFm(m: Machine): FloorMachine {
    const p = placementOf(m)!;
    const name = pick(m.nameEn, m.nameAr);
    const s = states[m.id];
    const base: FloorMachine = { id: m.id, type: m.type, name, x: p.x, z: p.z, rot: p.rot, accent: st.idle, person: preview, accentGlow: 0, tip: '' };
    if (s.state === 'out') {
      return { ...base, accent: st.offline, hatch: st.offline, plate: st.offline, plateOpacity: 0.18, ring: st.offline, person: false, tip: t('liveFloor.legend.out') };
    }
    if (prefs.colour === 'state') {
      const since = s.sinceMin > 0 ? ` · ${t('liveFloor.card.since', { d: fmtDuration(s.sinceMin * 60) })}` : '';
      const tip = `${t(`status.${s.state}`)}${s.state === 'inUse' ? since : ''}`;
      if (s.state === 'inUse') return { ...base, accent: st.inUse, accentGlow: 0.55, glow: st.inUse, plate: st.inUse, plateOpacity: 0.22, person: true, tip };
      if (s.state === 'cooling') return { ...base, accent: st.cooling, ring: st.cooling, plate: st.cooling, plateOpacity: 0.12, tip };
      return { ...base, tip };
    }
    if (noReading(m)) return { ...base, hatch: chart.axis, tip: t('liveFloor.card.noReading') };
    const u = usage.get(m.id);
    const v = prefs.colour === 'family' ? (familyUtil.get(m.type) ?? 0) : (u?.utilisationPct ?? 0);
    const col = seqColor(chart.seq.slice(2), v / maxUtil);
    const tip = prefs.colour === 'family'
      ? `${libName(m.type)} · ${fmtPercent(v, 1)}`
      : t('liveFloor.card.usageLine', { pct: fmtPercent(v, 1), n: fmtNumber(u?.sessions ?? 0) });
    return { ...base, accent: col, plate: col, plateOpacity: 0.55, tip, accentGlow: 0.15 };
  }

  const counts = useMemo(() => {
    const c = { inUse: 0, cooling: 0, idle: 0, out: 0 };
    for (const m of placed) c[states[m.id].state]++;
    return c;
  }, [placed, states]);

  // ---------- edit layout (AV-15) ----------
  const [status, setStatus] = useState<string | null>(null);
  useEffect(() => { if (!status) return; const id = window.setTimeout(() => setStatus(null), 3200); return () => window.clearTimeout(id); }, [status]);
  const onMove = useCallback((id: string, x: number, z: number) => {
    setDraft((cur) => {
      const m = rows.find((r) => r.id === id);
      if (!m) return cur;
      const p = cur[id] ?? (isMain ? { x: m.x, z: m.z, rot: m.rot } : canvas.placements?.[id] ?? { x, z, rot: 0 });
      return { ...cur, [id]: { ...p, x, z } };
    });
  }, [rows, isMain, canvas.placements]);
  const rotateSelected = () => {
    if (!selected) return;
    const p = placementOf(selected);
    if (!p) return;
    setDraft((cur) => ({ ...cur, [selected.id]: { ...p, rot: (p.rot + 90) % 360 } }));
  };
  const saveLayout = () => {
    const ids = Object.keys(draft);
    if (isMain) for (const id of ids) d.patch('machines', id, { x: draft[id].x, z: draft[id].z, rot: draft[id].rot });
    else saveCanvases(canvases.map((c) => (c.id === canvas.id ? { ...c, placements: { ...(c.placements ?? {}), ...draft } } : c)));
    setDraft({});
    setEditing(false);
    setStatus(t('liveFloor.edit.saved'));
  };
  const cancelLayout = () => { setDraft({}); setEditing(false); };
  const [confirmReset, setConfirmReset] = useState(false);
  const resetLayout = () => {
    if (isMain) {
      for (const m of rows) {
        const base = DEMO_PLACEMENTS.find((p) => p.id === shortId(m.id));
        if (base) d.patch('machines', m.id, { x: base.x, z: base.z, rot: base.rot });
      }
    } else saveCanvases(canvases.map((c) => (c.id === canvas.id ? { ...c, placements: {} } : c)));
    setDraft({});
    setConfirmReset(false);
    setStatus(t('liveFloor.edit.saved'));
  };
  const [toPlace, setToPlace] = useState<string>('');
  const addMachine = () => {
    const m = rows.find((r) => r.id === toPlace) ?? unplaced[0];
    if (!m) return;
    const cx = (FLOOR_SIZE_M.x[0] + FLOOR_SIZE_M.x[1]) / 2;
    const cz = (FLOOR_SIZE_M.z[0] + FLOOR_SIZE_M.z[1]) / 2;
    setDraft((cur) => ({ ...cur, [m.id]: { x: cx, z: cz, rot: 0 } }));
    setEditing(true);
    setSelectedId(m.id);
    setToPlace('');
  };

  // ---------- canvas form ----------
  const [confirmDelete, setConfirmDelete] = useState(false);
  const newCanvas = () => {
    const c: FloorCanvasDef = { id: `c${Date.now().toString(36)}`, name: t('liveFloor.canvas.newName'), label: '', labelX: 0, labelZ: 6, labelSize: 1, placements: {} };
    saveCanvases([...canvases, c]);
    setCanvasId(c.id);
    setPanelTab('settings');
    setEditing(false);
    setDraft({});
  };
  const saveCanvas = () => {
    saveCanvases(canvases.map((c) => (c.id === canvas.id ? { ...draftCanvas, name: draftCanvas.name.trim() || canvas.name } : c)));
    setStatus(t('liveFloor.canvas.saved'));
  };
  const deleteCanvas = () => {
    const list = canvases.filter((c) => c.id !== canvas.id);
    saveCanvases(list);
    setCanvasId(list[0].id);
    setConfirmDelete(false);
  };

  // ---------- list ----------
  const [query, setQuery] = useState('');
  const listed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order = (m: Machine) => FAMILY_ORDER.indexOf(m.type) * 100 + m.num;
    return placed
      .filter((m) => !q || m.nameEn.toLowerCase().includes(q) || m.nameAr.includes(query.trim()) || libName(m.type).toLowerCase().includes(q) || shortId(m.id).includes(q))
      .sort((a, b) => order(a) - order(b));
  }, [placed, query, libName]);

  // ---------- camera window (AV-13) ----------
  const camMachine = selected ?? placed.find((m) => d.cameras.find((c) => c.id === m.cameraId)?.online) ?? null;
  const cam = camMachine ? camerasById.get(camMachine.cameraId) : undefined;
  const blur = d.settings.blurCameras;
  const camPopped = !!selected && camPopFor === selected.id;
  const camShown = camAllowed && (prefs.camera || camPopped);
  const closeCam = useCallback(() => { setCamPopFor(null); if (prefs.camera) setPrefs({ camera: false }); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prefs.camera]);
  const camZones = useMemo(() => (cam && camMachine ? d.zones.filter((z) => z.cameraId === cam.id) : []), [d.zones, cam, camMachine]);
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageSize, setStageSize] = useState({ w: 800, h: 480 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setStageSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isLive]);
  const [phone, setPhone] = useState(() => { try { return window.matchMedia('(max-width: 640px)').matches; } catch { return false; } });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(max-width: 640px)'); } catch { return; }
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  // ---------- render ----------
  const timeShown = replayMin ?? nowMin;
  const fmtClock = (min: number) => {
    const h24 = Math.floor(min / 60) % 24;
    const mm = Math.floor(min % 60);
    if (lang === 'ar') return `${hhmm(min % 1440)}`;
    const h12 = h24 % 12 || 12;
    return `${h12}:${String(mm).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
  };
  const periodLabel = t(`liveFloor.toolbar.${prefs.period}`);
  const fontFamily = lang === 'ar' ? 'Tajawal, sans-serif' : 'Questrial, sans-serif';

  if (!isLive) {
    return (
      <div className="page lf-page">
        <PageHeader title={t('liveFloor.title')} eyebrow={pick(club.nameEn, club.nameAr)} />
        <EmptyState icon={Layers} title={t('liveFloor.empty.title')} body={t('liveFloor.empty.body')}
          action={(() => {
            const live = d.clubs.find((c) => c.id === LIVE_CLUB_ID);
            return live ? <Button onClick={() => setScope({ level: 'club', clubId: live.id })}>{t('liveFloor.empty.open', { name: pick(live.nameEn, live.nameAr) })}</Button> : undefined;
          })()} />
      </div>
    );
  }

  const header = (
    <PageHeader title={t('liveFloor.title')} eyebrow={pick(club.nameEn, club.nameAr)}
      actions={several ? (
        <Select label={t('liveFloor.empty.many')} value={club.id} title={t('liveFloor.empty.manyBody')}
          options={scopeClubs.map((c) => ({ value: c.id, label: pick(c.nameEn, c.nameAr) }))}
          onChange={(v) => setScope({ level: 'club', clubId: v })} />
      ) : undefined} />
  );

  return (
    <div className="page lf-page">
      {header}

      <div className="grid-kpi">
        <KpiTile live label={t('liveFloor.kpi.inUse')} value={fmtNumber(kpi.inUse)} icon={Users} info={t('liveFloor.kpi.inUseInfo')}
          hint={t('liveFloor.kpi.inUseOf', { n: fmtNumber(kpi.total) })} />
        <KpiTile label={t('liveFloor.kpi.sessions')} value={fmtNumber(kpi.sessions)} info={t('liveFloor.kpi.sessionsInfo')} />
        <KpiTile label={t('liveFloor.kpi.used')} value={fmtDuration(kpi.used * 60)} info={t('liveFloor.kpi.usedInfo')} />
        <KpiTile label={t('liveFloor.kpi.util')} value={fmtPercent(kpi.util, 1)} info={t('liveFloor.kpi.utilInfo')} />
      </div>

      <div className="lf-layout">
        <section className="lf-main" aria-label={t('liveFloor.title')}>
          {/* toolbar */}
          <div className="lf-toolbar">
            <div className="lf-toolbar__group">
              <span title={prefs.view === '3d' ? t('liveFloor.toolbar.v3dTip') : t('liveFloor.toolbar.v2dTip')}>
                <Segmented ariaLabel={t('liveFloor.toolbar.view')} size="sm" value={prefs.view} onChange={(v) => setPrefs({ view: v })}
                  options={[{ value: '3d', label: t('liveFloor.toolbar.v3d') }, { value: '2d', label: t('liveFloor.toolbar.v2d') }]} />
              </span>
              <Button size="sm" icon={Crosshair} onClick={() => setFitSignal((n) => n + 1)} title={t('liveFloor.toolbar.fitTip')}>{t('liveFloor.toolbar.fit')}</Button>
            </div>
            <div className="lf-toolbar__group lf-toggles">
              <ToggleLabel icon={Tag} label={t('liveFloor.toolbar.labels')} tip={t('liveFloor.toolbar.labelsTip')} checked={prefs.labels} onChange={(v) => setPrefs({ labels: v })} />
              <ToggleLabel icon={Box} label={t('liveFloor.toolbar.footprints')} tip={t('liveFloor.toolbar.footprintsTip')} checked={prefs.footprints} onChange={(v) => setPrefs({ footprints: v })} />
              <ToggleLabel icon={Eye} label={t('liveFloor.toolbar.preview')} tip={t('liveFloor.toolbar.previewTip')} checked={preview} onChange={setPreview} />
              {camAllowed && <ToggleLabel icon={CameraIcon} label={t('liveFloor.toolbar.camera')} tip={t('liveFloor.toolbar.cameraTip')} checked={prefs.camera} onChange={(v) => setPrefs({ camera: v })} />}
            </div>
            <div className="lf-toolbar__group lf-toolbar__end">
              <span className="lf-toolbar__label">{t('liveFloor.toolbar.colour')}</span>
              <Segmented ariaLabel={t('liveFloor.toolbar.colour')} size="sm" value={prefs.colour} onChange={(v) => setPrefs({ colour: v })}
                options={[{ value: 'state', label: t('liveFloor.toolbar.byState') }, { value: 'usage', label: t('liveFloor.toolbar.byUsage') }, { value: 'family', label: t('liveFloor.toolbar.byFamily') }]} />
              {prefs.colour !== 'state' && (
                <Select label={t('liveFloor.toolbar.period')} value={prefs.period} onChange={(v) => setPrefs({ period: v })}
                  options={[{ value: 'today', label: t('liveFloor.toolbar.today') }, { value: 'd7', label: t('liveFloor.toolbar.d7') }, { value: 'd30', label: t('liveFloor.toolbar.d30') }]} />
              )}
            </div>
          </div>

          {/* camera pop-up docks full width under the toolbar on phones */}
          {camShown && phone && (
            <CamWindow cam={cam} machineName={camMachine ? pick(camMachine.nameEn, camMachine.nameAr) : ''}
              zones={camZones.filter((z) => z.machineId === camMachine?.id)} otherZones={camZones.filter((z) => z.machineId !== camMachine?.id)}
              blur={blur} docked stage={stageSize} onClose={closeCam} />
          )}

          {/* stage */}
          <div className="lf-stage-wrap" ref={stageRef}>
            {webgl ? (
              <Suspense fallback={<div className="lf-loading" aria-busy="true"><span>{t('liveFloor.loading')}</span></div>}>
                <FloorScene machines={floorMachines} bounds={{ x: FLOOR_SIZE_M.x, z: FLOOR_SIZE_M.z }}
                  label={{ text: canvas.label, x: canvas.labelX, z: canvas.labelZ, size: canvas.labelSize }}
                  theme={theme} mode={prefs.view} showLabels={prefs.labels} showFootprints={prefs.footprints}
                  selectedId={selectedId} onSelect={(id) => select(id)} editing={editing} onMove={onMove}
                  fitSignal={fitSignal} focusSignal={focus.n} focusId={focus.id}
                  ariaLabel={`${t('liveFloor.canvasAria', { n: placed.length })}. ${t('liveFloor.toolbar.keys')}`}
                  fontFamily={fontFamily} scaleLabels={{ m1: lang === 'ar' ? '1 م' : '1 m', m5: lang === 'ar' ? '5 م' : '5 m' }}
                  fmtPos={(x, z) => t('liveFloor.edit.pos', { x: fmtNumber(x, 2), z: fmtNumber(z, 2) })} reducedMotion={reducedMotion} />
              </Suspense>
            ) : (
              <div className="lf-loading"><span>{t('liveFloor.noWebgl')}</span></div>
            )}

            {!placed.length && <div className="lf-stage-empty">{t('liveFloor.canvas.empty')}</div>}

            {/* legend with live counts */}
            <div className="lf-legend" aria-label={t('liveFloor.legend.title')}>
              {prefs.colour === 'state' ? (
                <ul>
                  <LegendItem kind="inUse" color={st.inUse} label={t('liveFloor.legend.inUse')} n={counts.inUse} />
                  <LegendItem kind="cooling" color={st.cooling} label={t('liveFloor.legend.cooling')} n={counts.cooling} />
                  <LegendItem kind="idle" color={st.idle} label={t('liveFloor.legend.idle')} n={counts.idle} />
                  {counts.out > 0 && <LegendItem kind="out" color={st.offline} label={t('liveFloor.legend.out')} n={counts.out} />}
                </ul>
              ) : (
                <div className="lf-legend__ramp">
                  <span className="lf-legend__title">{t(prefs.colour === 'family' ? 'liveFloor.legend.familyTitle' : 'liveFloor.legend.usageTitle', { period: periodLabel })}</span>
                  <div className="lf-legend__bar" style={{ background: `linear-gradient(to ${i18n.isRtl ? 'left' : 'right'}, ${chart.seq.slice(2).join(',')})` }} />
                  <div className="lf-legend__ends num"><span>0%</span><span>{fmtPercent(maxUtil, 0)}</span></div>
                  <span className="lf-legend__nr"><i className="lf-swatch lf-swatch--hatch" aria-hidden />{t('liveFloor.legend.noReading')}</span>
                </div>
              )}
              {preview && <Badge tone="accent" icon={Eye}>{t('liveFloor.legend.preview')}</Badge>}
            </div>

            {replayMin != null && (
              <div className="lf-replay-badge" role="status"><Badge tone="info">{t('liveFloor.replay.at', { time: fmtClock(replayMin) })}</Badge></div>
            )}

            {camShown && !phone && (
              <CamWindow cam={cam} machineName={camMachine ? pick(camMachine.nameEn, camMachine.nameAr) : ''}
                zones={camZones.filter((z) => z.machineId === camMachine?.id)} otherZones={camZones.filter((z) => z.machineId !== camMachine?.id)}
                blur={blur} docked={false} stage={stageSize} onClose={closeCam} />
            )}

            {status && <div className="lf-toast" role="status">{status}</div>}
          </div>

          {/* bottom bar: replay or edit */}
          {editing && manage ? (
            <div className="lf-bar lf-bar--edit">
              <span className="lf-bar__hint"><Move aria-hidden /> {t('liveFloor.edit.hint')}</span>
              {Object.keys(draft).length > 0 && <Badge tone="neutral">{t('liveFloor.edit.moved', { n: fmtNumber(Object.keys(draft).length) })}</Badge>}
              <div className="lf-bar__actions">
                <Button size="sm" icon={RotateCw} onClick={rotateSelected} disabled={!selected || !placementOf(selected)}>{t('liveFloor.edit.rotate')}</Button>
                <Button size="sm" variant="ghost" icon={Undo2} onClick={() => setConfirmReset(true)}>{t('liveFloor.edit.reset')}</Button>
                <Button size="sm" onClick={cancelLayout}>{t('liveFloor.edit.cancel')}</Button>
                <Button size="sm" variant="primary" onClick={saveLayout}>{t('liveFloor.edit.save')}</Button>
              </div>
            </div>
          ) : (
            <div className="lf-bar">
              <Button size="sm" icon={playing ? Pause : Play} onClick={() => { if (playing) setPlaying(false); else { if (replayMin == null || replayMin >= nowMin - 6) setReplayMin(openMin); setPlaying(true); } }}
                disabled={nowMin <= openMin}>
                {playing ? t('liveFloor.replay.pause') : t('liveFloor.replay.play')}
              </Button>
              <label className="lf-slider">
                <span className="visually-hidden">{t('liveFloor.replay.slider')}</span>
                <span className="lf-slider__end num">{fmtClock(openMin)}</span>
                <input type="range" min={openMin} max={Math.max(openMin + 1, nowMin)} step={1} value={timeShown}
                  aria-valuetext={fmtClock(timeShown)} disabled={nowMin <= openMin}
                  onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setReplayMin(v >= nowMin - 1 ? null : v); }} />
                <span className="lf-slider__end num">{fmtClock(timeShown)}</span>
              </label>
              {replayMin != null
                ? <Button size="sm" variant="ghost" onClick={() => { setPlaying(false); setReplayMin(null); }}>{t('liveFloor.replay.backLive')}</Button>
                : <Badge tone="success">{t('liveFloor.replay.live')}</Badge>}
            </div>
          )}
        </section>

        {/* side panel */}
        <aside className="lf-panel card">
          {selected ? (
            <MachineCard m={selected} state={states[selected.id]} typeName={libName(selected.type)}
              today={usageToday.get(selected.id)} weeks={usage4w.get(selected.id)}
              hourly={hourlyUse(selected, club, today, replayMin ?? nowMin)}
              cameraName={cam && camMachine?.id === selected.id ? pick(cam.nameEn, cam.nameAr) : (() => { const c = camerasById.get(selected.cameraId); return c ? pick(c.nameEn, c.nameAr) : ''; })()}
              cameraOnline={camerasById.get(selected.cameraId)?.online ?? false}
              cameraHidden={!camAllowed}
              location={(() => { const p = placementOf(selected); return p ? whereLabel(p.x, p.z) : ''; })()}
              clubOpen={d.live.clubs[club.id]?.isOpen ?? false}
              onClose={() => select(null)}
              onToggleService={() => d.patch('machines', selected.id, { enabled: !selected.enabled })}
              onLocate={() => setFocus((f) => ({ id: selected.id, n: f.n + 1 }))}
              clubAlerts={alertsIn(d, [club]).length}
            />
          ) : (
            <>
              <div className="lf-panel__tabs" role="tablist" aria-label={t('liveFloor.panel.machines')}>
                <button type="button" role="tab" aria-selected={panelTab === 'machines' || !manage} className="tab" onClick={() => setPanelTab('machines')}>
                  {t('liveFloor.panel.machines')}<span className="tab__count num">{placed.length}</span>
                </button>
                {manage && (
                  <button type="button" role="tab" aria-selected={panelTab === 'settings'} className="tab" onClick={() => setPanelTab('settings')}>
                    <Settings2 aria-hidden />{t('liveFloor.panel.settings')}
                  </button>
                )}
              </div>

              {panelTab === 'machines' || !manage ? (
                <div className="lf-panel__body">
                  <div className="lf-row">
                    <Select label={t('liveFloor.canvas.select')} value={canvas.id} onChange={(v) => { setCanvasId(v); setDraft({}); setEditing(false); select(null); }}
                      options={canvases.map((c) => ({ value: c.id, label: canvasLabel(c) }))} className="lf-grow" />
                    {manage && <Button size="sm" icon={Plus} onClick={newCanvas}>{t('liveFloor.canvas.new')}</Button>}
                  </div>
                  {manage && <div className="lf-row">
                    <Select label={t('liveFloor.edit.placement')} value={toPlace} onChange={setToPlace} className="lf-grow" disabled={!unplaced.length}
                      options={unplaced.length
                        ? [{ value: '', label: t('liveFloor.edit.placement') }, ...unplaced.map((m) => ({ value: m.id, label: pick(m.nameEn, m.nameAr) }))]
                        : [{ value: '', label: t('liveFloor.edit.allPlaced') }]} />
                    <Button size="sm" onClick={addMachine} disabled={!unplaced.length}>{t('liveFloor.edit.add')}</Button>
                  </div>}
                  {!editing && manage && <Button icon={Move} onClick={() => setEditing(true)} className="lf-full">{t('liveFloor.edit.start')}</Button>}
                  <TextField label={t('liveFloor.panel.search')} hideLabel icon={Search} value={query} onChange={setQuery} placeholder={t('liveFloor.panel.search')} />
                  <p className="lf-panel__hint">{t('liveFloor.panel.clickHint')}</p>
                  <ul className="lf-list" aria-label={t('liveFloor.panel.count', { n: listed.length })}>
                    {listed.map((m) => {
                      const s = states[m.id].state;
                      return (
                        <li key={m.id}>
                          <button type="button" className={`lf-list__item${m.id === selectedId ? ' is-selected' : ''}`} onClick={() => select(m.id, true)}>
                            <span className="lf-list__text">
                              <span className="lf-list__name">{pick(m.nameEn, m.nameAr)}</span>
                              <span className="lf-list__sub">{libName(m.type)} · {(() => { const p = placementOf(m); return p ? whereLabel(p.x, p.z) : ''; })()}</span>
                            </span>
                            {s === 'out' ? <StatusBadge status="offline" label={t('liveFloor.legend.out')} /> : <StatusBadge status={s} />}
                          </button>
                        </li>
                      );
                    })}
                    {!listed.length && <li className="lf-panel__hint">{t('liveFloor.panel.none')}</li>}
                  </ul>
                </div>
              ) : (
                <div className="lf-panel__body">
                  <Select label={t('liveFloor.canvas.select')} value={canvas.id} onChange={(v) => { setCanvasId(v); setDraft({}); setEditing(false); }}
                    options={canvases.map((c) => ({ value: c.id, label: canvasLabel(c) }))} />
                  <Button size="sm" icon={Plus} onClick={newCanvas} className="lf-full">{t('liveFloor.canvas.new')}</Button>
                  <TextField label={t('liveFloor.canvas.name')} value={draftCanvas.name} onChange={(v) => setDraftCanvas({ ...draftCanvas, name: v })} />
                  <TextField label={t('liveFloor.canvas.label')} value={draftCanvas.label} onChange={(v) => setDraftCanvas({ ...draftCanvas, label: v })} />
                  <div className="lf-row lf-row--2">
                    <TextField label={t('liveFloor.canvas.labelX')} type="number" value={String(draftCanvas.labelX)} dir="ltr"
                      onChange={(v) => setDraftCanvas({ ...draftCanvas, labelX: Number(v) || 0 })} />
                    <TextField label={t('liveFloor.canvas.labelZ')} type="number" value={String(draftCanvas.labelZ)} dir="ltr"
                      onChange={(v) => setDraftCanvas({ ...draftCanvas, labelZ: Number(v) || 0 })} />
                  </div>
                  <label className="field">
                    <span className="field__label">{t('liveFloor.canvas.labelSize', { n: fmtNumber(draftCanvas.labelSize, 1) })}</span>
                    <input type="range" min={0.5} max={3} step={0.1} value={draftCanvas.labelSize} className="lf-range"
                      onChange={(e) => setDraftCanvas({ ...draftCanvas, labelSize: Number(e.target.value) })} />
                  </label>
                  <div className="lf-row">
                    <Button variant="primary" onClick={saveCanvas}>{t('liveFloor.canvas.save')}</Button>
                    <Button variant="danger" icon={Trash2} onClick={() => setConfirmDelete(true)} disabled={canvases.length <= 1}
                      title={canvases.length <= 1 ? t('liveFloor.canvas.deleteLast') : undefined}>{t('liveFloor.canvas.delete')}</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </aside>
      </div>

      <ConfirmDialog open={confirmDelete} onCancel={() => setConfirmDelete(false)} onConfirm={deleteCanvas}
        title={t('liveFloor.canvas.deleteTitle', { name: canvasLabel(canvas) })} body={t('liveFloor.canvas.deleteBody')} confirmLabel={t('liveFloor.canvas.delete')} />
      <ConfirmDialog open={confirmReset} onCancel={() => setConfirmReset(false)} onConfirm={resetLayout}
        title={t('liveFloor.edit.resetTitle')} body={t('liveFloor.edit.resetBody')} confirmLabel={t('liveFloor.edit.resetConfirm')} />
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function ToggleLabel({ icon: Icon, label, tip, checked, onChange }: { icon: typeof Tag; label: string; tip: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <span className="lf-toggle" title={tip}>
      <Icon aria-hidden />
      <span className="lf-toggle__text">{label}</span>
      <Toggle checked={checked} onChange={onChange} label={label} />
    </span>
  );
}

function LegendItem({ kind, color, label, n }: { kind: string; color: string; label: string; n: number }) {
  return (
    <li className={`lf-legend__item lf-legend__item--${kind}`}>
      <i className={`lf-swatch lf-swatch--${kind}`} style={{ ['--sw' as string]: color }} aria-hidden />
      <span>{label}</span>
      <span className="num lf-legend__n">{n}</span>
    </li>
  );
}

interface MachineCardProps {
  m: Machine & { live: { state: string; sessionsToday: number; usedMinToday: number; sinceMin: number } };
  state: { state: ShownState; sinceMin: number };
  typeName: string;
  today?: { sessions: number; usedMin: number; utilisationPct: number; avgSessionMin: number };
  weeks?: { sessions: number; usedMin: number; utilisationPct: number; avgSessionMin: number };
  hourly: number[];
  cameraName: string;
  cameraOnline: boolean;
  /** Facility Manager: show only whether the camera is online, never its name. */
  cameraHidden?: boolean;
  location: string;
  clubOpen: boolean;
  clubAlerts: number;
  onClose: () => void;
  onToggleService: () => void;
  onLocate: () => void;
}

function MachineCard({ m, state, typeName, today, weeks, hourly, cameraName, cameraOnline, cameraHidden, location, clubOpen, onClose, onToggleService, onLocate }: MachineCardProps) {
  const { t, pick, fmtNumber, fmtPercent, fmtDuration } = useI18n();
  const [confirm, setConfirm] = useState(false);
  const s = state.state;
  const alerts: { tone: 'danger' | 'warning' | 'info'; text: string }[] = [];
  if (s === 'out') alerts.push({ tone: 'danger', text: t('liveFloor.alert.out') });
  if (!cameraOnline) alerts.push({ tone: 'warning', text: t('liveFloor.alert.camOffline') });
  if (s === 'idle' && clubOpen && state.sinceMin >= 120) alerts.push({ tone: 'info', text: t('liveFloor.alert.idleLong', { d: fmtDuration(state.sinceMin * 60) }) });
  if (weeks && m.enabled && weeks.utilisationPct < 2) alerts.push({ tone: 'warning', text: t('liveFloor.alert.lowWeek') });
  const maxH = Math.max(1, ...hourly);
  const firstH = hourly.findIndex((v) => v > 0);
  const hours = hourly.map((v, h) => ({ v, h })).filter(({ h }) => h >= Math.max(0, Math.min(firstH < 0 ? 6 : firstH, 6)));
  const fig = (label: string, info: string, value: string) => (
    <div className="lf-fig">
      <span className="lf-fig__label">{label}<InfoTip text={info} /></span>
      <span className="lf-fig__value num">{value}</span>
    </div>
  );
  return (
    <div className="lf-card">
      <div className="lf-card__head">
        <button type="button" className="btn btn--ghost btn--sm lf-card__back" onClick={onClose}><ChevronLeft aria-hidden className="flip-rtl" />{t('liveFloor.card.showList')}</button>
        <button type="button" className="btn btn--icon btn--ghost btn--sm" aria-label={t('liveFloor.card.close')} onClick={onClose}><X aria-hidden /></button>
      </div>
      <div className="lf-card__title">
        <h2>{pick(m.nameEn, m.nameAr)}</h2>
        <span className="lf-card__type">{typeName}{location ? ` · ${location}` : ''}</span>
      </div>
      <div className="lf-row">
        {s === 'out' ? <StatusBadge status="offline" label={t('liveFloor.legend.out')} size="md" /> : <StatusBadge status={s} size="md" />}
        {s !== 'out' && state.sinceMin > 0 && (
          <span className="lf-card__since">{s === 'inUse' ? t('liveFloor.card.since', { d: fmtDuration(state.sinceMin * 60) }) : t('liveFloor.card.lastUse', { d: fmtDuration(state.sinceMin * 60) })}</span>
        )}
        <Button size="sm" variant="ghost" icon={Crosshair} onClick={onLocate} aria-label={t('liveFloor.toolbar.fit')} iconOnly />
      </div>
      {cameraHidden
        ? <p className="lf-card__cam"><CameraIcon aria-hidden />{t(cameraOnline ? 'access.cameraOnline' : 'access.cameraOffline')}</p>
        : cameraName && <p className="lf-card__cam"><CameraIcon aria-hidden />{t('liveFloor.card.camera')}: {cameraName}</p>}

      <h3 className="lf-card__h">{t('liveFloor.card.today')}</h3>
      <div className="lf-figs">
        {fig(t('liveFloor.card.sessions'), t('liveFloor.card.sessionsInfo'), fmtNumber(today?.sessions ?? 0))}
        {fig(t('liveFloor.card.used'), t('liveFloor.card.usedInfo'), fmtDuration((today?.usedMin ?? 0) * 60))}
        {fig(t('liveFloor.card.util'), t('liveFloor.card.utilInfo'), fmtPercent(today?.utilisationPct ?? 0, 1))}
        {fig(t('liveFloor.card.avg'), t('liveFloor.card.avgInfo'), fmtDuration((today?.avgSessionMin ?? 0) * 60))}
      </div>
      <div className="lf-hours" aria-label={t('liveFloor.card.hourly')}>
        <span className="lf-fig__label">{t('liveFloor.card.hourly')}<InfoTip text={t('liveFloor.card.hourlyInfo')} /></span>
        <div className="lf-hours__bars">
          {hours.map(({ v, h }) => (
            <span key={h} className="lf-hours__bar" title={`${h}:00 · ${fmtNumber(v)} min`}><i style={{ height: `${(v / maxH) * 100}%` }} /></span>
          ))}
        </div>
        <div className="lf-hours__axis num"><span>{hours[0]?.h ?? 0}:00</span><span>{hours[hours.length - 1]?.h ?? 23}:00</span></div>
      </div>

      <h3 className="lf-card__h">{t('liveFloor.card.weeks')}</h3>
      <div className="lf-figs">
        {fig(t('liveFloor.card.sessions'), t('liveFloor.card.sessionsInfo'), fmtNumber(weeks?.sessions ?? 0))}
        {fig(t('liveFloor.card.used'), t('liveFloor.card.usedInfo'), fmtDuration((weeks?.usedMin ?? 0) * 60))}
        {fig(t('liveFloor.card.util'), t('liveFloor.card.utilInfo'), fmtPercent(weeks?.utilisationPct ?? 0, 1))}
        {fig(t('liveFloor.card.avg'), t('liveFloor.card.avgInfo'), fmtDuration((weeks?.avgSessionMin ?? 0) * 60))}
      </div>

      <h3 className="lf-card__h">{t('liveFloor.card.alerts')}</h3>
      {alerts.length ? (
        <ul className="lf-alerts">
          {alerts.map((a, i) => <li key={i}><Badge tone={a.tone}>{a.text}</Badge></li>)}
        </ul>
      ) : <p className="lf-panel__hint">{t('liveFloor.card.noAlerts')}</p>}

      <Button variant={m.enabled ? 'danger' : 'default'} className="lf-full" onClick={() => (m.enabled ? setConfirm(true) : onToggleService())}>
        {m.enabled ? t('liveFloor.card.markOut') : t('liveFloor.card.markIn')}
      </Button>
      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); onToggleService(); }}
        title={`${t('liveFloor.card.markOut')}: ${pick(m.nameEn, m.nameAr)}`} body={t('liveFloor.card.outBody')} confirmLabel={t('liveFloor.card.markOut')} />
    </div>
  );
}
