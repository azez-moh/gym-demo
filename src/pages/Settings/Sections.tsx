import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { CheckCircle2, ImagePlus, MinusCircle, PlugZap, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, Card, InfoTip, Select, TextField, Toggle } from '../../components';
import { useI18n } from '../../i18n';
import { useDemo, focusClub } from '../../data';
import { useScope } from '../../layout/filters';

/* ---------- browser storage helpers (every read and write guarded) ---------- */

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch { return fallback; }
}
function writeJson(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

/** "Saved" status line after a save; resets when the form changes again. */
function SaveRow({ onSave, status }: { onSave: () => void; status: 'idle' | 'ok' | 'fail' }) {
  const { t } = useI18n();
  return (
    <div className="st-save">
      <Button variant="primary" onClick={onSave}>{t('settings.common.save')}</Button>
      <span className="st-save__status" role="status" aria-live="polite">
        {status === 'ok' && <><CheckCircle2 aria-hidden />{t('settings.common.saved')}</>}
        {status === 'fail' && t('settings.common.notSaved')}
      </span>
    </div>
  );
}

function useSaveStatus(deps: unknown[]) {
  const [status, setStatus] = useState<'idle' | 'ok' | 'fail'>('idle');
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    setStatus('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [status, setStatus] as const;
}

/* ---------- 1. Working hours ---------- */

interface DayHours { open: boolean; from: string; to: string }
interface WorkingHours { days: DayHours[]; timezone: string; excludeClosed: boolean }

const TZ = [
  { value: 'Asia/Riyadh', key: 'riyadh' }, { value: 'Asia/Dubai', key: 'dubai' }, { value: 'Asia/Kuwait', key: 'kuwait' },
  { value: 'Asia/Bahrain', key: 'bahrain' }, { value: 'Asia/Qatar', key: 'qatar' }, { value: 'Africa/Cairo', key: 'cairo' },
  { value: 'Europe/London', key: 'london' }, { value: 'UTC', key: 'utc' },
] as const;

const hhmm = (h: number) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Open minutes of one day under the production rules (earlier close runs past midnight, equal means 24 hours). */
function dayMinutes(d: DayHours): number {
  if (!d.open) return 0;
  const a = toMin(d.from), b = toMin(d.to);
  if (a === b) return 1440;
  return b > a ? b - a : 1440 - a + b;
}

export function WorkingHoursCard() {
  const { t, fmtNumber } = useI18n();
  const data = useDemo();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const defaults = useMemo<WorkingHours>(() => {
    const h = club.hours;
    const day = (dow: number): DayHours => {
      const x = dow === 5 && h.fri ? h.fri : dow === 6 && h.sat ? h.sat : h;
      return { open: true, from: hhmm(x.open), to: hhmm(x.close) };
    };
    return { days: [0, 1, 2, 3, 4, 5, 6].map(day), timezone: 'Asia/Riyadh', excludeClosed: true };
  }, [club]);
  const [wh, setWh] = useState<WorkingHours>(() => {
    const v = readJson('gym.workingHours', defaults);
    return Array.isArray(v.days) && v.days.length === 7 ? v : defaults;
  });
  const [status, setStatus] = useSaveStatus([wh]);
  const setDay = (i: number, patch: Partial<DayHours>) => setWh((w) => ({ ...w, days: w.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
  const weekHours = wh.days.reduce((s, d) => s + dayMinutes(d), 0) / 60;

  return (
    <Card title={<span className="st-cardtitle">{t('settings.work.title')}<InfoTip text={t('settings.work.rulesInfo')} /></span>} info={t('settings.work.info')}
      subtitle={t('settings.work.perWeek', { h: fmtNumber(Math.round(weekHours * 10) / 10) })}>
      <div className="st-hours" role="table" aria-label={t('settings.work.title')}>
        <div className="st-hours__row st-hours__head" role="row">
          <span role="columnheader">{t('settings.work.day')}</span>
          <span role="columnheader">{t('settings.work.open')}</span>
          <span role="columnheader">{t('settings.work.opens')}</span>
          <span role="columnheader">{t('settings.work.closes')}</span>
          <span role="columnheader" className="st-hours__notecol" aria-hidden />
        </div>
        {wh.days.map((d, i) => {
          const day = t(`settings.work.days.d${i}`);
          const a = toMin(d.from), b = toMin(d.to);
          const note = !d.open ? t('settings.work.closed') : a === b ? t('settings.work.allDay') : b < a ? t('settings.work.nextDay') : '';
          return (
            <div key={i} className={`st-hours__row ${d.open ? '' : 'is-closed'}`.trim()} role="row">
              <span role="cell" className="st-hours__day">{day}</span>
              <span role="cell"><Toggle checked={d.open} onChange={(v) => setDay(i, { open: v })} label={t('settings.work.openOn', { day })} /></span>
              <span role="cell"><input className="field__input st-time" type="time" dir="ltr" value={d.from} disabled={!d.open}
                aria-label={t('settings.work.opensOn', { day })} onChange={(e) => setDay(i, { from: e.target.value })} /></span>
              <span role="cell"><input className="field__input st-time" type="time" dir="ltr" value={d.to} disabled={!d.open}
                aria-label={t('settings.work.closesOn', { day })} onChange={(e) => setDay(i, { to: e.target.value })} /></span>
              <span role="cell" className="st-hours__note">{note}</span>
            </div>
          );
        })}
      </div>
      <div className="st-formgrid">
        <div className="st-field">
          <span className="st-field__label">{t('settings.work.timezone')}</span>
          <Select label={t('settings.work.timezone')} value={wh.timezone} onChange={(v) => setWh((w) => ({ ...w, timezone: v }))}
            options={TZ.map((z) => ({ value: z.value, label: t(`settings.work.tz.${z.key}`) }))} />
        </div>
        <div className="st-switchrow">
          <Toggle checked={wh.excludeClosed} onChange={(v) => setWh((w) => ({ ...w, excludeClosed: v }))} label={t('settings.work.exclude')} />
          <span>{t('settings.work.exclude')}</span>
          <InfoTip text={t('settings.work.excludeInfo')} />
        </div>
      </div>
      <SaveRow status={status} onSave={() => setStatus(writeJson('gym.workingHours', wh) ? 'ok' : 'fail')} />
    </Card>
  );
}

/* ---------- 2. Display privacy ---------- */

function readBlur(): boolean {
  try { return localStorage.getItem('gym.blurCameras') !== 'off'; } catch { return true; }
}

export function PrivacyCard() {
  const { t } = useI18n();
  const [blur, setBlur] = useState(readBlur);
  useEffect(() => {
    document.documentElement.dataset.blurCameras = blur ? 'on' : 'off';
    try { localStorage.setItem('gym.blurCameras', blur ? 'on' : 'off'); } catch { /* not stored: applies for this visit */ }
  }, [blur]);
  return (
    <Card title={t('settings.privacy.title')} info={t('settings.privacy.info')}>
      <div className="st-switchrow">
        <Toggle checked={blur} onChange={setBlur} label={t('settings.privacy.blur')} />
        <span>{t('settings.privacy.blur')}</span>
      </div>
      <p className="st-status" role="status"><ShieldCheck aria-hidden />{blur ? t('settings.privacy.on') : t('settings.privacy.off')}</p>
      <p className="st-note">{t('settings.privacy.note')}</p>
    </Card>
  );
}

/* ---------- 3. Branding ---------- */

type FontKey = 'clash' | 'system' | 'arial' | 'verdana' | 'georgia';
const FONTS: Record<FontKey, string> = {
  clash: "'Clash Display', system-ui, sans-serif",
  system: 'system-ui, -apple-system, Segoe UI, sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  verdana: 'Verdana, Geneva, sans-serif',
  georgia: 'Georgia, serif',
};
interface Branding { name: string; primary: string; accent: string; font: FontKey; size: number }
const LOGO_MAX = 1.5 * 1024 * 1024;

/** Initial colour values: read from the current theme tokens, so the pickers start on the Primewave palette. */
function themeColour(name: string, fallback: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
  } catch { return fallback; }
}

export function BrandingCard() {
  const { t, pick } = useI18n();
  const data = useDemo();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const [b, setB] = useState<Branding>(() => readJson<Branding>('gym.branding', {
    name: '', primary: themeColour('--pw-violet', '#7c3aed'), accent: themeColour('--pw-cyan', '#21c3d6'), font: 'clash', size: 16,
  }));
  const [logo, setLogo] = useState<string>(() => { try { return localStorage.getItem('gym.brandLogo') ?? ''; } catch { return ''; } });
  const [logoNote, setLogoNote] = useState<'' | 'kept' | 'session'>(() => (logo ? 'kept' : ''));
  const [status, setStatus] = useSaveStatus([b]);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? '');
      setLogo(url);
      let kept = false;
      if (f.size <= LOGO_MAX) { try { localStorage.setItem('gym.brandLogo', url); kept = true; } catch { kept = false; } }
      else { try { localStorage.removeItem('gym.brandLogo'); } catch { /* ignore */ } }
      setLogoNote(kept ? 'kept' : 'session');
    };
    reader.readAsDataURL(f);
  };
  const removeLogo = () => {
    setLogo(''); setLogoNote('');
    try { localStorage.removeItem('gym.brandLogo'); } catch { /* ignore */ }
  };
  const shownName = b.name.trim() || pick(club.nameEn, club.nameAr);

  return (
    <Card title={t('settings.brand.title')} info={t('settings.brand.info')}>
      <div className="st-brand">
        <div className="st-brand__form">
          <div className="st-field">
            <span className="st-field__label">{t('settings.brand.logo')}</span>
            <div className="st-logo">
              <div className="st-logo__box">{logo ? <img src={logo} alt={t('settings.brand.logo')} /> : <ImagePlus aria-hidden />}</div>
              <div className="st-logo__actions">
                <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="visually-hidden" onChange={onFile}
                  aria-label={t('settings.brand.upload')} tabIndex={-1} />
                <Button size="sm" icon={ImagePlus} onClick={() => fileRef.current?.click()}>{logo ? t('settings.brand.replace') : t('settings.brand.upload')}</Button>
                {logo && <Button size="sm" variant="ghost" icon={Trash2} onClick={removeLogo}>{t('settings.brand.remove')}</Button>}
              </div>
            </div>
            <span className="st-note st-note--tight">{logoNote === 'kept' ? t('settings.brand.logoKept') : logoNote === 'session' ? t('settings.brand.logoSession') : t('settings.brand.logoHint')}</span>
          </div>
          <TextField label={t('settings.brand.name')} value={b.name} placeholder={t('settings.brand.namePlaceholder')} onChange={(v) => setB((x) => ({ ...x, name: v }))} />
          <div className="st-colors">
            {(['primary', 'accent'] as const).map((k) => (
              <label key={k} className="st-color">
                <span className="st-field__label">{t(`settings.brand.${k}`)}</span>
                <span className="st-color__wrap">
                  <input type="color" value={b[k]} onChange={(e) => setB((x) => ({ ...x, [k]: e.target.value }))} />
                  <span className="st-color__hex num" dir="ltr">{b[k].toUpperCase()}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="st-field">
            <span className="st-field__label">{t('settings.brand.font')}</span>
            <Select<FontKey> label={t('settings.brand.font')} value={b.font} onChange={(v) => setB((x) => ({ ...x, font: v }))}
              options={(Object.keys(FONTS) as FontKey[]).map((k) => ({ value: k, label: t(`settings.brand.fonts.${k}`) }))} />
          </div>
          <div className="st-field">
            <span className="st-field__label st-range__label">
              <span>{t('settings.brand.size')}</span><span className="num">{t('settings.brand.sizeValue', { n: b.size })}</span>
            </span>
            <input type="range" className="st-range" min={12} max={24} step={1} value={b.size} aria-label={t('settings.brand.size')}
              onChange={(e) => setB((x) => ({ ...x, size: Number(e.target.value) }))} />
          </div>
          <SaveRow status={status} onSave={() => setStatus(writeJson('gym.branding', b) ? 'ok' : 'fail')} />
        </div>

        <div className="st-brand__preview">
          <span className="st-field__label st-preview__label">{t('settings.brand.preview')}<InfoTip text={t('settings.brand.previewInfo')} /></span>
          {/* Scoped inline styles: the chosen values apply to this preview only, never to the app theme. */}
          <div className="st-preview" style={{ fontFamily: FONTS[b.font], fontSize: `${b.size}px` }}>
            <div className="st-preview__head" style={{ borderBlockEndColor: b.primary }}>
              {logo ? <img src={logo} alt="" className="st-preview__logo" /> : <span className="st-preview__mark" style={{ background: b.primary }} aria-hidden />}
              <span className="st-preview__name">{shownName}</span>
              <span className="st-preview__chip" style={{ background: b.accent }} aria-hidden />
            </div>
            <div className="st-preview__body">
              <span className="st-preview__title">{t('settings.brand.sampleTitle')}</span>
              <div className="st-preview__kpi" style={{ borderInlineStartColor: b.primary }}>
                <span className="st-preview__kpilabel">{t('settings.brand.sampleKpi')}</span>
                <span className="st-preview__kpivalue num" style={{ color: b.primary }}>18</span>
                <span className="st-preview__kpihint">{t('settings.brand.sampleOf', { n: 42 })}</span>
                <span className="st-preview__bar"><span style={{ width: '43%', background: b.accent }} /></span>
              </div>
              <span className="st-preview__btn" style={{ background: b.primary }}>{t('settings.brand.sampleButton')}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------- 4. AI providers ---------- */

type ProviderId = 'onsite' | 'openai' | 'gemini' | 'anthropic' | 'deepseek';
const PROVIDERS: { id: ProviderId; models: string[] }[] = [
  { id: 'onsite', models: ['Llama 3.1 8B', 'Qwen 2.5 7B', 'Mistral 7B'] },
  { id: 'openai', models: ['GPT-4.1', 'GPT-4.1 mini', 'GPT-4o'] },
  { id: 'gemini', models: ['Gemini 2.5 Pro', 'Gemini 2.5 Flash'] },
  { id: 'anthropic', models: ['Claude Sonnet', 'Claude Haiku', 'Claude Opus'] },
  { id: 'deepseek', models: ['DeepSeek V3', 'DeepSeek R1'] },
];
interface ProviderState { model: string; endpoint: string; hasKey: boolean }

/** A test that never leaves the browser: it only checks the fields are filled in, then reports success. */
function useSimTest() {
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'missing'>('idle');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const run = (ready: boolean) => {
    window.clearTimeout(timer.current);
    if (!ready) { setState('missing'); return; }
    setState('busy');
    timer.current = window.setTimeout(() => setState('ok'), 700);
  };
  return { state, run, reset: () => setState('idle') };
}

function TestResult({ state }: { state: ReturnType<typeof useSimTest>['state'] }) {
  const { t } = useI18n();
  return (
    <span className="st-test" role="status" aria-live="polite">
      {state === 'busy' && t('settings.common.testing')}
      {state === 'ok' && <><CheckCircle2 aria-hidden />{t('settings.common.testPassed')}</>}
      {state === 'missing' && t('settings.common.testNeedsSetup')}
    </span>
  );
}

function ConnChip({ on }: { on: boolean }) {
  const { t } = useI18n();
  return on
    ? <Badge tone="success" icon={CheckCircle2}>{t('settings.common.connected')}</Badge>
    : <Badge tone="neutral" icon={MinusCircle}>{t('settings.common.notConnected')}</Badge>;
}

function ProviderCard({ id, models, value, onChange }: { id: ProviderId; models: string[]; value: ProviderState; onChange: (v: ProviderState) => void }) {
  const { t } = useI18n();
  const [key, setKey] = useState('');
  const test = useSimTest();
  const local = id === 'onsite';
  const connected = local ? !!value.endpoint.trim() : value.hasKey;
  // A typed key is stored only as "a key is set"; the key itself is never kept in the page or shown back.
  const commitKey = () => { if (key.trim()) { onChange({ ...value, hasKey: true }); setKey(''); } };
  return (
    <div className="st-prov">
      <div className="st-prov__head">
        <span className="st-prov__name">{t(`settings.ai.providers.${id}.name`)}</span>
        <ConnChip on={connected} />
      </div>
      <p className="st-prov__desc">{t(`settings.ai.providers.${id}.desc`)}</p>
      <div className="st-field">
        <span className="st-field__label">{t('settings.common.model')}</span>
        <Select label={t('settings.common.model')} value={value.model} onChange={(v) => { onChange({ ...value, model: v }); test.reset(); }}
          options={models.map((m) => ({ value: m, label: m }))} />
      </div>
      {local ? (
        <TextField label={t('settings.ai.endpoint')} value={value.endpoint} dir="ltr" placeholder="http://10.0.0.20:11434"
          onChange={(v) => { onChange({ ...value, endpoint: v }); test.reset(); }} />
      ) : (
        <div className="st-keyfield" onBlur={commitKey}>
          <TextField label={t('settings.common.apiKey')} type="password" dir="ltr" value={key}
            placeholder={value.hasKey ? t('settings.common.keyKept') : t('settings.common.keyEnter')}
            onChange={(v) => { setKey(v); test.reset(); }} />
        </div>
      )}
      <div className="st-prov__foot">
        <Button size="sm" icon={PlugZap} disabled={test.state === 'busy'} onClick={() => { commitKey(); test.run(local ? !!value.endpoint.trim() : value.hasKey || !!key.trim()); }}>
          {t('settings.common.test')}
        </Button>
        <TestResult state={test.state} />
      </div>
    </div>
  );
}

export function AiProvidersCard() {
  const { t } = useI18n();
  const [ps, setPs] = useState<Record<ProviderId, ProviderState>>(() => {
    const base = Object.fromEntries(PROVIDERS.map((p) => [p.id, { model: p.models[0], endpoint: p.id === 'onsite' ? 'http://10.0.0.20:11434' : '', hasKey: false }])) as Record<ProviderId, ProviderState>;
    const saved = readJson<Partial<Record<ProviderId, ProviderState>>>('gym.aiProviders', {});
    for (const p of PROVIDERS) if (saved[p.id]) base[p.id] = { ...base[p.id], ...saved[p.id] };
    return base;
  });
  const [status, setStatus] = useSaveStatus([ps]);
  return (
    <Card title={t('settings.ai.title')} info={t('settings.ai.info')}>
      <p className="st-status"><ShieldCheck aria-hidden />{t('settings.ai.noImages')}</p>
      <div className="st-provs">
        {PROVIDERS.map((p) => (
          <ProviderCard key={p.id} id={p.id} models={p.models} value={ps[p.id]} onChange={(v) => setPs((x) => ({ ...x, [p.id]: v }))} />
        ))}
      </div>
      <SaveRow status={status} onSave={() => setStatus(writeJson('gym.aiProviders', ps) ? 'ok' : 'fail')} />
    </Card>
  );
}

/* ---------- 5. Notifications ---------- */

interface Notify {
  email: { on: boolean; host: string; port: string; sender: string; recipients: string };
  telegram: { on: boolean; hasToken: boolean; chatId: string };
}

export function NotificationsCard() {
  const { t } = useI18n();
  const [n, setN] = useState<Notify>(() => readJson<Notify>('gym.notifications', {
    email: { on: false, host: '', port: '587', sender: '', recipients: '' },
    telegram: { on: false, hasToken: false, chatId: '' },
  }));
  const [token, setToken] = useState('');
  const [status, setStatus] = useSaveStatus([n]);
  const mailTest = useSimTest();
  const tgTest = useSimTest();
  const setMail = (p: Partial<Notify['email']>) => { setN((x) => ({ ...x, email: { ...x.email, ...p } })); mailTest.reset(); };
  const setTg = (p: Partial<Notify['telegram']>) => { setN((x) => ({ ...x, telegram: { ...x.telegram, ...p } })); tgTest.reset(); };
  const commitToken = () => { if (token.trim()) { setTg({ hasToken: true }); setToken(''); } };
  const mailReady = !!(n.email.host.trim() && n.email.port.trim() && n.email.sender.trim() && n.email.recipients.trim());
  const tgReady = (n.telegram.hasToken || !!token.trim()) && !!n.telegram.chatId.trim();
  const channel = (label: string) => t('settings.notify.enable', { channel: label });

  return (
    <Card title={t('settings.notify.title')} info={t('settings.notify.info')}>
      <p className="st-status"><ShieldCheck aria-hidden />{t('settings.ai.noImages')}</p>
      <div className="st-provs st-provs--two">
        <div className="st-prov">
          <div className="st-prov__head">
            <span className="st-prov__name">{t('settings.notify.email')}</span>
            <ConnChip on={n.email.on && mailReady} />
          </div>
          <p className="st-prov__desc">{t('settings.notify.emailInfo')}</p>
          <div className="st-switchrow">
            <Toggle checked={n.email.on} onChange={(v) => setMail({ on: v })} label={channel(t('settings.notify.email'))} />
            <span>{t('settings.common.enabled')}</span>
          </div>
          <div className="st-pair">
            <TextField label={t('settings.notify.host')} dir="ltr" value={n.email.host} placeholder="smtp.example.com" onChange={(v) => setMail({ host: v })} />
            <TextField label={t('settings.notify.port')} dir="ltr" type="number" value={n.email.port} onChange={(v) => setMail({ port: v })} />
          </div>
          <TextField label={t('settings.notify.sender')} dir="ltr" type="email" value={n.email.sender} placeholder="alerts@example.com" onChange={(v) => setMail({ sender: v })} />
          <TextField label={t('settings.notify.recipients')} dir="ltr" value={n.email.recipients} placeholder={t('settings.notify.recipientsHint')} onChange={(v) => setMail({ recipients: v })} />
          <div className="st-prov__foot">
            <Button size="sm" icon={PlugZap} disabled={mailTest.state === 'busy'} onClick={() => mailTest.run(mailReady)}>{t('settings.common.test')}</Button>
            <TestResult state={mailTest.state} />
          </div>
        </div>

        <div className="st-prov">
          <div className="st-prov__head">
            <span className="st-prov__name">{t('settings.notify.telegram')}</span>
            <ConnChip on={n.telegram.on && n.telegram.hasToken && !!n.telegram.chatId.trim()} />
          </div>
          <p className="st-prov__desc">{t('settings.notify.telegramInfo')}</p>
          <div className="st-switchrow">
            <Toggle checked={n.telegram.on} onChange={(v) => setTg({ on: v })} label={channel(t('settings.notify.telegram'))} />
            <span>{t('settings.common.enabled')}</span>
          </div>
          <div className="st-keyfield" onBlur={commitToken}>
            <TextField label={t('settings.notify.botToken')} type="password" dir="ltr" value={token}
              placeholder={n.telegram.hasToken ? t('settings.common.keyKept') : t('settings.common.keyEnter')} onChange={(v) => { setToken(v); tgTest.reset(); }} />
          </div>
          <TextField label={t('settings.notify.chatId')} dir="ltr" value={n.telegram.chatId} placeholder="-1001234567890" onChange={(v) => setTg({ chatId: v })} />
          <div className="st-prov__foot">
            <Button size="sm" icon={PlugZap} disabled={tgTest.state === 'busy'} onClick={() => { commitToken(); tgTest.run(tgReady); }}>{t('settings.common.test')}</Button>
            <TestResult state={tgTest.state} />
          </div>
        </div>
      </div>
      <SaveRow status={status} onSave={() => { commitToken(); setStatus(writeJson('gym.notifications', { ...n, telegram: { ...n.telegram, hasToken: n.telegram.hasToken || !!token.trim() } }) ? 'ok' : 'fail'); }} />
    </Card>
  );
}
