import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import { Maximize2, Pause, Pencil, Play, Plus, RefreshCw } from 'lucide-react';
import { Badge, Button, KpiTile, Modal, PageHeader } from '../../components';
import { useI18n } from '../../i18n';
import type { Camera } from '../../data/types';
import { CameraFrame } from './vision/CameraFrame';
import { CameraForm } from './vision/CameraForm';
import { BlurChip, Toast, useToast } from './vision/BlurChip';
import { ensurePolygons, usePhase, useVision } from './vision/model';
import { readingAt } from './vision/scene';
import './vision/vision.css';
import './cameras.css';

const ORDER_KEY = 'opt.cameraWall.';

function readOrder(clubId: string): string[] {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY + clubId) || '[]') as string[]; } catch { return []; }
}
function writeOrder(clubId: string, ids: string[]) {
  try { localStorage.setItem(ORDER_KEY + clubId, JSON.stringify(ids)); } catch { /* per-viewer convenience only */ }
}

export default function CamerasPage() {
  const { t, pick, fmtNumber } = useI18n();
  const v = useVision();
  const [live, setLive] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const phase = usePhase(2000, live);
  const [order, setOrder] = useState<string[]>(() => readOrder(v.club.id));
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [large, setLarge] = useState<Camera | null>(null);
  const [edit, setEdit] = useState<Camera | null | 'new'>(null);
  const [toast, setToast] = useToast();

  useEffect(() => { setOrder(readOrder(v.club.id)); }, [v.club.id]);

  const wall = useMemo(() => {
    const rank = new Map(order.map((id, i) => [id, i]));
    return [...v.cameras].sort((a, b) => (rank.get(a.id) ?? 999 + v.cameras.indexOf(a)) - (rank.get(b.id) ?? 999 + v.cameras.indexOf(b)));
  }, [v.cameras, order]);

  const swap = useCallback((a: string, b: string) => {
    if (a === b) return;
    const ids = wall.map((c) => c.id);
    const i = ids.indexOf(a), j = ids.indexOf(b);
    if (i < 0 || j < 0) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setOrder(ids);
    writeOrder(v.club.id, ids);
    const ca = wall[i], cb = wall[j];
    setToast(t('cameras.swapped', { a: pick(ca.nameEn, ca.nameAr), b: pick(cb.nameEn, cb.nameAr) }));
  }, [wall, v.club.id, setToast, t, pick]);

  const online = v.cameras.filter((c) => c.online).length;
  const empty = v.cameras.filter((c) => !(v.zonesByCam.get(c.id)?.length)).length;
  const fp = phase + refreshKey * 7;

  const frameFor = (c: Camera, compact: boolean) => {
    const zs = ensurePolygons(v.zonesByCam.get(c.id) ?? []).map((z) => {
      const r = readingAt(v.live.zones[z.id] ?? { id: z.id, motionPct: 0, baselinePct: 0, active: false }, phase);
      return { ...z, active: r.active, motionPct: r.motionPct };
    });
    return <CameraFrame camera={c} zones={zs} machines={v.machines} inUse={v.inUse} phase={fp} compact={compact} labels={!compact} showZones={!compact} />;
  };

  const onDragStart = (id: string) => (e: DragEvent) => { setDragId(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); };
  const onDragOver = (id: string) => (e: DragEvent) => { if (!dragId) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overId !== id) setOverId(id); };
  const onDrop = (id: string) => (e: DragEvent) => { e.preventDefault(); const from = dragId ?? e.dataTransfer.getData('text/plain'); if (from) swap(from, id); setDragId(null); setOverId(null); };
  const onDragEnd = () => { setDragId(null); setOverId(null); };

  const largeZones = large ? (v.zonesByCam.get(large.id) ?? []) : [];

  return (
    <div className="page">
      <PageHeader title={t('cameras.title')} actions={<>
        <BlurChip />
        <Button icon={RefreshCw} onClick={() => setRefreshKey((k) => k + 1)}>{t('cameras.refresh')}</Button>
        <Button icon={live ? Pause : Play} onClick={() => setLive((x) => !x)} aria-pressed={live} title={live ? t('cameras.liveOn') : t('cameras.liveOff')}>
          {live && <span className="live-dot" aria-hidden />}{live ? t('cameras.live') : t('cameras.status.paused')}
        </Button>
        <Button variant="primary" icon={Plus} onClick={() => setEdit('new')}>{t('cameras.addCamera')}</Button>
      </>} />
      <p className="vis-lede">{t('cameras.lede')}</p>

      <div className="vis-kpis">
        <KpiTile label={t('cameras.kpi.cameras')} value={fmtNumber(v.cameras.length)} info={t('cameras.kpi.camerasInfo')} />
        <KpiTile label={t('cameras.kpi.zones')} value={fmtNumber(v.zones.length)} info={t('cameras.kpi.zonesInfo')} />
        <KpiTile live label={t('cameras.kpi.online')} value={`${fmtNumber(online)} / ${fmtNumber(v.cameras.length)}`} info={t('cameras.kpi.onlineInfo')} />
        <KpiTile label={t('cameras.kpi.noZones')} value={fmtNumber(empty)} info={t('cameras.kpi.noZonesInfo')} />
      </div>

      <div className="camwall" aria-live="off">
        {wall.map((c) => {
          const name = pick(c.nameEn, c.nameAr);
          return (
            <article key={c.id} className={`camtile ${dragId === c.id ? 'is-dragging' : ''} ${overId === c.id && dragId !== c.id ? 'is-over' : ''}`}
              draggable onDragStart={onDragStart(c.id)} onDragOver={onDragOver(c.id)} onDragLeave={() => setOverId((o) => (o === c.id ? null : o))}
              onDrop={onDrop(c.id)} onDragEnd={onDragEnd} aria-label={name} title={t('cameras.dragHint')}>
              {frameFor(c, true)}
              {overId === c.id && dragId !== c.id && <div className="camtile__drop"><span>{t('cameras.dropHere')}</span></div>}
              <div className="camtile__bar">
                <span className={`camtile__dot ${c.online ? 'is-on' : ''}`} aria-hidden />
                <span className="camtile__name">{name}</span>
                {c.isTest && <Badge>{t('cameras.testTag')}</Badge>}
                <span className="camtile__actions">
                  <button type="button" className="btn btn--sm btn--icon btn--ghost" onClick={() => setLarge(c)} aria-label={`${t('cameras.viewLarge')}: ${name}`} title={t('cameras.viewLarge')}><Maximize2 aria-hidden /></button>
                  <button type="button" className="btn btn--sm btn--icon btn--ghost" onClick={() => setEdit(c)} aria-label={`${t('cameras.editCamera')}: ${name}`} title={t('cameras.editCamera')}><Pencil aria-hidden /></button>
                </span>
              </div>
            </article>
          );
        })}
      </div>

      <Modal open={!!large} onClose={() => setLarge(null)} width={1080}
        title={large ? pick(large.nameEn, large.nameAr) : ''}
        subtitle={large ? (large.online ? t('cameras.status.onlineFps', { fps: fmtNumber(large.fps) }) : t('cameras.status.offline')) : undefined}
        footer={<>
          <span className="faint camlarge__hint">{t('cameras.largeClose')}</span>
          {large && <Button icon={Pencil} onClick={() => { const c = large; setLarge(null); setEdit(c); }}>{t('cameras.editCamera')}</Button>}
        </>}>
        {large && (() => {
          const c = v.cameras.find((x) => x.id === large.id) ?? large;
          const zs = ensurePolygons(largeZones).map((z) => {
            const r = readingAt(v.live.zones[z.id] ?? { id: z.id, motionPct: 0, baselinePct: 0, active: false }, phase);
            return { ...z, active: r.active, motionPct: r.motionPct };
          });
          return <CameraFrame camera={c} zones={zs} machines={v.machines} inUse={v.inUse} phase={fp} />;
        })()}
      </Modal>

      <CameraForm open={edit !== null} camera={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={setToast} />
      <Toast msg={toast} />
    </div>
  );
}
