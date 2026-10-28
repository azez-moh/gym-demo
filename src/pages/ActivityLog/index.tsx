import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Download, ListChecks, PlayCircle, Search } from 'lucide-react';
import { Badge, Button, Card, ChipGroup, EmptyState, KpiTile, PageHeader, Select, TextField, Toggle, exportCsv } from '../../components';
import { useI18n } from '../../i18n';
import { camerasOf, focusClub, hhmm, useDemo, type MachineType } from '../../data';
import { useScope } from '../../layout/filters';
import { buildLog, type Kind, type LogEvent } from './model';
import './activityLog.css';

const STEP = 100;
type KindFilter = 'all' | Kind;

export default function ActivityLogPage() {
  const { t, pick, fmtNumber, fmtDuration } = useI18n();
  const d = useDemo();
  const { scope } = useScope();
  const club = focusClub(d, scope);
  const date = d.live.date;
  const liveMin = d.live.hour * 60 + d.live.minute;

  const [live, setLive] = useState(true);
  const [frozen, setFrozen] = useState(liveMin);
  useEffect(() => { if (live) setFrozen(liveMin); }, [live, liveMin]);
  const nowMin = live ? liveMin : frozen;

  const machines = useMemo(() => d.machines.filter((m) => m.clubId === club.id && m.enabled), [d.machines, club.id]);
  const mById = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);
  const cams = useMemo(() => new Map(camerasOf(d, club.id).map((c) => [c.id, c])), [d, club.id]);
  const events = useMemo(() => buildLog(machines, cams, club, date, nowMin), [machines, cams, club, date, nowMin]);

  const [kind, setKind] = useState<KindFilter>('all');
  const [type, setType] = useState<string>('all');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(STEP);

  // events that appeared since the last render slide in
  const seen = useRef<Set<string> | null>(null);
  const fresh = useMemo(() => {
    const prev = seen.current;
    const ids = new Set(events.map((e) => e.id));
    const out = new Set<string>();
    if (prev) for (const id of ids) if (!prev.has(id)) out.add(id);
    seen.current = ids;
    return out;
  }, [events]);

  const typeLabel = (x: string) => t(`machines.type.${x}`);
  const types = useMemo(() => [...new Set(machines.map((m) => m.type))].sort(), [machines]);
  const mName = (id: string) => { const m = mById.get(id); return m ? pick(m.nameEn, m.nameAr) : ''; };

  const filtered = events.filter((e) => {
    if (kind !== 'all' && e.kind !== kind) return false;
    const m = mById.get(e.machineId);
    if (!m) return false;
    if (type !== 'all' && m.type !== type) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      if (!`${m.nameEn} ${m.nameAr} ${typeLabel(m.type)}`.toLowerCase().includes(s)) return false;
    }
    return true;
  });
  const shown = filtered.slice(0, limit);

  const nUse = events.filter((e) => e.kind === 'use').length;
  const nIdle = events.filter((e) => e.kind === 'idle').length;
  const nUnc = events.filter((e) => e.kind === 'uncertain');
  const usedMachines = new Set(events.filter((e) => e.kind === 'use').map((e) => e.machineId)).size;
  const inUseNow = useMemo(() => {
    const last = new Map<string, Kind>();
    for (const e of events) if (e.kind !== 'uncertain' && !last.has(e.machineId)) last.set(e.machineId, e.kind);
    return [...last.values()].filter((k) => k === 'use').length;
  }, [events]);
  const first = events.length ? events[events.length - 1].at : null;

  const where = (e: LogEvent) => {
    const m = mById.get(e.machineId);
    if (!m) return '';
    const c = cams.get(m.cameraId);
    const zs = m.zoneIds.map((id) => id.split(':z').pop()).join(', ');
    const zl = m.zoneIds.length > 1 ? t('activityLog.zonesN', { list: zs }) : t('activityLog.zones', { n: zs || '1' });
    return c ? `${zl} · ${pick(c.nameEn, c.nameAr)}` : zl;
  };
  const prevText = (e: LogEvent) => {
    if (e.kind === 'uncertain') return t('activityLog.prevUncertain', { d: fmtDuration((e.spanMin ?? 0) * 60) });
    if (e.kind === 'use' && e.prevMin <= 0) return t('activityLog.firstToday');
    return e.kind === 'use' ? t('activityLog.prevUse', { d: fmtDuration(Math.round(e.prevMin) * 60) }) : t('activityLog.prevIdle', { d: fmtDuration(Math.max(1, Math.round(e.prevMin)) * 60) });
  };

  const download = () => {
    exportCsv(`${t('activityLog.csv.name')}-${date}`,
      [t('activityLog.csv.time'), t('activityLog.csv.machine'), t('activityLog.csv.type'), t('activityLog.csv.camera'), t('activityLog.csv.change'), t('activityLog.csv.prevMin'), t('activityLog.csv.note')],
      filtered.map((e) => {
        const m = mById.get(e.machineId)!;
        const c = cams.get(m.cameraId);
        return [hhmm(e.at), pick(m.nameEn, m.nameAr), typeLabel(m.type), c ? pick(c.nameEn, c.nameAr) : '', t(`activityLog.kind.${e.kind}`),
          Math.round(e.kind === 'uncertain' ? e.spanMin ?? 0 : e.prevMin), e.reason ? t(`activityLog.reason.${e.reason}`) : ''];
      }));
  };

  return (
    <div className="page">
      <PageHeader eyebrow={pick(club.nameEn, club.nameAr)} title={t('nav.activityLog')}
        actions={<>
          <label className="al-live">
            <span className={`al-live__dot ${live ? 'is-on' : ''}`} aria-hidden />
            <span>{live ? t('activityLog.live') : t('activityLog.pausedAt', { time: hhmm(frozen) })}</span>
            <Toggle checked={live} onChange={setLive} label={t('activityLog.liveToggle')} />
          </label>
          <Button icon={Download} onClick={download}>{t('common.export')}</Button>
        </>} />

      <div className="grid-kpi">
        <KpiTile icon={ListChecks} label={t('activityLog.kpi.events')} info={t('activityLog.kpi.eventsInfo')} value={fmtNumber(events.length)}
          hint={first != null ? t('activityLog.kpi.eventsHint', { time: hhmm(first) }) : undefined} />
        <KpiTile icon={PlayCircle} label={t('activityLog.kpi.use')} info={t('activityLog.kpi.useInfo')} value={fmtNumber(nUse)}
          hint={t('activityLog.kpi.useHint', { n: fmtNumber(usedMachines) })} />
        <KpiTile icon={AlertTriangle} label={t('activityLog.kpi.uncertain')} info={t('activityLog.kpi.uncertainInfo')} value={fmtNumber(nUnc.length)}
          hint={t('activityLog.kpi.uncertainHint', { n: fmtNumber(nUnc.filter((e) => e.reason === 'offline').length) })} />
        <KpiTile live={live} icon={Activity} label={t('activityLog.kpi.active')} info={t('activityLog.kpi.activeInfo')} value={fmtNumber(inUseNow)}
          hint={t('activityLog.kpi.activeHint', { n: fmtNumber(machines.length) })} />
      </div>

      <Card title={t('activityLog.feed.title')} info={t('activityLog.feed.info')} live={live}>
        <div className="stack">
          <div className="al-filters">
            <ChipGroup<KindFilter> scroll ariaLabel={t('activityLog.feed.filter')} value={kind} onChange={(v) => { setKind(v); setLimit(STEP); }}
              options={[
                { value: 'all', label: t('activityLog.kind.all'), count: events.length },
                { value: 'use', label: t('activityLog.kind.use'), count: nUse },
                { value: 'idle', label: t('activityLog.kind.idle'), count: nIdle },
                { value: 'uncertain', label: t('activityLog.kind.uncertain'), count: nUnc.length },
              ]} />
            <div className="al-filters__end">
              <Select label={t('activityLog.feed.type')} value={type} onChange={(v) => { setType(v); setLimit(STEP); }}
                options={[{ value: 'all', label: t('activityLog.feed.allTypes') }, ...types.map((x) => ({ value: x, label: typeLabel(x as MachineType) }))]} />
              <div className="al-search">
                <TextField label={t('activityLog.feed.search')} hideLabel icon={Search} value={q} onChange={(v) => { setQ(v); setLimit(STEP); }} placeholder={t('activityLog.feed.search')} />
              </div>
            </div>
          </div>

          {shown.length === 0 ? <EmptyState title={t('activityLog.feed.empty')} /> : (
            <div className="dt">
              <div className="dt__scroll">
                <table className="al-table">
                  <caption className="visually-hidden">{t('activityLog.feed.title')}</caption>
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}><span className="dt__th">{t('activityLog.col.time')}</span></th>
                      <th><span className="dt__th">{t('activityLog.col.machine')}</span></th>
                      <th className="dt--hide-sm"><span className="dt__th">{t('activityLog.col.where')}</span></th>
                      <th><span className="dt__th">{t('activityLog.col.change')}</span></th>
                      <th className="dt--hide-sm"><span className="dt__th">{t('activityLog.col.prev')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((e) => (
                      <tr key={e.id} className={`al-row al-row--${e.kind} ${fresh.has(e.id) ? 'is-new' : ''}`.trim()}>
                        <td className="num al-time">{hhmm(e.at)}</td>
                        <td>
                          <div className="al-machine">
                            <span>{mName(e.machineId)}</span>
                            <span className="al-sub">{typeLabel(mById.get(e.machineId)!.type)}</span>
                          </div>
                        </td>
                        <td className="dt--hide-sm al-muted">{where(e)}</td>
                        <td>
                          <div className="al-change">
                            {e.kind === 'use' ? <Badge tone="accent">{t('activityLog.kind.use')}</Badge>
                              : e.kind === 'idle' ? <Badge tone="neutral">{t('activityLog.kind.idle')}</Badge>
                                : <Badge tone="warning" icon={AlertTriangle}>{t('activityLog.kind.uncertain')}</Badge>}
                            {e.reason && <span className="al-sub">{t(`activityLog.reason.${e.reason}`)}</span>}
                          </div>
                        </td>
                        <td className="dt--hide-sm al-muted">{prevText(e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="al-foot">
                <span className="muted al-sub">{t('activityLog.feed.showing', { n: fmtNumber(shown.length), m: fmtNumber(filtered.length) })}</span>
                {filtered.length > shown.length && <Button onClick={() => setLimit((n) => n + STEP)}>{t('activityLog.feed.showMore')}</Button>}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
