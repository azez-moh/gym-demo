import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { AreaChart, Badge, Card, DataTable as BaseTable, KpiTile, StatusBadge, type Column, type DataTableProps } from '../../components';
import { useI18n } from '../../i18n';
import {
  useDemo, focusClub, totals, alertsIn, activityIn, machinesOf, machinesByType, acOf, lightsOf, areasOf, presenceOf, agentsOf,
  integrationsOf, energyToday, savingsSummary, sessionsOn, TARIFF_SAR_PER_KWH, hhmm, msAt,
  type Alert, type Club, type MachineType,
} from '../../data';
import { useScope } from '../../layout/filters';
import { pageById } from '../../layout/nav';
import type { MorePage } from './morePages';

/*
  Pages never audited in the reference build: each states its purpose and lists its data, shaped like the closest audited
  page (BUILD-DECISIONS defaults). Read views only: no controls are invented.
*/

type I18n = ReturnType<typeof useI18n>;

/** Columns that only give `value` render that value (the shared table otherwise reads row[key]). */
function DataTable<T>(props: DataTableProps<T>) {
  const columns = props.columns.map((c) => (c.render || !c.value ? c : { ...c, render: (r: T) => String(c.value!(r) ?? '') }));
  return <BaseTable {...props} columns={columns} />;
}

function useBuilding() {
  const data = useDemo();
  const { scope } = useScope();
  return { data, club: focusClub(data, scope) };
}

function Kpis({ children, three }: { children: ReactNode; three?: boolean }) {
  return <div className={three ? 'mp-grid-kpi-3' : 'grid-kpi'}>{children}</div>;
}

function RelatedLink({ page }: { page: MorePage }) {
  const { t } = useI18n();
  const def = page.relatedPage ? pageById(page.relatedPage) : undefined;
  if (!def) return null;
  return <Link className="st-link" to={`/${def.id}`}>{t('settings.page.open', { name: t(`nav.${def.key}`) })}<ChevronRight aria-hidden className="flip-rtl" /></Link>;
}

function Purpose({ page, club }: { page: MorePage; club?: Club }) {
  const { t, pick } = useI18n();
  return (
    <div className="mp-purpose">
      <span>{club ? `${t('settings.page.building')}: ${pick(club.nameEn, club.nameAr)}` : pick(page.descEn, page.descAr)}</span>
      <RelatedLink page={page} />
    </div>
  );
}

function typeName(data: ReturnType<typeof useDemo>, i: I18n, type: MachineType) {
  const m = data.library.find((x) => x.id === type);
  return m ? i.pick(m.nameEn, m.nameAr) : type;
}

const levelStatus = (l: Alert['level']) => (l === 'critical' ? 'critical' : l === 'warning' ? 'warning' : 'info') as 'critical' | 'warning' | 'info';

export function MoreView({ page }: { page: MorePage }) {
  switch (page.slug) {
    case 'overview-fb': return <OverviewAlt page={page} />;
    case 'branches-fb': return <BranchesAlt page={page} />;
    case 'conductor-building': return <ConductorBuilding page={page} />;
    case 'conductor-energy': return <ConductorEnergy page={page} />;
    case 'conductor-spaces': return <ConductorSpaces page={page} />;
    case 'conductor-systems': return <ConductorSystems page={page} />;
    case 'conductor-alarms': return <ConductorAlarms page={page} />;
    case 'conductor-reports': return <ConductorReports page={page} />;
    case 'site-entities': return <SiteEntities page={page} />;
    case 'appliances': return <Appliances page={page} />;
    case 'machine-data': return <MachineData page={page} />;
    case 'live-data': return <LiveDataView page={page} />;
    case 'ac-coverage': return <AcCoverage page={page} />;
    case 'device-history': return <DeviceHistory page={page} />;
    case 'history': return <HistoryView page={page} />;
    case 'automations': return <Automations page={page} />;
    default: return null;
  }
}

/* ---------- Business views ---------- */

function useClubRows() {
  const data = useDemo();
  const { clubs } = useScope();
  return { data, clubs, rows: clubs.map((c) => ({ club: c, live: data.live.clubs[c.id] })) };
}
type ClubRow = ReturnType<typeof useClubRows>['rows'][number];

function NetworkKpis() {
  const i = useI18n();
  const { t, fmtNumber, fmtPercent, fmtEnergy } = i;
  const data = useDemo();
  const { clubs } = useScope();
  const tot = totals(data, clubs);
  return (
    <Kpis>
      <KpiTile live label={t('settings.kpi.peopleIn')} value={fmtNumber(tot.peopleIn)} info={t('settings.kpi.peopleInInfo')} hint={t('settings.kpi.ofCapacity', { n: fmtNumber(tot.capacity) })} />
      <KpiTile live label={t('settings.kpi.machineUse')} value={fmtPercent(tot.machineUsagePct)} info={t('settings.kpi.machineUseInfo')} hint={t('settings.kpi.ofMachines', { n: fmtNumber(tot.machines) })} />
      <KpiTile label={t('settings.kpi.energy')} value={fmtNumber(Math.round(tot.energyTodayKwh))} unit={t('common.kwh')} info={t('settings.kpi.energyInfo')} hint={t('settings.kpi.vsBaseline', { v: fmtEnergy(tot.baselineTodayKwh) })} />
      <KpiTile label={t('settings.kpi.alerts')} value={fmtNumber(tot.openAlerts)} info={t('settings.kpi.alertsInfo')} hint={t('settings.kpi.critical', { n: fmtNumber(tot.criticalAlerts) })} />
    </Kpis>
  );
}

function OverviewAlt({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber, fmtPercent, fmtEnergy } = useI18n();
  const { rows } = useClubRows();
  const cols: Column<ClubRow>[] = [
    { key: 'club', header: t('settings.col.club'), value: (r) => pick(r.club.nameEn, r.club.nameAr), render: (r) => pick(r.club.nameEn, r.club.nameAr) },
    { key: 'people', header: t('settings.col.peopleIn'), align: 'end', value: (r) => r.live?.peopleIn ?? 0, render: (r) => <span className="num">{fmtNumber(r.live?.peopleIn ?? 0)}</span> },
    { key: 'occ', header: t('settings.col.occupancy'), align: 'end', hideOnMobile: true, value: (r) => r.live?.occupancyPct ?? 0, render: (r) => <span className="num">{fmtPercent(r.live?.occupancyPct ?? 0)}</span> },
    { key: 'mu', header: t('settings.col.machineUse'), align: 'end', hideOnMobile: true, value: (r) => r.live?.machineUsagePct ?? 0, render: (r) => <span className="num">{fmtPercent(r.live?.machineUsagePct ?? 0)}</span> },
    { key: 'energy', header: t('settings.col.energy'), align: 'end', hideOnMobile: true, value: (r) => r.live?.energyTodayKwh ?? 0, render: (r) => <span className="num">{fmtEnergy(r.live?.energyTodayKwh ?? 0)}</span> },
    { key: 'status', header: t('settings.col.status'), value: (r) => r.live?.status ?? 'ok', render: (r) => <StatusBadge status={r.live?.status ?? 'ok'} /> },
  ];
  return (
    <>
      <Purpose page={page} />
      <NetworkKpis />
      <Card title={t('settings.lists.clubs')} pad="none">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.club.id} initialSort={{ key: 'people', dir: 'desc' }} />
      </Card>
    </>
  );
}

function BranchesAlt({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber } = useI18n();
  const { rows, data } = useClubRows();
  const lives = rows.map((r) => r.live).filter(Boolean);
  const district = (id: string) => data.districts.find((d) => d.id === id);
  const cols: Column<ClubRow>[] = [
    { key: 'club', header: t('settings.col.club'), value: (r) => pick(r.club.nameEn, r.club.nameAr), render: (r) => pick(r.club.nameEn, r.club.nameAr) },
    { key: 'city', header: t('settings.col.city'), hideOnMobile: true, value: (r) => { const d = district(r.club.district); return d ? pick(d.cityEn, d.cityAr) : ''; } },
    { key: 'gender', header: t('settings.col.gender'), hideOnMobile: true, value: (r) => t(`gender.${r.club.gender}`) },
    { key: 'hours', header: t('settings.col.hours'), hideOnMobile: true, sortable: false, render: (r) => <span className="mp-text num">{pick(r.club.hours.labelEn, r.club.hours.labelAr)}</span> },
    { key: 'open', header: t('settings.col.status'), value: (r) => (r.live?.isOpen ? 1 : 0), render: (r) => <StatusBadge status={r.live?.isOpen ? 'online' : 'stopped'} label={r.live?.isOpen ? t('settings.val.openNow') : t('settings.val.closedNow')} /> },
  ];
  return (
    <>
      <Purpose page={page} />
      <Kpis three>
        <KpiTile label={t('settings.kpi.clubs')} value={fmtNumber(rows.length)} info={t('settings.kpi.clubsInfo')} />
        <KpiTile live label={t('settings.kpi.openNow')} value={fmtNumber(lives.filter((l) => l!.isOpen).length)} info={t('settings.kpi.openNowInfo')} />
        <KpiTile label={t('settings.kpi.attention')} value={fmtNumber(lives.filter((l) => l!.status !== 'ok').length)} info={t('settings.kpi.attentionInfo')} />
      </Kpis>
      <Card title={t('settings.lists.clubs')} pad="none">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.club.id} />
      </Card>
    </>
  );
}

function ConductorBuilding({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber, fmtPercent, fmtEnergy, fmtAgo } = useI18n();
  const { data, club } = useBuilding();
  const l = data.live.clubs[club.id];
  const alerts = alertsIn(data, [club]);
  const cols: Column<Alert>[] = [
    { key: 'level', header: t('settings.col.level'), sortable: false, render: (a) => <StatusBadge status={levelStatus(a.level)} /> },
    { key: 'title', header: t('settings.col.alert'), sortable: false, render: (a) => <span className="mp-text">{pick(a.titleEn, a.titleAr)}</span> },
    { key: 'area', header: t('settings.col.area'), hideOnMobile: true, sortable: false, render: (a) => pick(a.areaEn, a.areaAr) },
    { key: 'since', header: t('settings.col.since'), align: 'end', sortable: false, render: (a) => <span className="num">{fmtAgo((data.live.nowMs - a.sinceMs) / 1000)}</span> },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis>
        <KpiTile live label={t('settings.kpi.peopleIn')} value={fmtNumber(l?.peopleIn ?? 0)} info={t('settings.kpi.peopleInInfo')} hint={t('settings.kpi.ofCapacity', { n: fmtNumber(club.capacity) })} />
        <KpiTile label={t('settings.kpi.energy')} value={fmtNumber(Math.round(l?.energyTodayKwh ?? 0))} unit={t('common.kwh')} info={t('settings.kpi.energyInfo')} hint={t('settings.kpi.vsBaseline', { v: fmtEnergy(l?.baselineTodayKwh ?? 0) })} />
        <KpiTile live label={t('settings.kpi.comfort')} value={fmtPercent(l?.comfortPct ?? 0)} info={t('settings.kpi.comfortInfo')} />
        <KpiTile label={t('settings.kpi.alerts')} value={fmtNumber(alerts.length)} info={t('settings.kpi.alertsInfo')} hint={t('settings.kpi.critical', { n: fmtNumber(alerts.filter((a) => a.level === 'critical').length) })} />
      </Kpis>
      <Card title={t('settings.lists.alerts')} pad="none">
        <DataTable rows={alerts} columns={cols} rowKey={(a) => a.id} empty={t('settings.lists.noAlerts')} />
      </Card>
    </>
  );
}

function ConductorEnergy({ page }: { page: MorePage }) {
  const { t, fmtEnergy, fmtCurrency, fmtNumber } = useI18n();
  const { data, club } = useBuilding();
  const l = data.live.clubs[club.id];
  const hours = energyToday(data, [club]);
  const sav = savingsSummary(data, [club]);
  const saved = Math.max(0, (l?.baselineTodayKwh ?? 0) - (l?.energyTodayKwh ?? 0));
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis>
        <KpiTile label={t('settings.kpi.energy')} value={fmtNumber(Math.round(l?.energyTodayKwh ?? 0))} unit={t('common.kwh')} info={t('settings.kpi.energyInfo')} hint={t('settings.kpi.vsBaseline', { v: fmtEnergy(l?.baselineTodayKwh ?? 0) })} />
        <KpiTile live label={t('settings.kpi.powerNow')} value={fmtNumber(l?.powerKw ?? 0)} unit={t('settings.val.kw')} info={t('settings.kpi.powerNowInfo')} />
        <KpiTile label={t('settings.kpi.savedToday')} value={fmtCurrency(saved * TARIFF_SAR_PER_KWH)} info={t('settings.kpi.savedTodayInfo', { t: fmtNumber(TARIFF_SAR_PER_KWH, 2) })} hint={fmtEnergy(saved)} />
        <KpiTile label={t('settings.kpi.savedMonth')} value={fmtCurrency(sav.month.savedSar)} info={t('settings.kpi.savedMonthInfo')} hint={fmtEnergy(sav.month.savedKwh)} />
      </Kpis>
      <Card title={t('settings.chart.energyToday')} info={t('settings.chart.energyTodayInfo')}>
        <AreaChart data={hours.filter((h) => h.hour <= data.live.hour).map((h) => ({ hour: hhmm(h.hour * 60), used: h.kwh, avoided: h.avoidedKwh }))} xKey="hour" stacked height={260}
          series={[{ key: 'used', label: t('settings.chart.used') }, { key: 'avoided', label: t('settings.chart.avoided') }]}
          yFormat={(v) => fmtNumber(v)} xInterval={3} ariaLabel={t('settings.chart.energyToday')} />
      </Card>
    </>
  );
}

function ConductorSpaces({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber, fmtPercent } = useI18n();
  const { data, club } = useBuilding();
  const l = data.live.clubs[club.id];
  const ac = acOf(data, club.id);
  const pres = presenceOf(data, club.id);
  const rows = pres.map(({ area, people }) => {
    const units = ac.filter((u) => u.areaId === area.id && u.live);
    const avg = (f: (u: typeof units[number]) => number) => (units.length ? units.reduce((a, u) => a + f(u), 0) / units.length : NaN);
    return { area, people, temp: avg((u) => u.live.reading), setpoint: avg((u) => u.live.setpoint), on: units.filter((u) => u.live.on).length, units: units.length };
  });
  type R = typeof rows[number];
  const cols: Column<R>[] = [
    { key: 'area', header: t('settings.col.area'), value: (r) => pick(r.area.nameEn, r.area.nameAr) },
    { key: 'floor', header: t('settings.col.floor'), hideOnMobile: true, value: (r) => pick(r.area.floorEn, r.area.floorAr) },
    { key: 'people', header: t('settings.col.people'), align: 'end', value: (r) => r.people, render: (r) => <span className="num">{fmtNumber(r.people)}</span> },
    { key: 'temp', header: t('settings.col.temp'), align: 'end', value: (r) => r.temp, render: (r) => <span className="num">{fmtNumber(r.temp, 1)} °</span> },
    { key: 'sp', header: t('settings.col.setpoint'), align: 'end', hideOnMobile: true, value: (r) => r.setpoint, render: (r) => <span className="num">{fmtNumber(r.setpoint, 1)} °</span> },
    { key: 'on', header: t('settings.col.acOn'), align: 'end', hideOnMobile: true, value: (r) => r.on, render: (r) => <span className="num">{fmtNumber(r.on)} / {fmtNumber(r.units)}</span> },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile live label={t('settings.kpi.peopleIn')} value={fmtNumber(l?.peopleIn ?? 0)} info={t('settings.kpi.peopleInInfo')} hint={t('settings.kpi.ofCapacity', { n: fmtNumber(club.capacity) })} />
        <KpiTile live label={t('settings.kpi.comfort')} value={fmtPercent(l?.comfortPct ?? 0)} info={t('settings.kpi.comfortInfo')} />
        <KpiTile live label={t('settings.kpi.acOn')} value={`${fmtNumber(ac.filter((u) => u.live?.on).length)} / ${fmtNumber(ac.length)}`} info={t('settings.kpi.acOnInfo')} />
      </Kpis>
      <Card title={t('settings.lists.areas')} pad="none">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.area.id} initialSort={{ key: 'people', dir: 'desc' }} />
      </Card>
    </>
  );
}

function AgentsTable({ clubId, showWatching = true }: { clubId: string; showWatching?: boolean }) {
  const { t, pick, fmtNumber } = useI18n();
  const data = useDemo();
  const agents = agentsOf(data, clubId);
  type R = typeof agents[number];
  const cols: Column<R>[] = [
    { key: 'agent', header: t('settings.col.agent'), value: (a) => pick(a.nameEn, a.nameAr) },
    { key: 'domain', header: t('settings.col.domain'), hideOnMobile: true, value: (a) => pick(a.domainEn, a.domainAr) },
    { key: 'status', header: t('settings.col.status'), value: (a) => (a.state?.running ? 1 : 0), render: (a) => (!a.state?.connected
      ? <StatusBadge status="stopped" label={t('settings.val.notConnected')} />
      : <StatusBadge status={a.state.running ? 'running' : 'stopped'} label={a.state.running ? t('settings.val.running') : t('settings.val.stopped')} />) },
    { key: 'mode', header: t('settings.col.mode'), value: (a) => a.state?.mode ?? '', render: (a) => (a.state?.mode === 'control' ? t('settings.val.readControl') : t('settings.val.readOnly')) },
    ...(showWatching ? [{ key: 'watching', header: t('settings.col.watching'), align: 'end' as const, hideOnMobile: true, value: (a: R) => a.state?.watching ?? 0, render: (a: R) => <span className="num">{fmtNumber(a.state?.watching ?? 0)}</span> }] : []),
  ];
  return <DataTable rows={agents} columns={cols} rowKey={(a) => a.id} />;
}

function ConductorSystems({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber, fmtAgo } = useI18n();
  const { data, club } = useBuilding();
  const ints = integrationsOf(data, club.id);
  const agents = agentsOf(data, club.id);
  type R = typeof ints[number];
  const cols: Column<R>[] = [
    { key: 'name', header: t('settings.col.connector'), value: (r) => pick(r.nameEn, r.nameAr), render: (r) => <span className="mp-text">{pick(r.nameEn, r.nameAr)}</span> },
    { key: 'gateway', header: t('settings.col.gateway'), hideOnMobile: true, value: (r) => r.gateway, render: (r) => <span className="num ltr" dir="ltr">{r.gateway}</span> },
    { key: 'covers', header: t('settings.col.covers'), align: 'end', value: (r) => r.covers, render: (r) => <span className="num">{r.kind === 'bacnet' ? t('settings.val.units', { n: fmtNumber(r.covers), m: fmtNumber(r.coversOf) }) : t('settings.val.items', { n: fmtNumber(r.covers) })}</span> },
    { key: 'last', header: t('settings.col.lastRead'), align: 'end', hideOnMobile: true, value: (r) => r.lastReadSec, render: (r) => <span className="num">{fmtAgo(r.lastReadSec)}</span> },
    { key: 'status', header: t('settings.col.status'), value: (r) => (r.running ? 1 : 0), render: (r) => <StatusBadge status={r.running ? 'running' : 'stopped'} /> },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile live label={t('settings.kpi.connectors')} value={`${fmtNumber(ints.filter((i) => i.running).length)} / ${fmtNumber(ints.length)}`} info={t('settings.kpi.connectorsInfo')} />
        <KpiTile label={t('settings.kpi.agentsConnected')} value={`${fmtNumber(agents.filter((a) => a.state?.connected).length)} / ${fmtNumber(agents.length)}`} info={t('settings.kpi.agentsConnectedInfo')} />
        <KpiTile label={t('settings.kpi.controlMode')} value={fmtNumber(agents.filter((a) => a.state?.connected && a.state.mode === 'control').length)} info={t('settings.kpi.controlModeInfo')} />
      </Kpis>
      <Card title={t('settings.lists.connectors')} pad="none">
        <DataTable rows={ints} columns={cols} rowKey={(r) => r.id} />
      </Card>
      <Card title={t('settings.lists.agents')} pad="none">
        <AgentsTable clubId={club.id} />
      </Card>
    </>
  );
}

function ConductorAlarms({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber, fmtAgo } = useI18n();
  const { data, club } = useBuilding();
  const alerts = alertsIn(data, [club]);
  const cols: Column<Alert>[] = [
    { key: 'level', header: t('settings.col.level'), value: (a) => (a.level === 'critical' ? 0 : a.level === 'warning' ? 1 : 2), render: (a) => <StatusBadge status={levelStatus(a.level)} /> },
    { key: 'title', header: t('settings.col.alert'), value: (a) => pick(a.titleEn, a.titleAr), render: (a) => <span className="mp-text">{pick(a.titleEn, a.titleAr)}</span> },
    { key: 'area', header: t('settings.col.area'), hideOnMobile: true, value: (a) => pick(a.areaEn, a.areaAr) },
    { key: 'status', header: t('settings.col.status'), hideOnMobile: true, value: (a) => a.status, render: (a) => (a.status === 'acknowledged' ? t('settings.val.acknowledged') : t('settings.val.open')) },
    { key: 'since', header: t('settings.col.since'), align: 'end', value: (a) => a.sinceMs, render: (a) => <span className="num">{fmtAgo((data.live.nowMs - a.sinceMs) / 1000)}</span> },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile label={t('settings.kpi.alerts')} value={fmtNumber(alerts.filter((a) => a.level === 'critical').length)} unit={t('status.critical')} info={t('settings.kpi.alertsInfo')} />
        <KpiTile label={t('settings.kpi.warning')} value={fmtNumber(alerts.filter((a) => a.level === 'warning').length)} info={t('settings.kpi.warningInfo')} />
        <KpiTile label={t('settings.kpi.acknowledged')} value={fmtNumber(alerts.filter((a) => a.status === 'acknowledged').length)} info={t('settings.kpi.acknowledgedInfo')} />
      </Kpis>
      <Card title={t('settings.lists.alerts')} pad="none">
        <DataTable rows={alerts} columns={cols} rowKey={(a) => a.id} empty={t('settings.lists.noAlerts')} />
      </Card>
    </>
  );
}

function ConductorReports({ page }: { page: MorePage }) {
  const i = useI18n();
  const { t, fmtNumber, fmtDuration } = i;
  const { data, club } = useBuilding();
  const rows = machinesByType(data, club.id);
  type R = typeof rows[number];
  const cols: Column<R>[] = [
    { key: 'type', header: t('settings.col.type'), value: (r) => typeName(data, i, r.type) },
    { key: 'machines', header: t('settings.col.machines'), align: 'end', value: (r) => r.machines, render: (r) => <span className="num">{fmtNumber(r.machines)}</span> },
    { key: 'inUse', header: t('settings.col.inUse'), align: 'end', value: (r) => r.inUse, render: (r) => <span className="num">{fmtNumber(r.inUse)}</span> },
    { key: 'sessions', header: t('settings.col.sessions'), align: 'end', value: (r) => r.sessionsToday, render: (r) => <span className="num">{fmtNumber(r.sessionsToday)}</span> },
    { key: 'used', header: t('settings.col.usedTime'), align: 'end', hideOnMobile: true, value: (r) => r.usedMinToday, render: (r) => <span className="num">{fmtDuration(r.usedMinToday * 60)}</span> },
  ];
  const sum = (f: (r: R) => number) => rows.reduce((a, r) => a + f(r), 0);
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile live label={t('settings.kpi.machineUse')} value={`${fmtNumber(sum((r) => r.inUse))} / ${fmtNumber(sum((r) => r.machines))}`} info={t('settings.kpi.machineUseInfo')} />
        <KpiTile label={t('settings.kpi.sessions')} value={fmtNumber(sum((r) => r.sessionsToday))} info={t('settings.kpi.sessionsInfo')} />
        <KpiTile label={t('settings.kpi.usedTime')} value={fmtDuration(sum((r) => r.usedMinToday) * 60)} info={t('settings.kpi.usedTimeInfo')} />
      </Kpis>
      <Card title={t('settings.lists.types')} pad="none">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.type} csvName="machine-types-today" initialSort={{ key: 'sessions', dir: 'desc' }} />
      </Card>
    </>
  );
}

/* ---------- Building data ---------- */

interface EntityRow { id: string; nameEn: string; nameAr: string; kind: 'ac' | 'light'; source: string; mapped: boolean; ratingW: number; areaEn: string; areaAr: string; readingEn: string; readingAr: string; on: boolean }

/** Entities read from the integrations (AC units on BACnet, light circuits on Home Assistant). */
function useEntities(clubId: string) {
  const data = useDemo();
  const i = useI18n();
  const ints = integrationsOf(data, clubId);
  const bac = ints.filter((x) => x.kind === 'bacnet');
  const ha = ints.find((x) => x.kind === 'home-assistant');
  const ac = acOf(data, clubId);
  const lights = lightsOf(data, clubId);
  const bacRead = bac.reduce((a, b) => a + b.covers, 0);
  const rows: EntityRow[] = [];
  ac.forEach((u, idx) => {
    const ctl = bac.length ? bac[idx % bac.length] : undefined;
    const r = u.live;
    rows.push({
      id: u.id, nameEn: u.nameEn, nameAr: u.nameAr, kind: 'ac', source: ctl ? i.pick(ctl.nameEn, ctl.nameAr) : '',
      mapped: idx < Math.min(ac.length, bacRead), ratingW: u.ratedKw * 1000, areaEn: u.area?.nameEn ?? '', areaAr: u.area?.nameAr ?? '', on: !!r?.on,
      readingEn: r ? (r.on ? `${r.reading} °C, set ${r.setpoint} °C` : `Off, ${r.reading} °C`) : '',
      readingAr: r ? (r.on ? `${r.reading} °م، الضبط ${r.setpoint} °م` : `متوقفة، ${r.reading} °م`) : '',
    });
  });
  lights.forEach((l) => {
    const r = l.live;
    rows.push({
      id: l.id, nameEn: l.nameEn, nameAr: l.nameAr, kind: 'light', source: ha ? i.pick(ha.nameEn, ha.nameAr) : '',
      mapped: !!ha, ratingW: l.watts, areaEn: l.area?.nameEn ?? '', areaAr: l.area?.nameAr ?? '', on: !!r?.on,
      readingEn: r ? (r.on ? `On, ${r.level}% level` : 'Off') : '', readingAr: r ? (r.on ? `تعمل، مستوى ${r.level}%` : 'متوقفة') : '',
    });
  });
  return { rows, ints, bac, ac, lights };
}

function SiteEntities({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber } = useI18n();
  const { club } = useBuilding();
  const { rows } = useEntities(club.id);
  const mapped = rows.filter((r) => r.mapped).length;
  const cols: Column<EntityRow>[] = [
    { key: 'name', header: t('settings.col.entity'), value: (r) => pick(r.nameEn, r.nameAr), render: (r) => <span className="mp-text">{pick(r.nameEn, r.nameAr)}</span> },
    { key: 'kind', header: t('settings.col.kind'), hideOnMobile: true, value: (r) => r.kind, render: (r) => (r.kind === 'ac' ? t('settings.val.ac') : t('settings.val.light')) },
    { key: 'source', header: t('settings.col.source'), hideOnMobile: true, value: (r) => r.source, render: (r) => <span className="mp-text">{r.source}</span> },
    { key: 'maps', header: t('settings.col.mapsTo'), value: (r) => (r.mapped ? 1 : 0), render: (r) => (r.mapped ? pick(r.areaEn, r.areaAr) : <Badge tone="warning">{t('settings.val.notMapped')}</Badge>) },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile label={t('settings.kpi.entitiesRead')} value={fmtNumber(rows.length)} info={t('settings.kpi.entitiesReadInfo')} />
        <KpiTile label={t('settings.kpi.mapped')} value={fmtNumber(mapped)} info={t('settings.kpi.mappedInfo')} />
        <KpiTile label={t('settings.kpi.unmapped')} value={fmtNumber(rows.length - mapped)} info={t('settings.kpi.unmappedInfo')} />
      </Kpis>
      <Card title={t('settings.lists.entities')} pad="none">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} />
      </Card>
    </>
  );
}

function Appliances({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber } = useI18n();
  const { club } = useBuilding();
  const { rows, ac, lights } = useEntities(club.id);
  const totalKw = rows.reduce((a, r) => a + r.ratingW, 0) / 1000;
  const cols: Column<EntityRow>[] = [
    { key: 'name', header: t('settings.col.appliance'), value: (r) => pick(r.nameEn, r.nameAr), render: (r) => <span className="mp-text">{pick(r.nameEn, r.nameAr)}</span> },
    { key: 'kind', header: t('settings.col.kind'), value: (r) => r.kind, render: (r) => (r.kind === 'ac' ? t('settings.val.ac') : t('settings.val.light')) },
    { key: 'area', header: t('settings.col.area'), hideOnMobile: true, value: (r) => pick(r.areaEn, r.areaAr) },
    { key: 'rating', header: t('settings.col.rating'), align: 'end', value: (r) => r.ratingW, render: (r) => <span className="num">{fmtNumber(r.ratingW / 1000, 1)} {t('settings.val.kw')}</span> },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile label={t('settings.kpi.acUnits')} value={fmtNumber(ac.length)} info={t('settings.kpi.acUnitsInfo')} />
        <KpiTile label={t('settings.kpi.lightCircuits')} value={fmtNumber(lights.length)} info={t('settings.kpi.lightCircuitsInfo')} />
        <KpiTile label={t('settings.kpi.ratedLoad')} value={fmtNumber(totalKw, 1)} unit={t('settings.val.kw')} info={t('settings.kpi.ratedLoadInfo')} />
      </Kpis>
      <Card title={t('settings.lists.appliances')} pad="none">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} csvName="appliances" />
      </Card>
    </>
  );
}

function MachineData({ page }: { page: MorePage }) {
  const i = useI18n();
  const { t, pick, fmtNumber } = i;
  const { data, club } = useBuilding();
  const machines = machinesOf(data, club.id);
  const camById = new Map(data.cameras.map((c) => [c.id, c]));
  const srcOf = (cameraId: string): 'live' | 'simulated' | 'noSource' => {
    const c = camById.get(cameraId);
    if (!c || !c.online || c.isTest) return 'noSource';
    return club.live ? 'live' : 'simulated';
  };
  const rows = machines.map((m) => ({ m, src: srcOf(m.cameraId), cam: camById.get(m.cameraId) }));
  type R = typeof rows[number];
  const count = (s: R['src']) => rows.filter((r) => r.src === s).length;
  const tone = { live: 'success', simulated: 'info', noSource: 'neutral' } as const;
  const cols: Column<R>[] = [
    { key: 'machine', header: t('settings.col.machine'), value: (r) => pick(r.m.nameEn, r.m.nameAr) },
    { key: 'type', header: t('settings.col.type'), hideOnMobile: true, value: (r) => typeName(data, i, r.m.type) },
    { key: 'camera', header: t('settings.col.camera'), hideOnMobile: true, value: (r) => (r.cam ? pick(r.cam.nameEn, r.cam.nameAr) : t('settings.val.unknownCamera')) },
    { key: 'src', header: t('settings.col.source'), value: (r) => r.src, render: (r) => <Badge tone={tone[r.src]}>{t(`settings.val.${r.src}`)}</Badge> },
    { key: 'sessions', header: t('settings.col.sessions'), align: 'end', value: (r) => r.m.live.sessionsToday, render: (r) => <span className="num">{fmtNumber(r.m.live.sessionsToday)}</span> },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile live label={t('settings.kpi.live')} value={fmtNumber(count('live'))} info={t('settings.kpi.liveInfo')} />
        <KpiTile label={t('settings.kpi.simulated')} value={fmtNumber(count('simulated'))} info={t('settings.kpi.simulatedInfo')} />
        <KpiTile label={t('settings.kpi.noSource')} value={fmtNumber(count('noSource'))} info={t('settings.kpi.noSourceInfo')} />
      </Kpis>
      <Card title={t('settings.lists.machines')} pad="none">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.m.id} />
      </Card>
    </>
  );
}

function LiveDataView({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber } = useI18n();
  const { club } = useBuilding();
  const { rows, ac, lights } = useEntities(club.id);
  const cols: Column<EntityRow>[] = [
    { key: 'name', header: t('settings.col.appliance'), value: (r) => pick(r.nameEn, r.nameAr), render: (r) => <span className="mp-text">{pick(r.nameEn, r.nameAr)}</span> },
    { key: 'reading', header: t('settings.col.reading'), value: (r) => pick(r.readingEn, r.readingAr), render: (r) => <span className="num">{pick(r.readingEn, r.readingAr)}</span> },
    { key: 'source', header: t('settings.col.source'), hideOnMobile: true, value: (r) => r.source, render: (r) => <span className="mp-text">{r.source}</span> },
    { key: 'last', header: t('settings.col.lastRead'), align: 'end', hideOnMobile: true, sortable: false, render: () => <span>{t('settings.val.justNow')}</span> },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile live label={t('settings.kpi.reporting')} value={`${fmtNumber(rows.filter((r) => r.readingEn).length)} / ${fmtNumber(rows.length)}`} info={t('settings.kpi.reportingInfo')} />
        <KpiTile live label={t('settings.kpi.acOn')} value={`${fmtNumber(ac.filter((u) => u.live?.on).length)} / ${fmtNumber(ac.length)}`} info={t('settings.kpi.acOnInfo')} />
        <KpiTile live label={t('settings.kpi.lightsOn')} value={`${fmtNumber(lights.filter((l) => l.live?.on).length)} / ${fmtNumber(lights.length)}`} info={t('settings.kpi.lightsOnInfo')} />
      </Kpis>
      <Card title={t('settings.lists.readings')} pad="none">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} />
      </Card>
    </>
  );
}

function AcCoverage({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber, fmtPercent } = useI18n();
  const { data, club } = useBuilding();
  const { bac, ac } = useEntities(club.id);
  const read = bac.reduce((a, b) => a + b.covers, 0);
  const addressable = bac.reduce((a, b) => a + b.coversOf, 0);
  const areas = areasOf(data, club.id).map((area) => {
    const units = ac.filter((u) => u.areaId === area.id);
    return { area, units: units.length, kw: units.reduce((a, u) => a + u.ratedKw, 0) };
  });
  type R = typeof areas[number];
  const cols: Column<R>[] = [
    { key: 'area', header: t('settings.col.area'), value: (r) => pick(r.area.nameEn, r.area.nameAr) },
    { key: 'size', header: t('settings.col.size'), align: 'end', hideOnMobile: true, value: (r) => r.area.m2, render: (r) => <span className="num">{t('settings.val.m2', { n: fmtNumber(r.area.m2) })}</span> },
    { key: 'units', header: t('settings.col.units'), align: 'end', value: (r) => r.units, render: (r) => <span className="num">{fmtNumber(r.units)}</span> },
    { key: 'kw', header: t('settings.col.rated'), align: 'end', value: (r) => r.kw, render: (r) => <span className="num">{fmtNumber(r.kw, 1)} {t('settings.val.kw')}</span> },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile label={t('settings.kpi.coverage')} value={fmtPercent(addressable ? (read / addressable) * 100 : 0, 1)} info={t('settings.kpi.coverageInfo')} />
        <KpiTile live label={t('settings.kpi.unitsRead')} value={fmtNumber(read)} info={t('settings.kpi.unitsReadInfo')} hint={t('settings.val.units', { n: fmtNumber(read), m: fmtNumber(addressable) })} />
        <KpiTile label={t('settings.kpi.areasServed')} value={`${fmtNumber(areas.filter((a) => a.units > 0).length)} / ${fmtNumber(areas.length)}`} info={t('settings.kpi.areasServedInfo')} />
      </Kpis>
      <Card title={t('settings.lists.areas')} pad="none">
        <DataTable rows={areas} columns={cols} rowKey={(r) => r.area.id} />
      </Card>
    </>
  );
}

/* ---------- History and automation ---------- */

function DeviceHistory({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber, fmtTime, fmtDuration } = useI18n();
  const { data, club } = useBuilding();
  const today = data.live.date;
  const nowMin = data.live.hour * 60 + data.live.minute;
  const rows = data.machines.filter((m) => m.clubId === club.id && m.enabled).flatMap((m) =>
    sessionsOn(m, club, today, nowMin).map((s, k) => ({ id: `${m.id}:${k}`, m, s, ongoing: s.end >= nowMin })));
  rows.sort((a, b) => b.s.start - a.s.start);
  type R = typeof rows[number];
  const used = rows.reduce((a, r) => a + (r.s.end - r.s.start), 0);
  const cols: Column<R>[] = [
    { key: 'machine', header: t('settings.col.machine'), value: (r) => pick(r.m.nameEn, r.m.nameAr) },
    { key: 'start', header: t('settings.col.start'), value: (r) => r.s.start, render: (r) => <span className="num">{fmtTime(msAt(today, r.s.start))}</span> },
    { key: 'end', header: t('settings.col.end'), hideOnMobile: true, value: (r) => r.s.end, render: (r) => <span className="num">{r.ongoing ? t('settings.val.inProgress') : fmtTime(msAt(today, r.s.end))}</span> },
    { key: 'dur', header: t('settings.col.duration'), align: 'end', value: (r) => r.s.end - r.s.start, render: (r) => <span className="num">{fmtDuration((r.s.end - r.s.start) * 60)}</span> },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile label={t('settings.kpi.sessions')} value={fmtNumber(rows.length)} info={t('settings.kpi.sessionsInfo')} />
        <KpiTile label={t('settings.kpi.usedTime')} value={fmtDuration(used * 60)} info={t('settings.kpi.usedTimeInfo')} />
        <KpiTile live label={t('settings.kpi.machineUse')} value={fmtNumber(rows.filter((r) => r.ongoing).length)} info={t('settings.kpi.machineUseInfo')} />
      </Kpis>
      <Card title={t('settings.lists.sessions')} pad="none">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: 'start', dir: 'desc' }} empty={t('settings.lists.noSessions')} csvName="device-history-today" />
      </Card>
    </>
  );
}

function HistoryView({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber, fmtTime } = useI18n();
  const { data, club } = useBuilding();
  const rows = activityIn(data, [club], 200);
  const agentName = (id: string) => { const a = data.agents.find((x) => x.id === id); return a ? pick(a.nameEn, a.nameAr) : id; };
  type R = typeof rows[number];
  const cols: Column<R>[] = [
    { key: 'time', header: t('settings.col.time'), value: (r) => r.atMs, render: (r) => <span className="num">{fmtTime(r.atMs)}</span> },
    { key: 'agent', header: t('settings.col.agent'), hideOnMobile: true, value: (r) => agentName(r.agentId) },
    { key: 'action', header: t('settings.col.action'), sortable: false, render: (r) => <span className="mp-text">{pick(r.textEn, r.textAr)}</span> },
  ];
  const agents = new Set(rows.map((r) => r.agentId)).size;
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile label={t('settings.kpi.entries')} value={fmtNumber(rows.length)} info={t('settings.kpi.entriesInfo')} />
        <KpiTile label={t('settings.kpi.agentsConnected')} value={fmtNumber(agents)} info={t('settings.kpi.agentsConnectedInfo')} />
        <KpiTile label={t('settings.kpi.alerts')} value={fmtNumber(alertsIn(data, [club]).length)} info={t('settings.kpi.alertsInfo')} />
      </Kpis>
      <Card title={t('settings.lists.activity')} pad="none">
        <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} initialSort={{ key: 'time', dir: 'desc' }} empty={t('settings.lists.noActivity')} />
      </Card>
    </>
  );
}

function Automations({ page }: { page: MorePage }) {
  const { t, pick, fmtNumber } = useI18n();
  const { data, club } = useBuilding();
  const agents = agentsOf(data, club.id);
  type R = typeof agents[number];
  const cols: Column<R>[] = [
    { key: 'agent', header: t('settings.col.agent'), value: (a) => pick(a.nameEn, a.nameAr) },
    { key: 'rule', header: t('settings.col.rule'), sortable: false, render: (a) => <span className="mp-text">{pick(a.descEn, a.descAr)}</span> },
    { key: 'mode', header: t('settings.col.mode'), value: (a) => a.state?.mode ?? '', render: (a) => (!a.state?.connected ? t('settings.val.notConnected') : a.state.mode === 'control' ? t('settings.val.readControl') : t('settings.val.readOnly')) },
    { key: 'status', header: t('settings.col.status'), hideOnMobile: true, value: (a) => (a.state?.running ? 1 : 0), render: (a) => <StatusBadge status={a.state?.running ? 'running' : 'stopped'} label={a.state?.running ? t('settings.val.running') : t('settings.val.stopped')} /> },
  ];
  return (
    <>
      <Purpose page={page} club={club} />
      <Kpis three>
        <KpiTile live label={t('settings.kpi.running')} value={`${fmtNumber(agents.filter((a) => a.state?.running).length)} / ${fmtNumber(agents.length)}`} info={t('settings.kpi.runningInfo')} />
        <KpiTile label={t('settings.kpi.controlMode')} value={fmtNumber(agents.filter((a) => a.state?.connected && a.state.mode === 'control').length)} info={t('settings.kpi.controlModeInfo')} />
        <KpiTile label={t('settings.kpi.readOnly')} value={fmtNumber(agents.filter((a) => a.state?.connected && a.state.mode === 'read').length)} info={t('settings.kpi.readOnlyInfo')} />
      </Kpis>
      <Card title={t('settings.lists.rules')} pad="none">
        <DataTable rows={agents} columns={cols} rowKey={(a) => a.id} />
      </Card>
    </>
  );
}
