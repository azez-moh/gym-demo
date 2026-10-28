import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Pencil, Plus } from 'lucide-react';
import { Badge, Button, EmptyState, InfoTip, LiveTag, PageHeader, Select, StatusBadge, Toggle } from '../../components';
import { useI18n } from '../../i18n';
import { CameraFrame } from '../Cameras/vision/CameraFrame';
import { StreamAddress } from '../Cameras/vision/StreamAddress';
import { BlurChip, Toast, useToast } from '../Cameras/vision/BlurChip';
import { ensurePolygons, usePhase, useVision, zoneLabel, type VZone } from '../Cameras/vision/model';
import { readingAt } from '../Cameras/vision/scene';
import { ZoneEditor } from './ZoneEditor';
import '../Cameras/vision/vision.css';
import './monitor.css';

export default function MonitorPage() {
  const { t, pick, fmtNumber, fmtPercent } = useI18n();
  const v = useVision();
  const [params, setParams] = useSearchParams();
  const phase = usePhase(2000);
  const [showZones, setShowZones] = useState(true);
  const [labels, setLabels] = useState(true);
  const [selZone, setSelZone] = useState<string | null>(null);
  const [selMachine, setSelMachine] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<{ zone: VZone | null } | null>(null);
  const [toast, setToast] = useToast();

  const camId = params.get('camera');
  const camera = v.cameras.find((c) => c.id === camId) ?? v.cameras[0];
  const setCamera = (id: string) => { setParams((p) => { const n = new URLSearchParams(p); n.set('camera', id); return n; }, { replace: true }); };

  useEffect(() => { setSelZone(null); setSelMachine(null); setOpen(new Set()); }, [camera?.id]);

  const camZones = useMemo(() => (camera ? ensurePolygons(v.zonesByCam.get(camera.id) ?? []) : []), [camera, v.zonesByCam]);
  const frameZones = useMemo(() => camZones.map((z) => {
    const r = readingAt(v.live.zones[z.id] ?? { id: z.id, motionPct: 0, baselinePct: 0, active: false }, phase);
    return { ...z, active: r.active && z.watching, motionPct: r.motionPct };
  }), [camZones, v.live.zones, phase]);

  const groups = useMemo(() => {
    const ids: string[] = [];
    for (const z of frameZones) if (!ids.includes(z.machineId)) ids.push(z.machineId);
    return ids.map((id) => ({ machine: v.machines.find((m) => m.id === id), zones: frameZones.filter((z) => z.machineId === id) }))
      .filter((g) => g.machine)
      .sort((a, b) => a.machine!.num - b.machine!.num || a.machine!.nameEn.localeCompare(b.machine!.nameEn));
  }, [frameZones, v.machines]);

  // first in-use machine opens by default (like the the reference build highlighted row)
  useEffect(() => {
    if (open.size || !groups.length) return;
    const first = groups.find((g) => v.inUse[g.machine!.id]) ?? groups[0];
    setOpen(new Set([first.machine!.id]));
  }, [groups, open.size, v.inUse]);

  if (!camera) {
    return <div className="page"><PageHeader title={t('monitor.title')} /><EmptyState title={t('monitor.noMachines')} /></div>;
  }

  const camOptions = v.cameras.map((c) => ({ value: c.id, label: `${pick(c.nameEn, c.nameAr)}${c.online ? '' : ` · ${t('cameras.status.offline')}`}` }));
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="page">
      <PageHeader title={t('monitor.title')} actions={<>
        <BlurChip />
        <Select label={t('monitor.camera')} value={camera.id} onChange={setCamera} options={camOptions} className="mon__camsel" />
        <Button variant="primary" icon={Plus} onClick={() => setEditor({ zone: null })} disabled={!camera.online}>{t('monitor.addZone')}</Button>
      </>} />
      <p className="vis-lede">{t('monitor.lede')}</p>

      <div className="mon">
        <div className="mon__main">
          <CameraFrame camera={camera} zones={frameZones} machines={v.machines} inUse={v.inUse} phase={phase}
            showZones={showZones} labels={labels} selectedZoneId={selZone} selectedMachineId={selMachine}
            onZoneClick={(id) => { setSelZone((s) => (s === id ? null : id)); const z = frameZones.find((x) => x.id === id); if (z) { setSelMachine(null); setOpen((s) => new Set(s).add(z.machineId)); } }} />
          <div className="mon__controls">
            <label className="mon__tog"><Toggle checked={showZones} onChange={setShowZones} label={t('monitor.showZones')} /><span>{t('monitor.showZones')}</span></label>
            <label className="mon__tog"><Toggle checked={labels} onChange={setLabels} label={t('monitor.labels')} disabled={!showZones} /><span>{t('monitor.labels')}</span></label>
            <span className="mon__hint">
              {t('monitor.hint')}{' · '}
              {camera.online
                ? <span className="mon__ok">{t('monitor.statusOnline', { fps: fmtNumber(camera.fps) })}</span>
                : <span className="mon__bad">{t('monitor.statusOffline')}</span>}
            </span>
          </div>
          <StreamAddress url={camera.stream} showLabel />
        </div>

        <aside className="mon__side" aria-label={t('monitor.machinesOn')}>
          <h2 className="mon__side-title label">{t('monitor.machinesOn')}<LiveTag /><InfoTip text={t('monitor.machinesOnInfo')} /></h2>
          {groups.length === 0 && <EmptyState compact title={t('monitor.noMachines')} body={t('monitor.noMachinesBody')} />}
          {groups.map(({ machine: m, zones }) => {
            const mm = m!;
            const used = !!v.inUse[mm.id];
            const isOpen = open.has(mm.id);
            const best = Math.max(0, ...zones.map((z) => z.motionPct));
            const sel = selMachine === mm.id || zones.some((z) => z.id === selZone);
            return (
              <div key={mm.id} className={`mrow ${used ? 'is-used' : ''} ${sel ? 'is-sel' : ''}`}>
                <button type="button" className="mrow__head" aria-expanded={isOpen}
                  onClick={() => { toggle(mm.id); setSelMachine((s) => (s === mm.id ? null : mm.id)); setSelZone(null); }}>
                  <ChevronDown aria-hidden className={`mrow__chev ${isOpen ? 'is-open' : ''}`} />
                  <span className="vis-name">
                    <span className="mrow__name">{pick(mm.nameEn, mm.nameAr)}</span>
                    <span className="faint mrow__type">{t(`cameras.types.${mm.type}`)}</span>
                  </span>
                  {used ? <Badge tone="accent">{t('cameras.state.inUse')}</Badge> : <StatusBadge status="idle" label={t('cameras.state.idle')} />}
                </button>
                <div className="mrow__rule">
                  <span className="mrow__rulechip">{mm.rule === 'and' ? 'AND' : 'OR'}</span>
                  <span>{zones.length === 1 ? t('monitor.zoneCount1') : t('monitor.zonesCount', { n: fmtNumber(zones.length) })} · {mm.rule === 'and' ? t('monitor.ruleAnd') : t('monitor.ruleOr')}</span>
                </div>
                <div className={`vis-bar ${used ? 'is-on' : ''}`} aria-hidden><span style={{ width: `${Math.min(100, best * 2.5)}%` }} /></div>
                {isOpen && (
                  <ul className="mrow__zones">
                    {zones.map((z) => (
                      <li key={z.id} className={selZone === z.id ? 'is-sel' : ''}>
                        <button type="button" className="mrow__zone" onClick={() => { setSelZone((s) => (s === z.id ? null : z.id)); setSelMachine(null); }} aria-pressed={selZone === z.id}>
                          <span className="vis-name">
                            <span>{zoneLabel(z, mm, pick, t)}</span>
                            <span className="vis-code">{z.code}</span>
                          </span>
                          <span className="mrow__zm num">{t('monitor.motion', { pct: fmtPercent(z.motionPct, 1) })}</span>
                        </button>
                        <button type="button" className="btn btn--sm btn--icon btn--ghost" onClick={() => setEditor({ zone: z })}
                          aria-label={`${t('monitor.editZone')}: ${zoneLabel(z, mm, pick, t)}`} title={t('monitor.editZone')}><Pencil aria-hidden /></button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </aside>
      </div>

      <ZoneEditor open={!!editor} camera={camera} zone={editor?.zone ?? null} cameraZones={camZones} machines={v.machines} inUse={v.inUse}
        phase={phase} onClose={() => setEditor(null)} onToast={setToast} />
      <Toast msg={toast} />
    </div>
  );
}
