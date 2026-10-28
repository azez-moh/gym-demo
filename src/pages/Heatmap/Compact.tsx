import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Layers } from 'lucide-react';
import { Card, EmptyState } from '../../components';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme/theme';
import { useDemo, type Club } from '../../data';
import { floorPlanOf, liveOccupancy, type PlanArea } from '../../data/floors';
import { PlanSvg } from './PlanSvg';
import { heatColor, legendGradient } from './scale';
import { crowdRatio } from '../../data/branchConfig';
import { usePeopleText } from './people';
import './heatmap.css';

/**
 * Compact crowd heatmap for the Overview pages: both floors small, side by side, same colours as the
 * Crowd heatmap page, names on hover, the two busiest areas and a link to /heatmap.
 * Gyms without a floor plan show "Floor plan not loaded yet".
 */
export function CrowdHeatmapCard({ club, title, className = '' }: { club: Club; title?: string; className?: string }) {
  const { t, pick, fmtNumber, isRtl } = useI18n();
  const { theme } = useTheme();
  const data = useDemo();
  const ppl = usePeopleText();
  const plan = floorPlanOf(club.id);
  const occList = useMemo(() => (plan ? liveOccupancy(data, club.id) : []), [data, club.id, plan]);
  const occ = useMemo(() => new Map(occList.map((a) => [a.areaId, a])), [occList]);
  const top = [...occList].sort((a, b) => b.ratio - a.ratio || b.people - a.people).slice(0, 2);
  const hotPct = Math.round(crowdRatio(club.id) * 100);
  const heading = <span className="ov-card-title">{title ?? t('heatmap.card.title')}</span>;

  if (!plan) {
    return (
      <Card title={heading} info={t('heatmap.card.info')} className={`hmc ${className}`.trim()}>
        <EmptyState compact icon={Layers} title={t('heatmap.empty.title')} body={t('heatmap.empty.body', { gym: pick(club.nameEn, club.nameAr) })} />
      </Card>
    );
  }

  const tip = (a: PlanArea) => {
    const o = occ.get(`${plan.clubId}:${a.key}`);
    if (!a.monitored || !o) return <strong>{pick(a.nameEn, a.nameAr)}</strong>;
    return (
      <>
        <strong>{pick(a.nameEn, a.nameAr)}</strong>
        <span>{fmtNumber(Math.round(o.ratio * 100))}% · {ppl(o.people)}</span>
      </>
    );
  };

  return (
    <Card title={heading} info={t('heatmap.card.info')} live className={`hmc ${className}`.trim()}>
      <div className="hmc__body">
        <div className="hmc__plans">
          <PlanSvg compact plan={plan} floors={plan.floors} occ={occ} theme={theme} tooltip={tip} />
        </div>
        <div className="hmc__side">
          <span className="hmc__label">{t('heatmap.card.busiest')}</span>
          <ul className="hmc__list">
            {top.map((a) => (
              <li key={a.areaId}>
                <span className="hm-row__sw" style={{ background: heatColor(a.ratio, theme) }} />
                <span className="hm-row__name">
                  <span>{pick(a.area.nameEn, a.area.nameAr)}</span>
                  <span className="hm-row__sub">{t('heatmap.area.peopleOf', { n: fmtNumber(a.people), cap: fmtNumber(a.area.capacity) })}</span>
                </span>
                <span className={`num hm-row__pct ${a.ratio * 100 > hotPct ? 'is-hot' : ''}`}>{fmtNumber(Math.round(a.ratio * 100))}%</span>
              </li>
            ))}
          </ul>
          <span className="hmc__label">{t('heatmap.legend.title')}</span>
          <span className="hmc__legend">
            <span className="hm-legend__bar" style={{ background: legendGradient(theme, isRtl ? 'to left' : 'to right') }} />
            <span className="hm-legend__ticks num hm-legend__ticks--c">
              <span style={{ insetInlineStart: '0%' }}>0%</span>
              <span className="hmc__hot" style={{ insetInlineStart: `${Math.min(100, hotPct)}%` }}>{fmtNumber(hotPct)}%</span>
            </span>
          </span>
          <div className="hmc__foot">
            <Link to="/heatmap" className="btn btn--sm">{t('heatmap.card.open')}<ArrowRight aria-hidden className="flip-rtl" /></Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
