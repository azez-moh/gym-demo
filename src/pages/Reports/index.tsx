import { Fragment, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Card, EmptyState, InfoTip, PageHeader } from '../../components';
import { useI18n } from '../../i18n';
import { useAccess } from '../../layout/access';
import type { MachineRow } from '../../data';
import { ExpandButton, StatePill, TodayPanel, useTypeLabel } from '../Machines/shared/parts';
import { useParam, useVisionClub } from '../Machines/shared/club';
import '../Machines/shared/machines.css';
import { CapacityCard } from './Capacity';

/**
 * Reports: one row per machine with its current state (MR-20, MR-21). Rows are keyed by machine id, so a
 * source that sends several records for one machine still shows it once, with the latest state.
 */
export default function ReportsPage() {
  const { t, pick, fmtNumber, fmtTime } = useI18n();
  const { d, club, rows: liveRows } = useVisionClub();
  const { cameras: showCameras } = useAccess();
  const typeLabel = useTypeLabel();
  // Refresh takes a snapshot so the header and all rows always change together.
  const [refreshedAt, setRefreshedAt] = useState(() => d.now.getTime());
  const [snapTick, setSnapTick] = useState(0);
  const [openParam, setOpenParam] = useParam('open', '');
  const open = useMemo(() => new Set(openParam ? openParam.split(',') : []), [openParam]);
  const toggle = (id: string) => {
    const n = new Set(open);
    if (n.has(id)) n.delete(id); else n.add(id);
    setOpenParam(n.size ? [...n].join(',') : null);
  };

  const rows = useMemo(() => {
    const byId = new Map<string, MachineRow>();
    for (const m of liveRows) byId.set(m.id, m); // latest record wins
    return [...byId.values()].sort((a, b) => a.type.localeCompare(b.type) || a.num - b.num);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRows, snapTick]);
  const inUse = rows.filter((m) => m.live.state === 'inUse').length;
  const zones = useMemo(() => new Map(d.zones.map((z) => [z.id, z])), [d.zones]);
  const cams = useMemo(() => new Map(d.cameras.map((c) => [c.id, c])), [d.cameras]);

  const refresh = () => { setRefreshedAt(d.now.getTime()); setSnapTick((n) => n + 1); };
  const shownAt = Math.max(refreshedAt, d.now.getTime());

  return (
    <div className="page">
      <PageHeader title={t('reports.title')} actions={<>
        <span className="mr-headchip"><strong className="num">{t('machines.count', { n: fmtNumber(rows.length) })}</strong><span className="mr-headchip__sep" />{t('machines.inUseN', { n: fmtNumber(inUse) })}</span>
        <Button icon={RefreshCw} onClick={refresh}>{t('reports.refresh')}</Button>
      </>} />
      <div className="row-between">
        <p className="mr-intro">{t('reports.intro')}</p>
        <span className="mr-refreshed">{t('reports.refreshedAt', { time: fmtTime(shownAt) })}<InfoTip text={t('reports.liveInfo')} /></span>
      </div>

      <CapacityCard />

      <Card pad="md" title={pick(club.nameEn, club.nameAr)} info={t('reports.tableInfo')}>
        {rows.length === 0 ? <EmptyState title={t('machines.empty')} /> : (
          <div className="dt mr-tablewrap">
            <div className="dt__scroll">
              <table>
                <caption className="visually-hidden">{t('reports.title')}</caption>
                <thead>
                  <tr>
                    <th><span className="dt__th">{t('machines.col.machine')}</span></th>
                    <th><span className="dt__th">{t('machines.col.type')}</span></th>
                    <th><span className="dt__th">{t('reports.col.state')}</span></th>
                    <th className="dt--hide-sm"><span className="dt__th">{t('reports.col.rule')}<InfoTip text={t('machines.logicInfo')} /></span></th>
                    <th className="dt--hide-sm"><span className="dt__th">{t('reports.col.zones')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => {
                    const isOpen = open.has(m.id);
                    const name = pick(m.nameEn, m.nameAr);
                    const camNames = [...new Set(m.zoneIds.map((z) => zones.get(z)?.cameraId).filter(Boolean) as string[])].map((c) => cams.get(c)).filter(Boolean);
                    return (
                      <Fragment key={m.id}>
                        <tr data-click="true" aria-expanded={isOpen} onClick={() => toggle(m.id)} className={m.live.state === 'inUse' ? 'is-highlight' : undefined}>
                          <td>
                            <span className="mr-machinecell">
                              <ExpandButton open={isOpen} onToggle={() => toggle(m.id)} label={t('machines.expandRow', { name })} />
                              <span className="mr-machinecell__text">
                                <span>{name}</span>
                              </span>
                            </span>
                          </td>
                          <td>{typeLabel(m.type)}</td>
                          <td><StatePill state={m.live.state} /></td>
                          <td className="dt--hide-sm mr-muted-cell">{t(`machines.logic.${m.rule}`)}</td>
                          <td className="dt--hide-sm">
                            <span className="num">{m.zoneIds.length === 1 ? t('reports.zonesN1') : m.zoneIds.length === 2 ? t('reports.zonesN2') : t('reports.zonesN', { n: fmtNumber(m.zoneIds.length) })}</span>
                            <span className="mr-sub">{showCameras
                              ? camNames.map((c) => pick(c!.nameEn, c!.nameAr)).join(' · ')
                              : (camNames.every((c) => c!.online) ? t('access.cameraOnline') : t('access.cameraOffline'))}</span>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="dt__expanded"><td colSpan={5}><TodayPanel machine={m} club={club} from="" /></td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
