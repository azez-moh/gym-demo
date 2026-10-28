import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Activity, AlertOctagon, AlertTriangle, ArrowRight, BarChart3, Cctv, Dumbbell, Flame, Gauge, Grid3x3, Timer, Users } from 'lucide-react';
import { Badge, Card, EmptyState, InfoTip, KpiTile, PageHeader } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { useAccess } from '../../layout/access';
import { alertsIn, camerasOf, focusClub, machinesOf, openMinutes, useDemo, type MachineType } from '../../data';
import { crowdRatio } from '../../data/branchConfig';
import { liveOccupancy } from '../../data/floors';
import { CrowdHeatmapCard } from '../Heatmap/Compact';
import { useFit } from '../AiAgents/useFit';
import './visionOverview.css';

/*
  AI Vision overview (/vision-overview), first page of the AI Vision group. One view without scrolling from
  1200 px wide (like AI Agents): 4 KPI tiles, the compact crowd heatmap of both floors, machine use per family
  today, camera and detection health (no camera images, for every role) and the latest vision alerts, with links
  to the detailed pages. A gym without a floor plan or cameras shows what it has and empty states for the rest.
*/

interface VAlert { id: string; level: 'critical' | 'warning'; title: string; where: string; to?: string }

export default function VisionOverviewPage() {
  const i18n = useI18n();
  const { t, pick, fmtNumber, fmtAgo, lang } = i18n;
  const data = useDemo();
  const { scope } = useScope();
  const { cameras: seesCameras, can } = useAccess();
  const club = focusClub(data, scope);
  const gym = pick(club.nameEn, club.nameAr);
  const live = data.live.clubs[club.id];
  const [famRef, famFit] = useFit<HTMLUListElement>();
  const [alRef, alFit] = useFit<HTMLUListElement>();

  // ---------- machines ----------
  const machines = useMemo(() => machinesOf(data, club.id), [data, club.id]);
  const enabled = machines.filter((m) => m.enabled);
  const inUse = enabled.filter((m) => m.live.state === 'inUse').length;
  const sessions = enabled.reduce((a, m) => a + m.live.sessionsToday, 0);
  const openMin = openMinutes(club, data.live.date, data.live.hour * 60 + data.live.minute);
  const usedMin = enabled.reduce((a, m) => a + m.live.usedMinToday, 0);
  const usePct = enabled.length && openMin ? (usedMin / (enabled.length * openMin)) * 100 : 0;

  const families = useMemo(() => {
    const map = new Map<MachineType, { type: MachineType; n: number; used: number; inUse: number }>();
    for (const m of enabled) {
      const r = map.get(m.type) ?? { type: m.type, n: 0, used: 0, inUse: 0 };
      r.n++; r.used += m.live.usedMinToday; if (m.live.state === 'inUse') r.inUse++;
      map.set(m.type, r);
    }
    return [...map.values()].map((r) => ({ ...r, pct: openMin ? (r.used / (r.n * openMin)) * 100 : 0 })).sort((a, b) => b.pct - a.pct);
  }, [enabled, openMin]);
  const famMax = Math.max(1, ...families.map((f) => f.pct));
  const byUse = [...enabled].sort((a, b) => b.live.usedMinToday - a.live.usedMinToday);
  const most = byUse[0];
  const least = byUse[byUse.length - 1];

  // ---------- cameras and detection ----------
  const cams = camerasOf(data, club.id);
  const online = cams.filter((c) => c.online).length;
  const zones = data.zones.filter((z) => z.clubId === club.id);
  const watched = zones.filter((z) => z.watching).length;
  const lastMin = enabled.length ? Math.min(...enabled.map((m) => (m.live.state === 'inUse' ? 0 : m.live.sinceMin))) : null;
  const blur = data.settings.blurCameras;

  // ---------- vision alerts ----------
  const hot = crowdRatio(club.id);
  const alerts = useMemo<VAlert[]>(() => {
    const out: VAlert[] = [];
    for (const c of cams.filter((x) => !x.online)) {
      out.push({ id: `cam:${c.id}`, level: 'critical', title: t('visionOverview.alerts.offline', { area: pick(c.areaEn, c.areaAr) }),
        where: seesCameras ? t('visionOverview.alerts.offlineWhere') : '', to: seesCameras ? '/camera-list' : undefined });
    }
    for (const a of alertsIn(data, [club]).filter((x) => x.source === 'vision')) {
      out.push({ id: a.id, level: a.level === 'critical' ? 'critical' : 'warning', title: pick(a.titleEn, a.titleAr), where: pick(a.areaEn, a.areaAr), to: '/machines' });
    }
    for (const a of liveOccupancy(data, club.id).filter((x) => x.ratio > hot).sort((x, y) => y.ratio - x.ratio)) {
      out.push({ id: `crowd:${a.areaId}`, level: 'warning',
        title: t('visionOverview.alerts.crowd', { area: pick(a.area.nameEn, a.area.nameAr), pct: fmtNumber(Math.round(a.ratio * 100)) }),
        where: t('visionOverview.alerts.crowdWhere', { p: fmtNumber(Math.round(hot * 100)) }), to: '/heatmap' });
    }
    for (const m of machines.filter((x) => !x.enabled)) {
      out.push({ id: `out:${m.id}`, level: 'warning', title: t('visionOverview.alerts.out', { name: pick(m.nameEn, m.nameAr) }),
        where: t('visionOverview.alerts.outWhere'), to: '/machines' });
    }
    return out.sort((a, b) => (a.level === b.level ? 0 : a.level === 'critical' ? -1 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, club.id, hot, lang, seesCameras]);
  const shownAlerts = Number.isFinite(alFit) ? Math.max(alFit, 0) : alerts.length;
  const moreAlerts = alerts.length - Math.min(shownAlerts, alerts.length);

  const typeName = (ty: MachineType) => t(`machines.type.${ty}`);
  const links = [
    { to: '/live-floor', label: t('nav.liveFloor'), icon: Grid3x3 },
    { to: '/heatmap', label: t('nav.heatmap'), icon: Flame },
    { to: '/machines', label: t('visionOverview.links.machines'), icon: Dumbbell },
    { to: '/usage-report', label: t('visionOverview.links.usage'), icon: BarChart3 },
  ].filter((l) => can(l.to.slice(1)));

  return (
    <div className="page vo-wall">
      <PageHeader eyebrow={gym} title={<span className="vo-head__titlewrap">{t('visionOverview.title')}<InfoTip text={t('visionOverview.about')} /></span>} />

      <div className="grid-kpi vo-kpis">
        <KpiTile icon={Users} live label={t('visionOverview.kpi.people')} info={t('visionOverview.kpi.peopleInfo')}
          value={fmtNumber(live?.peopleIn ?? 0)} unit={t('visionOverview.kpi.peopleOf', { n: fmtNumber(club.capacity) })}
          hint={t('visionOverview.kpi.peopleHint', { pct: fmtNumber(club.capacity ? Math.round(((live?.peopleIn ?? 0) / club.capacity) * 100) : 0) })} />
        <KpiTile icon={Activity} live label={t('visionOverview.kpi.machines')} info={t('visionOverview.kpi.machinesInfo')}
          value={fmtNumber(inUse)} unit={t('visionOverview.kpi.machinesOf', { n: fmtNumber(machines.length) })}
          hint={machines.length - enabled.length ? t('visionOverview.kpi.machinesHint', { n: fmtNumber(machines.length - enabled.length) }) : t('visionOverview.kpi.machinesHintNone')} />
        <KpiTile icon={Timer} label={t('visionOverview.kpi.sessions')} info={t('visionOverview.kpi.sessionsInfo')}
          value={fmtNumber(sessions)}
          hint={t('visionOverview.kpi.sessionsHint', { n: fmtNumber(enabled.length ? sessions / enabled.length : 0, 1) })} />
        <KpiTile icon={Gauge} label={t('visionOverview.kpi.use')} info={t('visionOverview.kpi.useInfo')}
          value={fmtNumber(usePct, 1)} unit="%" hint={t('visionOverview.kpi.useHint', { n: fmtNumber(enabled.length) })} />
      </div>

      <div className="vo-main">
        <div className="vo-col vo-col--heat">
          <CrowdHeatmapCard club={club} className="vo-heat" />
        </div>

        <div className="vo-col">
          <Card className="vo-card vo-card--grow" title={t('visionOverview.families.title')} info={t('visionOverview.families.info')}>
            {!families.length ? <EmptyState compact icon={Dumbbell} title={t('visionOverview.families.none')} /> : (<>
              <ul ref={famRef} className="vo-fam vo-fitlist">
                {families.map((f, i) => (
                  <li key={f.type} className={i >= famFit ? 'is-cut' : ''}>
                    <span className="vo-fam__name">{typeName(f.type)} <span className="vo-faint num">· {fmtNumber(f.n)}</span></span>
                    <span className="vo-fam__track" aria-hidden><span style={{ inlineSize: `${Math.max(2, (f.pct / famMax) * 100)}%` }} /></span>
                    <span className="vo-fam__val num">{fmtNumber(f.pct, 1)}%</span>
                  </li>
                ))}
              </ul>
              {Number.isFinite(famFit) && famFit < families.length && <span className="vo-more">{t('visionOverview.alerts.more', { n: fmtNumber(families.length - famFit) })}</span>}
              {most && least && (
                <div className="vo-ml">
                  <div><span className="vo-faint">{t('visionOverview.families.most')}</span><span className="vo-ml__name">{pick(most.nameEn, most.nameAr)}</span>
                    <span className="vo-faint num">{t('visionOverview.families.minutes', { n: fmtNumber(most.live.usedMinToday) })}</span></div>
                  <div><span className="vo-faint">{t('visionOverview.families.least')}</span><span className="vo-ml__name">{pick(least.nameEn, least.nameAr)}</span>
                    <span className="vo-faint num">{t('visionOverview.families.minutes', { n: fmtNumber(least.live.usedMinToday) })}</span></div>
                </div>
              )}
            </>)}
          </Card>
        </div>

        <div className="vo-col">
          <Card className="vo-card" title={<span className="vo-ct"><Cctv aria-hidden />{t('visionOverview.health.title')}</span>} info={t('visionOverview.health.info')} live>
            {!cams.length ? <EmptyState compact icon={Cctv} title={t('visionOverview.health.none')} /> : (
              <dl className="vo-health">
                <div><dt>{t('visionOverview.health.online')}</dt>
                  <dd className={online < cams.length ? 'txt-danger' : ''}><span className="num">{t('visionOverview.health.onlineOf', { n: fmtNumber(online), of: fmtNumber(cams.length) })}</span></dd></div>
                <div><dt>{t('visionOverview.health.zones')}</dt><dd className="num">{t('visionOverview.health.onlineOf', { n: fmtNumber(watched), of: fmtNumber(zones.length) })}</dd></div>
                <div><dt>{t('visionOverview.health.last')}</dt><dd>{lastMin == null ? '–' : lastMin === 0 ? t('common.live') : fmtAgo(lastMin * 60)}</dd></div>
                <div><dt>{t('visionOverview.health.blur')}</dt><dd><Badge tone={blur ? 'success' : 'warning'}>{blur ? t('visionOverview.health.blurOn') : t('visionOverview.health.blurOff')}</Badge></dd></div>
              </dl>
            )}
          </Card>

          <Card className="vo-card vo-card--grow" title={t('visionOverview.alerts.title')} info={t('visionOverview.alerts.info')}
            actions={alerts.length ? <span className="vo-count num">{fmtNumber(alerts.length)}</span> : undefined}>
            {!alerts.length ? <p className="vo-faint">{t('visionOverview.alerts.none')}</p> : (<>
              <ul ref={alRef} className="vo-alerts vo-fitlist">
                {alerts.map((a, i) => {
                  const Icon = a.level === 'critical' ? AlertOctagon : AlertTriangle;
                  const body = (<>
                    <Icon aria-hidden className={`vo-alert__icon ${a.level === 'critical' ? 'is-crit' : 'is-warn'}`} />
                    <span className="vo-alert__text"><span className="vo-alert__title">{a.title}</span>{a.where && <span className="vo-faint">{a.where}</span>}</span>
                    {a.to && <ArrowRight aria-hidden className="vo-alert__go flip-rtl" />}
                  </>);
                  return (
                    <li key={a.id} className={i >= shownAlerts ? 'is-cut' : ''}>
                      {a.to ? <Link className="vo-alert" to={a.to}>{body}</Link> : <div className="vo-alert">{body}</div>}
                    </li>
                  );
                })}
              </ul>
              {moreAlerts > 0 && <span className="vo-more">{t('visionOverview.alerts.more', { n: fmtNumber(moreAlerts) })}</span>}
            </>)}
          </Card>

          {links.length > 0 && (
            <nav className="vo-links" aria-label={t('visionOverview.links.title')}>
              {links.map((l) => {
                const Icon = l.icon;
                return <Link key={l.to} className="vo-link" to={l.to}><Icon aria-hidden /><span>{l.label}</span><ArrowRight aria-hidden className="vo-link__go flip-rtl" /></Link>;
              })}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
