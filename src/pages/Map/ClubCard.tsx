import { forwardRef, useEffect, type ReactNode } from 'react';
import { ArrowRight, Building2, Cpu, Ruler, X, type LucideIcon } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useDemo } from '../../data';
import { LIVE_CLUB_ID } from '../../data/clubs';
import type { Club } from '../../data/types';

function FactGroup({ icon: Icon, title, rows }: { icon: LucideIcon; title: string; rows: [string, ReactNode][] }) {
  return (
    <section className="mapcard__group">
      <h3 className="mapcard__group-h"><Icon aria-hidden />{title}</h3>
      <dl className="mapcard__rows">
        {rows.map(([k, v]) => (
          <div key={k} className="mapcard__row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** AC units reachable through the club's BACnet connector (largest connector), from live config. */
function acConnected(integrations: { clubId: string; kind: string; coversOf: number }[], clubId: string): number | null {
  const list = integrations.filter((i) => i.clubId === clubId && i.kind === 'bacnet');
  return list.length ? Math.max(...list.map((i) => i.coversOf)) : null;
}

/**
 * Club fact card: facts only (no KPI, trend or status chip). "Open club" sets the branch context to this
 * club and opens its pages; a club not yet on Primewave shows which systems are pending instead.
 */
export const ClubCard = forwardRef<HTMLElement, { club: Club; connected: boolean; onClose: () => void; onOpen: () => void; variant: 'panel' | 'sheet' }>(
  function ClubCard({ club: c, connected, onClose, onOpen, variant }, ref) {
    const { t, pick, fmtNumber } = useI18n();
    const data = useDemo();
    const district = data.districts.find((d) => d.id === c.district);
    const na = <span className="mapcard__na">{t('map.card.notAvailable')}</span>;
    const num = (n: number | null | undefined) => (n == null ? na : <span className="num">{fmtNumber(n)}</span>);

    useEffect(() => {
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', onKey);
      return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);

    const clubRows: [string, ReactNode][] = [
      [t('map.card.gender'), t(`gender.${c.gender}`)],
      [t('map.card.address'), pick(c.addressEn, c.addressAr) || na],
      [t('map.card.district'), district ? pick(district.nameEn, district.nameAr) : na],
      [t('map.card.city'), district ? pick(district.cityEn, district.cityAr) : na],
      [t('map.card.region'), t(`region.${c.region}`)],
      [t('map.card.hours'), pick(c.hours.labelEn, c.hours.labelAr)],
      [t('map.card.opened'), pick(c.openedEn, c.openedAr) || na],
    ];
    const siteRows: [string, ReactNode][] = [
      [t('map.card.area'), c.areaM2 ? <span className="num" key="a">{t('map.card.areaValue', { n: fmtNumber(c.areaM2) })}</span> : na],
    ];
    const notYet = <span className="mapcard__na">{t('map.notConnected')}</span>;
    const sysRows: [string, ReactNode][] = connected
      ? [
        [t('map.card.cameras'), num(c.cameras)],
        [t('map.card.zones'), num(c.zones)],
        [t('map.card.machines'), num(c.machines)],
        [t('map.card.ac'), num(acConnected(data.integrations, c.id))],
        [t('map.card.goLive'), c.id === LIVE_CLUB_ID ? pick('October 2026', 'أكتوبر 2026') : na],
      ]
      : [
        [t('map.card.cameras'), notYet],
        [t('map.card.zones'), notYet],
        [t('map.card.machines'), notYet],
        [t('map.card.ac'), notYet],
        [t('map.card.goLive'), na],
      ];

    return (
      <article ref={ref} tabIndex={-1} className={`mapcard mapcard--${variant}`} aria-label={pick(c.nameEn, c.nameAr)}>
        <header className="mapcard__head">
          <div className="mapcard__titles">
            <h2 className="mapcard__name">{pick(c.nameEn, c.nameAr)}</h2>
            <div className="mapcard__tags">
              <span className="maptag maptag--plain">{t(`gender.${c.gender}`)}</span>
            </div>
          </div>
          <button type="button" className="mapcard__close" onClick={onClose} aria-label={t('map.card.close')}><X aria-hidden /></button>
        </header>
        <div className="mapcard__body">
          <FactGroup icon={Building2} title={t('map.card.groupClub')} rows={clubRows.filter(([, v]) => v !== na)} />
          <FactGroup icon={Ruler} title={t('map.card.groupSite')} rows={siteRows.filter(([, v]) => v !== na)} />
          <FactGroup icon={Cpu} title={t('map.card.groupSystems')} rows={sysRows} />
          {!c.exactPin && <p className="mapcard__note">{t('map.card.approxPin')}</p>}
          {!connected && (
            <div className="mapcard__pending">
              <strong>{t('map.card.pendingTitle')}</strong>
              <span>{t('map.card.pendingBody')}</span>
              <ul>
                {(['cameras', 'machines', 'ac', 'energy'] as const).map((k) => <li key={k}>{t(`map.card.pending.${k}`)}</li>)}
              </ul>
            </div>
          )}
        </div>
        {connected && (
          <button type="button" className="btn btn--primary mapcard__cta" onClick={onOpen}>
            {t('map.card.open')}<ArrowRight aria-hidden className="flip-rtl" />
          </button>
        )}
      </article>
    );
  },
);
