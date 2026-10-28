import { Fragment, useMemo, useState } from 'react';
import { Cpu, Activity, Gauge, Timer, TrendingUp, TrendingDown, MinusCircle } from 'lucide-react';
import { Card, EmptyState, InfoTip, KpiTile, PageHeader, Tabs } from '../../components';
import { useI18n } from '../../i18n';
import { machinesByType, openMinutes, type MachineRow, type MachineType } from '../../data';
import { useAccess } from '../../layout/access';
import { ExpandButton, FillBar, RenameCell, StatePill, TodayPanel, useTypeLabel } from './shared/parts';
import { useParam, useVisionClub } from './shared/club';
import { nowMinute } from './shared/usage';
import './shared/machines.css';

type Tab = 'machine' | 'type';

export default function MachinesPage() {
  const { t, pick, fmtNumber, fmtDuration } = useI18n();
  const { d, club, rows } = useVisionClub();
  const { cameras: showCameras } = useAccess();
  const typeLabel = useTypeLabel();
  const [tab, setTab] = useParam('tab', 'machine');
  const [openParam, setOpenParam] = useParam('open', '');
  const [inUseFirst, setInUseFirst] = useParam('inuse', '0');
  const [openTypes, setOpenTypes] = useState<Set<string>>(new Set());
  const open = useMemo(() => new Set(openParam ? openParam.split(',') : []), [openParam]);
  const toggle = (id: string) => {
    const n = new Set(open);
    if (n.has(id)) n.delete(id); else n.add(id);
    setOpenParam(n.size ? [...n].join(',') : null);
  };

  const cams = useMemo(() => new Map(d.cameras.map((c) => [c.id, c])), [d.cameras]);
  const zones = useMemo(() => new Map(d.zones.map((z) => [z.id, z])), [d.zones]);
  const types = useMemo(() => machinesByType(d, club.id).filter((r) => rows.some((m) => m.type === r.type)), [d, club.id, rows]);
  const inUse = rows.filter((m) => m.live.state === 'inUse').length;
  const sessions = rows.reduce((a, m) => a + m.live.sessionsToday, 0);
  const openMin = useMemo(() => openMinutes(club, d.live.date, nowMinute(d)), [club, d]);
  const usedMin = rows.reduce((a, m) => a + m.live.usedMinToday, 0);
  const util = openMin * rows.length ? (usedMin / (openMin * rows.length)) * 100 : 0;

  const sorted = useMemo(() => {
    const base = [...rows].sort((a, b) => a.type.localeCompare(b.type) || a.num - b.num);
    if (inUseFirst !== '1') return base;
    const rank = (m: MachineRow) => (m.live.state === 'inUse' ? 0 : m.live.state === 'cooling' ? 1 : 2);
    return base.sort((a, b) => rank(a) - rank(b));
  }, [rows, inUseFirst]);

  // COO equipment view: families by utilisation today, and the least used machines
  const famUtil = useMemo(() => types.map((r) => ({
    type: r.type, pct: openMin * r.machines ? (r.usedMinToday / (openMin * r.machines)) * 100 : 0,
  })).sort((a, b) => b.pct - a.pct), [types, openMin]);
  const rare = useMemo(() => [...rows].sort((a, b) => a.live.usedMinToday - b.live.usedMinToday || a.live.sessionsToday - b.live.sessionsToday).slice(0, 4), [rows]);

  const zoneChips = (m: MachineRow) => {
    if (!m.zoneIds.length) return <span className="faint">{t('machines.noZones')}</span>;
    return (
      <span className="mr-zones">
        {m.zoneIds.map((id) => {
          const z = zones.get(id);
          if (!z) return null;
          const cam = cams.get(z.cameraId);
          return (
            <span key={id} className="mr-zone">
              <span>{t('machines.zone', { n: z.n })}</span>
              {cam && <span className="mr-zone__cam">{showCameras ? pick(cam.nameEn, cam.nameAr) : t(cam.online ? 'access.cameraOnline' : 'access.cameraOffline')}</span>}
            </span>
          );
        })}
      </span>
    );
  };

  return (
    <div className="page">
      <PageHeader title={t('machines.title')} actions={
        <span className="mr-headchip"><strong className="num">{t('machines.count', { n: fmtNumber(rows.length) })}</strong><span className="mr-headchip__sep" />{t('machines.inUseN', { n: fmtNumber(inUse) })}</span>
      } />
      <p className="mr-intro">{t('machines.intro')}</p>

      <div className="grid-kpi">
        <KpiTile label={t('machines.kpi.machines')} icon={Cpu} value={fmtNumber(rows.length)} info={t('machines.kpi.machinesInfo')} hint={pick(club.nameEn, club.nameAr)} />
        <KpiTile live label={t('machines.kpi.inUse')} icon={Activity} value={fmtNumber(inUse)} info={t('machines.kpi.inUseInfo')} hint={t('machines.kpi.ofMachines', { n: fmtNumber(rows.length) })} />
        <KpiTile label={t('machines.kpi.sessions')} icon={Timer} value={fmtNumber(sessions)} info={t('machines.kpi.sessionsInfo')} hint={t('machines.kpi.inOpen')} />
        <KpiTile label={t('machines.kpi.util')} icon={Gauge} value={`${fmtNumber(util, 1)}%`} info={t('machines.kpi.utilInfo')} hint={fmtDuration(usedMin * 60)} />
      </div>

      {rows.length > 0 && (
        <Card title={t('machines.hl.title')} info={t('machines.hl.info')} pad="md">
          <div className="mr-highlights">
            <div className="mr-hl">
              <div className="mr-hl__head"><TrendingUp aria-hidden />{t('machines.hl.hardest')}<span className="mr-small faint">·</span><TrendingDown aria-hidden />{t('machines.hl.quietest')}</div>
              <ul className="mr-hl__list">
                {famUtil.map((f, i) => (
                  <li key={f.type} className="mr-hl__item">
                    <span className="mr-hl__name">{typeLabel(f.type)}</span>
                    <FillBar n={f.pct} of={Math.max(1, famUtil[0]?.pct ?? 1)} tone={i === 0 ? 'accent' : 'muted'} text={`${fmtNumber(f.pct, 1)}%`} />
                  </li>
                ))}
              </ul>
            </div>
            <div className="mr-hl">
              <div className="mr-hl__head"><MinusCircle aria-hidden />{t('machines.hl.rare')}<InfoTip text={t('machines.hl.rareInfo')} /></div>
              <ul className="mr-hl__list">
                {rare.map((m) => (
                  <li key={m.id} className="mr-hl__item">
                    <button type="button" className="btn btn--link mr-hl__name" style={{ justifyContent: 'flex-start', padding: 0 }}
                      onClick={() => { setTab('machine'); if (!open.has(m.id)) toggle(m.id); window.setTimeout(() => document.getElementById(`mr-row-${m.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50); }}>
                      {pick(m.nameEn, m.nameAr)}
                    </button>
                    <span className="mr-hl__val num">{m.live.sessionsToday === 1 ? t('machines.hl.sessions1') : m.live.sessionsToday === 2 ? t('machines.hl.sessions2') : t('machines.hl.sessions', { n: fmtNumber(m.live.sessionsToday) })} · {fmtDuration(m.live.usedMinToday * 60)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <Card pad="md">
        <div className="stack">
          <div className="row-between">
            <Tabs<Tab> ariaLabel={t('machines.tabs.aria')} value={tab as Tab} onChange={(v) => setTab(v)}
              tabs={[{ id: 'machine', label: t('machines.tabs.byMachine'), count: rows.length }, { id: 'type', label: t('machines.tabs.byType'), count: types.length }]} />
            {tab === 'machine' ? (
              <label className="mr-check">
                <input type="checkbox" checked={inUseFirst === '1'} onChange={(e) => setInUseFirst(e.target.checked ? '1' : '0')} />
                {t('machines.inUseFirst')}
              </label>
            ) : <span className="muted mr-small">{t('machines.typesNote', { n: fmtNumber(types.length) })}</span>}
          </div>

          {rows.length === 0 ? <EmptyState title={t('machines.empty')} /> : tab === 'machine' ? (
            <div className="dt mr-tablewrap">
              <div className="dt__scroll">
                <table>
                  <caption className="visually-hidden">{t('machines.tabs.byMachine')}</caption>
                  <thead>
                    <tr>
                      <th><span className="dt__th">{t('machines.col.machine')}</span></th>
                      <th><span className="dt__th">{t('machines.col.type')}</span></th>
                      <th className="dt--hide-sm"><span className="dt__th">{t('machines.col.monitoredBy')}</span></th>
                      <th className="dt--hide-sm"><span className="dt__th">{t('machines.col.logic')}<InfoTip text={t('machines.logicInfo')} /></span></th>
                      <th><span className="dt__th">{t('machines.col.status')}</span></th>
                      <th className="dt--end"><span className="dt__th">{t('machines.col.sessions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((m) => {
                      const isOpen = open.has(m.id);
                      const name = pick(m.nameEn, m.nameAr);
                      return (
                        <Fragment key={m.id}>
                          <tr id={`mr-row-${m.id}`} data-click="true" aria-expanded={isOpen} className={m.live.state === 'inUse' ? 'is-highlight' : undefined}
                            onClick={() => toggle(m.id)}>
                            <td>
                              <span className="mr-machinecell">
                                <ExpandButton open={isOpen} onToggle={() => toggle(m.id)} label={t('machines.expandRow', { name })} />
                                <span className="mr-machinecell__text">
                                  <RenameCell machine={m} />
                                  <span className="mr-sub ltr">{m.id.split(':').pop()}</span>
                                </span>
                              </span>
                            </td>
                            <td>{typeLabel(m.type)}</td>
                            <td className="dt--hide-sm">{zoneChips(m)}</td>
                            <td className="dt--hide-sm mr-muted-cell">{t(`machines.logic.${m.rule}`)}</td>
                            <td><StatePill state={m.live.state} /></td>
                            <td className="dt--end num">{fmtNumber(m.live.sessionsToday)}</td>
                          </tr>
                          {isOpen && (
                            <tr className="dt__expanded">
                              <td colSpan={6}><TodayPanel machine={m} club={club} from="" /></td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="dt mr-tablewrap">
              <div className="dt__scroll">
                <table>
                  <caption className="visually-hidden">{t('machines.tabs.byType')}</caption>
                  <thead>
                    <tr>
                      <th><span className="dt__th">{t('machines.col.type')}</span></th>
                      <th className="dt--end"><span className="dt__th">{t('machines.col.machines')}</span></th>
                      <th><span className="dt__th">{t('machines.col.inUseNow')}</span></th>
                      <th className="dt--end"><span className="dt__th">{t('machines.col.sessionsToday')}</span></th>
                      <th className="dt--end dt--hide-sm"><span className="dt__th">{t('machines.col.usedToday')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((r) => {
                      const isOpen = openTypes.has(r.type);
                      const tog = () => setOpenTypes((s) => { const n = new Set(s); if (n.has(r.type)) n.delete(r.type); else n.add(r.type); return n; });
                      const members = rows.filter((m) => m.type === r.type).sort((a, b) => a.num - b.num);
                      return (
                        <Fragment key={r.type}>
                          <tr data-click="true" aria-expanded={isOpen} onClick={tog}>
                            <td>
                              <span className="mr-machinecell">
                                <ExpandButton open={isOpen} onToggle={tog} label={t('machines.expandType', { name: typeLabel(r.type) })} />
                                <span>{typeLabel(r.type as MachineType)}</span>
                              </span>
                            </td>
                            <td className="dt--end num">{fmtNumber(r.machines)}</td>
                            <td><FillBar n={r.inUse} of={r.machines} text={t('machines.ofInUse', { n: fmtNumber(r.inUse), m: fmtNumber(r.machines) })} /></td>
                            <td className="dt--end num">{fmtNumber(r.sessionsToday)}</td>
                            <td className="dt--end num dt--hide-sm">{fmtDuration(r.usedMinToday * 60)}</td>
                          </tr>
                          {isOpen && members.map((m) => (
                            <tr key={m.id} className="dt__expanded">
                              <td><span style={{ paddingInlineStart: 34, display: 'inline-block' }}>{pick(m.nameEn, m.nameAr)}</span></td>
                              <td className="dt--end" />
                              <td><StatePill state={m.live.state} /></td>
                              <td className="dt--end num">{fmtNumber(m.live.sessionsToday)}</td>
                              <td className="dt--end num dt--hide-sm">{fmtDuration(m.live.usedMinToday * 60)}</td>
                            </tr>
                          ))}
                        </Fragment>
                      );
                    })}
                    <tr>
                      <td><strong style={{ fontWeight: 400 }}>{t('common.total')}</strong></td>
                      <td className="dt--end num">{fmtNumber(types.reduce((a, r) => a + r.machines, 0))}</td>
                      <td><FillBar n={inUse} of={rows.length} text={t('machines.ofInUse', { n: fmtNumber(inUse), m: fmtNumber(rows.length) })} /></td>
                      <td className="dt--end num">{fmtNumber(sessions)}</td>
                      <td className="dt--end num dt--hide-sm">{fmtDuration(usedMin * 60)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
