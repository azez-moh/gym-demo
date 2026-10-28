import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Camera as CamIcon, Pencil, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import type { Camera, Machine } from '../../data/types';
import { ConfirmDialog, Drawer, InfoTip, Segmented, Select, TextField, Toggle } from '../../components';
import { useDemo } from '../../data/store';
import { useI18n } from '../../i18n';
import { CameraFrame } from '../Cameras/vision/CameraFrame';
import { ZONE_DEFAULTS, ensurePolygons, zoneLabel, type BaselineMode, type VZone } from '../Cameras/vision/model';

type Pt = [number, number];

function Lab({ text, info }: { text: string; info: string }) {
  return <span className="vform__lab">{text}<InfoTip text={info} /></span>;
}

function NumField({ label, info, value, onChange, min, max, step = 1 }: { label: string; info: string; value: number; onChange: (n: number) => void; min: number; max: number; step?: number }) {
  return (
    <div className="vform__field">
      <span className="field__label"><Lab text={label} info={info} /></span>
      <input className="field__input num" type="number" dir="ltr" value={value} min={min} max={max} step={step} aria-label={label}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, n))); }} />
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return <section className="vform__group"><h3 className="vform__group-title label">{title}</h3>{children}</section>;
}

/**
 * the reference build zone editor: name, machine, decision rule (AND/OR), outline, operator outline, mode motion,
 * motion threshold (3), pixel threshold (22), activate / release / gap seconds, baseline options.
 * Grouped into Basics and Sensitivity; each field has an "i". Delete asks for confirmation.
 */
export function ZoneEditor({ open, camera, zone, cameraZones, machines, inUse, phase, onClose, onToast }: {
  open: boolean; camera: Camera; zone: VZone | null; cameraZones: VZone[]; machines: Machine[]; inUse: Record<string, boolean>; phase: number;
  onClose: () => void; onToast: (m: string) => void;
}) {
  const { t, pick, fmtAgo } = useI18n();
  const { patch, add, remove, now } = useDemo();

  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [machineId, setMachineId] = useState('');
  const [rule, setRule] = useState<'and' | 'or'>('and');
  const [poly, setPoly] = useState<Pt[]>([]);
  const [opPoly, setOpPoly] = useState<Pt[]>([]);
  const [drawTarget, setDrawTarget] = useState<'outline' | 'operator' | null>(null);
  const [motion, setMotion] = useState(ZONE_DEFAULTS.motionThreshold);
  const [pixel, setPixel] = useState(ZONE_DEFAULTS.pixelThreshold);
  const [activate, setActivate] = useState(ZONE_DEFAULTS.activateSec);
  const [release, setRelease] = useState(ZONE_DEFAULTS.releaseSec);
  const [gap, setGap] = useState(ZONE_DEFAULTS.gapSec);
  const [baseline, setBaseline] = useState<BaselineMode>('none');
  const [baselineAt, setBaselineAt] = useState<number | undefined>();
  const [baselineMin, setBaselineMin] = useState(ZONE_DEFAULTS.baselineMinutes);
  const [watching, setWatching] = useState(true);
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTried(false);
    setDrawTarget(zone ? null : 'outline');
    const m = zone ? machines.find((x) => x.id === zone.machineId) : undefined;
    setNameEn(zone?.nameEn ?? ''); setNameAr(zone?.nameAr ?? '');
    setMachineId(zone?.machineId ?? '');
    setRule(m?.rule ?? 'and');
    setPoly((zone?.polygon ?? []) as Pt[]);
    setOpPoly((zone?.operatorPolygon ?? []) as Pt[]);
    setMotion(zone?.motionThreshold ?? ZONE_DEFAULTS.motionThreshold);
    setPixel(zone?.pixelThreshold ?? ZONE_DEFAULTS.pixelThreshold);
    setActivate(zone?.activateSec ?? ZONE_DEFAULTS.activateSec);
    setRelease(zone?.releaseSec ?? ZONE_DEFAULTS.releaseSec);
    setGap(zone?.gapSec ?? ZONE_DEFAULTS.gapSec);
    setBaseline(zone?.baseline ?? 'none');
    setBaselineAt(zone?.baselineAtMs);
    setBaselineMin(zone?.baselineMinutes ?? ZONE_DEFAULTS.baselineMinutes);
    setWatching(zone?.watching ?? true);
  }, [open, zone, machines]);

  useEffect(() => {
    const m = machines.find((x) => x.id === machineId);
    if (m && zone?.machineId !== machineId) setRule(m.rule);
  }, [machineId, machines, zone]);

  const machine = machines.find((m) => m.id === machineId);
  // machines on this camera first, then the rest of the club
  const machineOptions = useMemo(() => {
    const onCam = new Set(cameraZones.map((z) => z.machineId));
    const sorted = [...machines].sort((a, b) => Number(onCam.has(b.id)) - Number(onCam.has(a.id)) || a.nameEn.localeCompare(b.nameEn, undefined, { numeric: true }));
    return [{ value: '', label: t('monitor.editor.machine') }, ...sorted.map((m) => ({ value: m.id, label: pick(m.nameEn, m.nameAr) }))];
  }, [machines, cameraZones, pick, t]);

  const others = ensurePolygons(cameraZones.filter((z) => z.id !== zone?.id)).map((z) => ({ ...z, active: false, motionPct: 0 }));

  const addPoint = (p: Pt) => {
    if (drawTarget === 'outline') setPoly((x) => [...x, p]);
    else if (drawTarget === 'operator') setOpPoly((x) => [...x, p]);
  };

  const save = () => {
    setTried(true);
    if (!machineId || poly.length < 3) return;
    const fields = {
      nameEn: nameEn.trim(), nameAr: nameAr.trim(), machineId, polygon: poly, operatorPolygon: opPoly, mode: 'motion',
      motionThreshold: motion, pixelThreshold: pixel, activateSec: activate, releaseSec: release, gapSec: gap,
      baseline, baselineAtMs: baselineAt, baselineMinutes: baselineMin, watching,
    };
    if (machine && machine.rule !== rule) patch('machines', machine.id, { rule });
    if (zone) {
      patch('zones', zone.id, fields);
      onToast(t('monitor.editor.saved'));
    } else {
      const n = cameraZones.filter((z) => z.machineId === machineId).length + 1;
      const code = `Z_${(machine?.type ?? 'zone').replace(/-/g, '').toUpperCase().slice(0, 8)}_${machine?.num ?? 0}_Z${n}`;
      add('zones', { id: `${machineId}:z${Date.now().toString(36)}`, clubId: camera.clubId, cameraId: camera.id, code, n, ...fields });
      onToast(t('monitor.editor.created'));
    }
    onClose();
  };

  const doDelete = () => {
    if (!zone) return;
    remove('zones', zone.id);
    setConfirm(false);
    onToast(t('monitor.editor.deleted'));
    onClose();
  };

  const draftZone = { ...(zone ?? {}), nameEn, nameAr, n: zone?.n ?? 1 } as VZone;
  const label = zoneLabel(draftZone, machine, pick, t);

  return (
    <>
      <Drawer open={open} onClose={onClose} width={680}
        title={zone ? t('monitor.editor.editTitle') : t('monitor.editor.addTitle')}
        subtitle={zone ? label : pick(camera.nameEn, camera.nameAr)}
        footer={<>
          {zone && <button type="button" className="btn btn--danger zed__del" onClick={() => setConfirm(true)}><Trash2 aria-hidden />{t('monitor.editor.delete')}</button>}
          <button type="button" className="btn" onClick={onClose}>{t('monitor.editor.cancel')}</button>
          <button type="button" className="btn btn--primary" onClick={save}>{zone ? t('monitor.editor.save') : t('monitor.editor.create')}</button>
        </>}>
        <div className="vform">
          <div className="zed__frame">
            <CameraFrame camera={camera} zones={others} machines={machines} inUse={inUse} phase={phase} labels={false}
              drawPoints={poly} drawPoints2={opPoly} onDrawPoint={drawTarget ? addPoint : undefined} />
            {drawTarget && <span className="zed__drawhint">{t('monitor.editor.drawing')}</span>}
          </div>

          <Group title={t('monitor.editor.basics')}>
            <div className="vform__grid">
              <TextField label={t('monitor.editor.nameEn')} value={nameEn} onChange={setNameEn} dir="ltr" placeholder={t('monitor.editor.namePlaceholder')} />
              <TextField label={t('monitor.editor.nameAr')} value={nameAr} onChange={setNameAr} dir="rtl" />
            </div>
            <p className="vform__hint"><Lab text={label} info={t('monitor.editor.nameInfo')} /></p>
            {zone && <p className="vform__hint">{t('monitor.editor.code')}: <span className="vis-code">{zone.code}</span></p>}
            <div className="vform__grid">
              <div className="vform__field">
                <span className="field__label"><Lab text={t('monitor.editor.machine')} info={t('monitor.editor.machineInfo')} /></span>
                <Select label={t('monitor.editor.machine')} value={machineId} onChange={setMachineId} options={machineOptions} />
                {tried && !machineId && <p className="vform__err">{t('monitor.editor.errMachine')}</p>}
              </div>
              <div className="vform__field">
                <span className="field__label"><Lab text={t('monitor.editor.rule')} info={t('monitor.editor.ruleInfo')} /></span>
                <Segmented ariaLabel={t('monitor.editor.rule')} value={rule} onChange={setRule} size="sm"
                  options={[{ value: 'and', label: t('monitor.editor.ruleAnd') }, { value: 'or', label: t('monitor.editor.ruleOr') }]} />
                <span className="vform__hint">{rule === 'and' ? t('monitor.ruleAnd') : t('monitor.ruleOr')}</span>
              </div>
            </div>
            {([['outline', poly, setPoly, t('monitor.editor.outline'), t('monitor.editor.outlineInfo')], ['operator', opPoly, setOpPoly, t('monitor.editor.operator'), t('monitor.editor.operatorInfo')]] as const).map(([key, pts, setPts, lab, info]) => (
              <div key={key} className="zed__poly">
                <span className="field__label"><Lab text={lab} info={info} /></span>
                <span className="faint num">{pts.length ? t('monitor.editor.points', { n: pts.length }) : t('monitor.editor.noOutline')}</span>
                <span className="zed__poly-actions">
                  <button type="button" className={`btn btn--sm ${drawTarget === key ? 'btn--primary' : ''}`} aria-pressed={drawTarget === key}
                    onClick={() => setDrawTarget((d) => (d === key ? null : key))}><Pencil aria-hidden />{t('monitor.editor.draw')}</button>
                  <button type="button" className="btn btn--sm btn--icon" disabled={!pts.length} onClick={() => setPts((x: Pt[]) => x.slice(0, -1))}
                    aria-label={t('monitor.editor.undo')} title={t('monitor.editor.undo')}><Undo2 aria-hidden className="flip-rtl" /></button>
                  <button type="button" className="btn btn--sm btn--icon" disabled={!pts.length} onClick={() => setPts([])}
                    aria-label={t('monitor.editor.clear')} title={t('monitor.editor.clear')}><RotateCcw aria-hidden /></button>
                </span>
              </div>
            ))}
            {tried && poly.length < 3 && <p className="vform__err">{t('monitor.editor.errOutline')}</p>}
            <div className="zed__toggle">
              <Lab text={t('monitor.editor.watching')} info={t('monitor.editor.watchingInfo')} />
              <Toggle checked={watching} onChange={setWatching} label={t('monitor.editor.watching')} />
            </div>
          </Group>

          <Group title={t('monitor.editor.sensitivity')}>
            <div className="vform__field">
              <span className="field__label"><Lab text={t('monitor.editor.mode')} info={t('monitor.editor.modeInfo')} /></span>
              <Segmented ariaLabel={t('monitor.editor.mode')} value="motion" onChange={() => undefined} size="sm" options={[{ value: 'motion', label: t('monitor.editor.modeMotion') }]} />
            </div>
            <div className="vform__grid">
              <NumField label={t('monitor.editor.motionThreshold')} info={t('monitor.editor.motionThresholdInfo')} value={motion} onChange={setMotion} min={0} max={100} step={0.5} />
              <NumField label={t('monitor.editor.pixelThreshold')} info={t('monitor.editor.pixelThresholdInfo')} value={pixel} onChange={setPixel} min={0} max={255} />
              <NumField label={t('monitor.editor.activate')} info={t('monitor.editor.activateInfo')} value={activate} onChange={setActivate} min={0} max={120} />
              <NumField label={t('monitor.editor.release')} info={t('monitor.editor.releaseInfo')} value={release} onChange={setRelease} min={0} max={600} />
              <NumField label={t('monitor.editor.gap')} info={t('monitor.editor.gapInfo')} value={gap} onChange={setGap} min={0} max={120} />
            </div>
            <div className="vform__field">
              <span className="field__label"><Lab text={t('monitor.editor.baseline')} info={t('monitor.editor.baselineInfo')} /></span>
              <Segmented ariaLabel={t('monitor.editor.baseline')} value={baseline === 'captured' ? 'captured' : baseline} size="sm"
                onChange={(v) => { setBaseline(v); if (v === 'captured' && !baselineAt) setBaselineAt(now.getTime()); }}
                options={[
                  { value: 'none', label: t('monitor.editor.baselineNone') },
                  { value: 'auto', label: t('monitor.editor.baselineAuto') },
                  { value: 'captured', label: baselineAt ? t('monitor.editor.baselineCaptured', { when: fmtAgo((now.getTime() - baselineAt) / 1000) }) : t('monitor.editor.baselineCapture') },
                ]} />
            </div>
            {baseline === 'auto' && (
              <div className="vform__grid">
                <NumField label={t('monitor.editor.baselineMinutes')} info={t('monitor.editor.baselineInfo')} value={baselineMin} onChange={setBaselineMin} min={1} max={120} />
              </div>
            )}
            <div className="row">
              <button type="button" className="btn btn--sm" onClick={() => { setBaseline('captured'); setBaselineAt(now.getTime()); onToast(t('monitor.editor.baselineSaved')); }}>
                <CamIcon aria-hidden />{t('monitor.editor.baselineCapture')}
              </button>
              {baseline !== 'none' && (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setBaseline('none'); setBaselineAt(undefined); }}>{t('monitor.editor.baselineClear')}</button>
              )}
            </div>
          </Group>
        </div>
      </Drawer>
      <ConfirmDialog open={confirm} onCancel={() => setConfirm(false)} onConfirm={doDelete}
        title={t('monitor.editor.confirmTitle')} confirmLabel={t('monitor.editor.delete')}
        body={t('monitor.editor.confirmBody', { zone: label, machine: machine ? pick(machine.nameEn, machine.nameAr) : '' })} />
    </>
  );
}
