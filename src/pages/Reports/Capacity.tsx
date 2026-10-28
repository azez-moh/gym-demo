import { useMemo } from 'react';
import { Card, EmptyState, InfoTip, Segmented } from '../../components';
import { useI18n } from '../../i18n';
import { addDays, machinesByType, sessionsOn, usageReport, type Club, type Machine, type MachineType } from '../../data';
import { useTypeLabel } from '../Machines/shared/parts';
import { useParam, useVisionClub } from '../Machines/shared/club';
import './reports.css';

type Period = 'today' | 'd7' | 'd30';

interface CapRow { type: MachineType; available: number; avg: number; peak: number; utilPct: number }

/**
 * "Usage vs available machines" (production name: capacity). Average machines in use = observed used time / open time
 * in the period, against the machines available of each type. Peak = most machines of the type in use at the same minute.
 */
export function CapacityCard() {
  const { t, fmtNumber, fmtPercent } = useI18n();
  const { d, club } = useVisionClub();
  const typeLabel = useTypeLabel();
  const [periodParam, setPeriod] = useParam('period', 'today');
  const period: Period = periodParam === 'd7' || periodParam === 'd30' ? periodParam : 'today';
  const today = d.live.date;
  const nowMin = d.live.hour * 60 + d.live.minute;
  const from = period === 'today' ? today : addDays(today, period === 'd7' ? -6 : -29);
  const tick = Math.floor(nowMin / 5);

  const { rows, openMin } = useMemo(() => {
    const usage = usageReport(d, club.id, from, today);
    const byId = new Map(d.machines.filter((m) => m.clubId === club.id).map((m) => [m.id, m]));
    const usedByType = new Map<MachineType, number>();
    for (const u of usage) {
      const m = byId.get(u.machineId);
      if (m) usedByType.set(m.type, (usedByType.get(m.type) ?? 0) + u.usedMin);
    }
    const open = usage[0]?.openMin ?? 0;
    const peaks = peakByType(d.machines.filter((m) => m.clubId === club.id && m.enabled), club, from, today, nowMin);
    // Available = active (enabled) machines of the type, observed or not.
    const active = new Map<MachineType, number>();
    for (const m of byId.values()) if (m.enabled) active.set(m.type, (active.get(m.type) ?? 0) + 1);
    const out: CapRow[] = machinesByType(d, club.id)
      .map((r) => ({ r, n: active.get(r.type) ?? 0 }))
      .filter(({ n }) => n > 0)
      .map(({ r, n }) => {
        const avg = open ? (usedByType.get(r.type) ?? 0) / open : 0;
        return { type: r.type, available: n, avg, peak: Math.min(n, peaks.get(r.type) ?? 0), utilPct: (avg / n) * 100 };
      })
      .sort((a, b) => b.utilPct - a.utilPct);
    return { rows: out, openMin: open };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, club, from, today, tick]);

  const maxAvail = Math.max(1, ...rows.map((r) => r.available));
  const one = (n: number) => fmtNumber(Math.round(n * 10) / 10, { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  return (
    <Card pad="md" title={<span className="rp-title">{t('reports.capacity.title')}<InfoTip text={t('reports.capacity.caveats')} /></span>}
      info={t('reports.capacity.info')} subtitle={t('reports.capacity.openHours', { h: fmtNumber(Math.round(openMin / 60)) })}
      actions={<Segmented size="sm" ariaLabel={t('reports.period.label')} value={period} onChange={(v) => setPeriod(v)}
        options={[{ value: 'today', label: t('reports.period.today') }, { value: 'd7', label: t('reports.period.d7') }, { value: 'd30', label: t('reports.period.d30') }]} />}>
      {rows.length === 0 ? <EmptyState title={t('reports.capacity.empty')} /> : (
        <>
          <div className="rp-legend" aria-hidden>
            <span><i className="rp-sw rp-sw--avg" />{t('reports.capacity.legendAvg')}</span>
            <span><i className="rp-sw rp-sw--peak" />{t('reports.capacity.legendPeak')}</span>
          </div>
          <div className="dt rp-cap">
            <div className="dt__scroll">
              <table>
                <caption className="visually-hidden">{t('reports.capacity.title')}</caption>
                <thead>
                  <tr>
                    <th><span className="dt__th">{t('reports.capacity.col.type')}</span></th>
                    <th className="rp-num"><span className="dt__th">{t('reports.capacity.col.available')}</span></th>
                    <th className="rp-num"><span className="dt__th">{t('reports.capacity.col.avg')}</span></th>
                    <th className="rp-num"><span className="dt__th">{t('reports.capacity.col.peak')}</span></th>
                    <th className="rp-num"><span className="dt__th">{t('reports.capacity.col.util')}</span></th>
                    <th className="rp-barcol dt--hide-sm"><span className="visually-hidden">{t('reports.capacity.legendAvg')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.type}>
                      <td>{typeLabel(r.type)}</td>
                      <td className="rp-num num">{fmtNumber(r.available)}</td>
                      <td className="rp-num num">{one(r.avg)}</td>
                      <td className="rp-num num">{fmtNumber(r.peak)}</td>
                      <td className="rp-num num">{fmtPercent(r.utilPct, 0)}</td>
                      <td className="rp-barcol dt--hide-sm">
                        <span className="rp-bar" role="img" style={{ width: `${(r.available / maxAvail) * 100}%` }}
                          aria-label={t('reports.capacity.bar', { avg: one(r.avg), n: fmtNumber(r.available), peak: fmtNumber(r.peak) })}>
                          <span className="rp-bar__peak" style={{ width: `${(r.peak / r.available) * 100}%` }} />
                          <span className="rp-bar__avg" style={{ width: `${Math.min(100, (r.avg / r.available) * 100)}%` }} />
                          {Array.from({ length: r.available - 1 }, (_, i) => (
                            <span key={i} className="rp-bar__tick" style={{ insetInlineStart: `${((i + 1) / r.available) * 100}%` }} />
                          ))}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/** Most machines of each type in use at the same minute over [from, to], today cut at the live clock. */
function peakByType(machines: Machine[], club: Club, from: string, to: string, nowMin: number): Map<MachineType, number> {
  const out = new Map<MachineType, number>();
  const byType = new Map<MachineType, typeof machines>();
  for (const m of machines) byType.set(m.type, [...(byType.get(m.type) ?? []), m]);
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const upto = date === to ? nowMin : undefined;
    for (const [type, list] of byType) {
      const busy = new Int16Array(1440 * 2);
      for (const m of list) {
        for (const s of sessionsOn(m, club, date, upto)) {
          const a = Math.max(0, Math.floor(s.start));
          const b = Math.min(busy.length, Math.ceil(s.end));
          for (let x = a; x < b; x++) busy[x]++;
        }
      }
      let mx = out.get(type) ?? 0;
      for (let x = 0; x < busy.length; x++) if (busy[x] > mx) mx = busy[x];
      out.set(type, mx);
    }
  }
  return out;
}
