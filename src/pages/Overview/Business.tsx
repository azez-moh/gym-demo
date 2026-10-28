import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CalendarClock, Gauge, UserCheck, Users } from 'lucide-react';
import { Card, KpiTile } from '../../components';
import { useI18n } from '../../i18n';
import { useChartTokens } from '../../theme/theme';
import { useDemo, addDays, busiestHour, dateRange } from '../../data';
import { slotFullPct, SLOT_HOURS, mean, type ClubRow, type Period } from './metrics';
import { HBarList, useFmtHour } from './shared';
import { peopleInAt, peopleTodayAt } from '../../data/dynamics';

/** Business insights (CV-03, CV-04, CV-05). */
export function BusinessSection({ rows, period }: { rows: ClubRow[]; period: Period }) {
  const { t, pick, fmtNumber, fmtDate } = useI18n();
  const data = useDemo();
  const navigate = useNavigate();
  const fmtHour = useFmtHour();
  const clubs = rows.map((r) => r.club);
  const today = data.live.date;
  const ms = data.live.nowMs;

  const peopleNow = rows.reduce((a, r) => a + r.peopleIn, 0);
  const peopleToday = rows.reduce((a, r) => a + r.peopleToday, 0);
  // typical same weekday: average of the last 4 same weekdays at the same time
  const typicalNow = mean([1, 2, 3, 4].map((k) => clubs.reduce((a, c) => a + (peopleInAt(c, ms - k * 7 * 86_400_000)), 0)));
  const typicalToday = mean([1, 2, 3, 4].map((k) => clubs.reduce((a, c) => a + peopleTodayAt(c, ms - k * 7 * 86_400_000), 0)));
  const nowLive = rows.map((r) => r.live?.machineUsagePct ?? 0);
  const avgUsage = Math.round(mean(period === 'now' ? nowLive : rows.map((r) => r.machinePct)));
  const bh = busiestHour(clubs, today);
  const slotStart = bh % 2 === 0 ? bh : bh - 1;
  const dayName = fmtDate(new Date(Date.UTC(2026, 0, 4 + new Date(`${today}T12:00:00Z`).getUTCDay(), 12)), 'weekdayLong');

  // heatmap: two-hour slots, today or 7-day average
  const dates = period === 'week' ? dateRange(addDays(today, -6), today) : [today];
  const heat = rows.map((r) => ({
    club: r.club,
    values: SLOT_HOURS.map((h) => Math.round(mean(dates.map((d) => slotFullPct(r.club, d, h))))),
  }));
  let best = { club: '', h: 0, v: -1 };
  for (const row of heat) row.values.forEach((v, i) => { if (v > best.v) best = { club: pick(row.club.nameEn, row.club.nameAr), h: SLOT_HOURS[i], v }; });

  const usageTitle = period === 'now' ? t('overview.business.usageTitle') : period === 'today' ? t('overview.business.usageTitleToday') : t('overview.business.usageTitleWeek');
  const usage = [...rows].sort((a, b) => b.machinePct - a.machinePct || a.club.nameEn.localeCompare(b.club.nameEn));
  const showCard = (id: string) => navigate(`/branches?club=${encodeURIComponent(id)}`);

  return (
    <div className="stack-lg">
      <div className="grid-kpi">
        <KpiTile icon={Users} live={period === 'now'} label={t('overview.business.peopleNow')} info={t('overview.business.peopleNowInfo')} value={fmtNumber(peopleNow)}
          delta={{ value: typicalNow ? ((peopleNow - typicalNow) / typicalNow) * 100 : 0, label: t('overview.business.vsTypical', { day: dayName }) }} />
        <KpiTile icon={UserCheck} label={t('overview.business.peopleToday')} info={t('overview.business.peopleTodayInfo')} value={fmtNumber(peopleToday)}
          delta={{ value: typicalToday ? ((peopleToday - typicalToday) / typicalToday) * 100 : 0, label: t('overview.business.vsTypical', { day: dayName }) }} />
        <KpiTile icon={Gauge} live={period === 'now'} label={t('overview.business.avgUsage')} info={t('overview.business.avgUsageInfo')} value={fmtNumber(avgUsage)} unit="%" />
        <KpiTile icon={CalendarClock} label={t('overview.business.busiest')} info={t('overview.business.busiestInfo')}
          value={<span className="ov-slot">{fmtHour(slotStart)} – {fmtHour(slotStart + 2)}</span>} hint={t('overview.business.busiestSub')} />
      </div>
      <div className="ov-grid-2">
        <Card title={<span className="ov-card-title">{period === 'week' ? t('overview.business.heatTitleWeek') : t('overview.business.heatTitle')}</span>} info={t('overview.business.heatInfo')}>
          <BusyHeat rows={heat.map((h) => ({ id: h.club.id, name: pick(h.club.nameEn, h.club.nameAr), values: h.values }))}
            cols={SLOT_HOURS.map(fmtHour)} onRow={showCard}
            ariaLabel={t('overview.business.heatAria', { club: best.club, hour: fmtHour(best.h) })} />
        </Card>
        <Card live={period === 'now'} title={<span className="ov-card-title">{usageTitle}</span>} info={t('overview.business.usageInfo')}>
          <HBarList ariaLabel={t('overview.business.usageAria')} max={100}
            items={usage.map((r, i) => ({
              key: r.club.id,
              label: <span className="ov-hbars__name">{pick(r.club.nameEn, r.club.nameAr)}</span>,
              value: r.machinePct,
              display: `${fmtNumber(r.machinePct)}%`,
              highlight: i === 0,
              onClick: () => showCard(r.club.id),
              ariaLabel: `${pick(r.club.nameEn, r.club.nameAr)}: ${fmtNumber(r.machinePct)}%`,
            }))} />
        </Card>
      </div>
    </div>
  );
}


/** Busy heatmap: club rows by two-hour slot, sequential yellow ramp, tooltip "Club · 6 PM · 92% of capacity". */
function BusyHeat({ rows, cols, onRow, ariaLabel }: {
  rows: { id: string; name: string; values: number[] }[]; cols: string[]; onRow: (id: string) => void; ariaLabel: string;
}) {
  const ct = useChartTokens();
  const { t, fmtNumber } = useI18n();
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const hi = Math.max(1, ...rows.flatMap((r) => r.values));
  const colour = (v: number) => ct.seq[Math.min(ct.seq.length - 1, Math.round((v / hi) * (ct.seq.length - 1)))];
  const text = (r: { name: string }, i: number, v: number) => `${r.name} · ${cols[i]} · ${fmtNumber(v)}%`;
  return (
    <div className="heatmap ov-heat" role="figure" aria-label={ariaLabel}>
      <div className="heatmap__scroll">
        <div className="heatmap__grid ov-heat__grid" style={{ gridTemplateColumns: `minmax(150px, max-content) repeat(${cols.length}, minmax(30px, 1fr))` }}>
          <span />
          {cols.map((c, i) => <span key={i} className="heatmap__collabel num">{c}</span>)}
          {rows.map((r) => [
            <button key={`${r.id}:l`} type="button" className="heatmap__rowlabel ov-heat__row" onClick={() => onRow(r.id)}>
              <span className="ov-heat__rowname">{r.name}</span>
            </button>,
            ...r.values.map((v, i) => (
              <button key={`${r.id}:${i}`} type="button" className="heatmap__cell" style={{ background: colour(v) }} aria-label={text(r, i, v)}
                onClick={() => onRow(r.id)}
                onMouseEnter={(e) => { const b = e.currentTarget.getBoundingClientRect(); setTip({ x: b.left + b.width / 2, y: b.top, text: text(r, i, v) }); }}
                onFocus={(e) => { const b = e.currentTarget.getBoundingClientRect(); setTip({ x: b.left + b.width / 2, y: b.top, text: text(r, i, v) }); }}
                onMouseLeave={() => setTip(null)} onBlur={() => setTip(null)} />
            )),
          ])}
        </div>
      </div>
      <div className="heatmap__legend">
        <span>{t('overview.business.quiet')}</span>
        <span className="heatmap__ramp">{ct.seq.map((c) => <span key={c} style={{ background: c }} />)}</span>
        <span>{t('overview.business.busy')}</span>
      </div>
      {tip && createPortal(<div className="heatmap__float viz-tip" style={{ left: tip.x, top: tip.y - 8, transform: 'translate(-50%, -100%)' }}>{tip.text}</div>, document.body)}
    </div>
  );
}
