import { useMemo, useState } from 'react';
import { Clock, Lock, Save, Thermometer } from 'lucide-react';
import { Badge, Button, Card, InfoTip, Toggle } from '../../components';
import { useI18n } from '../../i18n';
import { TimeField } from '../Control/TimeField';
import { useDemo, localParts, type BmsSettings } from '../../data';
import { useSaveBms, useSavedLine } from './saved';

type Day = BmsSettings['workingHours'][number];
type Outside = BmsSettings['outside'];
const OUT_KEYS: (keyof Outside)[] = ['summerHigh', 'summerLow', 'winterHigh', 'winterLow'];

const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
function dayHours(d: Day): number {
  if (!d.open) return 0;
  let x = toMin(d.to) - toMin(d.from);
  if (x <= 0) x += 1440;
  return x / 60;
}

/** Position in the year between mid-January (0) and mid-July (1), smooth. */
function summerFrac(ms: number): { frac: number; month: number } {
  const p = localParts(ms);
  const [y, m, d] = p.date.split('-').map(Number);
  const doy = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000;
  return { frac: (1 - Math.cos((2 * Math.PI * (doy - 15)) / 365)) / 2, month: m };
}

export function BuildingTab() {
  const { t, fmtNumber, isRtl } = useI18n();
  const data = useDemo();
  const save = useSaveBms();
  const savedLine = useSavedLine();
  const stored = data.settings;
  const [hours, setHours] = useState<Day[]>(() => stored.workingHours.map((d) => ({ ...d })));
  const [out, setOut] = useState<Record<keyof Outside, string>>(() => Object.fromEntries(OUT_KEYS.map((k) => [k, String(stored.outside[k])])) as Record<keyof Outside, string>);
  const [flash, setFlash] = useState(false);

  const total = Math.round(hours.reduce((a, d) => a + dayHours(d), 0) * 10) / 10;
  const errs = Object.fromEntries(OUT_KEYS.map((k) => { const v = Number(out[k]); return [k, out[k].trim() === '' || !Number.isFinite(v) || v < -10 || v > 60]; })) as Record<keyof Outside, boolean>;
  const anyErr = OUT_KEYS.some((k) => errs[k]);
  const num = (k: keyof Outside) => (errs[k] ? stored.outside[k] : Number(out[k]));

  const today = useMemo(() => {
    const { frac, month } = summerFrac(data.live.nowMs);
    const day = num('winterHigh') + frac * (num('summerHigh') - num('winterHigh'));
    const night = num('winterLow') + frac * (num('summerLow') - num('winterLow'));
    const season = month <= 2 || month === 12 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn';
    return { day: Math.round(day), night: Math.round(night), pct: Math.round(frac * 100), season };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.live.nowMs, out]);

  const dirty = JSON.stringify(hours) !== JSON.stringify(stored.workingHours) || OUT_KEYS.some((k) => !errs[k] && Number(out[k]) !== stored.outside[k]);
  const setDay = (i: number, f: Partial<Day>) => setHours((h) => h.map((d, j) => (j === i ? { ...d, ...f } : d)));

  const doSave = () => {
    if (anyErr) return;
    save({ workingHours: hours, outside: Object.fromEntries(OUT_KEYS.map((k) => [k, Number(out[k])])) });
    setFlash(true);
    window.setTimeout(() => setFlash(false), 2000);
  };
  const discard = () => {
    setHours(stored.workingHours.map((d) => ({ ...d })));
    setOut(Object.fromEntries(OUT_KEYS.map((k) => [k, String(stored.outside[k])])) as Record<keyof Outside, string>);
  };

  return (
    <div className="stack">
      <div className="bmss__hoursgrid">
        <Card title={<span className="row" style={{ gap: 8 }}><Clock aria-hidden className="bmss__ticon" />{t('bmsSettings.hoursTitle')}</span>} info={t('bmsSettings.hoursInfo')}
          actions={<span className="row" style={{ gap: 4 }}><span className="num bmss__total">{t('bmsSettings.weekTotal', { h: fmtNumber(total) })}</span><InfoTip text={t('bmsSettings.weekTotalInfo')} /></span>}>
          <ul className="bmss__week">
            {hours.map((d, i) => (
              <li key={d.day} className={`bmss__day ${d.open ? '' : 'is-closed'}`}>
                <span className="bmss__dayname">{t(`bmsSettings.day.${d.day}`)}</span>
                <Toggle checked={d.open} label={`${t(`bmsSettings.day.${d.day}`)}: ${t('bmsSettings.open')}`} onChange={(v) => setDay(i, { open: v })} />
                {d.open ? (
                  <span className="bmss__times">
                    <TimeField className="bmss__time" value={d.from} label={`${t(`bmsSettings.day.${d.day}`)} ${t('bmsSettings.from')}`} onChange={(v) => setDay(i, { from: v })} />
                    <span className="faint">{t('bmsSettings.to')}</span>
                    <TimeField className="bmss__time" value={d.to} label={`${t(`bmsSettings.day.${d.day}`)} ${t('bmsSettings.to')}`} onChange={(v) => setDay(i, { to: v })} />
                  </span>
                ) : <span className="faint bmss__times">{t('bmsSettings.closed')}</span>}
                <span className="num faint bmss__dh">{d.open ? t('bmsSettings.dayHours', { h: fmtNumber(dayHours(d)) }) : ''}</span>
              </li>
            ))}
          </ul>
          <p className="faint bmss__used"><span>{t('bmsSettings.hoursUsedBy')}</span> <InfoTip text={t('bmsSettings.overnightInfo')} /></p>
        </Card>

        <Card tone="sunken" title={<span className="row" style={{ gap: 8 }}><Lock aria-hidden className="bmss__ticon" />{t('bmsSettings.cameraHours')}</span>} info={t('bmsSettings.cameraHoursInfo')}
          actions={<Badge tone="neutral">{t('bmsSettings.readOnlyTag')}</Badge>}>
          <div className="stack" style={{ gap: 10 }}>
            <p className="num bmss__camhrs">{t('bmsSettings.cameraHoursDaily')}</p>
            <p className="num muted">{t('bmsSettings.cameraHoursThu')}</p>
            <p className="faint bmss__used">{t('bmsSettings.cameraHoursUsedBy')}</p>
          </div>
        </Card>
      </div>

      <Card title={<span className="row" style={{ gap: 8 }}><Thermometer aria-hidden className="bmss__ticon" />{t('bmsSettings.outside')}</span>} info={t('bmsSettings.outsideInfo')}>
        <div className="bmss__temps">
          {OUT_KEYS.map((k) => (
            <label key={k} className={`bmss__temp ${errs[k] ? 'has-err' : ''}`}>
              <span className="field__label">{t(`bmsSettings.${k}`)}</span>
              <span className="bmss__tempwrap">
                <input type="number" min={-10} max={60} step={1} dir="ltr" className="field__input" value={out[k]} aria-invalid={errs[k]}
                  onChange={(e) => setOut((o) => ({ ...o, [k]: e.target.value }))} />
                <span className="faint ltr">°C</span>
              </span>
              {errs[k] && <span className="bmss__err" role="alert">{t('bmsSettings.rangeError')}</span>}
            </label>
          ))}
        </div>
        <div className="bmss__today">
          <span className="label">{t('bmsSettings.today')}</span>
          <span className="num bmss__todayval">{t('bmsSettings.todayLine', { day: fmtNumber(today.day), night: fmtNumber(today.night) })}</span>
          <span className="muted">{t('bmsSettings.seasonLine', { season: t(`bmsSettings.season.${today.season}`), pct: fmtNumber(today.pct) })}</span>
          <InfoTip text={t('bmsSettings.todayInfo')} />
        </div>
      </Card>

      <div className="bmss__savebar" dir={isRtl ? 'rtl' : 'ltr'}>
        <span className="faint">{savedLine}</span>
        <span className="row">
          {dirty && <Button variant="ghost" onClick={discard}>{t('bmsSettings.reset')}</Button>}
          <Button variant="primary" icon={Save} disabled={!dirty || anyErr} onClick={doSave}>{flash ? t('bmsSettings.saved') : t('bmsSettings.save')}</Button>
        </span>
      </div>
    </div>
  );
}
