import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Building2, Check, ChevronRight, Clock, Layers, Lock, PlugZap, Save } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, EmptyState, InfoTip, PageHeader } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { useAuth } from '../../layout/auth';
import { canEditBranch, useAccess } from '../../layout/access';
import { focusClub, integrationsOf, useDemo, type Club } from '../../data';
import { branchConfig, branchKey, DEFAULT_THRESHOLDS, THRESHOLD_LIMITS, type BranchThresholds } from '../../data/branchConfig';
import { defaultPlanOf, type FloorId } from '../../data/floors';
import './branchSettings.css';

/*
  Branch settings (/branch-settings): one page with the settings of the gym in scope.
    Gym details (register data, contacts editable), Floors and areas (comfortable capacity per area, used by the
    Heatmap), Operating hours (Building hours (BMS) edited in BMS Settings, camera counting hours read only), Alert
    thresholds (crowding, comfort band, idle and overused machines, used by Heatmap and recommendations) and an
    Integrations summary. Saved with a confirmation into the demo store (settings, `branch:<clubId>`).
  Facility Manager: operating hours and alert thresholds only (access.ts canEditBranch).
*/

type TKey = keyof BranchThresholds;
const T_KEYS: TKey[] = ['crowdPct', 'warmC', 'hotC', 'idlePct', 'overusedPct'];
const DAY_IDX = [0, 1, 2, 3, 4, 5, 6];

interface Draft {
  th: Record<TKey, string>;
  cap: Record<string, string>;
  manager: string;
  phone: string;
  email: string;
}

const hh = (h: number) => `${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`;
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

export default function BranchSettingsPage() {
  const i18n = useI18n();
  const { t, pick, fmtNumber, fmtDate } = i18n;
  const data = useDemo();
  const { scope } = useScope();
  const { user } = useAuth();
  const { role } = useAccess();
  const club = focusClub(data, scope);
  const gym = pick(club.nameEn, club.nameAr);
  const plan = defaultPlanOf(club.id);
  // reading data.patches keeps this in step with the registry the store fills
  const stored = useMemo(() => branchConfig(club.id), [club.id, data.patches]); // eslint-disable-line react-hooks/exhaustive-deps

  const fromStored = (): Draft => ({
    th: Object.fromEntries(T_KEYS.map((k) => [k, String(stored[k])])) as Record<TKey, string>,
    cap: Object.fromEntries((plan?.floors ?? []).flatMap((f) => f.areas.filter((a) => a.monitored).map((a) => [a.key, String(stored.capacity[a.key] ?? a.capacity)]))),
    manager: stored.manager, phone: stored.phone, email: stored.email,
  });
  const [draft, setDraft] = useState<Draft>(fromStored);
  const [draftFor, setDraftFor] = useState(club.id);
  if (draftFor !== club.id) { setDraftFor(club.id); setDraft(fromStored()); }
  const [ask, setAsk] = useState(false);
  const [flash, setFlash] = useState(false);

  const may = {
    details: canEditBranch(role, 'details'),
    floors: canEditBranch(role, 'floors'),
    thresholds: canEditBranch(role, 'thresholds'),
  };

  // ---------- validation ----------
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v));
  const thErr: Partial<Record<TKey, string>> = {};
  for (const k of T_KEYS) {
    const [a, b] = THRESHOLD_LIMITS[k];
    const v = num(draft.th[k]);
    if (!Number.isFinite(v) || v < a || v > b) thErr[k] = t('branchSettings.thresholds.range', { a: fmtNumber(a), b: fmtNumber(b) });
  }
  if (!thErr.warmC && !thErr.hotC && num(draft.th.hotC) <= num(draft.th.warmC)) thErr.hotC = t('branchSettings.thresholds.hotAbove');
  if (!thErr.idlePct && !thErr.overusedPct && num(draft.th.idlePct) >= num(draft.th.overusedPct)) thErr.idlePct = t('branchSettings.thresholds.idleBelow');
  const capErr = (key: string) => { const v = num(draft.cap[key] ?? ''); return !Number.isInteger(v) || v < 1 || v > 300; };
  const anyErr = Object.keys(thErr).length > 0 || Object.keys(draft.cap).some(capErr);

  // ---------- changes ----------
  const base = fromStored();
  const changes = [
    ...T_KEYS.filter((k) => num(draft.th[k]) !== num(base.th[k])),
    ...Object.keys(draft.cap).filter((k) => num(draft.cap[k]) !== num(base.cap[k])),
    ...(['manager', 'phone', 'email'] as const).filter((k) => draft[k].trim() !== base[k].trim()),
  ].length;
  const changesTxt = changes === 1 ? t('branchSettings.save.unsavedOne') : t('branchSettings.save.unsaved', { n: fmtNumber(changes) });

  const doSave = () => {
    const capacity: Record<string, number> = {};
    for (const f of plan?.floors ?? []) for (const a of f.areas) {
      if (!a.monitored) continue;
      const v = num(draft.cap[a.key]);
      if (v !== a.capacity) capacity[a.key] = v;
    }
    data.patch('settings', branchKey(club.id), {
      ...Object.fromEntries(T_KEYS.map((k) => [k, num(draft.th[k])])),
      capacity, manager: draft.manager.trim(), phone: draft.phone.trim(), email: draft.email.trim(),
      savedBy: user?.name ?? '', savedRole: role, savedAt: data.now.getTime(),
    });
    setAsk(false);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 2200);
  };

  const savedLine = stored.savedAt
    ? t('branchSettings.save.lastSaved', {
      role: t(`role.${stored.savedRole === 'fm' ? 'fm' : 'coo'}Short`),
      time: `${fmtDate(stored.savedAt, 'short')} ${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(stored.savedAt))}`,
    })
    : t('branchSettings.save.notSaved');

  const setTh = (k: TKey, v: string) => setDraft((d) => ({ ...d, th: { ...d.th, [k]: v } }));

  return (
    <div className="page bs-page">
      <PageHeader eyebrow={gym} title={<span className="bs-title">{t('branchSettings.title')}<InfoTip text={t('branchSettings.about')} /></span>} />
      {role === 'fm' && <p className="bs-fmnote"><Lock aria-hidden />{t('branchSettings.fmNote')}</p>}

      <div className="bs-grid">
        <div className="bs-col">
          <DetailsCard club={club} draft={draft} setDraft={setDraft} editable={may.details} />
          <FloorsCard clubId={club.id} draft={draft} setDraft={setDraft} editable={may.floors} capErr={capErr} />
        </div>
        <div className="bs-col">
          <HoursCard />
          <Card className="bs-card" title={<CardTitle icon={Bell} text={t('branchSettings.thresholds.title')} />} info={t('branchSettings.thresholds.info')}
            actions={!may.thresholds ? <Badge tone="neutral">{t('branchSettings.readOnly')}</Badge> : undefined}>
            <div className="bs-th">
              <Threshold k="crowdPct" label={t('branchSettings.thresholds.crowd')} info={t('branchSettings.thresholds.crowdInfo')} unit={t('branchSettings.thresholds.crowdUnit')}
                value={draft.th.crowdPct} onChange={(v) => setTh('crowdPct', v)} err={thErr.crowdPct} editable={may.thresholds} />
              <div className="bs-th__pair">
                <span className="bs-th__label">{t('branchSettings.thresholds.comfort')}<InfoTip text={t('branchSettings.thresholds.comfortInfo')} /></span>
                <div className="bs-th__two">
                  <Threshold k="warmC" small label={t('branchSettings.thresholds.warm')} unit={t('branchSettings.thresholds.degUnit')}
                    value={draft.th.warmC} onChange={(v) => setTh('warmC', v)} err={thErr.warmC} editable={may.thresholds} />
                  <Threshold k="hotC" small label={t('branchSettings.thresholds.hot')} unit={t('branchSettings.thresholds.degUnit')}
                    value={draft.th.hotC} onChange={(v) => setTh('hotC', v)} err={thErr.hotC} editable={may.thresholds} />
                </div>
              </div>
              <Threshold k="idlePct" label={t('branchSettings.thresholds.idle')} info={t('branchSettings.thresholds.idleInfo')} unit={t('branchSettings.thresholds.useUnit')}
                value={draft.th.idlePct} onChange={(v) => setTh('idlePct', v)} err={thErr.idlePct} editable={may.thresholds} />
              <Threshold k="overusedPct" label={t('branchSettings.thresholds.overused')} info={t('branchSettings.thresholds.overusedInfo')} unit={t('branchSettings.thresholds.useUnit')}
                value={draft.th.overusedPct} onChange={(v) => setTh('overusedPct', v)} err={thErr.overusedPct} editable={may.thresholds} />
            </div>
          </Card>
          <IntegrationsCard clubId={club.id} />
        </div>
      </div>

      <div className="bs-savebar" role="region" aria-label={t('branchSettings.save.save')}>
        <span className="bs-savebar__line">{savedLine}</span>
        <span className="bs-savebar__actions">
          {changes > 0 && <span className="bs-savebar__n">{changesTxt}</span>}
          {changes > 0 && <Button variant="ghost" onClick={() => setDraft(fromStored())}>{t('branchSettings.save.discard')}</Button>}
          <Button variant="primary" icon={flash ? Check : Save} disabled={!changes || anyErr} onClick={() => setAsk(true)}>
            {flash ? t('branchSettings.save.done') : t('branchSettings.save.save')}
          </Button>
        </span>
      </div>

      <ConfirmDialog open={ask} tone="primary" onCancel={() => setAsk(false)} onConfirm={doSave}
        title={t('branchSettings.save.confirmTitle')} body={t('branchSettings.save.confirmBody', { n: changesTxt, gym })}
        confirmLabel={t('branchSettings.save.confirmBtn')} />
    </div>
  );
}

function CardTitle({ icon: Icon, text }: { icon: typeof Bell; text: string }) {
  return <span className="bs-cardtitle"><Icon aria-hidden />{text}</span>;
}

function Threshold({ k, label, info, unit, value, onChange, err, editable, small }: {
  k: TKey; label: string; info?: string; unit: string; value: string; onChange: (v: string) => void; err?: string; editable: boolean; small?: boolean;
}) {
  const { t, fmtNumber } = useI18n();
  const [a, b, step] = THRESHOLD_LIMITS[k];
  return (
    <label className={`bs-th__row ${small ? 'is-small' : ''} ${err ? 'has-err' : ''}`} data-k={k}>
      <span className="bs-th__label">{label}{info && <InfoTip text={info} />}</span>
      <span className="bs-th__input">
        <input type="number" className="field__input" dir="ltr" min={a} max={b} step={step} value={value} readOnly={!editable} aria-invalid={!!err}
          onChange={(e) => onChange(e.target.value)} />
        <span className="bs-th__unit">{unit}</span>
      </span>
      <span className="bs-th__hint">{err ? <span className="bs-err" role="alert">{err}</span> : t('branchSettings.thresholds.def', { v: fmtNumber(DEFAULT_THRESHOLDS[k]) })}</span>
    </label>
  );
}

function DetailsCard({ club, draft, setDraft, editable }: { club: Club; draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; editable: boolean }) {
  const { t, pick, fmtNumber } = useI18n();
  const data = useDemo();
  const d = data.districts.find((x) => x.id === club.district);
  const span = (day: number) => {
    const o = (day === 5 && club.hours.fri) || (day === 6 && club.hours.sat) || { open: club.hours.open, close: club.hours.close };
    const v = { from: hh(o.open), to: hh(o.close) };
    return o.close > 24 ? t('branchSettings.details.closesNext', v) : t('branchSettings.details.span', v);
  };
  const row = (label: string, value: ReactNode) => (<div className="bs-dl__row"><dt>{label}</dt><dd>{value}</dd></div>);
  const contact = (k: 'manager' | 'phone' | 'email', type: string) => (
    <label className="bs-contact">
      <span className="field__label">{t(`branchSettings.details.${k}`)}</span>
      <input className="field__input" type={type} dir={k === 'manager' ? undefined : 'ltr'} value={draft[k]} readOnly={!editable}
        placeholder={t(`branchSettings.details.${k}Ph`)} onChange={(e) => setDraft((x) => ({ ...x, [k]: e.target.value }))} />
    </label>
  );
  return (
    <Card className="bs-card" title={<CardTitle icon={Building2} text={t('branchSettings.details.title')} />} info={t('branchSettings.details.info')}
      actions={!editable ? <Badge tone="neutral">{t('branchSettings.readOnly')}</Badge> : undefined}>
      <div className="bs-details">
        <dl className="bs-dl">
          {row(t('branchSettings.details.name'), pick(club.nameEn, club.nameAr))}
          {row(t('branchSettings.details.brand'), 'GYM Demo')}
          {row(t('branchSettings.details.address'), pick(club.addressEn, club.addressAr))}
          {row(t('branchSettings.details.district'), d ? `${pick(d.nameEn, d.nameAr)}, ${pick(d.cityEn, d.cityAr)}` : '')}
          {row(t('branchSettings.details.gender'), club.gender === 'men' ? t('branchSettings.details.men') : t('branchSettings.details.women'))}
          {row(t('branchSettings.details.area'), <span className="num">{t('branchSettings.details.areaVal', { n: fmtNumber(club.areaM2) })}</span>)}
          {row(t('branchSettings.details.capacity'), <span className="num">{t('branchSettings.details.capacityVal', { n: fmtNumber(club.capacity) })}</span>)}
          {row(t('branchSettings.details.opened'), pick(club.openedEn, club.openedAr))}
        </dl>
        <div className="bs-week" aria-label={t('branchSettings.details.hours')}>
          <span className="bs-sub">{t('branchSettings.details.hours')}</span>
          <ul>
            {DAY_IDX.map((day) => (
              <li key={day}><span>{t(`bmsSettings.day.${day}`)}</span><bdi className="num">{span(day)}</bdi></li>
            ))}
          </ul>
        </div>
      </div>
      <span className="bs-sub">{t('branchSettings.details.contacts')}</span>
      <div className="bs-contacts">
        {contact('manager', 'text')}
        {contact('phone', 'tel')}
        {contact('email', 'email')}
      </div>
    </Card>
  );
}

function FloorsCard({ clubId, draft, setDraft, editable, capErr }: {
  clubId: string; draft: Draft; setDraft: (f: (d: Draft) => Draft) => void; editable: boolean; capErr: (k: string) => boolean;
}) {
  const { t, pick, fmtNumber } = useI18n();
  const data = useDemo();
  const club = data.clubs.find((c) => c.id === clubId)!;
  const plan = defaultPlanOf(clubId);
  const title = <CardTitle icon={Layers} text={t('branchSettings.floors.title')} />;
  if (!plan) {
    return (
      <Card className="bs-card" title={title} info={t('branchSettings.floors.info')}>
        <EmptyState compact icon={Layers} title={t('heatmap.empty.title')} body={t('heatmap.empty.body', { gym: pick(club.nameEn, club.nameAr) })} />
      </Card>
    );
  }
  const floorName = (id: FloorId) => t(`heatmap.floors.${id}`);
  return (
    <Card className="bs-card" title={title} info={t('branchSettings.floors.info')}
      actions={!editable ? <Badge tone="neutral">{t('branchSettings.readOnly')}</Badge> : undefined}>
      <div className="bs-floors">
        {plan.floors.map((f) => {
          const areas = f.areas.filter((a) => a.monitored);
          const m2 = areas.reduce((s, a) => s + a.m2, 0);
          const cap = areas.reduce((s, a) => s + (Number(draft.cap[a.key]) || 0), 0);
          return (
            <table key={f.id} className="bs-table">
              <caption>{floorName(f.id)}</caption>
              <thead>
                <tr><th scope="col">{t('branchSettings.floors.area')}</th><th scope="col" className="num">{t('branchSettings.floors.m2')}</th><th scope="col">{t('branchSettings.floors.cap')}</th></tr>
              </thead>
              <tbody>
                {areas.map((a) => {
                  const err = capErr(a.key);
                  const changed = Number(draft.cap[a.key]) !== a.capacity;
                  return (
                    <tr key={a.key} data-area={a.key}>
                      <th scope="row">{pick(a.nameEn, a.nameAr)}</th>
                      <td className="num">{t('heatmap.area.m2', { n: fmtNumber(Math.round(a.m2)) })}</td>
                      <td>
                        <span className="bs-cap">
                          <input type="number" className={`field__input ${err ? 'is-err' : ''}`} dir="ltr" min={1} max={300} step={1} value={draft.cap[a.key] ?? ''}
                            readOnly={!editable} aria-invalid={err} aria-label={`${pick(a.nameEn, a.nameAr)}: ${t('branchSettings.floors.cap')}`}
                            onChange={(e) => setDraft((d) => ({ ...d, cap: { ...d.cap, [a.key]: e.target.value } }))} />
                          {err ? <span className="bs-err">{t('branchSettings.floors.err')}</span>
                            : changed ? <span className="bs-faint">{t('branchSettings.floors.def', { n: fmtNumber(a.capacity) })}</span> : null}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr><th scope="row">{t('branchSettings.floors.total')}</th><td className="num">{t('heatmap.area.m2', { n: fmtNumber(Math.round(m2)) })}</td><td className="num">{t('branchSettings.floors.people', { n: fmtNumber(cap) })}</td></tr>
              </tfoot>
            </table>
          );
        })}
      </div>
      <p className="bs-note">{t('branchSettings.floors.usedBy')} <Link className="bs-link" to="/heatmap">{t('nav.heatmap')}<ChevronRight aria-hidden className="flip-rtl" /></Link></p>
    </Card>
  );
}

function HoursCard() {
  const { t, fmtNumber } = useI18n();
  const data = useDemo();
  const { can } = useAccess();
  const days = [...data.settings.workingHours].sort((a, b) => a.day - b.day);
  const total = days.reduce((a, d) => {
    if (!d.open) return a;
    let x = toMin(d.to) - toMin(d.from);
    if (x <= 0) x += 1440;
    return a + x;
  }, 0) / 60;
  return (
    <Card className="bs-card" title={<CardTitle icon={Clock} text={t('branchSettings.hours.title')} />} info={t('branchSettings.hours.info')}>
      <div className="bs-hours">
        <section className="bs-hours__block" aria-labelledby="bs-h-bms">
          <div className="bs-hours__head">
            <span id="bs-h-bms" className="bs-sub">{t('branchSettings.hours.building')}</span>
            <InfoTip text={t('branchSettings.hours.buildingInfo')} />
            <span className="bs-faint num">{t('branchSettings.hours.perWeek', { h: fmtNumber(Math.round(total * 10) / 10) })}</span>
          </div>
          <ul className="bs-hours__list">
            {days.map((d) => (
              <li key={d.day}><span>{t(`bmsSettings.day.${d.day}`)}</span>
                <bdi className="num">{d.open ? t('branchSettings.details.span', { from: d.from, to: d.to }) : t('branchSettings.hours.closed')}</bdi></li>
            ))}
          </ul>
          {can('bms-settings') && (
            <Link className="btn btn--sm bs-hours__edit" to="/bms-settings?tab=building">{t('branchSettings.hours.edit')}<ChevronRight aria-hidden className="flip-rtl" /></Link>
          )}
        </section>
        <section className="bs-hours__block" aria-labelledby="bs-h-cam">
          <div className="bs-hours__head">
            <span id="bs-h-cam" className="bs-sub">{t('branchSettings.hours.camera')}</span>
            <InfoTip text={t('branchSettings.hours.cameraInfo')} />
            <Badge tone="neutral">{t('branchSettings.readOnly')}</Badge>
          </div>
          <p className="num bs-hours__cam">{t('bmsSettings.cameraHoursDaily')}</p>
          <p className="num bs-faint">{t('bmsSettings.cameraHoursThu')}</p>
          <p className="bs-faint">{t('bmsSettings.cameraHoursUsedBy')}</p>
        </section>
      </div>
    </Card>
  );
}

function IntegrationsCard({ clubId }: { clubId: string }) {
  const { t, pick, fmtNumber } = useI18n();
  const data = useDemo();
  const { can } = useAccess();
  const list = integrationsOf(data, clubId);
  return (
    <Card className="bs-card" title={<CardTitle icon={PlugZap} text={t('branchSettings.integrations.title')} />} info={t('branchSettings.integrations.info')}
      actions={can('integration') ? <Link className="btn btn--sm btn--ghost" to="/integration">{t('branchSettings.integrations.open')}<ChevronRight aria-hidden className="flip-rtl" /></Link> : undefined}>
      {list.length === 0 ? <p className="bs-faint">{t('branchSettings.integrations.none')}</p> : (
        <ul className="bs-integ">
          {list.map((x) => (
            <li key={x.id}>
              <span className={`bs-dot ${x.running ? 'is-on' : ''}`} aria-hidden />
              <span className="bs-integ__name">{pick(x.nameEn, x.nameAr)}</span>
              <span className="bs-faint num">{t('branchSettings.integrations.covers', { n: fmtNumber(x.covers), of: fmtNumber(x.coversOf) })}</span>
              <Badge tone={x.running ? 'success' : 'neutral'}>{x.running ? t('branchSettings.integrations.running') : t('branchSettings.integrations.stopped')}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
