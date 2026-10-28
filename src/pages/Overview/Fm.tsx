import { useEffect, useMemo, useState } from 'react';
import { Bell, Check, Dumbbell, Minus, Plus, Snowflake, ThermometerSun, X, Zap, ZapOff } from 'lucide-react';
import {
  Badge, Button, Card, ChipGroup, ConfirmDialog, EmptyState, InfoTip, KpiTile, PageHeader, Segmented, Select, StatusBadge, Toggle,
} from '../../components';
import { useI18n } from '../../i18n';
import { useAuth } from '../../layout/auth';
import { alertsIn, focusClub, totals, useDemo, TARIFF_SAR_PER_KWH, type Alert, type Level } from '../../data';
import { useScope } from '../../layout/filters';
import { AsAtLine } from './shared';
import { sortAlerts } from './metrics';
import { MODES, SCENES, SP_MAX, SP_MIN, useFmControls, type BuildingMode, type LogEntry, type Scene, type ZoneRow } from './fmModel';
import { CrowdHeatmapCard } from '../Heatmap/Compact';
import './fm.css';

type Pending =
  | { kind: 'mode'; mode: BuildingMode }
  | { kind: 'boost'; areaId: string }
  | { kind: 'empty' }
  | { kind: 'acOff'; zone: ZoneRow }
  | { kind: 'lightsOff'; zone: ZoneRow }
  | { kind: 'clear'; alert: Alert };

/** Facility Manager home: one gym, four KPIs, building controls with a change log, and the gym's alarms. */
export function FmOverview() {
  const i18n = useI18n();
  const { t, pick, fmtNumber, fmtTime, fmtAgo, fmtAge, fmtCurrency } = i18n;
  const data = useDemo();
  const { scope } = useScope();
  const { user } = useAuth();
  const club = focusClub(data, scope);
  const who = t('fm.who');
  const ctl = useFmControls(data, club.id, user?.name || who);
  const [pending, setPending] = useState<Pending | null>(null);
  const [boostZone, setBoostZone] = useState<string>('');
  const [level, setLevel] = useState<'all' | Level>('all');

  // the boost ends by itself after one hour (simulated clock)
  const { boost, endBoost } = ctl;
  useEffect(() => {
    if (boost && data.live.nowMs >= boost.until) endBoost();
  }, [boost, data.live.nowMs, endBoost]);

  const zoneName = (areaId?: string) => {
    const a = data.areas.find((x) => x.id === areaId);
    return a ? pick(a.nameEn, a.nameAr) : '';
  };
  // isolated left to right so Arabic text never shows "C°31.8"
  const deg = (v?: number) => (v == null ? '–' : `\u2066${fmtNumber(v, { maximumFractionDigits: 1 })}°C\u2069`);

  // ---------- KPIs ----------
  const alerts = useMemo(() => sortAlerts(alertsIn(data, [club])), [data, club]);
  const nCrit = alerts.filter((a) => a.level === 'critical').length;
  const nWarn = alerts.filter((a) => a.level === 'warning').length;
  const nAck = alerts.filter((a) => a.status === 'acknowledged').length;

  const outZones = ctl.zones.filter((z) => z.unitsOn > 0 && z.overBy >= 1.5);
  const worst = [...outZones].sort((a, b) => b.overBy - a.overBy)[0];

  const clubMachines = data.machines.filter((m) => m.clubId === club.id);
  const outMachines = clubMachines.filter((m) => !m.enabled);

  const tot = totals(data, [club]);
  const overKwh = tot.energyTodayKwh - tot.baselineTodayKwh;
  const vsPct = tot.baselineTodayKwh ? (overKwh / tot.baselineTodayKwh) * 100 : 0;

  // ---------- alarms ----------
  const shown = level === 'all' ? alerts : alerts.filter((a) => a.level === level);
  const ack = (a: Alert) => { data.patch('alerts', a.id, { status: 'acknowledged' }); ctl.logAlarm('ack', a.titleEn, a.titleAr); };
  const clear = (a: Alert) => { data.patch('alerts', a.id, { status: 'resolved' }); ctl.logAlarm('clear', a.titleEn, a.titleAr); };

  // ---------- confirm dialog ----------
  const boostTarget = boostZone || ctl.zones.slice().sort((a, b) => b.overBy - a.overBy)[0]?.area.id || '';
  const untilMs = data.live.nowMs + 60 * 60_000;
  const dlg = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case 'mode': {
        const m = t(`fm.controls.modes.${pending.mode}`);
        return { title: t('fm.controls.modeConfirmTitle', { mode: m }), body: t(`fm.controls.modeDesc.${pending.mode}`), btn: t('fm.controls.modeConfirmBtn', { mode: m }), tone: pending.mode === 'closed' ? 'danger' as const : 'primary' as const, run: () => ctl.setMode(pending.mode) };
      }
      case 'boost': {
        const z = ctl.zones.find((x) => x.area.id === pending.areaId);
        const zone = zoneName(pending.areaId);
        return { title: t('fm.controls.boostConfirmTitle', { zone }), body: t('fm.controls.boostConfirmBody', { zone, n: fmtNumber(z?.units.length ?? 0), time: fmtTime(untilMs) }), btn: t('fm.controls.boostConfirmBtn'), tone: 'primary' as const, run: () => ctl.startBoost(pending.areaId) };
      }
      case 'empty':
        return { title: t('fm.controls.emptyConfirmTitle', { n: fmtNumber(ctl.emptyZones.length) }), body: t('fm.controls.emptyConfirmBody', { zones: ctl.emptyZones.map((z) => pick(z.area.nameEn, z.area.nameAr)).join(i18n.lang === 'ar' ? '، ' : ', ') }), btn: t('fm.controls.emptyConfirmBtn'), tone: 'danger' as const, run: ctl.offEmpty };
      case 'acOff': {
        const zone = pick(pending.zone.area.nameEn, pending.zone.area.nameAr);
        return { title: t('fm.controls.acOffTitle', { zone }), body: t('fm.controls.acOffBody', { zone, n: fmtNumber(pending.zone.units.length) }), btn: t('fm.controls.acOffBtn'), tone: 'danger' as const, run: () => ctl.setZoneAc(pending.zone, false) };
      }
      case 'lightsOff': {
        const zone = pick(pending.zone.area.nameEn, pending.zone.area.nameAr);
        return { title: t('fm.controls.lightsOffTitle', { zone }), body: t('fm.controls.lightsOffBody', { zone }), btn: t('fm.controls.lightsOffBtn'), tone: 'danger' as const, run: () => ctl.setScene(pending.zone, 'off') };
      }
      case 'clear':
        return { title: t('fm.alarms.clearTitle'), body: t('fm.alarms.clearBody', { alarm: pick(pending.alert.titleEn, pending.alert.titleAr), area: pick(pending.alert.areaEn, pending.alert.areaAr) }), btn: t('fm.alarms.clearBtn'), tone: 'danger' as const, run: () => clear(pending.alert) };
    }
  })();

  const logText = (e: LogEntry) => {
    const vars: Record<string, string> = {
      mode: e.mode ? t(`fm.controls.modes.${e.mode}`) : '',
      zone: zoneName(e.areaId),
      scene: e.scene ? t(`fm.controls.scenes.${e.scene}`) : '',
      value: deg(e.value),
      n: fmtNumber(e.n ?? 0),
      alarm: e.alarmEn ? pick(e.alarmEn, e.alarmAr ?? e.alarmEn) : '',
    };
    return t(`fm.log.${e.kind}`, vars);
  };

  return (
    <div className="page ov-page fm">
      <div className="ov-head">
        <PageHeader title={pick(club.nameEn, club.nameAr)} />
        <AsAtLine />
      </div>

      <div className="grid-kpi ov-kpis">
        <KpiTile icon={Bell} label={t('fm.kpi.alarms')} info={t('fm.kpi.alarmsInfo')}
          className={nCrit ? 'ov-kpi-alert is-crit' : 'ov-kpi-alert'}
          value={<span className={nCrit ? 'ov-crit' : ''}>{fmtNumber(alerts.length)}</span>}
          hint={(
            <span className="fm-hint">
              <span className={nCrit ? 'ov-crit-text' : ''}>{t('fm.kpi.alarmsSplit', { c: fmtNumber(nCrit), w: fmtNumber(nWarn), i: fmtNumber(alerts.length - nCrit - nWarn) })}</span>
              {nAck > 0 && <span className="faint">{t('fm.kpi.alarmsAck', { n: fmtNumber(nAck) })}</span>}
            </span>
          )} />
        <KpiTile icon={ThermometerSun} live label={t('fm.kpi.comfort')} info={t('fm.kpi.comfortInfo')} to="/hvac"
          className={outZones.length ? 'fm-kpi-warn' : ''}
          value={fmtNumber(outZones.length)} unit={t('fm.kpi.comfortOf', { n: fmtNumber(ctl.zones.length) })}
          hint={worst ? <span className="txt-warning">{t('fm.kpi.comfortWorst', { zone: pick(worst.area.nameEn, worst.area.nameAr), temp: deg(worst.maxReading) })}</span> : t('fm.kpi.comfortAll')} />
        <KpiTile icon={Dumbbell} label={t('fm.kpi.machinesOut')} info={t('fm.kpi.machinesOutInfo')} to="/live-floor"
          value={fmtNumber(outMachines.length)} unit={t('fm.kpi.machinesOutOf', { n: fmtNumber(clubMachines.length) })}
          hint={outMachines.length ? t('fm.kpi.machinesOutSome', { name: pick(outMachines[outMachines.length - 1].nameEn, outMachines[outMachines.length - 1].nameAr) }) : t('fm.kpi.machinesOutNone')} />
        <KpiTile icon={Zap} label={t('fm.kpi.energy')} info={t('fm.kpi.energyInfo', { tariff: fmtCurrency(TARIFF_SAR_PER_KWH, 2) })}
          className="ov-kpi-energy"
          value={fmtNumber(tot.energyTodayKwh)} unit={i18n.lang === 'ar' ? 'كيلوواط ساعة' : 'kWh'}
          delta={{ value: vsPct, goodWhen: 'down', label: t('fm.kpi.energyVs') }}
          hint={overKwh <= 0
            ? t('fm.kpi.energySaved', { sar: fmtCurrency(tot.savedTodaySar) })
            : t('fm.kpi.energyOver', { sar: fmtCurrency(Math.round(overKwh * TARIFF_SAR_PER_KWH)) })} />
      </div>

      <CrowdHeatmapCard club={club} />

      {/* ---------- building controls ---------- */}
      <Card live title={<span className="ov-card-title">{t('fm.controls.title')}</span>} info={t('fm.controls.info')} pad="md" className="fm-controls">
        <div className="fm-quick">
          <div className="fm-block fm-block--mode">
            <span className="fm-block__label">{t('fm.controls.mode')}<InfoTip text={t('fm.controls.modeInfo')} /></span>
            <Segmented ariaLabel={t('fm.controls.mode')} value={(ctl.mode ?? '') as BuildingMode} onChange={(m) => { if (m !== ctl.mode) setPending({ kind: 'mode', mode: m }); }}
              options={MODES.map((m) => ({ value: m, label: t(`fm.controls.modes.${m}`) }))} />
            <span className="fm-block__note">{ctl.mode && ctl.modeAt ? t('fm.controls.modeSet', { time: fmtTime(ctl.modeAt) }) : t('fm.controls.modeNone')}</span>
          </div>

          <div className="fm-block">
            <span className="fm-block__label">{t('fm.controls.boost')}<InfoTip text={t('fm.controls.boostInfo')} /></span>
            {ctl.boost ? (
              <div className="fm-row">
                <Badge tone="info" icon={Snowflake}>{t('fm.controls.boostActive', { zone: zoneName(ctl.boost.areaId), time: fmtTime(ctl.boost.until) })}</Badge>
                <Button size="sm" onClick={ctl.endBoost}>{t('fm.controls.boostEnd')}</Button>
              </div>
            ) : (
              <div className="fm-row">
                <Select label={t('fm.controls.boostZone')} value={boostTarget} onChange={setBoostZone} className="fm-grow"
                  options={ctl.zones.filter((z) => z.units.length).map((z) => ({ value: z.area.id, label: pick(z.area.nameEn, z.area.nameAr) }))} />
                <Button size="sm" icon={Snowflake} onClick={() => boostTarget && setPending({ kind: 'boost', areaId: boostTarget })}>{t('fm.controls.boostBtn')}</Button>
              </div>
            )}
          </div>

          <div className="fm-block">
            <span className="fm-block__label">{t('fm.controls.empty')}<InfoTip text={t('fm.controls.emptyInfo')} /></span>
            <span className="fm-block__note">{ctl.emptyZones.length === 0 ? t('fm.controls.emptyNone') : ctl.emptyZones.length === 1 ? t('fm.controls.emptyCountOne') : t('fm.controls.emptyCount', { n: fmtNumber(ctl.emptyZones.length) })}</span>
            <Button size="sm" variant="danger" icon={ZapOff} disabled={!ctl.emptyZones.length} onClick={() => setPending({ kind: 'empty' })}>{t('fm.controls.emptyBtn')}</Button>
          </div>
        </div>

        <div className="fm-zones">
          <div className="fm-zones__head">
            <span className="fm-block__label">{t('fm.controls.zones')}<InfoTip text={t('fm.controls.zonesInfo')} /></span>
          </div>
          <div className="fm-zone fm-zone--head" aria-hidden>
            <span>{t('fm.controls.col.zone')}</span>
            <span>{t('fm.controls.col.temp')}</span>
            <span>{t('fm.controls.col.ac')}</span>
            <span>{t('fm.controls.col.setpoint')}</span>
            <span>{t('fm.controls.col.lights')}</span>
          </div>
          <ul className="fm-zones__list">
            {ctl.zones.map((z) => {
              const name = pick(z.area.nameEn, z.area.nameAr);
              const hot = z.unitsOn > 0 && z.overBy >= 1.5;
              return (
                <li key={z.area.id} className="fm-zone">
                  <span className="fm-zone__name">
                    <span>{name}</span>
                    <span className="fm-zone__sub">{z.people ? t('fm.controls.peopleN', { n: fmtNumber(z.people) }) : t('fm.controls.peopleNone')} · {pick(z.area.floorEn, z.area.floorAr)}</span>
                  </span>
                  <span className="fm-zone__name fm-zone__temp">
                    <span className={`num ltr ${hot ? (z.overBy >= 3 ? 'txt-danger' : 'txt-warning') : ''}`}>{deg(z.temp)}</span>
                    {hot && <span className="fm-zone__sub">{t('fm.controls.upTo', { temp: deg(z.maxReading) })}</span>}
                  </span>
                  <span className="fm-zone__ac">
                    <Toggle checked={z.unitsOn > 0} disabled={!z.units.length} label={t('fm.controls.acToggle', { zone: name })}
                      onChange={(v) => (v ? ctl.setZoneAc(z, true) : setPending({ kind: 'acOff', zone: z }))} />
                    <span className="fm-zone__sub">{t('fm.controls.unitsOn', { n: fmtNumber(z.unitsOn), m: fmtNumber(z.units.length) })}</span>
                  </span>
                  <span className="fm-zone__sp apl-set" title={t('fm.controls.limit')}>
                    <button type="button" className="btn btn--sm btn--icon btn--ghost" aria-label={t('fm.controls.lower', { zone: name })}
                      disabled={!z.units.length || (z.setpoint ?? 0) <= SP_MIN} onClick={() => ctl.nudge(z, -0.5)}><Minus aria-hidden /></button>
                    <span className="num ltr fm-zone__spv">{deg(z.setpoint)}</span>
                    <button type="button" className="btn btn--sm btn--icon btn--ghost" aria-label={t('fm.controls.raise', { zone: name })}
                      disabled={!z.units.length || (z.setpoint ?? 99) >= SP_MAX} onClick={() => ctl.nudge(z, 0.5)}><Plus aria-hidden /></button>
                  </span>
                  <span className="fm-zone__lights">
                    <Segmented size="sm" ariaLabel={t('fm.controls.scenesLabel', { zone: name })} value={(z.scene ?? '') as Scene}
                      onChange={(s) => { if (s === z.scene) return; if (s === 'off') setPending({ kind: 'lightsOff', zone: z }); else ctl.setScene(z, s); }}
                      options={SCENES.map((s) => ({ value: s, label: t(`fm.controls.scenes.${s}`), disabled: !z.lights.length }))} />
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </Card>

      <Card title={<span className="ov-card-title">{t('fm.log.title')}</span>} info={t('fm.log.info')} pad="md">
        {ctl.log.length === 0 ? <p className="muted fm-empty">{t('fm.log.empty')}</p> : (
          <ul className="fm-log">
            {ctl.log.slice(0, 8).map((e, i) => (
              <li key={`${e.at}-${i}`} className="fm-log__row">
                <Check aria-hidden className="fm-log__icon" />
                <span className="fm-log__what">{logText(e)}</span>
                <span className="fm-log__who">{t('fm.who')}</span>
                <span className="fm-log__when num" title={fmtTime(e.at)}>{fmtAgo(Math.max(0, (data.live.nowMs - e.at) / 1000))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------- alarms ---------- */}
      <Card title={<span className="ov-card-title">{t('fm.alarms.title')}</span>} info={t('fm.alarms.info')} pad="md">
        <div className="fm-alarms-filter">
          <ChipGroup ariaLabel={t('fm.alarms.filter')} value={level} onChange={setLevel} scroll
            options={[
              { value: 'all', label: t('fm.alarms.all'), count: alerts.length },
              { value: 'critical', label: t('status.critical'), count: nCrit },
              { value: 'warning', label: t('status.warning'), count: nWarn },
              { value: 'info', label: t('status.info'), count: alerts.length - nCrit - nWarn },
            ]} />
        </div>
        {shown.length === 0 ? <EmptyState title={t('fm.alarms.none')} body={t('fm.alarms.noneBody')} compact /> : (
          <ul className="fm-alarms">
            {shown.map((a) => (
              <li key={a.id} className="fm-alarm">
                <span className="fm-alarm__lvl"><StatusBadge status={a.level} /></span>
                <span className="fm-alarm__text">
                  <span className="fm-alarm__title">{pick(a.titleEn, a.titleAr)}</span>
                  <span className="fm-alarm__meta">{pick(a.areaEn, a.areaAr)} · {t('fm.alarms.since', { d: fmtAge((data.live.nowMs - a.sinceMs) / 1000) })}</span>
                </span>
                <span className="fm-alarm__actions">
                  {a.status === 'acknowledged'
                    ? <Badge tone="neutral" icon={Check}>{t('fm.alarms.acknowledged')}</Badge>
                    : <Button size="sm" icon={Check} onClick={() => ack(a)}>{t('fm.alarms.ack')}</Button>}
                  <Button size="sm" variant="ghost" icon={X} onClick={() => setPending({ kind: 'clear', alert: a })}>{t('fm.alarms.clear')}</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog open={!!dlg} title={dlg?.title ?? ''} body={dlg?.body} confirmLabel={dlg?.btn} tone={dlg?.tone}
        onCancel={() => setPending(null)} onConfirm={() => { dlg?.run(); setPending(null); }} />
    </div>
  );
}
