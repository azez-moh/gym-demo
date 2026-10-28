import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, RefreshCw, ScanEye } from 'lucide-react';
import { Badge, Button, KpiTile, PageHeader, StatusBadge } from '../../components';
import { useI18n } from '../../i18n';
import { useVision, zoneLabel, type VZone } from '../Cameras/vision/model';
import '../Cameras/vision/vision.css';
import './zones.css';

export default function ZonesPage() {
  const { t, pick, fmtNumber } = useI18n();
  const v = useVision();
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [stamp, setStamp] = useState(0);

  const refresh = () => {
    setLoading(true);
    window.setTimeout(() => { setLoading(false); setStamp((s) => s + 1); }, 450);
  };

  const groups = useMemo(() => v.cameras.map((c) => ({ camera: c, zones: v.zonesByCam.get(c.id) ?? [] })), [v.cameras, v.zonesByCam, stamp]); // eslint-disable-line react-hooks/exhaustive-deps
  const watchedMachines = new Set(v.zones.map((z) => z.machineId)).size;
  const camsWithZones = groups.filter((g) => g.zones.length).length;
  const paused = v.zones.filter((z) => !z.watching).length;
  const allOpen = closed.size === 0;

  const baselineText = (z: VZone) => (z.baseline === 'auto' ? t('zones.baselineAuto') : z.baseline === 'captured' ? t('zones.baselineCaptured') : t('zones.baselineNone'));
  const toggle = (id: string) => setClosed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="page">
      <PageHeader title={t('zones.title')} actions={<>
        <Button onClick={() => setClosed(allOpen ? new Set(groups.filter((g) => g.zones.length).map((g) => g.camera.id)) : new Set())}>
          {allOpen ? t('zones.collapseAll') : t('zones.expandAll')}
        </Button>
        <Button icon={RefreshCw} onClick={refresh} disabled={loading} aria-busy={loading}>{t('zones.refresh')}</Button>
      </>} />
      <p className="vis-lede">{t('zones.lede')}</p>

      <div className="vis-kpis">
        <KpiTile label={t('zones.kpi.zones')} value={fmtNumber(v.zones.length)} info={t('zones.kpi.zonesInfo')} />
        <KpiTile label={t('zones.kpi.machines')} value={fmtNumber(watchedMachines)} info={t('zones.kpi.machinesInfo')} />
        <KpiTile label={t('zones.kpi.cameras')} value={`${fmtNumber(camsWithZones)} / ${fmtNumber(v.cameras.length)}`} info={t('zones.kpi.camerasInfo')} />
        <KpiTile label={t('zones.kpi.paused')} value={fmtNumber(paused)} info={t('zones.kpi.pausedInfo')} />
      </div>

      <div className={`zg-list ${loading ? 'is-loading' : ''}`}>
        {groups.map(({ camera: c, zones }) => {
          const name = pick(c.nameEn, c.nameAr);
          if (!zones.length) {
            return (
              <div key={c.id} className="zg zg--empty">
                <span className="zg__title">{name}</span>
                <span className="faint">{t('zones.noZones')}</span>
              </div>
            );
          }
          const isOpen = !closed.has(c.id);
          return (
            <section key={c.id} className="zg">
              <div className="zg__head">
                <button type="button" className="zg__toggle" aria-expanded={isOpen} onClick={() => toggle(c.id)}>
                  <ChevronDown aria-hidden className={`zg__chev ${isOpen ? 'is-open' : ''}`} />
                  <span className="zg__title">{name}</span>
                  <Badge>{zones.length === 1 ? t('zones.zoneCount1') : t('zones.zonesCount', { n: fmtNumber(zones.length) })}</Badge>
                  {!c.online && <StatusBadge status="offline" label={t('cameras.status.offline')} />}
                </button>
                <Link to={`/monitor?camera=${encodeURIComponent(c.id)}`} className="btn btn--sm btn--ghost"><ScanEye aria-hidden />{t('zones.openMonitor')}</Link>
              </div>
              {isOpen && (
                <div className="dt"><div className="dt__scroll">
                  <table className="zg__table">
                    <thead><tr>
                      <th><span className="dt__th">{t('zones.col.zone')}</span></th>
                      <th><span className="dt__th">{t('zones.col.machine')}</span></th>
                      <th><span className="dt__th">{t('zones.col.mode')}</span></th>
                      <th><span className="dt__th">{t('zones.col.baseline')}</span></th>
                      <th className="dt--end"><span className="dt__th">{t('zones.col.watching')}</span></th>
                    </tr></thead>
                    <tbody>
                      {zones.map((z) => {
                        const m = v.machines.find((x) => x.id === z.machineId);
                        return (
                          <tr key={z.id}>
                            <td><span className="vis-name"><span>{zoneLabel(z, m, pick, t)}</span><span className="vis-code">{z.code}</span></span></td>
                            <td>{m ? pick(m.nameEn, m.nameAr) : ''}</td>
                            <td>{t('zones.modeMotion')}</td>
                            <td className={z.baseline && z.baseline !== 'none' ? '' : 'faint'}>{baselineText(z)}</td>
                            <td className="dt--end">{z.watching ? <Badge tone="success">{t('zones.watching')}</Badge> : <Badge>{t('zones.paused')}</Badge>}</td>
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
