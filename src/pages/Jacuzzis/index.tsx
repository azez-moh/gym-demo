import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Thermometer, Users, Wind } from 'lucide-react';
import { Button, Card, KpiTile, LineChart, PageHeader, Toggle } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { focusClub, useDemo } from '../../data';
import { hashString } from '../../data/rng';
import { useTheme } from '../../theme/theme';
import { hourLabel, useInView, usePageVisible, useReducedMotion, useWebgl } from '../Pool/wellness';
import { JACUZZI_SEATS, defaultJets, jacuzziPeople, jacuzzisByHour, jacuzziTemps } from './model';
import './jacuzzis.css';

const JacuzziScene = lazy(() => import('./JacuzziScene'));

export default function JacuzzisPage() {
  const { t, pick, fmtNumber } = useI18n();
  const d = useDemo();
  const { scope } = useScope();
  const club = focusClub(d, scope);
  const people = jacuzziPeople(d, club);
  const temps = jacuzziTemps(club.id, d.live.date, d.tick);
  const [jets, setJets] = useState<[boolean, boolean]>(() => defaultJets(people));
  // a different gym starts from its own jet state
  useEffect(() => { setJets(defaultJets(jacuzziPeople(d, club))); }, [club.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const running = jets.filter(Boolean).length;
  const nowMin = d.live.hour * 60 + d.live.minute;
  const hourly = useMemo(() => jacuzzisByHour(club, d.live.date, nowMin), [club, d.live.date, nowMin]);
  const names = [t('jacuzzis.name1'), t('jacuzzis.name2')];
  const deg = (v: number) => <span className="ltr">{fmtNumber(v, 1)}</span>;

  return (
    <div className="page jz">
      <PageHeader eyebrow={pick(club.nameEn, club.nameAr)} title={t('nav.jacuzzis')} />

      <div className="grid-kpi">
        <KpiTile live icon={Users} label={t('jacuzzis.kpi.people')} value={fmtNumber(people[0] + people[1])} unit={t('jacuzzis.kpi.ofSeats', { n: fmtNumber(JACUZZI_SEATS * 2) })} info={t('jacuzzis.kpi.peopleInfo')} />
        <KpiTile live icon={Thermometer} label={t('jacuzzis.kpi.temp1')} value={deg(temps[0])} unit={'\u2066°C\u2069'} info={t('jacuzzis.kpi.temp1Info')} hint={t('jacuzzis.kpi.range')} />
        <KpiTile live icon={Thermometer} label={t('jacuzzis.kpi.temp2')} value={deg(temps[1])} unit={'\u2066°C\u2069'} info={t('jacuzzis.kpi.temp2Info')} hint={t('jacuzzis.kpi.range')} />
        <KpiTile icon={Wind} label={t('jacuzzis.kpi.jets')} value={fmtNumber(running)} unit={t('jacuzzis.kpi.ofJets', { n: fmtNumber(2) })} info={t('jacuzzis.kpi.jetsInfo')} />
      </div>

      <div className="jz-pair">
        {[0, 1].map((i) => (
          <JacuzziCard key={`${club.id}-${i}`} name={names[i]} people={people[i]} temp={temps[i]} jets={jets[i]} seed={hashString(`${club.id}|${i}`)}
            onJets={(v) => setJets((cur) => (i === 0 ? [v, cur[1]] : [cur[0], v]))} />
        ))}
      </div>
      <p className="jz-note">{t('jacuzzis.note')}</p>

      <Card title={t('jacuzzis.hourly.title')} info={t('jacuzzis.hourly.info')}>
        <LineChart data={hourly} xKey="hour" xFormat={hourLabel} height={240} ariaLabel={t('jacuzzis.hourly.aria')} yFormat={(v) => fmtNumber(v)}
          series={[{ key: 'j1', label: names[0], slot: 0 }, { key: 'j2', label: names[1], slot: 1 }]} />
      </Card>
    </div>
  );
}

function JacuzziCard({ name, people, temp, jets, onJets, seed }: { name: string; people: number; temp: number; jets: boolean; onJets: (v: boolean) => void; seed: number }) {
  const { t, fmtNumber } = useI18n();
  const { theme, chart } = useTheme();
  const webgl = useWebgl();
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const [reset, setReset] = useState(0);
  const active = jets && visible && inView && !reduced;
  return (
    <section className="jz-card" aria-label={name}>
      <header className="jz-card__head">
        <h3 className="card__title">{name}</h3>
        <div className="jz-card__facts">
          <span className="jz-fact"><Users aria-hidden /><span>{t('jacuzzis.view.people', { n: fmtNumber(people), max: fmtNumber(JACUZZI_SEATS) })}</span></span>
          <span className="jz-fact"><Thermometer aria-hidden /><span className="ltr">{fmtNumber(temp, 1)} °C</span></span>
        </div>
      </header>
      <div className="jz-stage" ref={ref}>
        {webgl ? (
          <Suspense fallback={<div className="jz-loading" aria-busy="true"><span>{t('jacuzzis.view.loading')}</span></div>}>
            <JacuzziScene people={people} jets={jets} theme={theme} accent={chart.series[0]} active={active} resetSignal={reset} reducedMotion={reduced} seed={seed}
              ariaLabel={t('jacuzzis.view.aria', { name, n: fmtNumber(people), state: jets ? t('jacuzzis.view.on') : t('jacuzzis.view.off') })} />
          </Suspense>
        ) : (
          <div className="jz-loading"><span>{t('jacuzzis.view.noWebgl')}</span></div>
        )}
        <span className={`jz-state ${jets ? 'is-on' : ''}`} aria-hidden><span className="jz-state__dot" />{jets ? t('jacuzzis.view.jetsOn') : t('jacuzzis.view.jetsOff')}</span>
      </div>
      <footer className="jz-card__foot">
        <label className="jz-switch">
          <Toggle checked={jets} onChange={onJets} label={t('jacuzzis.view.toggle', { name })} />
          <span aria-hidden>{t('jacuzzis.view.jets')}</span>
        </label>
        <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setReset((r) => r + 1)}>{t('jacuzzis.view.reset')}</Button>
      </footer>
    </section>
  );
}
