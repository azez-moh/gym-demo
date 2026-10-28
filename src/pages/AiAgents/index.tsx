import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, AlertTriangle, Eye, EyeOff, Unplug } from 'lucide-react';
import { Badge, BarChart, Card, ConfirmDialog, InfoTip, Select, Segmented, Toggle } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { useChartTokens } from '../../theme/theme';
import {
  acOf, activityIn, addDays, agentsOf, alertsIn, areasOf, energyHistory, energyHours, focusClub, lightsOf, msAt, presenceOf, savingsSummary, useDemo,
} from '../../data';
import type { Level } from '../../data/types';
import { BuildingViewer, LAYERS, buildZones } from '../BmsOverview/BuildingViewer';
import { floorsOf, riyadhClock } from '../BmsOverview/bms';
import { useFit } from './useFit';
import '../BmsOverview/bms.css';
import './aiAgents.css';

type Agent = ReturnType<typeof agentsOf>[number];

/** the reference build split of avoided energy by cause (percent, sums to 100). */
const CAUSES = [
  { key: 'hvac', pct: 62 },
  { key: 'lighting', pct: 21 },
  { key: 'equipment', pct: 11 },
  { key: 'other', pct: 6 },
];

const SEV: Record<Level, { tone: 'danger' | 'warning' | 'neutral'; icon: typeof Eye; key: string }> = {
  critical: { tone: 'danger', icon: AlertOctagon, key: 'alarm' },
  warning: { tone: 'warning', icon: AlertTriangle, key: 'warning' },
  info: { tone: 'neutral', icon: Eye, key: 'watch' },
};

export default function AiAgentsPage() {
  const { t, pick, fmtNumber, fmtDate } = useI18n();
  const data = useDemo();
  const ct = useChartTokens();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const building = pick(club.nameEn, club.nameAr);
  const agents = agentsOf(data, club.id);
  const [confirmOff, setConfirmOff] = useState<Agent | null>(null);
  const [agentFilter, setAgentFilter] = useState('all');
  const [period, setPeriod] = useState<'day' | 'month'>('day');
  const [logRef, logFit] = useFit<HTMLOListElement>();
  const [alertRef, alertFit] = useFit<HTMLUListElement>();

  // ---------- run summary ----------
  const running = agents.filter((a) => a.state?.connected && a.state.running);
  const mayAct = running.filter((a) => !a.readOnly && a.state.mode === 'control');
  const liveSources = running.reduce((s, a) => s + a.state.watching, 0);
  const noSource = agents.filter((a) => !a.state?.connected).length;
  const st = data.settings;
  const setbackText = t('aiAgents.setback', { c: fmtNumber(st.setbackC), s: fmtNumber(st.setbackAfterSec) });

  const setRunning = (a: Agent, on: boolean) => {
    if (on) data.patch('agentStates', `${club.id}:${a.id}`, { running: true });
    else setConfirmOff(a);
  };

  // ---------- activity (newest first; the list shows what fits) ----------
  const activity = activityIn(data, [club], 200).filter((e) => agentFilter === 'all' || e.agentId === agentFilter);
  const agentName = (id: string) => { const a = agents.find((x) => x.id === id); return a ? pick(a.nameEn, a.nameAr) : id; };
  const midnight = msAt(data.live.date, 0);
  const logShown = Math.min(logFit, activity.length);
  const logHidden = activity.slice(logShown);
  const logHiddenToday = logHidden.filter((e) => e.atMs >= midnight).length;
  const logMore = logHiddenToday > 0 ? t('aiAgents.logMoreToday', { n: fmtNumber(logHiddenToday) })
    : logHidden.length > 0 ? t('aiAgents.logMoreEarlier', { n: fmtNumber(logHidden.length) }) : '';

  // ---------- building ----------
  const areas = areasOf(data, club.id);
  const ac = acOf(data, club.id);
  const lights = lightsOf(data, club.id);
  const presence = presenceOf(data, club.id);
  const zones = useMemo(() => buildZones(areas, ac, lights, presence), [areas, ac, lights, presence]);
  const floors = floorsOf(areas);
  const layers = useMemo(() => new Set(LAYERS.filter((l) => l !== 'labels' && l !== 'presence')), []);

  // ---------- energy: last 24 hours rolling (hourly) and month to date (daily) ----------
  const today = data.live.date;
  const yesterday = addDays(today, -1);
  const hoursToday = energyHours(club, today);
  const hoursYesterday = energyHours(club, yesterday);
  const dayRows = Array.from({ length: 24 }, (_, i) => {
    const h = data.live.hour - 23 + i;
    const e = h < 0 ? hoursYesterday[h + 24] : hoursToday[h];
    const hour = (h + 24) % 24;
    const kwh = Math.round(e.kwh * 10) / 10;
    const avoided = Math.round(Math.max(0, e.baselineKwh - e.kwh) * 10) / 10;
    return { x: `${String(hour).padStart(2, '0')}:00`, consumed: kwh, avoided };
  });
  const dayKwh = dayRows.reduce((s, r) => s + r.consumed, 0);
  const dayAvoided = dayRows.reduce((s, r) => s + r.avoided, 0);
  const dayPct = dayKwh + dayAvoided > 0 ? (dayAvoided / (dayKwh + dayAvoided)) * 100 : 0;
  const dayOfMonth = Number(today.slice(8, 10));
  const month = energyHistory(data, [club], dayOfMonth);
  const monthRows = month.map((d) => ({ x: String(Number(d.date.slice(8, 10))), consumed: d.kwh, avoided: d.savedKwh, date: d.date }));
  const monthKwh = month.reduce((s, d) => s + d.kwh, 0);
  const sav = savingsSummary(data, [club]);
  const series = [
    { key: 'consumed', label: t('aiAgents.consumed'), color: ct.series[2] },
    { key: 'avoided', label: t('aiAgents.avoided'), slot: 0 },
  ];
  const mwh = (kwh: number) => fmtNumber(kwh / 1000, 2);
  const dayLabel = (v: string | number) => {
    const r = monthRows.find((m) => m.x === String(v));
    return r ? fmtDate(r.date, { day: 'numeric', month: 'short' }) : String(v);
  };

  // ---------- alerts (most severe first; the list shows what fits) ----------
  const rank: Record<Level, number> = { critical: 0, warning: 1, info: 2 };
  const order = (id: string) => Number(/:a(\d+)$/.exec(id)?.[1] ?? 99);
  const alerts = [...alertsIn(data, [club])].sort((a, b) => rank[a.level] - rank[b.level] || order(a.id) - order(b.id));
  const attention = alerts.filter((a) => a.level === 'critical').length;
  const alertsShown = Math.min(alertFit, alerts.length);
  const alertsHidden = alerts.length - alertsShown;
  const causeColor = [ct.series[0], ct.series[1], ct.series[2], ct.series[3]];

  return (
    <div className="page ag-wall">
      {/* Title line and one line of run summary (BMS-13) */}
      <header className="ag-head">
        <div className="ag-head__line">
          <h1 className="ag-head__title">{t('nav.aiAgents')}</h1>
          <span className="ag-head__where">{building}</span>
        </div>
        <div className="ag-run" aria-label={t('aiAgents.runLabel')}>
          <span className="ag-run__chip num">{t('aiAgents.running', { n: fmtNumber(running.length) })}</span>
          <span className="ag-run__chip">{mayAct.length ? t('aiAgents.mayAct', { n: fmtNumber(mayAct.length) }) : t('aiAgents.noneMayAct')}</span>
          <span className="ag-run__chip num">{t('aiAgents.sources', { live: fmtNumber(liveSources), sim: fmtNumber(0), none: fmtNumber(noSource) })}</span>
          <span className="ag-run__text" title={setbackText}>{setbackText}</span>
          <Link to="/bms-settings" className="btn btn--link btn--sm">{t('aiAgents.modes')}</Link>
        </div>
      </header>

      {/* BMS-11 agent status strip: one compact row, detail in the tooltip */}
      <ul aria-label={t('aiAgents.cardsLabel')} className="ag-strip">
        {agents.map((a) => {
          const s = a.state;
          const connected = !!s?.connected;
          const on = connected && s.running;
          const name = pick(a.nameEn, a.nameAr);
          const mode = a.readOnly || s?.mode === 'read' ? t('aiAgents.modeRead') : t('aiAgents.modeControl');
          const state = !connected ? t('aiAgents.notConnected') : on ? t('aiAgents.watching', { n: fmtNumber(s.watching) }) : t('aiAgents.switchedOff');
          const tip = `${a.num} ${name}. ${pick(a.domainEn, a.domainAr)}. ${state}${connected ? `, ${mode}` : ''}. ${pick(a.descEn, a.descAr)}`;
          const StateIcon = !connected ? Unplug : on ? Eye : EyeOff;
          return (
            <li key={a.id} className={`ag-tile ${connected ? '' : 'ag-tile--muted'} ${on ? 'ag-tile--on' : ''}`} title={tip}>
              <span className="ag-tile__name">{pick(a.domainEn, a.domainAr)}</span>
              <span className="ag-tile__row">
                <span className="ag-tile__state">
                  <StateIcon aria-hidden />
                  <span className="num ag-tile__val">{!connected ? t('aiAgents.offline') : on ? fmtNumber(s.watching) : t('aiAgents.offShort')}</span>
                  <span className="visually-hidden">{state}</span>
                </span>
                {connected && <Toggle checked={on} onChange={(v) => setRunning(a, v)}
                  label={on ? t('aiAgents.switchOff', { name }) : t('aiAgents.switchOn', { name })} />}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="ag-main">
        {/* BMS-12 activity log */}
        <div className="ag-col ag-col--log">
          <Card title={t('aiAgents.log')} info={t('aiAgents.info.log')}
            actions={<span className="ag-count num">{t('aiAgents.logCount', { n: fmtNumber(activity.length) })}</span>}>
            <div className="ag-log-filter">
              <Select label={t('aiAgents.filterAgent')} value={agentFilter} onChange={setAgentFilter}
                options={[{ value: 'all', label: t('aiAgents.allAgents') }, ...agents.map((a) => ({ value: a.id, label: pick(a.nameEn, a.nameAr) }))]} />
            </div>
            <ol className="ag-fitlist ag-log" ref={logRef}>
              {activity.length === 0 && <li className="muted" style={{ padding: '12px 0' }}>{t('aiAgents.logEmpty')}</li>}
              {activity.map((e, i) => (
                <li key={e.id} className={`ag-log__item${i >= logShown ? ' is-cut' : ''}`} aria-hidden={i >= logShown || undefined}>
                  <span className="ag-log__time num ltr" title={fmtDate(e.atMs, 'short')}>{riyadhClock(e.atMs)}</span>
                  <span className="ag-log__agent">{agentName(e.agentId)}</span>
                  <span className="ag-log__msg">{pick(e.textEn, e.textAr)}</span>
                </li>
              ))}
            </ol>
            <p className="ag-more num" aria-live="off">{logMore}</p>
          </Card>
        </div>

        <div className="ag-col ag-col--center">
          {/* BMS-14 building */}
          <Card pad="none" title={building}
            actions={<span className="ag-count">{t(floors.length === 1 ? 'bmsOverview.floorsOne' : 'bmsOverview.floorsMany', { n: fmtNumber(floors.length) })}</span>}>
            <div className="ag-building">
              <BuildingViewer zones={zones} floors={floors.map((f) => f.index)} layers={layers} spread={0.5} view="iso" colorBy="state"
                height="100%" compact ariaLabel={t('aiAgents.buildingAria', { name: building })} />
            </div>
          </Card>

          {/* BMS-15 energy consumed vs avoided */}
          <Card title={t('aiAgents.energy')} info={t('aiAgents.info.energy')}
            actions={<Segmented size="sm" ariaLabel={t('aiAgents.period')} value={period} onChange={setPeriod}
              options={[{ value: 'day', label: t('aiAgents.last24') }, { value: 'month', label: t('aiAgents.monthToDate') }]} />}>
            <div className="ag-headline">
              <div className="ag-headline__item">
                <span className="ag-headline__label">{t('aiAgents.last24')}<InfoTip text={t('aiAgents.info.day')} /></span>
                <span className="ag-headline__value num">{fmtNumber(dayKwh, 0)}<small>{t('common.kwh')}</small></span>
              </div>
              <div className="ag-headline__item">
                <span className="ag-headline__label">{t('aiAgents.monthToDate')}<InfoTip text={t('aiAgents.info.month')} /></span>
                <span className="ag-headline__value num">{mwh(monthKwh)}<small>{t('aiAgents.mwh')}</small></span>
              </div>
            </div>
            <div className="ag-chart">
              {period === 'day'
                ? <BarChart data={dayRows} xKey="x" series={series} stacked={false} xInterval={2}
                  yFormat={(v) => fmtNumber(v, { maximumFractionDigits: 0 })} ariaLabel={t('aiAgents.chartDay')} />
                : <BarChart data={monthRows} xKey="x" series={series} stacked={false} xFormat={dayLabel} xInterval={monthRows.length > 16 ? 2 : monthRows.length > 8 ? 1 : 0}
                  yFormat={(v) => fmtNumber(v, { notation: v >= 1000 ? 'compact' : 'standard', maximumFractionDigits: 1 })} ariaLabel={t('aiAgents.chartMonth')} />}
            </div>
            <p className="ag-caption">{period === 'day' ? t('aiAgents.axisDay') : t('aiAgents.axisMonth')}</p>
          </Card>
        </div>

        <div className="ag-col ag-col--side">
          {/* BMS-16 energy avoided */}
          <Card title={t('aiAgents.avoidedTitle')} info={t('aiAgents.info.avoided')}>
            <div className="ag-avoid__big num">{fmtNumber(dayPct, 1)}%<small>{t('aiAgents.last24')}</small></div>
            <div className="ag-avoid__sub">
              <span>{t('aiAgents.monthToDate')} <b className="num ltr">{fmtNumber(sav.month.savedPct, 1)}%</b></span>
              <span>{t('aiAgents.yearToDate')} <b className="num ltr">{fmtNumber(sav.year.savedPct, 1)}%</b></span>
            </div>
            <div className="ag-bar" role="img" aria-label={t('aiAgents.causesLabel')}>
              {CAUSES.map((c, i) => <span key={c.key} style={{ width: `${c.pct}%`, background: causeColor[i] }} />)}
            </div>
            <ul className="ag-causes">
              {CAUSES.map((c, i) => (
                <li key={c.key}><span><i className="sw" style={{ background: causeColor[i] }} aria-hidden />{t(`aiAgents.cause.${c.key}`)}</span><span className="num ltr">{fmtNumber(c.pct)}%</span></li>
              ))}
            </ul>
          </Card>

          {/* BMS-17 alerts */}
          <Card title={t('aiAgents.alerts')} info={t('aiAgents.info.alerts')}
            actions={<span className="ag-count num">{attention ? t('aiAgents.attention', { n: fmtNumber(attention) }) : t('aiAgents.noAttention')}</span>}>
            <ul className="ag-fitlist ag-alerts" ref={alertRef}>
              {alerts.length === 0 && <li className="muted" style={{ padding: '12px 0' }}>{t('aiAgents.alertsEmpty')}</li>}
              {alerts.map((a, i) => {
                const s = SEV[a.level];
                const cut = i >= alertsShown;
                return (
                  <li key={a.id} className={`ag-alert${cut ? ' is-cut' : ''}`} aria-hidden={cut || undefined}>
                    <div className="ag-alert__top">
                      <Badge tone={s.tone} icon={s.icon}>{t(`aiAgents.sev.${s.key}`)}</Badge>
                      <span className="ag-alert__where">{pick(a.areaEn, a.areaAr)}</span>
                      <span className="ag-alert__time num ltr">{riyadhClock(a.sinceMs)}</span>
                    </div>
                    <span className="ag-alert__title">{pick(a.titleEn, a.titleAr)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="ag-more num">{alertsHidden > 0 ? t('aiAgents.alertsMore', { n: fmtNumber(alertsHidden) }) : ''}</p>
          </Card>
        </div>
      </div>

      <ConfirmDialog open={!!confirmOff} title={t('aiAgents.confirmTitle', { name: confirmOff ? pick(confirmOff.nameEn, confirmOff.nameAr) : '' })}
        body={t('aiAgents.confirmBody')} confirmLabel={t('aiAgents.confirmCta')}
        onCancel={() => setConfirmOff(null)}
        onConfirm={() => { if (confirmOff) data.patch('agentStates', `${club.id}:${confirmOff.id}`, { running: false }); setConfirmOff(null); }} />
    </div>
  );
}
