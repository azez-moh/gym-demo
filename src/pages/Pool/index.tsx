import { lazy, Suspense, useMemo, useRef, useState } from 'react';
import { Droplets, Pause, Play, RotateCcw, Thermometer, Users, Waves } from 'lucide-react';
import { Badge, BarChart, Button, Card, KpiTile, PageHeader, Segmented } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { focusClub, useDemo } from '../../data';
import { useTheme } from '../../theme/theme';
import { HUMIDITY_LIMIT, POOL_CAPACITY, POOL_LANES, lanePace, laneAssignment, poolClimate, swimmerPhase, swimmersByHour, swimmersNow } from './model';
import { hourLabel, useInView, usePageVisible, useReducedMotion, useWebgl } from './wellness';
import type { PoolSwimmer } from './PoolScene';
import './pool.css';

const PoolScene = lazy(() => import('./PoolScene'));

const CAPS = ['#7c3aed', '#21c3d6', '#241f30', '#f5f3fa', '#3b86df', '#9b7af2'];

export default function PoolPage() {
  const { t, pick, fmtNumber } = useI18n();
  const d = useDemo();
  const { scope } = useScope();
  const { theme, chart } = useTheme();
  const club = focusClub(d, scope);
  const webgl = useWebgl();
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef);
  const [view, setView] = useState<'perspective' | 'top'>('perspective');
  const [playing, setPlaying] = useState(!reduced);
  const [reset, setReset] = useState(0);

  const n = swimmersNow(d, club);
  const lanes = useMemo(() => laneAssignment(club.id, d.live.date, n), [club.id, d.live.date, n]);
  const perLane = useMemo(() => { const c = Array(POOL_LANES).fill(0) as number[]; lanes.forEach((l) => { c[l]++; }); return c; }, [lanes]);
  const lanesUsed = perLane.filter((x) => x > 0).length;
  const climate = poolClimate(club.id, d.live.date, d.tick, n);
  const humid = climate.humidity > HUMIDITY_LIMIT;

  const nowMin = d.live.hour * 60 + d.live.minute;
  const hourly = useMemo(() => swimmersByHour(club, d.live.date, nowMin), [club, d.live.date, nowMin]);
  const peak = hourly.reduce<{ hour: number; swimmers: number } | null>((a, r) => (r.swimmers != null && (!a || r.swimmers > a.swimmers) ? { hour: r.hour, swimmers: r.swimmers } : a), null);

  const swimmers: PoolSwimmer[] = useMemo(() => {
    const slot = Array(POOL_LANES).fill(0) as number[];
    return lanes.map((lane, k) => {
      const i = slot[lane]++;
      const pace = lanePace(lane) * (i === 0 ? 1 : 0.94);
      // the second swimmer of a lane starts about half a loop behind the first
      const phase = swimmerPhase(club.id, lane) + i * 27;
      return { id: k, lane, speed: pace, phase, cap: CAPS[(k * 5 + lane) % CAPS.length], side: 1 };
    });
  }, [lanes, club.id]);

  const active = playing && visible && inView && !reduced;
  const paceLabel = (l: number) => (l <= 1 ? t('pool.lanes.slow') : l <= 2 ? t('pool.lanes.medium') : t('pool.lanes.fast'));
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim() || 'system-ui, sans-serif';

  return (
    <div className="page pl">
      <PageHeader eyebrow={pick(club.nameEn, club.nameAr)} title={t('nav.pool')} />

      <div className="grid-kpi">
        <KpiTile live icon={Users} label={t('pool.kpi.swimmers')} value={fmtNumber(n)} unit={t('pool.kpi.ofCapacity', { n: fmtNumber(POOL_CAPACITY) })} info={t('pool.kpi.swimmersInfo')} />
        <KpiTile live icon={Waves} label={t('pool.kpi.lanes')} value={fmtNumber(lanesUsed)} unit={t('pool.kpi.ofLanes', { n: fmtNumber(POOL_LANES) })} info={t('pool.kpi.lanesInfo')} />
        <KpiTile live icon={Thermometer} label={t('pool.kpi.water')} value={<span className="ltr">{fmtNumber(climate.waterC, 1)}</span>} unit={'\u2066°C\u2069'} info={t('pool.kpi.waterInfo')} hint={t('pool.kpi.range')} />
        <KpiTile live icon={Droplets} label={t('pool.kpi.humidity')} value={<span className={humid ? 'pl-warn' : ''}>{fmtNumber(climate.humidity)}%</span>} info={t('pool.kpi.humidityInfo')}
          hint={humid ? <Badge tone="warning">{t('pool.kpi.humidityHigh')}</Badge> : t('pool.kpi.humidityOk')} />
      </div>

      <section className="pl-main" aria-label={t('pool.view.title')}>
        <div className="pl-toolbar">
          <Segmented size="sm" ariaLabel={t('pool.view.mode')} value={view} onChange={setView}
            options={[{ value: 'perspective', label: t('pool.view.perspective') }, { value: 'top', label: t('pool.view.top') }]} />
          <div className="pl-toolbar__end">
            <Button size="sm" variant="ghost" icon={playing ? Pause : Play} onClick={() => setPlaying((p) => !p)} aria-pressed={!playing}>
              {playing ? t('pool.view.pause') : t('pool.view.resume')}
            </Button>
            <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setReset((r) => r + 1)}>{t('pool.view.reset')}</Button>
          </div>
        </div>
        <div className="pl-stage" ref={stageRef}>
          {webgl ? (
            <Suspense fallback={<div className="pl-loading" aria-busy="true"><span>{t('pool.view.loading')}</span></div>}>
              <PoolScene swimmers={swimmers} lanesInUse={perLane.map((x) => x > 0)} theme={theme} accent={chart.series[0]} view={view}
                playing={playing && !reduced} active={active} resetSignal={reset} reducedMotion={reduced} fontFamily={fontFamily}
                ariaLabel={t('pool.view.aria', { n: fmtNumber(n), lanes: fmtNumber(lanesUsed) })} />
            </Suspense>
          ) : (
            <div className="pl-loading"><span>{t('pool.view.noWebgl')}</span></div>
          )}
          <span className="pl-hint" aria-hidden>{t('pool.view.hint')}</span>
        </div>
        <p className="pl-note">{t('pool.view.note')}</p>
      </section>

      <div className="pl-grid">
        <Card title={t('pool.hourly.title')} info={t('pool.hourly.info')}>
          <BarChart data={hourly} xKey="hour" series={[{ key: 'swimmers', label: t('pool.hourly.series') }]} legend={false} stacked={false}
            xFormat={hourLabel} height={240} ariaLabel={t('pool.hourly.aria')} yFormat={(v) => fmtNumber(v)}
            footer={peak ? <p className="pl-foot">{t('pool.hourly.peak', { hour: hourLabel(peak.hour), n: fmtNumber(Math.round(peak.swimmers)) })}</p> : undefined} />
        </Card>
        <Card title={t('pool.lanes.title')} info={t('pool.lanes.info')} live>
          <ul className="pl-lanes">
            {perLane.map((c, i) => (
              <li key={i} className={`pl-lane ${c ? 'is-used' : ''}`}>
                <span className="pl-lane__bar" aria-hidden />
                <span className="pl-lane__name">
                  <strong>{t('pool.lanes.lane', { n: fmtNumber(i + 1) })}</strong>
                  <span className="pl-lane__pace">{paceLabel(i)}</span>
                </span>
                <span className="pl-lane__count">{c === 0 ? t('pool.lanes.none') : c === 1 ? t('pool.lanes.swimmer1') : t('pool.lanes.swimmers', { n: fmtNumber(c) })}</span>
                <span className={`pl-chip pl-chip--${c === 0 ? 'free' : c === 1 ? 'use' : 'busy'}`}>{c === 0 ? t('pool.lanes.free') : c === 1 ? t('pool.lanes.inUse') : t('pool.lanes.busy')}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
