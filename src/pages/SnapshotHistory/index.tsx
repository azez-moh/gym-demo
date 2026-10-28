import { useEffect, useMemo, useState } from 'react';
import { Camera as CameraIcon, HardDrive, Images, Plus, Trash2, Video } from 'lucide-react';
import {
  Badge, Button, Card, Chip, ConfirmDialog, Drawer, EmptyState, InfoTip, KpiTile, Modal, PageHeader, Select, StatusBadge, TextField, Toggle,
} from '../../components';
import { useI18n } from '../../i18n';
import { camerasOf, focusClub, hhmm, useDemo, type Camera, type Club, type Machine } from '../../data';
import { useScope } from '../../layout/filters';
import { captureTimes, inUseAt, loadProfiles, peopleAt, saveProfiles, seedProfiles, type Profile } from './model';
import './snapshotHistory.css';

const INTERVALS = [5, 10, 15, 30, 60];
const PAGE = 4;
/** Clock time, with midnight at the end of the day shown as 24:00. */
const endTime = (m: number) => (m >= 1440 ? '24:00' : hhmm(m));
/** Average size of one kept frame in megabytes. */
const FRAME_MB = 0.42;

export default function SnapshotHistoryPage() {
  const { t, pick, fmtNumber } = useI18n();
  const d = useDemo();
  const { scope } = useScope();
  const club = focusClub(d, scope);
  const date = d.live.date;
  const nowMin = d.live.hour * 60 + d.live.minute;
  const cams = useMemo(() => camerasOf(d, club.id).filter((c) => !c.isTest), [d, club.id]);
  const machines = useMemo(() => d.machines.filter((m) => m.clubId === club.id && m.enabled), [d.machines, club.id]);

  const seed = () => seedProfiles(club, cams, machines);
  const [list, setList] = useState<Profile[]>(() => loadProfiles(club.id, seed));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setList(loadProfiles(club.id, seed)); }, [club.id]);
  const commit = (next: Profile[]) => { setList(next); saveProfiles(club.id, next); };
  const [sel, setSel] = useState<string>(list[0]?.id ?? '');
  const selected = list.find((p) => p.id === sel) ?? list[0];
  const [shownN, setShownN] = useState(PAGE);
  useEffect(() => setShownN(PAGE), [sel]);

  const [draft, setDraft] = useState<Profile | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [frame, setFrame] = useState<{ cam: Camera; min: number } | null>(null);

  const name = (p: Profile) => pick(p.nameEn || p.nameAr, p.nameAr || p.nameEn) || t('snapshotHistory.editor.unnamed');
  const camById = useMemo(() => new Map(cams.map((c) => [c.id, c])), [cams]);
  const active = list.filter((p) => p.enabled);
  const times = useMemo(() => new Map(list.map((p) => [p.id, captureTimes(p, club, date, nowMin)])), [list, club, date, nowMin]);
  const snapsToday = active.reduce((a, p) => a + (times.get(p.id)?.length ?? 0) * p.cameraIds.filter((id) => camById.get(id)?.online).length, 0);
  const lastAt = Math.max(-1, ...active.map((p) => times.get(p.id)?.[0] ?? -1));
  const covered = new Set(active.flatMap((p) => p.cameraIds));
  const recordingNow = active.filter((p) => nowMin >= p.from && nowMin < p.to).length;
  // 30 days kept: today plus 29 full days at the daily rate
  const perDay = active.reduce((a, p) => a + Math.floor((p.to - p.from) / p.everyMin) * p.cameraIds.length, 0);
  const storageGb = ((perDay * 29 + snapsToday) * FRAME_MB) / 1024;

  const openNew = () => {
    setIsNew(true);
    setDraft({ id: `sp-${Date.now().toString(36)}`, nameEn: '', nameAr: '', cameraIds: [], machineIds: [], everyMin: 15, from: club.hours.open * 60, to: Math.min(24, club.hours.close) * 60, background: true, enabled: true });
  };
  const openEdit = (p: Profile) => { setIsNew(false); setDraft({ ...p, cameraIds: [...p.cameraIds], machineIds: [...p.machineIds] }); };
  const saveDraft = (p: Profile) => {
    commit(isNew ? [...list, p] : list.map((x) => (x.id === p.id ? p : x)));
    if (isNew) setSel(p.id);
    setDraft(null);
  };

  const selTimes = selected ? times.get(selected.id) ?? [] : [];
  const selCams = selected ? selected.cameraIds.map((id) => camById.get(id)).filter(Boolean) as Camera[] : [];

  return (
    <div className="page">
      <PageHeader eyebrow={pick(club.nameEn, club.nameAr)} title={t('nav.snapshotHistory')}
        actions={<Button variant="primary" icon={Plus} onClick={openNew}>{t('snapshotHistory.newProfile')}</Button>} />

      <div className="grid-kpi">
        <KpiTile icon={Video} label={t('snapshotHistory.kpi.profiles')} info={t('snapshotHistory.kpi.profilesInfo')} value={fmtNumber(list.length)}
          hint={t('snapshotHistory.kpi.profilesHint', { n: fmtNumber(recordingNow) })} />
        <KpiTile icon={Images} label={t('snapshotHistory.kpi.snapshots')} info={t('snapshotHistory.kpi.snapshotsInfo')} value={fmtNumber(snapsToday)}
          hint={lastAt >= 0 ? t('snapshotHistory.kpi.snapshotsHint', { time: hhmm(lastAt) }) : undefined} />
        <KpiTile icon={CameraIcon} label={t('snapshotHistory.kpi.cameras')} info={t('snapshotHistory.kpi.camerasInfo')} value={fmtNumber(covered.size)}
          hint={t('snapshotHistory.kpi.camerasHint', { n: fmtNumber(cams.length) })} />
        <KpiTile icon={HardDrive} label={t('snapshotHistory.kpi.storage')} info={t('snapshotHistory.kpi.storageInfo')}
          value={t('snapshotHistory.kpi.gb', { n: fmtNumber(storageGb, 1) })} hint={t('snapshotHistory.kpi.storageHint')} />
      </div>

      <div className="sh-layout">
        <Card title={t('snapshotHistory.profiles.title')} info={t('snapshotHistory.profiles.info')} pad="md">
          <ul className="sh-profiles">
            {list.map((p) => (
              <li key={p.id} className={`sh-prof ${selected?.id === p.id ? 'is-sel' : ''} ${p.enabled ? '' : 'is-off'}`.trim()}>
                <button type="button" className="sh-prof__main" aria-pressed={selected?.id === p.id} onClick={() => setSel(p.id)} onDoubleClick={() => openEdit(p)}>
                  <span className="sh-prof__name">{name(p)}</span>
                  <span className="sh-prof__meta">
                    <span>{t('snapshotHistory.profiles.every', { n: fmtNumber(p.everyMin) })}</span>
                    <span className="num">{t('snapshotHistory.profiles.window', { from: hhmm(p.from), to: endTime(p.to) })}</span>
                  </span>
                  <span className="sh-prof__meta">
                    <span>{p.cameraIds.length === 1 ? t('snapshotHistory.profiles.cams1') : t('snapshotHistory.profiles.cams', { n: fmtNumber(p.cameraIds.length) })}</span>
                    <span>{p.machineIds.length ? t('snapshotHistory.profiles.machines', { n: fmtNumber(p.machineIds.length) }) : t('snapshotHistory.profiles.noMachines')}</span>
                  </span>
                </button>
                <div className="sh-prof__side">
                  <Toggle checked={p.enabled} onChange={(v) => commit(list.map((x) => (x.id === p.id ? { ...x, enabled: v } : x)))}
                    label={t('snapshotHistory.profiles.toggle', { name: name(p) })} />
                  <Button size="sm" variant="link" onClick={() => openEdit(p)}>{t('snapshotHistory.editor.editTitle')}</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title={selected ? t('snapshotHistory.timeline.title', { name: name(selected) }) : t('snapshotHistory.profiles.title')}
          info={t('snapshotHistory.timeline.info')} pad="md" className="sh-main">
          {!selected ? <EmptyState title={t('snapshotHistory.timeline.empty')} />
            : !selected.enabled ? <EmptyState title={t('snapshotHistory.timeline.off')} />
              : selTimes.length === 0 ? <EmptyState title={t('snapshotHistory.timeline.empty')} /> : (
                <div className="sh-timeline">
                  {selTimes.slice(0, shownN).map((min) => (
                    <section key={min} className="sh-capture" aria-label={t('snapshotHistory.timeline.capture', { time: hhmm(min) })}>
                      <h4 className="sh-capture__time"><span className="num">{hhmm(min)}</span></h4>
                      <div className="sh-tiles">
                        {selCams.map((cam) => (
                          <FrameTile key={cam.id} cam={cam} min={min} club={club} date={date}
                            machines={machinesIn(cam, selected, machines)} onOpen={() => setFrame({ cam, min })} />
                        ))}
                      </div>
                    </section>
                  ))}
                  {selTimes.length > shownN && (
                    <div className="sh-more"><Button onClick={() => setShownN((n) => n + PAGE)}>{t('snapshotHistory.timeline.showMore')}</Button></div>
                  )}
                </div>
              )}
        </Card>
      </div>

      {frame && selected && (
        <FrameModal cam={frame.cam} min={frame.min} club={club} date={date} machines={machinesIn(frame.cam, selected, machines)} onClose={() => setFrame(null)} />
      )}
      {draft && (
        <ProfileEditor draft={draft} isNew={isNew} cams={cams} machines={machines} onClose={() => setDraft(null)} onSave={saveDraft}
          onDelete={() => setConfirmDel(true)} />
      )}
      <ConfirmDialog open={confirmDel} onCancel={() => setConfirmDel(false)} confirmLabel={t('common.delete')}
        title={t('snapshotHistory.editor.deleteTitle')} body={draft ? t('snapshotHistory.editor.deleteBody', { name: name(draft) }) : ''}
        onConfirm={() => { if (draft) commit(list.filter((p) => p.id !== draft.id)); setConfirmDel(false); setDraft(null); }} />
    </div>
  );
}

function machinesIn(cam: Camera, p: Profile, all: Machine[]): Machine[] {
  const ids = new Set(p.machineIds);
  return all.filter((m) => m.cameraId === cam.id && ids.has(m.id)).sort((a, b) => a.x - b.x || a.z - b.z);
}

/** Lay machines out as a simple grid of footprints in a 320 x 180 frame. */
function layout(ms: Machine[]) {
  const n = ms.length;
  const cols = Math.max(1, Math.min(6, Math.ceil(Math.sqrt(n * 1.8))));
  const rows = Math.max(1, Math.ceil(n / cols));
  const padX = 22, padTop = 40, padBottom = 16;
  const cw = (320 - padX * 2) / cols;
  const ch = (180 - padTop - padBottom) / rows;
  return ms.map((m, i) => {
    const c = i % cols, r = Math.floor(i / cols);
    const w = Math.min(cw * 0.7, 44), h = Math.min(ch * 0.72, 46);
    return { m, x: padX + c * cw + (cw - w) / 2, y: padTop + r * ch + (ch - h) / 2, w, h };
  });
}

function FrameSvg({ cam, min, club, date, machines, big }: { cam: Camera; min: number; club: Club; date: string; machines: Machine[]; big?: boolean }) {
  const { t, pick } = useI18n();
  const boxes = layout(machines);
  const people = machines.length === 0 ? peopleAt(cam, club, date, min) : 0;
  const dots = Array.from({ length: Math.min(people, 24) }, (_, i) => ({ x: 40 + ((i * 53) % 240), y: 70 + ((i * 37) % 90) }));
  return (
    <svg className={`sh-frame ${big ? 'sh-frame--big' : ''}`} viewBox="0 0 320 180" role="img"
      aria-label={t('snapshotHistory.modal.frameAlt', { cam: pick(cam.nameEn, cam.nameAr), time: hhmm(min) })}>
      <rect className="sh-frame__bg" width="320" height="180" />
      <path className="sh-frame__floor" d="M0 180 L48 34 L272 34 L320 180 Z" />
      {boxes.map(({ m, x, y, w, h }) => {
        const on = inUseAt(m, club, date, min);
        return (
          <g key={m.id}>
            <rect className="sh-frame__machine" x={x + 4} y={y + 4} width={w - 8} height={h - 8} />
            <rect className={`sh-frame__zone ${on ? 'is-on' : ''}`} x={x} y={y} width={w} height={h} />
            {on && <circle className="sh-frame__person" cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) * 0.16} />}
          </g>
        );
      })}
      {dots.map((p, i) => <circle key={i} className="sh-frame__person" cx={p.x} cy={p.y} r="5" />)}
      <rect className="sh-frame__stamp-bg" x="6" y="6" width={big ? 116 : 106} height="20" />
      <text className="sh-frame__stamp" x="12" y="20">{`${date.slice(5)} ${hhmm(min)}:00`}</text>
      <circle className="sh-frame__rec" cx="306" cy="16" r="4" />
    </svg>
  );
}

function FrameTile({ cam, min, club, date, machines, onOpen }: { cam: Camera; min: number; club: Club; date: string; machines: Machine[]; onOpen: () => void }) {
  const { t, pick, fmtNumber } = useI18n();
  const on = machines.filter((m) => inUseAt(m, club, date, min)).length;
  const camName = pick(cam.nameEn, cam.nameAr);
  return (
    <button type="button" className="sh-tile" onClick={onOpen} aria-label={t('snapshotHistory.timeline.open', { cam: camName, time: hhmm(min) })}>
      <FrameSvg cam={cam} min={min} club={club} date={date} machines={machines} />
      <span className="sh-tile__foot">
        <span className="sh-tile__cam">{camName}</span>
        <span className="sh-tile__chips">
          {machines.length ? (<>
            <Badge tone="accent">{t('snapshotHistory.timeline.inUse', { n: fmtNumber(on) })}</Badge>
            <Badge tone="neutral">{t('snapshotHistory.timeline.idle', { n: fmtNumber(machines.length - on) })}</Badge>
          </>) : <Badge tone="neutral">{t('snapshotHistory.timeline.people', { n: fmtNumber(peopleAt(cam, club, date, min)) })}</Badge>}
        </span>
      </span>
    </button>
  );
}

function FrameModal({ cam, min, club, date, machines, onClose }: { cam: Camera; min: number; club: Club; date: string; machines: Machine[]; onClose: () => void }) {
  const { t, pick, fmtNumber } = useI18n();
  return (
    <Modal open onClose={onClose} width={760} title={t('snapshotHistory.modal.title', { cam: pick(cam.nameEn, cam.nameAr), time: hhmm(min) })}>
      <div className="sh-modal">
        <FrameSvg cam={cam} min={min} club={club} date={date} machines={machines} big />
        <div className="sh-modal__list">
          <h3 className="sh-modal__head">{machines.length ? t('snapshotHistory.modal.machines') : t('snapshotHistory.modal.peopleNow')}</h3>
          {machines.length === 0 ? (
            <>
              <strong className="sh-modal__big num">{fmtNumber(peopleAt(cam, club, date, min))}</strong>
              <p className="muted sh-small">{t('snapshotHistory.modal.none')}</p>
            </>
          ) : (
            <ul className="sh-mlist">
              {machines.map((m) => (
                <li key={m.id}><span>{pick(m.nameEn, m.nameAr)}</span><StatusBadge status={inUseAt(m, club, date, min) ? 'inUse' : 'idle'} /></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ProfileEditor({ draft, isNew, cams, machines, onClose, onSave, onDelete }: {
  draft: Profile; isNew: boolean; cams: Camera[]; machines: Machine[]; onClose: () => void; onSave: (p: Profile) => void; onDelete: () => void;
}) {
  const { t, pick, lang, fmtNumber } = useI18n();
  const [p, setP] = useState<Profile>(draft);
  const [err, setErr] = useState('');
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const visible = machines.filter((m) => p.cameraIds.includes(m.cameraId));
  const nameVal = lang === 'ar' ? p.nameAr || p.nameEn : p.nameEn || p.nameAr;
  const toggleIn = (arr: string[], id: string) => (arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const hours = Array.from({ length: 25 }, (_, h) => ({ value: String(h * 60), label: endTime(h * 60) }));
  const save = () => {
    if ((!p.nameEn.trim() && !p.nameAr.trim()) || !p.cameraIds.length) { setErr(t('snapshotHistory.editor.nameRequired')); return; }
    onSave({ ...p, machineIds: p.machineIds.filter((id) => visible.some((m) => m.id === id)), to: Math.max(p.to, p.from + p.everyMin) });
  };

  return (
    <Drawer open onClose={onClose} width={560} title={isNew ? t('snapshotHistory.editor.newTitle') : t('snapshotHistory.editor.editTitle')}
      footer={<div className="sh-foot">
        {!isNew ? <Button variant="ghost" icon={Trash2} onClick={onDelete}>{t('snapshotHistory.editor.delete')}</Button> : <span />}
        <div className="row">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={save}>{t('snapshotHistory.editor.save')}</Button>
        </div>
      </div>}>
      <div className="stack sh-form">
        <TextField label={t('snapshotHistory.editor.name')} value={nameVal} placeholder={t('snapshotHistory.editor.namePh')}
          onChange={(v) => set(lang === 'ar' ? { nameAr: v, nameEn: p.nameEn && !isNew ? p.nameEn : v } : { nameEn: v, nameAr: p.nameAr && !isNew ? p.nameAr : v })} />
        {err && <p className="sh-err" role="alert">{err}</p>}

        <div className="sh-field">
          <span className="field__label">{t('snapshotHistory.editor.cameras')}</span>
          <div className="chip-group" role="group" aria-label={t('snapshotHistory.editor.cameras')}>
            {cams.map((c) => (
              <Chip key={c.id} pressed={p.cameraIds.includes(c.id)} onClick={() => set({ cameraIds: toggleIn(p.cameraIds, c.id) })}>{pick(c.nameEn, c.nameAr)}</Chip>
            ))}
          </div>
        </div>

        <div className="sh-field">
          <div className="row-between">
            <span className="field__label">{t('snapshotHistory.editor.machines')} <span className="num">({fmtNumber(p.machineIds.filter((id) => visible.some((m) => m.id === id)).length)}/{fmtNumber(visible.length)})</span></span>
            <div className="row">
              <Button size="sm" variant="link" onClick={() => set({ machineIds: visible.map((m) => m.id) })}>{t('snapshotHistory.editor.selectAll')}</Button>
              <Button size="sm" variant="link" onClick={() => set({ machineIds: [] })}>{t('snapshotHistory.editor.clear')}</Button>
            </div>
          </div>
          <span className="faint sh-small">{t('snapshotHistory.editor.machinesHint')}</span>
          <div className="chip-group sh-machines" role="group" aria-label={t('snapshotHistory.editor.machines')}>
            {visible.map((m) => (
              <Chip key={m.id} pressed={p.machineIds.includes(m.id)} onClick={() => set({ machineIds: toggleIn(p.machineIds, m.id) })}>{pick(m.nameEn, m.nameAr)}</Chip>
            ))}
          </div>
        </div>

        <div className="sh-grid3">
          <div className="sh-field">
            <span className="field__label">{t('snapshotHistory.editor.interval')}</span>
            <Select label={t('snapshotHistory.editor.interval')} value={String(p.everyMin)} onChange={(v) => set({ everyMin: Number(v) })}
              options={INTERVALS.map((n) => ({ value: String(n), label: t('snapshotHistory.editor.intervalOpt', { n: fmtNumber(n) }) }))} />
          </div>
          <div className="sh-field">
            <span className="field__label">{t('snapshotHistory.editor.from')}</span>
            <Select label={t('snapshotHistory.editor.from')} value={String(p.from)} onChange={(v) => set({ from: Number(v) })} options={hours.slice(0, 24)} />
          </div>
          <div className="sh-field">
            <span className="field__label">{t('snapshotHistory.editor.to')}</span>
            <Select label={t('snapshotHistory.editor.to')} value={String(p.to)} onChange={(v) => set({ to: Number(v) })} options={hours.slice(1)} />
          </div>
        </div>

        <div className="row-between sh-set">
          <span className="sh-labeltip">{t('snapshotHistory.editor.background')}<InfoTip text={t('snapshotHistory.editor.backgroundInfo')} /></span>
          <Toggle checked={p.background} onChange={(v) => set({ background: v })} label={t('snapshotHistory.editor.background')} />
        </div>
        <div className="row-between sh-set">
          <span>{t('snapshotHistory.editor.enabled')}</span>
          <Toggle checked={p.enabled} onChange={(v) => set({ enabled: v })} label={t('snapshotHistory.editor.enabled')} />
        </div>
      </div>
    </Drawer>
  );
}
