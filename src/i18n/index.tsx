/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './en';
import ar from './ar';

export type Lang = 'en' | 'ar';
export type Dir = 'ltr' | 'rtl';
type Tree = { [k: string]: string | number | Tree };
type Flat = Record<string, string>;

const LANG_KEY = 'opt.lang';

function flatten(obj: Tree, prefix = '', out: Flat = {}): Flat {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === 'object') flatten(v as Tree, key, out);
    else out[key] = String(v);
  }
  return out;
}

/*
  Page dictionaries: every file src/i18n/pages/<page>.ts is merged automatically.
  The file must export { en: {...}, ar: {...} } (as default export, or as named exports `en` and `ar`,
  or as any named export object holding both). Keys are namespaced by the file name:
    src/i18n/pages/liveFloor.ts  { en: { kpi: { inUse: 'In use' } } }  ->  t('liveFloor.kpi.inUse')
*/
type PageModule = Record<string, unknown>;
const pageModules = import.meta.glob<PageModule>('./pages/*.ts', { eager: true });

function pickDicts(mod: PageModule): { en?: Tree; ar?: Tree } | null {
  const cands: unknown[] = [mod.default, mod, ...Object.values(mod)];
  for (const c of cands) {
    if (c && typeof c === 'object' && 'en' in c && 'ar' in c) {
      const o = c as { en: Tree; ar: Tree };
      return { en: o.en, ar: o.ar };
    }
  }
  return null;
}

function buildDictionaries(): Record<Lang, Flat> {
  const dicts: Record<Lang, Flat> = { en: flatten(en as unknown as Tree), ar: flatten(ar as unknown as Tree) };
  for (const [path, mod] of Object.entries(pageModules)) {
    const ns = path.replace(/^.*\//, '').replace(/\.ts$/, '');
    const d = pickDicts(mod);
    if (!d) {
      if (import.meta.env.DEV) console.warn(`[i18n] ${path} does not export { en, ar }`);
      continue;
    }
    if (d.en) flatten(d.en, ns, dicts.en);
    if (d.ar) flatten(d.ar, ns, dicts.ar);
  }
  return dicts;
}

const DICTS = buildDictionaries();

export function translate(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = DICTS[lang][key] ?? DICTS.en[key];
  if (s === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Latin digits in both languages, Gregorian calendar, Arabic month and day names in Arabic. */
export const LOCALE: Record<Lang, string> = { en: 'en-GB', ar: 'ar-SA-u-nu-latn-ca-gregory' };

export type DateStyle = 'long' | 'medium' | 'short' | 'weekday' | 'weekdayLong' | 'month' | 'monthLong' | 'iso';

export interface I18n {
  lang: Lang;
  dir: Dir;
  isRtl: boolean;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Pick between inline en/ar strings, e.g. pick(branch.nameEn, branch.nameAr). */
  pick: (enText: string, arText: string) => string;
  fmtNumber: (n: number, opts?: number | Intl.NumberFormatOptions) => string;
  fmtPercent: (pct: number, decimals?: number) => string;
  fmtDate: (d: Date | string | number, style?: DateStyle | Intl.DateTimeFormatOptions) => string;
  fmtTime: (d: Date | string | number) => string;
  /**
   * Shared duration formatter (seconds in). Under 1 h: "1 min 37 s", "4 min", "37 s"; 1 h and above: "2 h 5 min".
   * Arabic: "1 د 37 ث", "2 س 5 د". `compact` gives "m:ss" for dense tables only.
   */
  fmtDuration: (sec: number, opts?: { compact?: boolean }) => string;
  /** Average in minutes for KPI tiles and tables, at most 1 decimal: "12.5 min" / "12.5 د". */
  fmtMinutes: (min: number) => string;
  /** Minute unit label ("min" / "د"). */
  minUnit: string;
  /** Relative age from seconds: "4 min ago", "2 h 5 min ago", "3 d ago" / "منذ 4 د". */
  fmtAgo: (sec: number) => string;
  /** Age without "ago", for columns headed "Age" / "منذ": "4 min", "2 h 5 min", "3 d". */
  fmtAge: (sec: number) => string;
  fmtCurrency: (sar: number, decimals?: number) => string;
  /** Energy with unit: "1,840 kWh", or "52.3 MWh" when >= 10,000 kWh. Arabic "كيلوواط ساعة" / "ميغاواط ساعة". */
  fmtEnergy: (kwh: number) => string;
  /**
   * Gym count: "1 gym", "6 gyms" / Arabic with number agreement: "صالة رياضية واحدة", "صالتان رياضيتان",
   * "3 صالات رياضية" (3 to 10), "11 صالة رياضية" (11 and above). Name kept for existing callers.
   */
  fmtClubs: (n: number) => string;
  /** Kept for Dunkin-ported code: same as fmtClubs. */
  fmtBranches: (n: number) => string;
}

const Ctx = createContext<I18n | null>(null);

function readLang(): Lang {
  try { return localStorage.getItem(LANG_KEY) === 'ar' ? 'ar' : 'en'; } catch { return 'en'; }
}

function applyLang(l: Lang) {
  const el = document.documentElement;
  el.lang = l;
  el.dir = l === 'ar' ? 'rtl' : 'ltr';
}

const toDate = (d: Date | string | number) => (d instanceof Date ? d : new Date(d));

const DATE_STYLES: Record<Exclude<DateStyle, 'iso'>, Intl.DateTimeFormatOptions> = {
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  medium: { day: 'numeric', month: 'short', year: 'numeric' },
  short: { day: 'numeric', month: 'short' },
  weekday: { weekday: 'short' },
  weekdayLong: { weekday: 'long' },
  month: { month: 'short', year: 'numeric' },
  monthLong: { month: 'long', year: 'numeric' },
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const l = readLang();
    applyLang(l);
    return l;
  });

  const setLang = useCallback((l: Lang) => {
    applyLang(l);
    setLangState(l);
    try { localStorage.setItem(LANG_KEY, l); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    document.title = translate(lang, 'app.title');
  }, [lang]);

  const value = useMemo<I18n>(() => {
    const loc = LOCALE[lang];
    const nfCache = new Map<string, Intl.NumberFormat>();
    const nf = (o: Intl.NumberFormatOptions) => {
      const k = JSON.stringify(o);
      let f = nfCache.get(k);
      if (!f) { f = new Intl.NumberFormat(loc, o); nfCache.set(k, f); }
      return f;
    };
    const fmtNumber = (n: number, opts?: number | Intl.NumberFormatOptions) => {
      if (!Number.isFinite(n)) return '–';
      const o: Intl.NumberFormatOptions = typeof opts === 'number'
        ? { minimumFractionDigits: opts, maximumFractionDigits: opts }
        : { maximumFractionDigits: 1, ...opts };
      return nf(o).format(n);
    };
    const u = lang === 'ar'
      ? { s: 'ث', m: 'د', h: 'س', d: 'ي' }
      : { s: 's', m: 'min', h: 'h', d: 'd' };
    const fmtDuration = (sec: number, opts?: { compact?: boolean }) => {
      if (!Number.isFinite(sec)) return '–';
      const s = Math.max(0, Math.round(sec));
      if (opts?.compact) {
        const m = Math.floor(s / 60);
        return `${m}:${String(s % 60).padStart(2, '0')}`;
      }
      if (s < 60) return `${s} ${u.s}`;
      if (s < 3600) {
        const m = Math.floor(s / 60), r = s % 60;
        return r ? `${m} ${u.m} ${r} ${u.s}` : `${m} ${u.m}`;
      }
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
      return m ? `${h} ${u.h} ${m} ${u.m}` : `${h} ${u.h}`;
    };
    const fmtAge = (sec: number) => {
      const s = Math.max(60, Math.round(sec / 60) * 60);
      if (s < 48 * 3600) return fmtDuration(s);
      const n = Math.floor(s / 86400);
      return lang === 'ar' ? `${n} ${n <= 10 ? 'أيام' : 'يومًا'}` : `${n} ${u.d}`;
    };
    /** Gym count, EN "1 gym" / "6 gyms"; AR 1, 2, 3 to 10 and 11+ forms of "صالة رياضية". */
    const fmtGyms = (n: number) => {
      const k = n === 1 ? 'One' : n === 2 ? 'Two' : n >= 3 && n <= 10 ? 'Few' : '';
      return translate(lang, `scope.clubsCount${k}`, { n: fmtNumber(n) });
    };
    const fmtAgo = (sec: number) => (lang === 'ar' ? `منذ ${fmtAge(sec)}` : `${fmtAge(sec)} ago`);
    const timeFmt = new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit', hour12: true });
    return {
      lang,
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      isRtl: lang === 'ar',
      setLang,
      toggleLang: () => setLang(lang === 'ar' ? 'en' : 'ar'),
      t: (key, vars) => translate(lang, key, vars),
      pick: (e, a) => (lang === 'ar' ? a || e : e),
      fmtNumber,
      fmtPercent: (pct, decimals = 0) => `${fmtNumber(pct, decimals)}%`,
      fmtDate: (d, style = 'medium') => {
        const date = toDate(d);
        if (style === 'iso') {
          const p = (x: number) => String(x).padStart(2, '0');
          return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
        }
        const o = typeof style === 'string' ? DATE_STYLES[style] : style;
        const out = new Intl.DateTimeFormat(loc, o).format(date);
        // en-GB short month for September is "Sept"; use the 3-letter form everywhere.
        return lang === 'en' ? out.replace(/\bSept\b/g, 'Sep') : out;
      },
      // "7:24 PM" in English (en-GB gives "7:24 pm"), "7:24 م" in Arabic.
      fmtTime: (d) => {
        const out = timeFmt.format(toDate(d));
        return lang === 'en' ? out.replace(/\b(am|pm)\b/g, (m) => m.toUpperCase()) : out;
      },
      fmtDuration,
      fmtMinutes: (min) => (Number.isFinite(min) ? `${fmtNumber(min, { maximumFractionDigits: 1 })} ${u.m}` : '–'),
      minUnit: u.m,
      fmtAgo,
      fmtAge,
      fmtClubs: (n) => fmtGyms(n),
      fmtBranches: (n) => fmtGyms(n),
      fmtEnergy: (kwh) => {
        if (!Number.isFinite(kwh)) return '–';
        if (Math.abs(kwh) >= 10000) return `${fmtNumber(kwh / 1000, 1)} ${lang === 'ar' ? 'ميغاواط ساعة' : 'MWh'}`;
        return `${fmtNumber(Math.round(kwh))} ${lang === 'ar' ? 'كيلوواط ساعة' : 'kWh'}`;
      },
      fmtCurrency: (sar, decimals = 0) => {
        const v = fmtNumber(sar, decimals);
        return lang === 'ar' ? `${v} ر.س` : `SAR ${v}`;
      },
    };
  }, [lang, setLang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n must be used inside <I18nProvider>');
  return c;
}
