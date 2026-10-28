import { useMemo, useState } from 'react';
import { CalendarClock, Download, Gauge, Hourglass, RotateCcw, Timer, Activity } from 'lucide-react';
import { Button, Card, ChipGroup, EmptyState, InfoTip, KpiTile, Modal, PageHeader, Select, Tabs, Toggle, exportCsv } from '../../components';
import { useI18n } from '../../i18n';
import { useAuth } from '../../layout/auth';
import { addDays, type MachineType } from '../../data';
import { useTypeLabel } from '../Machines/shared/parts';
import { useParam, useVisionClub } from '../Machines/shared/club';
import { buildReport, resetsOf, TYPE_ORDER, type ReportFilter, type ResetRecord } from '../Machines/shared/usage';
import { PeakHours, FamilyBars, CapacityBars, SmallMultiples, BreakdownTable, TimelineTable } from './parts';
import '../Machines/shared/machines.css';
import './usage.css';

type Preset = 'today' | '7' | '30' | 'custom';
type Tab = 'usage' | 'count';

export default function UsageReportPage() {
  const { t, pick, fmtNumber, fmtDuration, fmtDate, lang } = useI18n();
  const { d, club, rows } = useVisionClub();
  const { user } = useAuth();
  const typeLabel = useTypeLabel();
  const today = d.live.date;
  const [tab, setTab] = useParam('tab', 'usage');

  const presetRange = (p: Preset): [string, string] => (p === '7' ? [addDays(today, -6), today] : p === '30' ? [addDays(today, -29), today] : [today, today]);
  const initial: ReportFilter = { from: today, to: today, type: 'all', mergeSec: 30, includeTest: false };
  const [draft, setDraft] = useState<ReportFilter>(initial);
  const [preset, setPreset] = useState<Preset>('today');
  const [applied, setApplied] = useState<ReportFilter>(initial);
  const [appliedPreset, setAppliedPreset] = useState<Preset>('today');
  const [resetOpen, setResetOpen] = useState(false);
  const [confirmWord, setConfirmWord] = useState('');
  const [splitBy, setSplitBy] = useState<'type' | 'machine'>('type');

  const dateError = draft.to < draft.from ? t('usageReport.filter.dateError') : '';
  const mergeError = !Number.isInteger(draft.mergeSec) || draft.mergeSec < 0 || draft.mergeSec > 600 ? t('usageReport.filter.mergeError') : '';
  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);

  const resets = resetsOf(d);
  // "Today" follows the live clock even if the page stays open past midnight.
  const effective = appliedPreset === 'custom' ? applied : { ...applied, from: presetRange(appliedPreset)[0], to: presetRange(appliedPreset)[1] };
  const report = useMemo(() => buildReport(d, club, effective, resets), [d, club, effective.from, effective.to, effective.type, effective.mergeSec, effective.includeTest, resets]); // eslint-disable-line react-hooks/exhaustive-deps

  const families = useMemo(() => [...report.families].sort((a, b) => b.utilPct - a.utilPct), [report.families]);
  const byCapacity = useMemo(() => [...report.families].sort((a, b) => b.capacityPct - a.capacityPct), [report.families]);
  const hasUsage = report.totals.sessions > 0;
  const openH = report.openMin / 60;

  const typesHere = useMemo(() => TYPE_ORDER.filter((x) => rows.some((m) => m.type === x)), [rows]);

  const choosePreset = (p: Preset) => {
    setPreset(p);
    const [from, to] = presetRange(p);
    setDraft((f) => ({ ...f, from, to }));
  };
  const update = () => {
    if (dateError || mergeError) return;
    setApplied(draft);
    setAppliedPreset(preset);
  };

  const rangeText = report.dates.length <= 1 && effective.from === effective.to
    ? fmtDate(`${effective.from}T12:00:00+03:00`, 'medium')
    : `${fmtDate(`${effective.from}T12:00:00+03:00`, 'short')} to ${fmtDate(`${effective.to}T12:00:00+03:00`, 'medium')}`;
  const rangeTextAr = `${fmtDate(`${effective.from}T12:00:00+03:00`, 'short')} إلى ${fmtDate(`${effective.to}T12:00:00+03:00`, 'medium')}`;
  const periodLabel = lang === 'ar' && effective.from !== effective.to ? rangeTextAr : rangeText;

  const downloadCsv = () => {
    const header = [t('usageReport.csv.machine'), t('usageReport.csv.type'), t('usageReport.csv.from'), t('usageReport.csv.to'), t('usageReport.csv.sessions'),
      t('usageReport.csv.usedMin'), t('usageReport.csv.idleMin'), t('usageReport.csv.util'), t('usageReport.csv.avgSession'), t('usageReport.csv.avgGap'), t('usageReport.csv.coverage')];
    const data = report.rows.map((r) => [
      pick(r.machine.nameEn, r.machine.nameAr), typeLabel(r.machine.type), effective.from, effective.to, r.sessions,
      Math.round(r.usedMin), Math.round(r.idleMin), Math.round(r.utilPct * 10) / 10, Math.round(r.avgSessionMin * 10) / 10,
      Math.round(r.avgGapMin * 10) / 10, Math.round(r.coverage * 1000) / 10,
    ]);
    exportCsv(`usage-report-${effective.from}-to-${effective.to}`, header, data);
  };

  const word = t('usageReport.reset.word');
  const doReset = () => {
    const rec: ResetRecord = { from: effective.from, to: effective.to, atMs: d.now.getTime(), byName: user?.name ?? '', byRole: user?.role ?? 'coo', machines: report.rows.length };
    d.patch('settings', 'usageResets', { list: [...resets, rec] });
    setResetOpen(false);
    setConfirmWord('');
  };
  const lastReset = resets[resets.length - 1];

  return (
    <div className="page">
      <PageHeader title={t('usageReport.title')} actions={<>
        <Button icon={Download} onClick={downloadCsv} disabled={!report.rows.length}>{t('usageReport.download')}</Button>
        <span className="ur-sep" aria-hidden />
        <Button variant="danger" icon={RotateCcw} onClick={() => setResetOpen(true)}>{t('usageReport.reset.button')}</Button>
      </>} />
      <p className="mr-intro">{t('usageReport.intro')}</p>

      <Card pad="md">
        <div className="stack">
          <div className="ur-filters">
            <div className="field ur-filters__type">
              <span className="field__label" aria-hidden>{t('usageReport.filter.type')}</span>
              <Select<string> label={t('usageReport.filter.type')} value={draft.type} onChange={(v) => setDraft((f) => ({ ...f, type: v as MachineType | 'all' }))}
                options={[{ value: 'all', label: t('usageReport.filter.allTypes') }, ...typesHere.map((x) => ({ value: x, label: typeLabel(x) }))]} />
            </div>
            <label className="field ur-filters__date">
              <span className="field__label">{t('usageReport.filter.from')}</span>
              <input type="date" className="field__input ltr" value={draft.from} max={today} aria-invalid={!!dateError}
                onChange={(e) => { if (e.target.value) { setDraft((f) => ({ ...f, from: e.target.value })); setPreset('custom'); } }} />
            </label>
            <label className="field ur-filters__date">
              <span className="field__label">{t('usageReport.filter.to')}</span>
              <input type="date" className="field__input ltr" value={draft.to} max={today} aria-invalid={!!dateError}
                onChange={(e) => { if (e.target.value) { setDraft((f) => ({ ...f, to: e.target.value })); setPreset('custom'); } }} />
            </label>
            <label className="field ur-filters__merge">
              <span className="field__label">{t('usageReport.filter.merge')}<InfoTip text={t('usageReport.filter.mergeInfo')} /></span>
              <input type="number" inputMode="numeric" min={0} max={600} step={1} className="field__input num" value={Number.isFinite(draft.mergeSec) ? draft.mergeSec : ''}
                aria-invalid={!!mergeError} onChange={(e) => setDraft((f) => ({ ...f, mergeSec: e.target.value === '' ? NaN : Number(e.target.value) }))} />
            </label>
            <div className="field">
              <span className="field__label">{t('usageReport.filter.period')}</span>
              <ChipGroup<Preset> ariaLabel={t('usageReport.filter.period')} value={preset} onChange={choosePreset}
                options={[{ value: 'today', label: t('usageReport.filter.today') }, { value: '7', label: t('usageReport.filter.last7') }, { value: '30', label: t('usageReport.filter.last30') }]} />
            </div>
            <div className="field">
              <span className="field__label">{t('usageReport.filter.testCams')}</span>
              <span className="row" style={{ minHeight: 36 }}>
                <Toggle checked={draft.includeTest} onChange={(v) => setDraft((f) => ({ ...f, includeTest: v }))} label={t('usageReport.filter.testCams')} />
                <span className="muted mr-small">{draft.includeTest ? t('common.on') : t('common.off')}</span>
              </span>
            </div>
            <Button variant="primary" onClick={update} disabled={!!dateError || !!mergeError} className="ur-filters__go">{t('usageReport.filter.update')}</Button>
          </div>
          {(dateError || mergeError) && <p className="ur-error" role="alert">{dateError || mergeError}</p>}
          <div className="row-between">
            <span className="ur-note">
              <CalendarClock aria-hidden />
              {t('usageReport.hoursNote', { n: fmtNumber(openH, 1) })}
              <InfoTip text={t('usageReport.hoursInfo')} />
            </span>
            <span className="muted mr-small">
              {pick(club.shortEn, club.shortAr)} · {periodLabel}{effective.type !== 'all' ? ` · ${typeLabel(effective.type)}` : ''}
              {dirty && <span className="ur-dirty"> · {t('usageReport.filter.pending')}</span>}
            </span>
          </div>
        </div>
      </Card>

      <Tabs<Tab> ariaLabel={t('usageReport.tabs.aria')} value={tab as Tab} onChange={(v) => setTab(v)}
        tabs={[{ id: 'usage', label: t('usageReport.tabs.usage') }, { id: 'count', label: t('usageReport.tabs.count') }]} />

      {report.rows.length === 0 ? (
        <Card pad="lg"><EmptyState title={t('usageReport.noMachines')} body={t('usageReport.noMachinesBody')} /></Card>
      ) : !hasUsage ? (
        <Card pad="lg">
          <EmptyState icon={Hourglass} title={t('usageReport.noUsage')}
            body={report.resetDates > 0 && lastReset ? t('usageReport.resetBy', { name: lastReset.byName, role: t(`role.${lastReset.byRole}Short`), time: fmtDate(lastReset.atMs, 'medium') }) : t('usageReport.noUsageBody')} />
        </Card>
      ) : tab === 'usage' ? (
        <>
          <div className="grid-kpi">
            <KpiTile label={t('usageReport.kpi.sessions')} icon={Activity} value={fmtNumber(report.totals.sessions)} info={t('usageReport.kpi.sessionsInfo', { s: fmtNumber(effective.mergeSec) })}
              hint={t('usageReport.kpi.sessionsHint', { s: fmtNumber(effective.mergeSec) })} />
            <KpiTile label={t('usageReport.kpi.used')} icon={Timer} value={fmtDuration(report.totals.usedMin * 60)} info={t('usageReport.kpi.usedInfo')} hint={t('usageReport.kpi.usedHint')} />
            <KpiTile label={t('usageReport.kpi.idle')} icon={Hourglass} value={fmtDuration(report.totals.idleMin * 60)} info={t('usageReport.kpi.idleInfo')} hint={t('usageReport.kpi.idleHint')} />
            <KpiTile label={t('usageReport.kpi.util')} icon={Gauge} value={`${fmtNumber(report.totals.utilPct, 1)}%`}
              info={t('usageReport.kpi.utilInfo', { u: fmtDuration(report.totals.unknownMin * 60) })} hint={t('usageReport.kpi.utilHint', { u: fmtDuration(report.totals.unknownMin * 60) })} />
          </div>
          <PeakHours peak={report.peak} closed={report.closedHours} />
          <FamilyBars families={families} />
          <Card title={t('usageReport.over.title')} info={t('usageReport.over.info')} actions={
            <Select<string> label={t('usageReport.over.split')} value={splitBy} onChange={(v) => setSplitBy(v as 'type' | 'machine')}
              options={[{ value: 'type', label: t('usageReport.over.perType') }, { value: 'machine', label: t('usageReport.over.perMachine') }]} />
          }>
            <SmallMultiples report={report} splitBy={splitBy} />
          </Card>
          <BreakdownTable report={report} />
          <TimelineTable report={report} />
        </>
      ) : (
        <CapacityBars families={byCapacity} />
      )}

      <Modal open={resetOpen} onClose={() => { setResetOpen(false); setConfirmWord(''); }} title={t('usageReport.reset.title')} width={480}
        footer={<>
          <button type="button" className="btn" onClick={() => { setResetOpen(false); setConfirmWord(''); }} autoFocus>{t('common.cancel')}</button>
          <button type="button" className="btn btn--danger" disabled={confirmWord.trim().toUpperCase() !== word.toUpperCase()} onClick={doReset}>{t('usageReport.reset.confirm')}</button>
        </>}>
        <div className="stack">
          <p className="confirm__body">{t('usageReport.reset.body', { range: periodLabel, n: fmtNumber(report.rows.length), club: pick(club.nameEn, club.nameAr) })}</p>
          <p className="confirm__body">{t('usageReport.reset.undo')}</p>
          <label className="field">
            <span className="field__label">{t('usageReport.reset.typeWord', { word })}</span>
            <input className="field__input" value={confirmWord} onChange={(e) => setConfirmWord(e.target.value)} autoComplete="off" />
          </label>
          <p className="faint mr-small">{t('usageReport.reset.audit', { name: user?.name ?? '', role: t(`role.${user?.role ?? 'coo'}Short`) })}</p>
        </div>
      </Modal>
    </div>
  );
}
