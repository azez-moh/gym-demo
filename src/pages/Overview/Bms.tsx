import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertOctagon, Building2, ChevronRight, ListChecks, ThermometerSun } from 'lucide-react';
import { Card, ChipGroup, EmptyState, KpiTile, StatusBadge } from '../../components';
import { useI18n } from '../../i18n';
import { useScope } from '../../layout/filters';
import { useDemo, type Level } from '../../data';
import { mean, sortAlerts, type ClubRow } from './metrics';

type LevelFilter = 'all' | Level;

/** BMS analysis (CV-09, CV-10). */
export function BmsSection({ rows, level, onLevel }: { rows: ClubRow[]; level: string | null; onLevel: (l: LevelFilter) => void }) {
  const { t, pick, fmtNumber, fmtAge, fmtClubs } = useI18n();
  const data = useDemo();
  const { setScope } = useScope();
  const navigate = useNavigate();
  const all = sortAlerts(rows.flatMap((r) => r.alerts));
  const nCrit = all.filter((a) => a.level === 'critical').length;
  const affected = rows.filter((r) => r.alerts.length > 0).length;
  const comfort = Math.round(mean(rows.map((r) => r.live?.comfortPct ?? 0)));
  const filter: LevelFilter = level === 'critical' || level === 'warning' || level === 'info' ? level : 'all';
  const list = filter === 'all' ? all : all.filter((a) => a.level === filter);
  const byId = new Map(rows.map((r) => [r.club.id, r.club]));
  const count = (l: Level) => all.filter((a) => a.level === l).length;

  const [params] = useSearchParams();
  const { pathname } = useLocation();
  const cp = new URLSearchParams(params); cp.set('section', 'bms'); cp.set('level', 'critical');
  const critLink = `${pathname}?${cp.toString()}`;
  const go = (clubId: string) => { setScope({ level: 'club', clubId }); navigate('/bms-overview'); };

  return (
    <div className="stack-lg">
      <div className="grid-kpi">
        <KpiTile icon={ListChecks} label={t('overview.bms.open')} info={t('overview.bms.openInfo')} value={fmtNumber(all.length)}
          hint={t('overview.bms.acrossClubs', { n: fmtClubs(rows.length) })} />
        <KpiTile icon={AlertOctagon} label={t('overview.bms.critical')} info={t('overview.bms.criticalInfo')} to={critLink}
          className={nCrit ? 'ov-kpi-alert is-crit' : ''}
          value={<span className={nCrit ? 'ov-crit' : ''}>{fmtNumber(nCrit)}</span>}
          hint={<span className={nCrit ? 'ov-crit-text' : ''}>{nCrit ? t('overview.bms.criticalSub') : t('overview.bms.criticalNone')}</span>} />
        <KpiTile icon={Building2} label={t('overview.bms.affected')} info={t('overview.bms.affectedInfo')}
          value={<>{fmtNumber(affected)}<span className="ov-of">/{fmtNumber(rows.length)}</span></>} />
        <KpiTile icon={ThermometerSun} label={t('overview.bms.comfort')} info={t('overview.bms.comfortInfo')} value={fmtNumber(comfort)} unit="%"
          hint={t('overview.bms.comfortSub')} />
      </div>

      <Card title={<span className="ov-card-title">{t('overview.bms.listTitle')}</span>} info={t('overview.bms.listInfo')}
        actions={(
          <ChipGroup ariaLabel={t('overview.bms.filter')} value={filter} onChange={onLevel} scroll
            options={[
              { value: 'all', label: t('overview.bms.all'), count: all.length },
              { value: 'critical', label: t('status.critical'), count: count('critical') },
              { value: 'warning', label: t('status.warning'), count: count('warning') },
              { value: 'info', label: t('status.info'), count: count('info') },
            ]} />
        )}>
        {list.length === 0
          ? <EmptyState title={t('overview.bms.empty')} body={t('overview.bms.emptyBody')} compact />
          : (
            <ul className="ov-alerts">
              {list.map((a) => {
                const c = byId.get(a.clubId);
                const cname = c ? pick(c.nameEn, c.nameAr) : '';
                return (
                  <li key={a.id}>
                    <button type="button" className="ov-alerts__row" onClick={() => go(a.clubId)} aria-label={`${t(`status.${a.level}`)}. ${pick(a.titleEn, a.titleAr)}. ${t('overview.bms.switchTo', { name: cname })}`}>
                      <span className="ov-alerts__lvl"><StatusBadge status={a.level} /></span>
                      <span className="ov-alerts__club">{cname}</span>
                      <span className="ov-alerts__text">
                        <span className="ov-alerts__title">{pick(a.titleEn, a.titleAr)}</span>
                        <span className="ov-alerts__meta">{pick(a.areaEn, a.areaAr)} · {t('overview.bms.openFor', { d: fmtAge((data.now.getTime() - a.sinceMs) / 1000) })}</span>
                      </span>
                      <ChevronRight aria-hidden className="ov-alerts__chev flip-rtl" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
      </Card>
    </div>
  );
}
