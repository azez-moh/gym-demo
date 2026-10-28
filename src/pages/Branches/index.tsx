import { useEffect, useMemo, useRef } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertOctagon, ArrowDownUp, ArrowRight, Check, ListChecks, Store, Users } from 'lucide-react';
import { ChipGroup, EmptyState, InfoTip, LiveTag, KpiTile, PageHeader, Select } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { useAccess } from '../../layout/access';
import { useDemo, type Level } from '../../data';
import { clubRows, type ClubRow } from '../Overview/metrics';
import { AsAtLine, ClubStatus, STATUS_RANK, useFmtHour, useFmtMwh } from '../Overview/shared';
import './branches.css';

type Filter = 'all' | 'attention';
type Sort = 'status' | 'name' | 'people' | 'full' | 'machines' | 'energy' | 'alerts';
const SORTS: Sort[] = ['status', 'name', 'people', 'full', 'machines', 'energy', 'alerts'];
const FILTERS: Filter[] = ['all', 'attention'];

/**
 * Branches (top menu): the gym list only, one card per gym with Open gym. Opening a gym sets the gym scope and
 * opens its Overview; the left menu then shows the gym's BMS Core and AI Vision pages. The Kingdom map is its own
 * page (/map); an old /branches?view=map link redirects there with the same drill-down query.
 * A link with ?club=<id> highlights that card (used by Overview).
 */
export default function BranchesPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const { scope, setScope } = useScope();
  const { changeScope } = useAccess();

  // Branches belongs to the network level: opened while a gym is picked, go back to all branches.
  useEffect(() => {
    if (changeScope && scope.level === 'club' && params.get('view') !== 'map') setScope({ level: 'all' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (params.get('view') === 'map') {
    const p = new URLSearchParams(params);
    p.delete('view');
    const rest = p.toString();
    return <Navigate to={`/map${rest ? `?${rest}` : ''}`} replace />;
  }

  return (
    <div className="page br-page">
      <PageHeader title={t('branches.title')} />
      <BranchesList />
    </div>
  );
}

function BranchesList() {
  const i18n = useI18n();
  const { t, pick, fmtNumber, fmtClubs } = i18n;
  const data = useDemo();
  const { scope, allClubs: clubs, districts } = useScope();
  const [params, setParams] = useSearchParams();
  const filter: Filter = FILTERS.includes(params.get('filter') as Filter) ? (params.get('filter') as Filter) : 'all';
  const sort: Sort = SORTS.includes(params.get('sort') as Sort) ? (params.get('sort') as Sort) : 'status';
  const focus = params.get('club');

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v == null) n.delete(k); else n.set(k, v);
    setParams(n, { replace: true });
  };

  const rows = useMemo(() => clubRows(data, clubs, 'now'), [data, clubs]);
  const cap = clubs.reduce((a, c) => a + c.capacity, 0);
  const peopleIn = rows.reduce((a, r) => a + r.peopleIn, 0);
  const alerts = rows.flatMap((r) => r.alerts);
  const nCrit = alerts.filter((a) => a.level === 'critical').length;
  const nAttn = rows.filter((r) => r.live?.status === 'critical').length;
  const affected = rows.filter((r) => r.alerts.length).length;

  const name = (r: ClubRow) => pick(r.club.nameEn, r.club.nameAr);
  const visible = rows
    .filter((r) => filter === 'all' || r.live?.status === 'critical')
    .sort((a, b) => {
      const byName = name(a).localeCompare(name(b));
      switch (sort) {
        case 'status': return STATUS_RANK[a.live?.status ?? 'ok'] - STATUS_RANK[b.live?.status ?? 'ok'] || byName;
        case 'name': return byName;
        case 'people': return b.peopleIn - a.peopleIn || byName;
        case 'full': return b.pctFull - a.pctFull || byName;
        case 'machines': return b.machinePct - a.machinePct || byName;
        case 'energy': return b.energyTodayKwh - a.energyTodayKwh || byName;
        case 'alerts': return b.alerts.length - a.alerts.length || b.critical - a.critical || byName;
      }
    });

  // Scroll to and flash a card opened from Overview (?club=<id>).
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focus) return;
    const el = gridRef.current?.querySelector<HTMLElement>(`[data-club="${CSS.escape(focus)}"]`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
  }, [focus]);

  return (
    <>
      <div className="ov-head br-listhead">
        <AsAtLine />
      </div>

      <div className="grid-kpi ov-kpis">
        <KpiTile icon={Store} label={t('branches.kpi.clubs')} info={t('branches.kpi.clubsInfo')} value={fmtNumber(rows.length)}
          hint={[...new Set(clubs.map((c) => { const d = districts.find((x) => x.id === c.district); return d ? pick(d.cityEn, d.cityAr) : ''; }))].filter(Boolean).join(' · ')} />
        <KpiTile icon={Users} live label={t('branches.kpi.people')} info={t('branches.kpi.peopleInfo')} value={fmtNumber(peopleIn)}
          unit={t('branches.kpi.of', { cap: fmtNumber(cap) })} hint={t('branches.kpi.full', { pct: fmtNumber(cap ? Math.round((peopleIn / cap) * 100) : 0) })} />
        <KpiTile icon={ListChecks} label={t('branches.kpi.open')} info={t('branches.kpi.openInfo')} value={fmtNumber(alerts.length)}
          hint={t('branches.kpi.across', { n: fmtClubs(affected) })} />
        <KpiTile icon={AlertOctagon} label={t('branches.kpi.critical')} info={t('branches.kpi.criticalInfo')}
          className={nCrit ? 'ov-kpi-alert is-crit' : ''} to={nCrit ? '/overview?section=bms&level=critical' : undefined}
          value={<span className={nCrit ? 'ov-crit' : ''}>{fmtNumber(nCrit)}</span>}
          hint={<span className={nCrit ? 'ov-crit-text' : ''}>{nCrit ? t('branches.kpi.criticalSub') : t('branches.kpi.criticalNone')}</span>} />
      </div>

      <div className="br-toolbar">
        <ChipGroup ariaLabel={t('branches.filter.label')} value={filter} onChange={(v) => setParam('filter', v === 'all' ? null : v)} scroll
          options={[
            { value: 'all', label: t('branches.filter.all'), count: rows.length },
            { value: 'attention', label: t('branches.filter.attention'), count: nAttn },
          ]} />
        <Select label={t('branches.sort.label')} icon={ArrowDownUp} value={sort} onChange={(v) => setParam('sort', v === 'status' ? null : v)}
          title={t('branches.sort.label')} options={SORTS.map((s) => ({ value: s, label: `${t('branches.sort.label')}: ${t(`branches.sort.${s}`)}` }))} />
      </div>

      {visible.length === 0
        ? <EmptyState title={t('branches.empty')} />
        : (
          <div className="br-grid" ref={gridRef}>
            {visible.map((r) => <ClubCard key={r.club.id} row={r} current={scope.level === 'club' && scope.clubId === r.club.id} focused={focus === r.club.id} />)}
          </div>
        )}
    </>
  );
}

function ClubCard({ row, current, focused }: { row: ClubRow; current: boolean; focused: boolean }) {
  const { t, pick, fmtNumber } = useI18n();
  const { setScope } = useScope();
  const { districts } = useDemo();
  const navigate = useNavigate();
  const fmtHour = useFmtHour();
  const mwh = useFmtMwh();
  const c = row.club;
  const district = districts.find((d) => d.id === c.district);
  const status = row.live?.status ?? 'ok';
  const name = pick(c.nameEn, c.nameAr);
  const shown = row.alerts.slice(0, 3);
  const more = row.alerts.length - shown.length;
  const open = () => { setScope({ level: 'club', clubId: c.id }); navigate('/branch'); };
  const openAlerts = () => { setScope({ level: 'club', clubId: c.id }); navigate('/ai-agents'); };
  const pct = Math.min(100, row.pctFull);
  const capTone = row.pctFull >= 85 ? 'is-high' : '';

  return (
    <article className={`br-card br-card--${status} ${current ? 'is-current' : ''} ${focused ? 'is-focused' : ''}`} data-club={c.id} tabIndex={-1} aria-label={name}>
      <header className="br-card__head">
        <h3 className="br-card__name">{name}</h3>
        <ClubStatus status={status} />
      </header>
      <div className="br-card__tags">
        <span className="br-tag">{t(`gender.${c.gender}`)}</span>
        <span className="br-card__city">{district ? `${pick(district.nameEn, district.nameAr)}, ${pick(district.cityEn, district.cityAr)}` : ''}</span>
        {row.live && !row.live.isOpen && <span className="br-tag br-tag--muted">{t('branches.card.closed')}</span>}
      </div>

      <div className="br-card__nums">
        <div className="br-num">
          <span className="label br-num__label">{t('branches.card.inNow')}<LiveTag /></span>
          <span className="br-num__v num">{fmtNumber(row.peopleIn)}</span>
        </div>
        <div className="br-num">
          <span className="label">{t('branches.card.today')}</span>
          <span className="br-num__v num">{fmtNumber(row.peopleToday)}</span>
        </div>
      </div>

      <div className="br-cap">
        <div className="br-cap__bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={row.pctFull}
          aria-label={t('branches.card.capacityAria', { n: fmtNumber(row.peopleIn), cap: fmtNumber(c.capacity), pct: fmtNumber(row.pctFull) })}>
          <span className={`br-cap__fill ${capTone}`} style={{ inlineSize: `${pct}%` }} />
        </div>
        <div className="br-cap__text">
          <span className="num">{t('branches.card.capacity', { pct: fmtNumber(row.pctFull), n: fmtNumber(row.peopleIn), cap: fmtNumber(c.capacity) })}</span>
          <InfoTip text={t('branches.card.capacityInfo')} />
        </div>
      </div>

      <p className="br-card__line num">
        <span>{t('branches.card.peak', { hour: fmtHour(row.peakHour) })}</span>
        <span aria-hidden>·</span>
        <span>{t('branches.card.machines', { pct: fmtNumber(row.machinePct) })}</span>
        <span aria-hidden>·</span>
        <span>{t('branches.card.energy', { v: mwh.full(row.energyTodayKwh) })}</span>
      </p>

      <div className="br-card__alerts">
        {shown.length === 0
          ? <p className="br-card__none"><Check aria-hidden />{t('branches.card.noAlerts')}</p>
          : (
            <ul aria-label={t('branches.card.alertsLabel')}>
              {shown.map((a) => (
                <li key={a.id} className={`br-alert br-alert--${a.level}`}>
                  <span className="br-alert__dot" aria-hidden />
                  <span className="visually-hidden">{t(`status.${a.level as Level}`)}: </span>
                  <span>{pick(a.titleEn, a.titleAr)}</span>
                </li>
              ))}
            </ul>
          )}
        {more > 0 && (
          <button type="button" className="btn btn--link br-card__more" onClick={openAlerts} aria-label={t('branches.card.moreAria', { name, n: more })}>
            {t('branches.card.more', { n: fmtNumber(more) })}
          </button>
        )}
      </div>

      <footer className="br-card__foot">
        {current
          ? <button type="button" className="btn btn--sm br-card__btn" disabled><Check aria-hidden />{t('branches.card.current')}</button>
          : (
            <button type="button" className="btn btn--sm br-card__btn br-card__btn--go" onClick={open}>
              {t('branches.card.open')}<ArrowRight aria-hidden className="flip-rtl" />
            </button>
          )}
      </footer>
    </article>
  );
}
