import { useNavigate } from 'react-router-dom';
import { Leaf, Percent, TrendingDown, Zap, CalendarDays } from 'lucide-react';
import { Card, InfoTip, KpiTile, Sparkline } from '../../components';
import { useI18n } from '../../i18n';
import { useDemo, ENERGY_SPLIT, TARIFF_SAR_PER_KWH } from '../../data';
import { dailySavingsSar, mean, ytdSavingsSar, type ClubRow } from './metrics';
import { CountUp, HBarList, useFmtMwh, useFmtSarCompact } from './shared';

/** Energy consumption (CV-06, CV-07, CV-08) with the SAR savings highlight. */
export function EnergySection({ rows }: { rows: ClubRow[] }) {
  const { t, pick, fmtNumber, fmtCurrency, fmtEnergy, lang } = useI18n();
  const data = useDemo();
  const navigate = useNavigate();
  const mwh = useFmtMwh();
  const sarC = useFmtSarCompact();
  const clubs = rows.map((r) => r.club);
  const today = data.live.date;
  const nowMin = data.live.hour * 60 + data.live.minute;

  const todayKwh = rows.reduce((a, r) => a + r.energyTodayKwh, 0);
  const monthKwh = rows.reduce((a, r) => a + r.energyMonthKwh, 0);
  const redToday = Math.round(mean(rows.map((r) => r.savedTodayPct)) * 10) / 10;
  const redMonth = Math.round(mean(rows.map((r) => r.savedMonthPct)) * 10) / 10;
  const savedSar = rows.reduce((a, r) => a + r.savedMonthSar, 0);
  const savedKwh = rows.reduce((a, r) => a + r.savedMonthKwh, 0);
  const ytd = ytdSavingsSar(clubs, today, nowMin);
  const spark = dailySavingsSar(clubs, today, nowMin, 14);
  const tariff = fmtCurrency(TARIFF_SAR_PER_KWH, 2);

  const byMonth = [...rows].sort((a, b) => b.energyMonthKwh - a.energyMonthKwh);
  const split = [...ENERGY_SPLIT].sort((a, b) => b.pct - a.pct);
  const showCard = (id: string) => navigate(`/branches?club=${encodeURIComponent(id)}`);
  const fmtSarFull = (v: number) => (lang === 'ar' ? `${fmtNumber(Math.round(v))}` : fmtNumber(Math.round(v)));

  return (
    <div className="stack-lg">
      <section className="ov-savings" aria-label={t('overview.energy.savedHero')}>
        <div className="ov-savings__main">
          <div className="ov-savings__label">
            <Leaf aria-hidden />
            <span className="label">{t('overview.energy.savedHero')}</span>
            <InfoTip text={t('overview.energy.savedHeroInfo', { tariff })} />
          </div>
          <div className="ov-savings__value">
            {lang === 'en' && <span className="ov-savings__cur">SAR</span>}
            <span className="num ov-savings__num"><CountUp value={savedSar} format={fmtSarFull} /></span>
            {lang === 'ar' && <span className="ov-savings__cur">ر.س</span>}
          </div>
          <div className="ov-savings__meta">
            <span>{t('overview.energy.kwhSaved', { v: fmtEnergy(savedKwh) })}</span>
            <span aria-hidden>·</span>
            <span className="num">{fmtNumber(redMonth, 1)}% {t('overview.energy.vsBaseline')}</span>
            <span aria-hidden>·</span>
            <span>{t('overview.energy.ytd', { v: sarC(ytd) })}</span>
          </div>
        </div>
        <div className="ov-savings__spark">
          <Sparkline data={spark} slot={0} />
          <span className="ov-savings__sparklabel">{t('overview.energy.last14')}</span>
        </div>
      </section>

      <div className="grid-kpi">
        <KpiTile icon={Zap} label={t('overview.energy.today')} info={t('overview.energy.todayInfo')} value={mwh.value(todayKwh)} unit={mwh.unit}
          delta={{ value: -redToday, goodWhen: 'down', label: t('overview.energy.vsBaseline') }} />
        <KpiTile icon={CalendarDays} label={t('overview.energy.month')} info={t('overview.energy.monthInfo')} value={mwh.value(monthKwh)} unit={mwh.unit}
          delta={{ value: -redMonth, goodWhen: 'down', label: t('overview.energy.vsBaseline') }} />
        <KpiTile icon={TrendingDown} label={t('overview.energy.redToday')} info={t('overview.energy.redTodayInfo')} value={fmtNumber(redToday, 1)} unit="%"
          hint={t('overview.energy.avgClubs')} />
        <KpiTile icon={Percent} label={t('overview.energy.redMonth')} info={t('overview.energy.redMonthInfo')} value={fmtNumber(redMonth, 1)} unit="%"
          hint={t('overview.energy.ytd', { v: sarC(ytd) })} />
      </div>

      <div className="ov-grid-2">
        <Card title={<span className="ov-card-title">{t('overview.energy.whereTitle')}</span>} info={t('overview.energy.whereInfo')}>
          <HBarList ariaLabel={t('overview.energy.whereAria')} max={split[0].pct}
            items={split.map((s, i) => ({
              key: s.key,
              label: <span className="ov-hbars__name">{pick(s.en, s.ar)}</span>,
              value: s.pct,
              display: `${fmtNumber(s.pct)}%`,
              highlight: i === 0,
            }))} />
        </Card>
        <Card title={<span className="ov-card-title">{t('overview.energy.clubsTitle')}</span>} info={t('overview.energy.clubsInfo')}>
          <HBarList ariaLabel={t('overview.energy.clubsAria')}
            items={byMonth.map((r, i) => ({
              key: r.club.id,
              label: <span className="ov-hbars__name">{pick(r.club.nameEn, r.club.nameAr)}</span>,
              tag: i === 0 && byMonth.length > 1 ? <span className="ov-mark ov-mark--warn">{t('overview.ranking.highest')}</span> : undefined,
              value: r.energyMonthKwh,
              display: mwh.full(r.energyMonthKwh),
              highlight: i === 0,
              onClick: () => showCard(r.club.id),
              ariaLabel: `${pick(r.club.nameEn, r.club.nameAr)}: ${mwh.full(r.energyMonthKwh)}`,
            }))} />
        </Card>
      </div>
    </div>
  );
}
