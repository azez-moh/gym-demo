import { useEffect, useMemo, useState } from 'react';
import { Bell, DoorOpen, Plus, Search, ShieldCheck, Trash2, Users } from 'lucide-react';
import {
  Button, Card, ConfirmDialog, Drawer, EmptyState, InfoTip, KpiTile, LineChart, PageHeader, Segmented, Select, StatusBadge, TextField, Toggle,
} from '../../components';
import { useI18n } from '../../i18n';
import { camerasOf, focusClub, hhmm, useDemo } from '../../data';
import { useScope } from '../../layout/filters';
import {
  ZONES, doorwayToday, evaluate, history, loadPolicies, savePolicies, zoneDef,
  type Detection, type Kind, type LogStat, type Op, type Policy, type ZoneKey,
} from './model';
import './policies.css';

const OPS: Op[] = ['atLeast', 'atMost', 'equals'];
const STATS: LogStat[] = ['latest', 'min', 'peak', 'average'];
const WINDOWS = [30, 60, 120, 300, 600];

function blank(): Policy {
  return {
    id: `p-${Date.now().toString(36)}`, nameEn: '', nameAr: '', kind: 'count', zone: 'studio2', cameraKey: 'cam-9',
    op: 'atLeast', n: 15, confirmSec: 30, detection: 'local', logOn: true, logWindowSec: 60, logStat: 'peak', enabled: true, lineY: 55, lineTilt: 0,
  };
}

export default function PoliciesPage() {
  const { t, pick, lang, fmtNumber } = useI18n();
  const d = useDemo();
  const { scope } = useScope();
  const club = focusClub(d, scope);
  const date = d.live.date;
  const nowMin = d.live.hour * 60 + d.live.minute;
  const cams = useMemo(() => camerasOf(d, club.id), [d, club.id]);
  const camName = (key: string) => {
    const c = cams.find((x) => x.id === `${club.id}:${key}`) ?? cams[0];
    return c ? pick(c.nameEn, c.nameAr) : '';
  };

  const [list, setList] = useState<Policy[]>(() => loadPolicies(club.id));
  useEffect(() => { setList(loadPolicies(club.id)); }, [club.id]);
  const commit = (next: Policy[]) => { setList(next); savePolicies(club.id, next); };

  const [q, setQ] = useState('');
  const [draft, setDraft] = useState<Policy | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState('');

  const name = (p: Policy) => pick(p.nameEn || p.nameAr, p.nameAr || p.nameEn) || t('policies.drawer.unnamed');
  const evals = useMemo(() => new Map(list.map((p) => [p.id, evaluate(p, club, date, nowMin)])), [list, club, date, nowMin]);
  const peopleIn = d.live.clubs[club.id]?.peopleIn ?? 0;
  const door = useMemo(() => doorwayToday(club, date, nowMin, peopleIn), [club, date, nowMin, peopleIn]);

  const active = list.filter((p) => p.enabled);
  const alertsToday = active.reduce((a, p) => a + (evals.get(p.id)?.alerts ?? 0), 0);
  const rulesAlerted = active.filter((p) => (evals.get(p.id)?.alerts ?? 0) > 0).length;
  const countRules = active.filter((p) => p.kind === 'count');
  const zonesWatched = new Set(countRules.map((p) => p.zone));
  const peopleWatched = [...zonesWatched].reduce((a, z) => {
    const p = countRules.find((x) => x.zone === z)!;
    return a + (evals.get(p.id)?.value ?? 0);
  }, 0);

  const shown = list.filter((p) => !q.trim() || `${p.nameEn} ${p.nameAr} ${t(`policies.zone.${p.zone}`)}`.toLowerCase().includes(q.trim().toLowerCase()));

  const condText = (p: Policy) => (p.kind === 'doorway'
    ? t('policies.condDoor', { op: t(`policies.op.${p.op}`), n: fmtNumber(p.n) })
    : t('policies.condCount', { op: t(`policies.op.${p.op}`), n: fmtNumber(p.n) }));

  const openEdit = (p: Policy) => { setDraft({ ...p }); setIsNew(false); setErr(''); };
  const openNew = () => { const b = blank(); if (!cams.some((c) => c.id === `${club.id}:${b.cameraKey}`)) b.cameraKey = cams[0]?.id.split(':').pop() ?? b.cameraKey; setDraft(b); setIsNew(true); setErr(''); };
  const close = () => setDraft(null);
  const save = () => {
    if (!draft) return;
    if (!draft.nameEn.trim() && !draft.nameAr.trim()) { setErr(t('policies.drawer.nameRequired')); return; }
    commit(isNew ? [...list, draft] : list.map((p) => (p.id === draft.id ? draft : p)));
    setDraft(null);
  };
  const setToggle = (id: string, on: boolean) => commit(list.map((p) => (p.id === id ? { ...p, enabled: on } : p)));

  return (
    <div className="page">
      <PageHeader eyebrow={pick(club.nameEn, club.nameAr)} title={t('nav.policies')}
        actions={<Button variant="primary" icon={Plus} onClick={openNew}>{t('policies.newPolicy')}</Button>} />

      <div className="grid-kpi">
        <KpiTile icon={ShieldCheck} label={t('policies.kpi.active')} info={t('policies.kpi.activeInfo')} value={fmtNumber(active.length)}
          hint={t('policies.kpi.activeHint', { n: fmtNumber(list.length) })} />
        <KpiTile icon={Bell} label={t('policies.kpi.alerts')} info={t('policies.kpi.alertsInfo')} value={fmtNumber(alertsToday)}
          hint={t('policies.kpi.alertsHint', { n: fmtNumber(rulesAlerted) })} />
        <KpiTile live icon={Users} label={t('policies.kpi.people')} info={t('policies.kpi.peopleInfo')} value={fmtNumber(peopleWatched)}
          hint={t('policies.kpi.peopleHint', { n: fmtNumber(zonesWatched.size) })} />
        <KpiTile icon={DoorOpen} label={t('policies.kpi.entries')} info={t('policies.kpi.entriesInfo')} value={fmtNumber(door.inN)}
          hint={t('policies.kpi.entriesHint', { n: fmtNumber(door.outN) })} />
      </div>

      <Card title={t('policies.list.title')} info={t('policies.list.info')} live>
        <div className="pol-search"><TextField label={t('policies.list.search')} hideLabel icon={Search} value={q} onChange={setQ} placeholder={t('policies.list.search')} /></div>
        {shown.length === 0 ? <EmptyState title={t('common.noResults')} /> : (
          <div className="dt">
            <div className="dt__scroll">
              <table className="pol-table">
                <caption className="visually-hidden">{t('policies.list.title')}</caption>
                <thead>
                  <tr>
                    <th><span className="dt__th">{t('policies.col.name')}</span></th>
                    <th className="dt--hide-sm"><span className="dt__th">{t('policies.col.camera')}</span></th>
                    <th className="dt--hide-sm"><span className="dt__th">{t('policies.col.condition')}</span></th>
                    <th><span className="dt__th">{t('policies.col.now')}</span></th>
                    <th className="dt--hide-sm"><span className="dt__th">{t('policies.col.last')}</span></th>
                    <th className="dt--end"><span className="dt__th">{t('policies.col.on')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const e = evals.get(p.id)!;
                    return (
                      <tr key={p.id} data-click="true" tabIndex={0} className={e.triggered ? 'pol-row--hot' : undefined}
                        onClick={() => openEdit(p)} onKeyDown={(ev) => { if (ev.key === 'Enter') openEdit(p); }}>
                        <td>
                          <div className="pol-name">
                            <span className="pol-name__text">{name(p)}</span>
                            <span className="pol-sub">
                              {t(`policies.kind.${p.kind}`)} · {t(`policies.zone.${p.zone}`)}{p.afterHours ? ` · ${t('policies.afterHours')}` : ''}
                            </span>
                          </div>
                        </td>
                        <td className="dt--hide-sm pol-muted">{camName(p.cameraKey)}</td>
                        <td className="dt--hide-sm">{condText(p)}</td>
                        <td>
                          <div className="pol-now">
                            <span className="num pol-now__v">{p.kind === 'doorway' ? t('policies.entries10', { n: fmtNumber(e.value) }) : e.value === 1 ? t('policies.people1') : t('policies.people', { n: fmtNumber(e.value) })}</span>
                            {!p.enabled ? <StatusBadge status="stopped" label={t('policies.status.off')} />
                              : !e.watched ? <StatusBadge status="idle" label={t('policies.status.paused')} />
                                : e.triggered ? <StatusBadge status="warning" label={t('policies.status.triggered')} />
                                  : <StatusBadge status="ok" label={t('policies.status.ok')} />}
                          </div>
                        </td>
                        <td className="dt--hide-sm num pol-muted">{e.lastAt != null ? hhmm(e.lastAt) : t('policies.never')}</td>
                        <td className="dt--end" onClick={(ev) => ev.stopPropagation()} onKeyDown={(ev) => ev.stopPropagation()}>
                          <Toggle checked={p.enabled} onChange={(v) => setToggle(p.id, v)} label={t('policies.toggle', { name: name(p) })} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      {draft && (
        <PolicyDrawer draft={draft} setDraft={setDraft} isNew={isNew} err={err} onClose={close} onSave={save}
          onDelete={() => setConfirmDel(true)} cams={cams.map((c) => ({ key: c.id.split(':').pop()!, label: pick(c.nameEn, c.nameAr) }))}
          camName={camName} door={door} lang={lang} />
      )}
      <ConfirmDialog open={confirmDel} onCancel={() => setConfirmDel(false)}
        title={t('policies.drawer.deleteTitle')} body={draft ? t('policies.drawer.deleteBody', { name: name(draft) }) : ''}
        confirmLabel={t('common.delete')}
        onConfirm={() => { if (draft) commit(list.filter((p) => p.id !== draft.id)); setConfirmDel(false); setDraft(null); }} />
    </div>
  );
}

function PolicyDrawer({ draft, setDraft, isNew, err, onClose, onSave, onDelete, cams, camName, door, lang }: {
  draft: Policy; setDraft: (p: Policy) => void; isNew: boolean; err: string; onClose: () => void; onSave: () => void; onDelete: () => void;
  cams: { key: string; label: string }[]; camName: (k: string) => string; door: { inN: number; outN: number }; lang: string;
}) {
  const { t, fmtNumber, pick } = useI18n();
  const d = useDemo();
  const { scope } = useScope();
  const club = focusClub(d, scope);
  const nowMin = d.live.hour * 60 + d.live.minute;
  const set = (patch: Partial<Policy>) => setDraft({ ...draft, ...patch });
  const series = useMemo(() => history(draft, club, d.live.date, nowMin).map((x) => ({ t: hhmm(x.min), v: x.v })), [draft, club, d.live.date, nowMin]);
  const nameVal = lang === 'ar' ? draft.nameAr || draft.nameEn : draft.nameEn || draft.nameAr;
  const title = isNew ? t('policies.drawer.newTitle') : (pick(draft.nameEn || draft.nameAr, draft.nameAr || draft.nameEn));

  return (
    <Drawer open onClose={onClose} title={title} width={560}
      footer={<div className="pol-foot">
        {!isNew ? <Button variant="ghost" icon={Trash2} onClick={onDelete}>{t('policies.drawer.delete')}</Button> : <span />}
        <div className="row">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" onClick={onSave}>{t('policies.drawer.save')}</Button>
        </div>
      </div>}>
      <div className="stack pol-form">
        <TextField label={t('policies.drawer.name')} value={nameVal} placeholder={t('policies.drawer.namePh')}
          onChange={(v) => set(lang === 'ar' ? { nameAr: v, nameEn: draft.nameEn && !isNew ? draft.nameEn : v } : { nameEn: v, nameAr: draft.nameAr && !isNew ? draft.nameAr : v })} />
        {err && <p className="pol-err" role="alert">{err}</p>}

        <div className="pol-field">
          <span className="field__label">{t('policies.drawer.type')}</span>
          <Segmented<Kind> ariaLabel={t('policies.drawer.type')} value={draft.kind}
            onChange={(v) => set({ kind: v, n: v === 'doorway' ? 30 : draft.n, zone: v === 'doorway' ? 'reception' : draft.zone, cameraKey: v === 'doorway' ? 'cam-10' : draft.cameraKey })}
            options={[{ value: 'count', label: t('policies.kind.count') }, { value: 'doorway', label: t('policies.kind.doorway') }]} />
        </div>

        <div className="pol-grid2">
          <LabeledSelect label={t('policies.drawer.camera')} value={draft.cameraKey} onChange={(v) => set({ cameraKey: v })}
            options={cams.map((c) => ({ value: c.key, label: c.label }))} />
          <LabeledSelect label={t('policies.drawer.zone')} value={draft.zone}
            onChange={(v) => { const z = zoneDef(v as ZoneKey); set({ zone: v as ZoneKey, cameraKey: cams.some((c) => c.key === z.cams[0]) ? z.cams[0] : draft.cameraKey }); }}
            options={ZONES.map((z) => ({ value: z.key, label: t(`policies.zone.${z.key}`) }))} />
        </div>

        <fieldset className="pol-set">
          <legend className="pol-legend">{t('policies.drawer.condition')}</legend>
          <div className="pol-grid3">
            <LabeledSelect label={t('policies.drawer.op')} value={draft.op} onChange={(v) => set({ op: v as Op })}
              options={OPS.map((o) => ({ value: o, label: t(`policies.op.${o}`) }))} />
            <TextField type="number" label={draft.kind === 'doorway' ? t('policies.drawer.nDoor') : t('policies.drawer.n')} value={String(draft.n)}
              onChange={(v) => set({ n: Math.max(0, Math.min(999, Math.round(Number(v) || 0))) })} dir="ltr" />
            <div className="pol-field">
              <span className="field__label pol-labeltip">{t('policies.drawer.confirm')}<InfoTip text={t('policies.drawer.confirmInfo')} /></span>
              <Select label={t('policies.drawer.confirm')} value={String(draft.confirmSec)} onChange={(v) => set({ confirmSec: Number(v) })}
                options={[0, 10, 20, 30, 45, 60, 120, 300].map((s) => ({ value: String(s), label: fmtNumber(s) }))} />
            </div>
          </div>
        </fieldset>

        <div className="pol-field">
          <span className="field__label pol-labeltip">{t('policies.drawer.detection')}<InfoTip text={t('policies.drawer.detectionInfo')} /></span>
          <Segmented<Detection> ariaLabel={t('policies.drawer.detection')} value={draft.detection} onChange={(v) => set({ detection: v })}
            options={[{ value: 'local', label: t('policies.drawer.local') }, { value: 'cloud', label: t('policies.drawer.cloud') }]} />
        </div>

        <div className="pol-set">
          <div className="row-between">
            <span className="pol-labeltip">{t('policies.drawer.log')}<InfoTip text={t('policies.drawer.logInfo')} /></span>
            <Toggle checked={draft.logOn} onChange={(v) => set({ logOn: v })} label={t('policies.drawer.log')} />
          </div>
          {draft.logOn && (
            <div className="pol-grid2">
              <LabeledSelect label={t('policies.drawer.logWindow')} value={String(draft.logWindowSec)} onChange={(v) => set({ logWindowSec: Number(v) })}
                options={WINDOWS.map((s) => ({ value: String(s), label: s < 120 ? t('policies.drawer.sec', { n: fmtNumber(s) }) : t('policies.drawer.min', { n: fmtNumber(s / 60) }) }))} />
              <LabeledSelect label={t('policies.drawer.logStat')} value={draft.logStat} onChange={(v) => set({ logStat: v as LogStat })}
                options={STATS.map((s) => ({ value: s, label: t(`policies.drawer.stat.${s}`) }))} />
            </div>
          )}
        </div>

        {draft.kind === 'doorway' && (
          <div className="pol-set">
            <span className="pol-labeltip">{t('policies.drawer.line')}<InfoTip text={t('policies.drawer.lineInfo')} /></span>
            <DoorPreview y={draft.lineY ?? 55} tilt={draft.lineTilt ?? 0} label={t('policies.drawer.preview', { cam: camName(draft.cameraKey) })}
              inLabel={t('policies.drawer.in')} outLabel={t('policies.drawer.out')} />
            <div className="pol-grid2">
              <label className="pol-range">
                <span className="field__label">{t('policies.drawer.linePos')}</span>
                <input type="range" min={20} max={85} value={draft.lineY ?? 55} onChange={(e) => set({ lineY: Number(e.target.value) })} />
              </label>
              <label className="pol-range">
                <span className="field__label">{t('policies.drawer.lineTilt')}</span>
                <input type="range" min={-20} max={20} value={draft.lineTilt ?? 0} onChange={(e) => set({ lineTilt: Number(e.target.value) })} />
              </label>
            </div>
            <div className="pol-doorstats">
              <div><span className="field__label">{t('policies.drawer.inToday')}</span><strong className="num">{fmtNumber(door.inN)}</strong></div>
              <div><span className="field__label">{t('policies.drawer.outToday')}</span><strong className="num">{fmtNumber(door.outN)}</strong></div>
            </div>
          </div>
        )}

        <div className="pol-set">
          <span className="pol-labeltip">{t('policies.drawer.chart')}<InfoTip text={t('policies.drawer.chartInfo')} /></span>
          <LineChart data={series} xKey="t" height={180} ariaLabel={t('policies.drawer.chart')} xInterval={5}
            series={[{ key: 'v', label: t('policies.drawer.count') }]}
            reference={{ value: draft.n, label: t('policies.drawer.threshold') }} />
        </div>

        <div className="row-between pol-set">
          <span>{t('policies.drawer.afterHours')}</span>
          <Toggle checked={!!draft.afterHours} onChange={(v) => set({ afterHours: v })} label={t('policies.drawer.afterHours')} />
        </div>
        <div className="row-between pol-set">
          <span>{t('policies.drawer.enabled')}</span>
          <Toggle checked={draft.enabled} onChange={(v) => set({ enabled: v })} label={t('policies.drawer.enabled')} />
        </div>
      </div>
    </Drawer>
  );
}

function LabeledSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="pol-field">
      <span className="field__label">{label}</span>
      <Select label={label} value={value} onChange={onChange} options={options} />
    </div>
  );
}

/** Stylised camera view of a doorway with the crossing line and IN / OUT arrows. */
function DoorPreview({ y, tilt, label, inLabel, outLabel }: { y: number; tilt: number; label: string; inLabel: string; outLabel: string }) {
  const W = 320, H = 180;
  const cy = (y / 100) * H;
  const dy = Math.tan((tilt * Math.PI) / 180) * (W * 0.42);
  return (
    <svg className="pol-cam" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid slice">
      <rect className="pol-cam__bg" x="0" y="0" width={W} height={H} />
      <path className="pol-cam__floor" d={`M0 ${H} L70 ${H * 0.42} L250 ${H * 0.42} L${W} ${H} Z`} />
      <rect className="pol-cam__door" x="122" y="18" width="76" height={H * 0.42 - 18} />
      <rect className="pol-cam__doorin" x="130" y="26" width="60" height={H * 0.42 - 26} />
      <rect className="pol-cam__desk" x="232" y={H * 0.5} width="62" height="22" />
      <circle className="pol-cam__person" cx="150" cy={H * 0.62} r="7" />
      <rect className="pol-cam__person" x="143" y={H * 0.62 + 8} width="14" height="22" />
      <circle className="pol-cam__person" cx="196" cy={H * 0.78} r="7" />
      <rect className="pol-cam__person" x="189" y={H * 0.78 + 8} width="14" height="22" />
      <line className="pol-cam__line" x1={W * 0.08} y1={cy - dy} x2={W * 0.92} y2={cy + dy} />
      <circle className="pol-cam__handle" cx={W * 0.08} cy={cy - dy} r="4.5" />
      <circle className="pol-cam__handle" cx={W * 0.92} cy={cy + dy} r="4.5" />
      <g transform={`translate(${W * 0.3} ${cy - dy * 0.45})`}>
        <path className="pol-cam__arrow pol-cam__arrow--in" d="M0 -26 L0 14 M-7 6 L0 14 L7 6" />
        <text className="pol-cam__tag" x="10" y="-12">{inLabel}</text>
      </g>
      <g transform={`translate(${W * 0.7} ${cy + dy * 0.45})`}>
        <path className="pol-cam__arrow pol-cam__arrow--out" d="M0 26 L0 -14 M-7 -6 L0 -14 L7 -6" />
        <text className="pol-cam__tag" x="10" y="20">{outLabel}</text>
      </g>
    </svg>
  );
}
