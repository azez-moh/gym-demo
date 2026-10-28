import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, Flame, Layers, Pause, Play, Radio, TrendingUp, Users, X } from 'lucide-react';
import { Badge, Button, Card, EmptyState, InfoTip, KpiTile, LiveTag, Segmented, Sparkline } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { useTheme } from '../../theme/theme';
import { focusClub, useDemo } from '../../data';
import {
  areaPeaks, climateAt, floorPlanOf, liveClimate, occupancyToday,
  type AreaClimate, type AreaOccupancy, type FloorId, type PlanArea,
} from '../../data/floors';
import { PlanSvg, planWidthForHeight, type PlanKeyItem } from './PlanSvg';
import { heatColor, legendGradient } from './scale';
import { crowdRatio } from '../../data/branchConfig';
import { usePeopleText } from './people';
import './heatmap.css';

type FloorView = FloorId | 'both';
const VIEWS: FloorView[] = ['ground', 'first', 'both'];

function useWide(min: number) {
  const q = `(min-width: ${min}px)`;
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setWide(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, [q]);
  return wide;
}

export default function HeatmapPage() {
  const i18n = useI18n();
  const { t, pick } = i18n;
  const data = useDemo();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const plan = floorPlanOf(club.id);
  const gym = pick(club.nameEn, club.nameAr);

  if (!plan) {
    return (
      <div className="page hm-page hm-page--empty">
        <header className="hm-head">
          <div className="hm-head__text">
            <h1 className="page-head__title">{t('heatmap.title')}</h1>
            <p className="hm-lead">{gym}</p>
          </div>
        </header>
        <Card pad="lg"><EmptyState icon={Layers} title={t('heatmap.empty.title')} body={t('heatmap.empty.body', { gym })} /></Card>
      </div>
    );
  }
  return <HeatmapView />;
}

function HeatmapView() {
  const i18n = useI18n();
  const { t, pick, fmtNumber, fmtTime } = i18n;
  const data = useDemo();
  const { theme } = useTheme();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const plan = floorPlanOf(club.id)!;
  const gym = pick(club.nameEn, club.nameAr);
  const [params, setParams] = useSearchParams();
  const ppl = usePeopleText();
  const wide = useWide(1200);
  const xwide = useWide(1600);

  // ---------- floor ----------
  const fp = params.get('floor') as FloorView | null;
  const asked: FloorView = fp && VIEWS.includes(fp) ? fp : xwide ? 'both' : 'ground';
  const view: FloorView = asked === 'both' && !wide ? 'ground' : asked;
  const setView = (v: FloorView) => {
    const n = new URLSearchParams(params);
    n.set('floor', v);
    setParams(n, { replace: true });
  };
  const floors = plan.floors.filter((f) => view === 'both' || f.id === view);

  // ---------- time ----------
  const steps = useMemo(() => occupancyToday(data, club), [data, club]);
  const [stepIdx, setStepIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const lastIdx = steps.length - 1;
  const idx = stepIdx == null ? lastIdx : Math.min(stepIdx, lastIdx);
  const step = steps[idx];
  const isLive = idx === lastIdx;

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setStepIdx((cur) => {
        const c = cur == null ? lastIdx : cur;
        if (c >= lastIdx - 1) { setPlaying(false); return null; }
        return c + 1;
      });
    }, 650);
    return () => window.clearInterval(id);
  }, [playing, lastIdx]);

  const play = () => {
    if (playing) { setPlaying(false); return; }
    if (isLive) setStepIdx(0);
    setPlaying(true);
  };
  const toLive = () => { setPlaying(false); setStepIdx(null); };

  // ---------- figures at the selected time ----------
  const occ = useMemo(() => new Map(step.areas.map((a) => [a.areaId, a])), [step]);
  const climate = useMemo<Map<string, AreaClimate>>(
    () => (step.live ? liveClimate(data, club.id) : climateAt(data, club.id, step.ms)), [data, club.id, step]);
  const peaks = useMemo(() => areaPeaks(steps), [steps]);
  const gymPeak = useMemo(() => steps.reduce((b, s) => (s.peopleIn > b.peopleIn ? s : b), steps[0]), [steps]);
  const ranked = useMemo(() => [...step.areas].sort((a, b) => b.ratio - a.ratio || b.people - a.people), [step]);
  const busiest = ranked[0];
  // crowding threshold of this gym (Branch settings, 85% by default)
  const HOT_RATIO = crowdRatio(club.id);
  const hotPct = Math.round(HOT_RATIO * 100);
  const hot = ranked.filter((a) => a.ratio > HOT_RATIO);
  const timeOf = (minute: number) => fmtTime(steps.find((s) => s.minute === minute)?.ms ?? step.ms);

  // ---------- selection ----------
  const [selected, setSelected] = useState<string | null>(null);
  const selOcc = selected ? step.areas.find((a) => a.area.key === selected) : undefined;
  const select = (key: string) => {
    setSelected((cur) => (cur === key ? null : key));
    const a = step.areas.find((x) => x.area.key === key);
    if (a && view !== 'both' && a.area.floor !== view) setView(a.area.floor);
  };

  // ---------- fit the page to the screen on wide screens ----------
  const pageRef = useRef<HTMLDivElement>(null);
  const [fitH, setFitH] = useState<number | null>(null);
  const fit = useCallback(() => {
    const el = pageRef.current;
    if (!el || window.innerWidth < 1200 || window.innerHeight < 680) { setFitH(null); return; }
    const top = el.getBoundingClientRect().top + window.scrollY;
    const padBottom = el.parentElement ? parseFloat(getComputedStyle(el.parentElement).paddingBottom) || 0 : 0;
    setFitH(Math.max(560, window.innerHeight - top - Math.min(padBottom, 48) - 1));
  }, []);
  useLayoutEffect(() => {
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [fit]);

  const pctTxt = (r: number) => `${fmtNumber(Math.round(r * 100))}%`;
  const comfortTxt = (c?: AreaClimate) => !c ? '' : t(`heatmap.area.comfort${c.comfort === 'ok' ? 'Ok' : c.comfort === 'warm' ? 'Warm' : c.comfort === 'hot' ? 'Hot' : c.comfort === 'off' ? 'Off' : 'None'}`);
  const deg = (v?: number) => (v == null ? '–' : `⁦${fmtNumber(v, { maximumFractionDigits: 1 })}°C⁩`);
  const floorName = (id: FloorId) => t(`heatmap.floors.${id}`);

  const tooltip = (a: PlanArea) => {
    const name = pick(a.nameEn, a.nameAr);
    if (!a.monitored) return (<><strong>{name}</strong><span className="muted">{t('heatmap.area.notCounted')}</span></>);
    const o = occ.get(`${plan.clubId}:${a.key}`);
    const c = climate.get(`${plan.clubId}:${a.key}`);
    const pk = peaks.get(`${plan.clubId}:${a.key}`);
    return (
      <>
        <strong>{name}</strong>
        <span className="hm-tip__big num">{pctTxt(o?.ratio ?? 0)}</span>
        <span>{t('heatmap.area.peopleOf', { n: fmtNumber(o?.people ?? 0), cap: fmtNumber(a.capacity) })}</span>
        {pk && <span className="muted">{t('heatmap.area.peak')}: {t('heatmap.area.peakVal', { people: ppl(pk.people), time: timeOf(pk.minute) })}</span>}
        {c && c.comfort !== 'none' && <span className="muted">{deg(c.temp)} · {comfortTxt(c)}</span>}
      </>
    );
  };

  // ---------- plan card: as wide as the plan needs to fill the height (single floor), legend beside it ----------
  const mainRef = useRef<HTMLDivElement>(null);
  const [mainH, setMainH] = useState(0);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMainH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [ppm, setPpm] = useState(0);
  const [keyItems, setKeyItems] = useState<PlanKeyItem[]>([]);
  const asideLayout = !!fitH && view !== 'both';
  // card: 12 px padding top and bottom, 16 px sides, 200 px legend column and a 16 px gap
  const cardW = asideLayout && mainH > 200 ? Math.ceil(planWidthForHeight(floors, mainH - 26) + 32 + 200 + 16 + 2) : 0;

  const planHead = (
    <div className="hm-plancard__head">
      <span className="hm-plancard__title">{view === 'both' ? t('heatmap.floors.both') : floorName(view)}</span>
      <span className="hm-plancard__end">
        {isLive ? <LiveTag /> : <Badge tone="neutral" icon={Clock}>{t('heatmap.time.at', { time: fmtTime(step.ms) })}</Badge>}
        <InfoTip text={t('heatmap.info')} />
      </span>
    </div>
  );
  const legend = (
    <div className="hm-legend">
      <span className="hm-legend__title">{t('heatmap.legend.title')}</span>
      <span className="hm-legend__scale">
        <span className="hm-legend__bar" style={{ background: legendGradient(theme, i18n.isRtl ? 'to left' : 'to right') }} />
        <span className="hm-legend__ticks num">
          <span style={{ insetInlineStart: '0%' }}>0%</span>
          <span style={{ insetInlineStart: '50%' }}>50%</span>
          {hotPct > 58 && hotPct < 93 && <span className="hm-legend__hot" style={{ insetInlineStart: `${hotPct}%` }}>{fmtNumber(hotPct)}%</span>}
          <span style={{ insetInlineStart: '100%' }}>100%</span>
        </span>
      </span>
      {ppm > 0 && (
        <span className="hm-scalebar"><span className="hm-scalebar__bar" style={{ width: Math.round(10 * ppm) }} />{t('heatmap.legend.scale')}</span>
      )}
      {keyItems.length > 0 && (
        <ol className="hm-key">
          {keyItems.map((k) => (
            <li key={k.key}>
              <button type="button" onClick={() => select(k.key)}><span className="hm-key__n num">{fmtNumber(k.n)}</span>{k.name}</button>
            </li>
          ))}
        </ol>
      )}
      <span className="hm-legend__note">{t('heatmap.planNote')}</span>
    </div>
  );

  const kpiTime = isLive ? undefined : t('heatmap.time.at', { time: fmtTime(step.ms) });

  return (
    <div ref={pageRef} className={`page hm-page ${fitH ? 'is-fit' : ''}`} style={fitH ? { height: fitH } : undefined}>
      <header className="hm-head">
        <div className="hm-head__text">
          <h1 className="page-head__title">{t('heatmap.title')}</h1>
          <p className="hm-lead">{t('heatmap.lead', { gym })}</p>
        </div>
        <div className="hm-head__actions">
          <Segmented ariaLabel={t('heatmap.floors.label')} value={view} onChange={setView}
            options={(wide ? VIEWS : VIEWS.filter((v) => v !== 'both')).map((v) => ({ value: v, label: t(`heatmap.floors.${v}`) }))} />
        </div>
      </header>

      <div className="grid-kpi hm-kpis">
        <KpiTile icon={Users} live={isLive} label={t('heatmap.kpi.people')} info={t('heatmap.kpi.peopleInfo')}
          value={fmtNumber(step.peopleIn)} unit={t('heatmap.kpi.peopleOf', { cap: fmtNumber(club.capacity) })}
          hint={kpiTime ?? t('heatmap.kpi.peopleFull', { pct: fmtNumber(Math.round((step.peopleIn / club.capacity) * 100)) })} />
        <KpiTile icon={Flame} live={isLive} label={t('heatmap.kpi.busiest')} info={t('heatmap.kpi.busiestInfo')}
          className={busiest && busiest.ratio > HOT_RATIO ? 'hm-kpi-hot' : ''}
          value={busiest && busiest.people > 0 ? <span className="hm-kpi-name">{pick(busiest.area.nameEn, busiest.area.nameAr)}</span> : '–'}
          hint={busiest && busiest.people > 0
            ? t('heatmap.kpi.busiestHint', { people: ppl(busiest.people), pct: fmtNumber(Math.round(busiest.ratio * 100)) })
            : t('heatmap.kpi.busiestNone')} />
        <KpiTile icon={TrendingUp} live={isLive} label={t('heatmap.kpi.above', { p: fmtNumber(hotPct) })} info={t('heatmap.kpi.aboveInfo', { p: fmtNumber(hotPct) })}
          className={hot.length ? 'hm-kpi-hot' : ''}
          value={fmtNumber(hot.length)} unit={t('heatmap.kpi.aboveOf', { n: fmtNumber(step.areas.length) })}
          hint={hot.length ? <span className="hm-kpi-names">{hot.map((a) => pick(a.area.nameEn, a.area.nameAr)).join(i18n.lang === 'ar' ? '، ' : ', ')}</span> : t('heatmap.kpi.aboveNone')} />
        <KpiTile icon={Clock} label={t('heatmap.kpi.peak')} info={t('heatmap.kpi.peakInfo')}
          value={fmtNumber(gymPeak.peopleIn)} unit={t('heatmap.kpi.peopleOf', { cap: fmtNumber(club.capacity) })}
          hint={t('heatmap.kpi.peakHint', { time: fmtTime(gymPeak.ms), pct: fmtNumber(Math.round((gymPeak.peopleIn / club.capacity) * 100)) })} />
      </div>

      <div ref={mainRef} className="hm-main" style={cardW ? { gridTemplateColumns: `minmax(0, ${cardW}px) minmax(300px, 1fr)` } : undefined}>
        <section className={`card hm-plancard ${asideLayout ? 'is-aside' : ''}`}>
          {!asideLayout && planHead}
          <div className="hm-plans">
            <PlanSvg plan={plan} floors={floors} occ={occ} theme={theme} onScale={setPpm} onKey={setKeyItems}
              selected={selected} onSelect={select} tooltip={tooltip} />
          </div>
          {asideLayout ? <div className="hm-plancard__aside">{planHead}{legend}</div> : legend}
        </section>

        <aside className="card hm-side">
          {selOcc ? (
            <AreaDetail o={selOcc} climate={climate.get(selOcc.areaId)} peak={peaks.get(selOcc.areaId)} steps={steps}
              onBack={() => setSelected(null)} pctTxt={pctTxt} comfortTxt={comfortTxt} deg={deg} timeOf={timeOf} floorName={floorName} />
          ) : (
            <>
              <div className="hm-side__head">
                <span className="hm-side__title">{t('heatmap.area.list')}</span>
                <span className="hm-plancard__end">{isLive && <LiveTag />}<InfoTip text={t('heatmap.area.listInfo')} /></span>
              </div>
              <ul className="hm-list">
                {ranked.map((a) => (
                  <li key={a.areaId}>
                    <button type="button" className="hm-row" onClick={() => select(a.area.key)}>
                      <span className="hm-row__sw" style={{ background: heatColor(a.ratio, theme) }} />
                      <span className="hm-row__name">
                        <span>{pick(a.area.nameEn, a.area.nameAr)}</span>
                        <span className="hm-row__sub">{floorName(a.area.floor)} · {t('heatmap.area.peopleOf', { n: fmtNumber(a.people), cap: fmtNumber(a.area.capacity) })}</span>
                      </span>
                      <span className={`hm-row__pct num ${a.ratio > HOT_RATIO ? 'is-hot' : ''}`}>{pctTxt(a.ratio)}</span>
                      <span className="hm-row__bar"><span style={{ width: `${Math.min(100, a.ratio * 100)}%`, background: heatColor(a.ratio, theme) }} /></span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>

      <div className="card hm-time">
        <Button size="sm" variant={playing ? 'default' : 'primary'} icon={playing ? Pause : Play} onClick={play}>
          {playing ? t('heatmap.time.pause') : t('heatmap.time.play')}
        </Button>
        <div className="hm-time__track">
          <input type="range" className="hm-range" min={0} max={lastIdx} step={1} value={idx} aria-label={t('heatmap.time.label')}
            aria-valuetext={isLive ? t('common.live') : fmtTime(step.ms)}
            onChange={(e) => { setPlaying(false); const v = Number(e.target.value); setStepIdx(v >= lastIdx ? null : v); }} />
          <div className="hm-time__ticks num" aria-hidden>
            <span>{fmtTime(steps[0].ms)}</span>
            <span>{isLive ? t('common.live') : fmtTime(steps[lastIdx].ms)}</span>
          </div>
        </div>
        <span className="hm-time__now num">{fmtTime(step.ms)}</span>
        {isLive ? <LiveTag /> : <Button size="sm" variant="ghost" icon={Radio} onClick={toLive}>{t('heatmap.time.live')}</Button>}
      </div>
    </div>
  );
}

function AreaDetail({ o, climate, peak, steps, onBack, pctTxt, comfortTxt, deg, timeOf, floorName }: {
  o: AreaOccupancy;
  climate?: AreaClimate;
  peak?: { people: number; minute: number };
  steps: ReturnType<typeof occupancyToday>;
  onBack: () => void;
  pctTxt: (r: number) => string;
  comfortTxt: (c?: AreaClimate) => string;
  deg: (v?: number) => string;
  timeOf: (m: number) => string;
  floorName: (f: FloorId) => string;
}) {
  const { t, pick, fmtNumber } = useI18n();
  const ppl = usePeopleText();
  const { theme } = useTheme();
  const HOT_RATIO = crowdRatio(o.areaId.split(':')[0]);
  const series = steps.map((s) => s.areas.find((a) => a.areaId === o.areaId)?.ratio ?? 0).map((r) => Math.round(r * 100));
  const tone = climate?.comfort === 'hot' ? 'txt-danger' : climate?.comfort === 'warm' ? 'txt-warning' : '';
  return (
    <div className="hm-detail">
      <div className="hm-side__head">
        <button type="button" className="hm-back" onClick={onBack}><ArrowLeft aria-hidden className="flip-rtl" />{t('heatmap.area.back')}</button>
        <button type="button" className="btn btn--sm btn--icon btn--ghost" aria-label={t('heatmap.area.close')} onClick={onBack}><X aria-hidden /></button>
      </div>
      <div className="hm-detail__title">
        <span className="hm-row__sw" style={{ background: heatColor(o.ratio, theme) }} />
        <span>
          <span className="hm-detail__name">{pick(o.area.nameEn, o.area.nameAr)}</span>
          <span className="hm-row__sub">{floorName(o.area.floor)}</span>
        </span>
      </div>
      <div className="hm-detail__big">
        <span className={`num hm-detail__pct ${o.ratio > HOT_RATIO ? 'is-hot' : ''}`}>{pctTxt(o.ratio)}</span>
        <span className="muted">{t('heatmap.area.peopleOf', { n: fmtNumber(o.people), cap: fmtNumber(o.area.capacity) })}</span>
      </div>
      <dl className="hm-facts">
        <div><dt>{t('heatmap.area.peak')}</dt><dd>{peak ? t('heatmap.area.peakVal', { people: ppl(peak.people), time: timeOf(peak.minute) }) : '–'}</dd></div>
        <div><dt>{t('heatmap.area.temp')}</dt><dd className={tone}>{climate && climate.comfort !== 'none' ? deg(climate.temp) : '–'}</dd></div>
        <div><dt>{t('heatmap.area.comfort')}</dt><dd className={tone}>{comfortTxt(climate)}</dd></div>
        <div><dt>{t('heatmap.area.capacity')}</dt><dd>{t('heatmap.area.capacityVal', { n: fmtNumber(o.area.capacity) })}</dd></div>
        <div><dt>{t('heatmap.area.size')}</dt><dd className="num">{t('heatmap.area.m2', { n: fmtNumber(Math.round(o.area.m2)) })}</dd></div>
      </dl>
      {series.length > 1 && (
        <div className="hm-detail__spark">
          <span className="hm-row__sub">{t('heatmap.area.today')}</span>
          <Sparkline data={series} height={44} width={240} />
        </div>
      )}
      <div className="hm-detail__links">
        <Link className="btn btn--sm" to="/bms-overview">{t('heatmap.area.climate')}</Link>
        {o.area.key === 'cardio' && <Link className="btn btn--sm" to="/live-floor">{t('heatmap.area.machines')}</Link>}
      </div>
    </div>
  );
}
