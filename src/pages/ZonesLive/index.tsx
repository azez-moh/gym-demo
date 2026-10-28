import { useMemo } from 'react';
import { Badge, KpiTile, PageHeader, StatusBadge } from '../../components';
import { useI18n } from '../../i18n';
import { usePhase, useVision, zoneLabel, ZONE_DEFAULTS } from '../Cameras/vision/model';
import { readingAt } from '../Cameras/vision/scene';
import '../Cameras/vision/vision.css';
import '../Zones/zones.css';
import './zonesLive.css';

export default function ZonesLivePage() {
  const { t, pick, fmtNumber, fmtPercent, fmtTime } = useI18n();
  const v = useVision();
  // the watcher reports every 2 seconds
  const slot = usePhase(2000);

  const groups = useMemo(() => v.cameras.map((c) => ({
    camera: c,
    rows: (v.zonesByCam.get(c.id) ?? []).map((z) => {
      const base = v.live.zones[z.id] ?? { id: z.id, motionPct: 0, baselinePct: 0, active: false };
      const r = readingAt(base, slot);
      return { zone: z, reading: { ...r, active: r.active && z.watching } };
    }),
  })), [v.cameras, v.zonesByCam, v.live.zones, slot]);

  const onlineRows = groups.filter((g) => g.camera.online).flatMap((g) => g.rows);
  const inUse = onlineRows.filter((r) => r.reading.active).length;
  const peak = Math.max(0, ...onlineRows.map((r) => r.reading.motionPct));
  const offline = v.cameras.filter((c) => !c.online).length;

  return (
    <div className="page">
      <PageHeader title={t('zonesLive.title')} actions={<>
        <span className="vis-chip vis-chip--on"><span className="live-dot" aria-hidden />{t('zonesLive.liveEvery')}</span>
        <span className="faint zl__updated num">{t('zonesLive.updated', { time: fmtTime(v.live.nowMs) })}</span>
      </>} />
      <p className="vis-lede">{t('zonesLive.lede')}</p>

      <div className="vis-kpis">
        <KpiTile live label={t('zonesLive.kpi.inUse')} value={fmtNumber(inUse)} info={t('zonesLive.kpi.inUseInfo')} />
        <KpiTile live label={t('zonesLive.kpi.zones')} value={fmtNumber(onlineRows.length)} info={t('zonesLive.kpi.zonesInfo')} />
        <KpiTile live label={t('zonesLive.kpi.peak')} value={fmtPercent(peak, 1)} info={t('zonesLive.kpi.peakInfo')} />
        <KpiTile live label={t('zonesLive.kpi.offline')} value={fmtNumber(offline)} info={t('zonesLive.kpi.offlineInfo')} />
      </div>

      <div className="zg-list">
        {groups.map(({ camera: c, rows }) => {
          const name = pick(c.nameEn, c.nameAr);
          return (
            <section key={c.id} className="zg">
              <div className="zg__head">
                <div className="zl__camhead">
                  <span className="zg__title">{name}</span>
                  {c.online
                    ? <StatusBadge status="online" label={t('zonesLive.online', { fps: fmtNumber(c.fps) })} />
                    : <StatusBadge status="offline" label={t('zonesLive.offline')} />}
                </div>
              </div>
              {!rows.length ? (
                <div className="zg zg--empty"><span className="faint">{t('zonesLive.noZones')}</span></div>
              ) : !c.online ? (
                <div className="zg zg--empty"><span className="faint">{t('zonesLive.noReadings')}</span></div>
              ) : (
                <div className="dt"><div className="dt__scroll">
                  <table className="zg__table zl__table" aria-live="off">
                    <thead><tr>
                      <th><span className="dt__th">{t('zonesLive.col.zone')}</span></th>
                      <th><span className="dt__th">{t('zonesLive.col.state')}</span></th>
                      <th><span className="dt__th">{t('zonesLive.col.motion')}</span></th>
                      <th className="dt--end"><span className="dt__th">{t('zonesLive.col.baseline')}</span></th>
                    </tr></thead>
                    <tbody>
                      {rows.map(({ zone: z, reading: r }) => {
                        const m = v.machines.find((x) => x.id === z.machineId);
                        const thr = z.motionThreshold ?? ZONE_DEFAULTS.motionThreshold;
                        return (
                          <tr key={z.id} className={r.active ? 'zl__row--on' : ''}>
                            <td><span className="vis-name"><span>{zoneLabel(z, m, pick, t)}</span><span className="vis-code">{z.code}</span></span></td>
                            <td>{r.active ? <Badge tone="accent">{t('cameras.state.inUse')}</Badge> : <StatusBadge status="idle" label={t('cameras.state.idle')} />}</td>
                            <td>
                              <span className="vis-motion" title={r.motionPct >= thr ? t('zonesLive.aboveThreshold') : undefined}>
                                <span className={`vis-bar ${r.active ? 'is-on' : ''}`} aria-hidden>
                                  <span style={{ width: `${Math.min(100, r.motionPct * 2.5)}%` }} />
                                  <i className="zl__thr" style={{ insetInlineStart: `${Math.min(100, thr * 2.5)}%` }} />
                                </span>
                                <span className="num">{fmtPercent(r.motionPct, 1)}</span>
                              </span>
                            </td>
                            <td className="dt--end num">{r.baselinePct >= 0.5 ? fmtPercent(r.baselinePct, 1) : <span className="faint">–</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div></div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
