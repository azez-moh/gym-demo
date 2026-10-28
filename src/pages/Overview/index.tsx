import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import type { Scope } from '../../data/types';
import { Activity, Bell, Building2, Gauge, Leaf, Users, Zap } from 'lucide-react';
import { KpiTile, PageHeader, Segmented, Tabs, type TabDef } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { useAccess } from '../../layout/access';
import { scopeLabel } from '../../layout/scopeLabel';
import { useDemo, TARIFF_SAR_PER_KWH, LIVE_CLUB_ID, type MachineType } from '../../data';
import { clubRows, machineBaseline, mean, peopleLastWeek, PERIODS, type Period } from './metrics';
import { AsAtLine, CountUp, useFmtMwh, useFmtSarCompact } from './shared';
import { buildInsights, gymStats, insightsForCell, windows, type GymStats } from './insights';
import { usePlan } from './plan';
import { ActionPlan, RecDrawer, RecommendedActions, useTx } from './Insights';
import { CompareDrawer, EquipmentMatrix, GymComparison, ThisGym, useGymCmp } from './Compare';
import { BusinessSection } from './Business';
import { EnergySection } from './Energy';
import { BmsSection } from './Bms';
import { CrowdHeatmapCard } from '../Heatmap/Compact';

type Section = 'business' | 'energy' | 'bms';
const SECTIONS: Section[] = ['business', 'energy', 'bms'];

/**
 * Top-centre "Overview" (/overview, network level): always the overview of all branches. Opening it sets the scope to
 * All branches, so the branch name by the logo reads "All branches" and there is no left menu.
 * The Facility Manager is locked to his gym: /overview forwards him to Branch overview (/branch, his operations page).
 * The single-gym overview is Branch overview (/branch, src/pages/Branch), the same component in 'branch' mode.
 */
export default function OverviewPage() {
  const { isFm } = useAccess();
  return isFm ? <Navigate to="/branch" replace /> : <NetworkOverview />;
}

function NetworkOverview() {
  const { scope, setScope } = useScope();
  useEffect(() => {
    if (scope.level !== 'all') setScope({ level: 'all' });
  }, [scope.level, setScope]);
  return <ChainOverview mode="network" />;
}

const ALL: Scope = { level: 'all' };

/** Overview content: all branches ('network', /overview) or the gym in scope ('branch', /branch). */
// eslint-disable-next-line react-refresh/only-export-components
export function ChainOverview({ mode }: { mode: 'network' | 'branch' }) {
  const i18n = useI18n();
  const { t, fmtNumber } = i18n;
  const data = useDemo();
  const sc = useScope();
  const scope = mode === 'network' ? ALL : sc.scope;
  const clubs = mode === 'network' ? sc.allClubs : sc.clubs;
  const allClubs = sc.allClubs;
  const basePath = mode === 'network' ? '/overview' : '/branch';
  const [params, setParams] = useSearchParams();
  const mwh = useFmtMwh();
  const sarC = useFmtSarCompact();

  const period: Period = PERIODS.includes(params.get('p') as Period) ? (params.get('p') as Period) : 'now';
  const section: Section = SECTIONS.includes(params.get('section') as Section) ? (params.get('section') as Section) : 'business';

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(params);
    if (v == null) n.delete(k); else n.set(k, v);
    setParams(n, { replace: true });
  };
  const linkWith = (k: string, v: string, extra?: Record<string, string>) => {
    const n = new URLSearchParams(params);
    n.set(k, v);
    if (extra) for (const [a, b] of Object.entries(extra)) n.set(a, b);
    return `${basePath}?${n.toString()}`;
  };

  const rows = useMemo(() => clubRows(data, clubs, period), [data, clubs, period]);

  // ---------- comparison across all gyms and recommended actions (complete days, stable through the day) ----------
  const allRows = useMemo(() => clubRows(data, allClubs, 'now'), [data, allClubs]);
  const { date } = data.live;
  /* eslint-disable react-hooks/exhaustive-deps */
  // the 8-week analysis takes about a second the first time each day: paint the page first, then fill it in
  const [ready, setReady] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setReady(true), 30); return () => window.clearTimeout(id); }, []);
  const branchSig = JSON.stringify(data.patches.set.settings ?? {});
  const insights = useMemo(() => (ready ? buildInsights(data) : []), [ready, date, data.machines, data.clubs, data.areas, data.acUnits, data.lights, branchSig]);
  const stats = useMemo(() => {
    if (!ready) return new Map<string, GymStats>();
    const w4 = windows(date).w4;
    return new Map<string, GymStats>(data.clubs.map((c) => [c.id, gymStats(data, c, w4)]));
  }, [ready, date, data.machines, data.clubs]);
  /* eslint-enable react-hooks/exhaustive-deps */
  const gyms = useGymCmp(allRows, stats);
  const plan = usePlan(data);
  const x = useTx();
  const isAll = scope.level === 'all';
  const scopeIds = clubs.map((c) => c.id);
  const scopeGym = scope.level === 'club' ? gyms.find((g) => g.club.id === scope.clubId) : undefined;
  // crowd heatmap: the gym in scope, or at network level the gym with floor data (Hittin Men)
  const heatClub = clubs.find((c) => c.id === LIVE_CLUB_ID) ?? clubs[0];

  // compare two gyms, deep-linkable as ?compare=<gymA>,<gymB>
  const cmpParam = params.get('compare');
  const cmpIds = cmpParam ? cmpParam.split(',').filter((id) => data.clubs.some((c) => c.id === id)) : [];
  const openCompare = (pre?: string) => {
    const ids = data.clubs.map((c) => c.id);
    const a = pre ?? scopeGym?.club.id ?? LIVE_CLUB_ID;
    let b = scopeGym && scopeGym.club.id !== a ? scopeGym.club.id : ids[(ids.indexOf(a) + 1) % ids.length];
    if (b === a) b = ids[(ids.indexOf(a) + 1) % ids.length];
    setParam('compare', `${a},${b}`);
  };

  // matrix cell -> its recommendations
  const [cell, setCell] = useState<{ type: MachineType; clubId: string } | null>(null);
  const planRef = useRef<HTMLDivElement>(null);
  const viewPlan = useCallback(() => planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), []);

  // ---------- 4 summary KPIs ----------
  const cap = clubs.reduce((a, c) => a + c.capacity, 0);
  const people = peopleLastWeek(data, clubs, period);
  const peopleDelta = people.before ? ((people.now - people.before) / people.before) * 100 : 0;
  const fullPct = cap ? Math.round((rows.reduce((a, r) => a + r.peopleIn, 0) / cap) * 100) : 0;
  const machineNow = Math.round(mean(rows.map((r) => r.machinePct)));
  const machineBase = machineBaseline(data, clubs, period);
  const energyKwh = period === 'week' ? rows.reduce((a, r) => a + r.energyWeekKwh, 0) : rows.reduce((a, r) => a + r.energyTodayKwh, 0);
  const savedPct = Math.round(mean(rows.map((r) => (period === 'week' ? r.savedWeekPct : r.savedTodayPct))) * 10) / 10;
  const savedMonthSar = rows.reduce((a, r) => a + r.savedMonthSar, 0);
  const alerts = rows.flatMap((r) => r.alerts);
  const nCrit = alerts.filter((a) => a.level === 'critical').length;
  const nWarn = alerts.filter((a) => a.level === 'warning').length;
  const nInfo = alerts.length - nCrit - nWarn;

  // Scroll to the details when a tile opens a section (not on first load).
  const detailsRef = useRef<HTMLDivElement>(null);
  const prevSection = useRef(section);
  useEffect(() => {
    if (prevSection.current !== section) detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    prevSection.current = section;
  }, [section]);

  const title = scopeLabel(scope, i18n, data.clubs, data.districts);
  const peopleLabel = period === 'now' ? t('overview.kpi.people') : period === 'today' ? t('overview.kpi.peopleToday') : t('overview.kpi.peopleWeek');
  const peopleInfo = period === 'now' ? t('overview.kpi.peopleInfo') : period === 'today' ? t('overview.kpi.peopleTodayInfo') : t('overview.kpi.peopleWeekInfo');
  const peopleCmp = period === 'now' ? t('overview.kpi.vsLastWeekHour') : period === 'today' ? t('overview.kpi.vsLastWeekTime') : t('overview.kpi.vsPrevWeek');

  const tabs: TabDef<Section>[] = [
    { id: 'business', label: t('overview.sections.business'), icon: Activity },
    { id: 'energy', label: t('overview.sections.energy'), icon: Zap },
    { id: 'bms', label: t('overview.sections.bms'), icon: Building2, count: alerts.length },
  ];

  return (
    <div className="page ov-page">
      <div className="ov-head">
        <PageHeader
          title={title}
          actions={(
            <Segmented ariaLabel={t('overview.period.label')} value={period} onChange={(v) => setParam('p', v === 'now' ? null : v)}
              options={PERIODS.map((p) => ({ value: p, label: t(`overview.period.${p}`) }))} />
          )}
        />
        <AsAtLine scope={scope} count={clubs.length} />
      </div>

      <div className="grid-kpi ov-kpis">
        <KpiTile icon={Users} live={period === 'now'} label={peopleLabel} info={peopleInfo} to={linkWith('section', 'business')}
          value={fmtNumber(period === 'week' ? people.now : period === 'today' ? people.now : rows.reduce((a, r) => a + r.peopleIn, 0))}
          unit={period === 'now' ? t('overview.kpi.peopleOf', { cap: fmtNumber(cap) }) : undefined}
          delta={{ value: peopleDelta, label: peopleCmp, goodWhen: 'up' }}
          hint={period === 'now' ? t('overview.kpi.peopleFull', { pct: fmtNumber(fullPct) }) : undefined} />
        <KpiTile icon={Gauge} live={period === 'now'} label={t('overview.kpi.machine')} info={t('overview.kpi.machineInfo')} to={linkWith('section', 'business')}
          value={fmtNumber(machineNow)} unit="%"
          delta={{ value: machineNow - machineBase, unit: 'pp', label: t('overview.kpi.vs4w') }}
          hint={period === 'now' ? t('overview.kpi.machineSub') : period === 'today' ? t('overview.kpi.machineSubToday') : t('overview.kpi.machineSubWeek')} />
        <KpiTile icon={Zap} label={period === 'week' ? t('overview.kpi.energyWeek') : t('overview.kpi.energy')}
          info={t('overview.kpi.energyInfo', { tariff: i18n.fmtCurrency(TARIFF_SAR_PER_KWH, 2) })} to={linkWith('section', 'energy')}
          className="ov-kpi-energy"
          value={mwh.value(energyKwh)} unit={mwh.unit}
          delta={{ value: -savedPct, goodWhen: 'down', label: t('overview.kpi.saved') }}
          hint={(
            <span className="ov-sar-hint">
              <Leaf aria-hidden />
              <strong className="num"><CountUp value={savedMonthSar} format={(v) => sarC(v)} /></strong>
              <span>{t('overview.kpi.savedMonth')}</span>
            </span>
          )} />
        <KpiTile icon={Bell} label={t('overview.kpi.alerts')} info={t('overview.kpi.alertsInfo')}
          to={linkWith('section', 'bms', nCrit ? { level: 'critical' } : undefined)}
          className={nCrit ? 'ov-kpi-alert is-crit' : 'ov-kpi-alert'}
          value={<span className={nCrit ? 'ov-crit' : ''}>{fmtNumber(alerts.length)}</span>}
          hint={<span className={nCrit ? 'ov-crit-text' : ''}>{t('overview.kpi.alertsSplit', { c: fmtNumber(nCrit), w: fmtNumber(nWarn), i: fmtNumber(nInfo) })}</span>} />
      </div>

      {!ready && <div className="card card--pad-md in-loading" role="status"><span className="live-dot" aria-hidden />{t('insights.recs.loading')}</div>}

      {ready && scopeGym && (
        <ThisGym g={scopeGym} gyms={gyms} recs={insights.filter((i) => i.clubIds.includes(scopeGym.club.id) && !plan.isDismissed(i.id)).length}
          onCompare={() => openCompare(scopeGym.club.id)} />
      )}

      {scope.level === 'club' && heatClub && <CrowdHeatmapCard club={heatClub} />}

      {ready && (<>
      <RecommendedActions list={insights} scopeIds={scopeIds} isAll={isAll} plan={plan} highlightId={params.get('action')} onViewPlan={viewPlan} />

      <div ref={planRef} className="ov-anchor"><ActionPlan plan={plan} /></div>

      <GymComparison gyms={gyms} scopeIds={scopeIds} isAll={isAll} onCompare={openCompare} />

      {scope.level !== 'club' && heatClub && <CrowdHeatmapCard club={heatClub} title={i18n.pick(heatClub.nameEn, heatClub.nameAr)} />}

      <EquipmentMatrix gyms={gyms} insights={insights.filter((i) => !plan.isDismissed(i.id))} scopeIds={scopeIds} isAll={isAll}
        onCell={(type, clubId) => setCell({ type, clubId })} />

      <RecDrawer open={!!cell} onClose={() => setCell(null)} plan={plan} onViewPlan={viewPlan}
        title={cell ? x.t('matrix.pickTitle', { type: x.typeLabel(cell.type), gym: x.gym(cell.clubId) }) : ''}
        items={cell ? insightsForCell(insights, cell.type, cell.clubId).filter((i) => !plan.isDismissed(i.id)) : []} />

      <CompareDrawer open={cmpIds.length === 2} a={cmpIds[0] ?? ''} b={cmpIds[1] ?? ''} gyms={gyms} insights={insights.filter((i) => !plan.isDismissed(i.id))}
        onChange={(a, b) => setParam('compare', `${a},${b}`)} onClose={() => setParam('compare', null)} />
      </>)}

      <div ref={detailsRef} className="ov-details">
        <Tabs ariaLabel={t('overview.sections.label')} tabs={tabs} value={section} onChange={(s) => setParam('section', s)} />
        <div role="tabpanel" className="ov-panel">
          {section === 'business' && <BusinessSection rows={rows} period={period} />}
          {section === 'energy' && <EnergySection rows={rows} />}
          {section === 'bms' && (
            <BmsSection rows={rows} level={params.get('level')} onLevel={(l) => setParam('level', l === 'all' ? null : l)} />
          )}
        </div>
      </div>
    </div>
  );
}
