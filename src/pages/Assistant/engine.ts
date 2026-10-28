import type { Alert, Club, DemoContextValue, Level, MachineType, Role } from '../../data';
import { acOf, alertsIn, areasOf, arrivalsByHour, isOpenAt, lightsOf, machinesByType, presenceOf, savingsSummary, LIVE_CLUB_ID, TARIFF_SAR_PER_KWH } from '../../data';
import { translate, LOCALE, type Lang } from '../../i18n';
import { buildInsights, gymStats, windows, type GymStats, type Insight, type InsightKind } from '../Overview/insights';
import { brief, makeTx, type Tx } from '../Overview/describe';
import { sortAlerts, peakHourOf } from '../Overview/metrics';

/*
  Ask Conductor, built-in mode: a small intent engine over the demo store. No network, no invented numbers:
  every figure comes from the same selectors as the dashboard (live snapshot, today, last 4 complete weeks,
  the recommendations in Overview/insights.ts). English and Arabic phrasings are matched with keyword and
  synonym tables after normalising the text (Arabic letter forms, diacritics, punctuation); gym names are
  matched with a small edit distance. Answers are built in the UI language.
*/

export type Intent =
  | 'help' | 'thanks' | 'people' | 'compare' | 'typeUse' | 'machineUse' | 'idle' | 'busiest' | 'recs' | 'alarms'
  | 'energy' | 'comfort' | 'oos' | 'service' | 'peak' | 'building' | 'unknown';

export interface RecItem { id: string; kind: InsightKind; kindLabel: string; text: string; key: string; conf: string; to?: string }

export type Block =
  | { k: 'p'; text: string }
  | { k: 'table'; head: string[]; rows: string[][]; end?: number[] }
  | { k: 'recs'; items: RecItem[] }
  | { k: 'links'; items: { label: string; to: string }[] }
  | { k: 'source'; text: string }
  | { k: 'suggest'; items: string[] };

export interface Answer { intent: Intent; understood: boolean; blocks: Block[] }

export interface EngineCtx {
  data: DemoContextValue;
  lang: Lang;
  role: Role;
  /** Gyms in the current scope (the Facility Manager: his gym only). */
  scopeClubs: Club[];
  /** Whether the signed-in role may open a path (links are dropped otherwise). */
  can: (path: string) => boolean;
}

// ---------- text normalisation and matching ----------

const AR_RE = /[؀-ۿ]/;

export function norm(s: string): string {
  return s.toLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/m²/g, 'm2')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Keyword test on normalised text. English: word-prefix ("alarm" matches "alarms"); a trailing $ means whole word. Arabic: substring. */
function find(text: string, kw: string): string | null {
  const whole = kw.endsWith('$');
  const k = norm(whole ? kw.slice(0, -1) : kw);
  if (!k) return null;
  if (AR_RE.test(k)) return text.includes(k) ? k : null;
  const m = new RegExp(`(?:^| )(${esc(k)}${whole ? '' : '[a-z0-9]*'})(?= |$)`).exec(text);
  return m ? m[1] : null;
}

/** Keyword entries: "!word" strong (3), "~word" weak (1), plain (2). */
function weightOf(kw: string): [string, number] {
  if (kw.startsWith('!')) return [kw.slice(1), 3];
  if (kw.startsWith('~')) return [kw.slice(1), 1];
  return [kw, 2];
}

const INTENT_KWS: { id: Exclude<Intent, 'typeUse' | 'unknown'>; kws: string[] }[] = [
  { id: 'oos', kws: ['!out of service', '!out-of-service', 'broken', 'disabled', '!not working', 'offline', '!خارج الخدمه', 'معطل', 'متوقف', '!لا تعمل'] },
  { id: 'service', kws: ['service', 'servicing', 'maintenance', 'maintain', 'repair', 'overdue', '!need service', 'صيانه', 'اصلاح', 'متاخر'] },
  { id: 'alarms', kws: ['alarm', 'alert', 'warning', 'critical', 'fault', 'incident', '~issue', '~problem', 'تنبيه', 'انذار', 'تحذير', 'حرج', 'عطل', 'اعطال', '~مشكل'] },
  { id: 'compare', kws: ['!compare', 'comparison', 'versus', 'vs$', 'difference', '~against', '~better', '~worse', '!which gym', 'rank', '!قارن', 'مقارنه', 'مقابل', 'الفرق', '~افضل', '~اسوا', '!اي صاله'] },
  { id: 'recs', kws: ['!what should', '!should i', '!should we', 'recommend', '!action', 'suggest', 'advice', '!to do', 'priorit', '~move', '~buy', '~purchase', '~retire', '~crowding',
    '!ماذا افعل', '!ماذا يجب', '!ماذا نفعل', 'توصي', '!اجراء', 'اقتراح', 'مقترح', 'انصح', 'نصيحه', '~شراء', '~اشتري', '~نقل', '~انقل', '~اخراج'] },
  { id: 'building', kws: ['!building mode', 'mode', 'building', 'ac$', 'a c$', '!air condition', 'hvac', 'cooling', 'lights', 'lighting', 'light$', 'setpoint',
    '!وضع المبنى', 'المبنى', 'مبنى', 'تكييف', 'مكيف', 'اضاءه', 'انوار', '~وضع'] },
  { id: 'comfort', kws: ['temperature', 'temp$', 'comfort', 'hot$', 'warm', 'cold', '~cool$', 'degree', 'zone', 'humid', 'حراره', 'درجه', 'راحه', 'حار', 'دافي', 'بارد', 'برود', 'مناطق', 'منطقه'] },
  { id: 'energy', kws: ['energy', 'kwh', 'electric', 'power', 'saving', 'saved', 'save$', 'sar$', 'bill', 'consumption', '~cost', 'طاقه', 'كهرباء', 'استهلاك', 'توفير', 'وفر', 'ريال', 'فاتوره', 'كيلوواط'] },
  { id: 'peak', kws: ['peak', '!busiest hour', '!busiest time', '!busy hour', '!busy time', 'rush', '!what time', '!which hour', '~when', '~hours', 'ذروه', '!وقت الازدحام', 'اوقات', '~ساعه', '~متي'] },
  { id: 'idle', kws: ['idle', '!least used', 'unused', 'underused', '!under used', 'rarely', 'spare', '~least', '~quiet', 'خامل', '!اقل استخدام', '~الاقل', '!غير مستخدم', 'نادر', 'فايض'] },
  { id: 'busiest', kws: ['!most used', '!busiest machine', 'popular', '!in demand', '!highest use', '~busiest', '!اكثر استخدام', '!الاكثر طلب', '~الاكثر'] },
  { id: 'people', kws: ['people', 'visitors', 'members', 'inside', 'occupancy', '!how busy', '!busy are', '!busy is', 'crowd', 'attendance', 'visit', 'footfall', 'overview', 'summary', 'status', '~how is', '~how are',
    'حضور', 'اشخاص', 'زوار', 'اعضاء', 'اشغال', 'ازدحام', 'مزدحم', '!نظره عامه', 'ملخص', '!كيف حال', '!كيف الوضع', 'زيارات', 'متواجد', 'موجود'] },
  { id: 'machineUse', kws: ['!machine use', 'utilisation', 'utilization', 'usage', '~use$', '~used', '~machine', 'equipment', 'session', 'استخدام', '~اجهزه', '~جهاز', 'معدات', 'جلسات'] },
  { id: 'help', kws: ['help', '!what can you', '!what can i ask', 'hello', 'hi$', 'hey$', 'مساعده', '!ماذا يمكنك', 'مرحبا', 'السلام', 'اهلا'] },
  { id: 'thanks', kws: ['thank', 'شكرا', 'مشكور'] },
];

const KIND_KWS: Record<InsightKind, string[]> = {
  move: ['move', 'relocate', 'transfer', 'نقل', 'انقل'],
  buy: ['buy', 'purchase', 'شراء', 'اشتري', 'اشتر'],
  retire: ['retire', 'sell', 'اخراج', 'بيع'],
  service: ['service', 'maintenance', 'repair', 'صيانه'],
  energy: ['energy', 'power', 'electric', 'kwh', 'طاقه', 'كهرباء'],
  capacity: ['crowd', 'class', 'capacity', 'ازدحام', 'حصص', 'حصه', 'سعه'],
};

/** Machine types, most specific phrases first (a match is removed before the generic ones are tried). */
const TYPE_KWS: { types: MachineType[]; kws: string[] }[] = [
  { types: ['slat-treadmill'], kws: ['slat', 'شرايحي'] },
  { types: ['incline-treadmill'], kws: ['incline treadmill', 'مشايه مايله', 'مشايات مايله'] },
  { types: ['incline-bench'], kws: ['incline bench', 'بنش مايل', 'بنشات مايله'] },
  { types: ['flat-bench'], kws: ['flat bench', 'بنش افقي', 'بنشات افقيه'] },
  { types: ['recumbent-bike'], kws: ['recumbent', 'مسند ظهر', 'مسند'] },
  { types: ['indoor-bike'], kws: ['indoor bike', 'spin', 'دراجه داخليه', 'دراجات داخليه'] },
  { types: ['adaptive-cross-trainer'], kws: ['adaptive', 'cross trainer', 'act$', 'خطوه متكيفه', 'متكيفه'] },
  { types: ['upper-body-ergometer'], kws: ['upper body', 'ergometer', 'ube$', 'arm bike', 'جزء العلوي'] },
  { types: ['standing-preacher'], kws: ['standing preacher', 'standing curl', 'وقوفا'] },
  { types: ['preacher-curl'], kws: ['seated preacher', 'seated curl', 'جلوسا'] },
  { types: ['treadmill'], kws: ['treadmill', 'running machine', 'مشايه', 'مشايات', 'مشايا'] },
  { types: ['stair-climber'], kws: ['stair', 'stepper', 'climber', 'صعود الدرج', 'سلالم'] },
  { types: ['elliptical'], kws: ['elliptical', 'اهليلج'] },
  { types: ['rower'], kws: ['rower', 'rowing', 'تجديف'] },
  { types: ['indoor-bike', 'recumbent-bike'], kws: ['bike', 'cycle', 'دراجه', 'دراجات'] },
  { types: ['flat-bench', 'incline-bench'], kws: ['bench', 'بنش'] },
  { types: ['preacher-curl', 'standing-preacher'], kws: ['preacher', 'curl', 'ثني الذراع'] },
];

const METRIC_KWS: Record<string, string[]> = {
  people: ['people', 'visitors', 'occupancy', 'busy', 'crowd', 'حضور', 'اشخاص', 'اشغال', 'ازدحام'],
  machine: ['machine use', 'utilis', 'utiliz', 'usage', 'use$', 'استخدام'],
  sessions: ['session', 'جلسات'],
  energy: ['energy', 'kwh', 'electric', 'power', 'طاقه', 'كهرباء'],
  kwhM2: ['m2', 'square', 'per area', 'متر', 'مساحه'],
  alarms: ['alarm', 'alert', 'تنبيه', 'انذار'],
  oos: ['out of service', 'broken', 'خارج الخدمه', 'معطل'],
};

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[m][n];
}

/** Strips Arabic article and joined prepositions ("والصحافة" -> "صحافة", "بحطين" -> "حطين"). */
function arStem(tok: string): string {
  return tok.replace(/^(?:و|ف|ب|ل|ك)?(?:ال|لل)/, '');
}

/** Gyms named in the question, in the order they are mentioned (fuzzy on each token). */
export function findGyms(text: string, clubs: Club[], districts: DemoContextValue['districts']): Club[] {
  const toks = text.split(' ');
  const keys = clubs.map((c) => {
    const d = districts.find((x) => x.id === c.district);
    const words = [d?.nameEn ?? '', d?.nameAr ?? '', c.shortEn, c.shortAr].map(norm).join(' ').split(' ')
      .map((w) => (AR_RE.test(w) ? arStem(w) : w)).filter((w) => w.length >= 4 && !['gym', 'men', 'رجال', 'women'].includes(w));
    return { c, words: [...new Set(words)] };
  });
  const hits: { c: Club; at: number }[] = [];
  toks.forEach((raw, at) => {
    const tok = AR_RE.test(raw) ? arStem(raw) : raw;
    if (tok.length < 4) return;
    for (const { c, words } of keys) {
      const ok = words.some((w) => {
        if (tok === w) return true;
        const tol = w.length >= 7 ? 2 : 1;
        return Math.abs(tok.length - w.length) <= tol && levenshtein(tok, w) <= tol;
      });
      if (ok && !hits.some((h) => h.c.id === c.id)) hits.push({ c, at });
    }
  });
  return hits.sort((a, b) => a.at - b.at).map((h) => h.c);
}

export interface Parsed {
  text: string;
  intent: Intent;
  scores: Partial<Record<Intent, number>>;
  gyms: Club[];
  types: MachineType[];
  kinds: InsightKind[];
  metrics: string[];
  allGyms: boolean;
}

export function parse(q: string, data: DemoContextValue): Parsed {
  let text = norm(q);
  // types first (specific phrases are consumed so the generic ones do not match again)
  const types: MachineType[] = [];
  let rest = ` ${text} `;
  for (const e of TYPE_KWS) {
    for (const kw of e.kws) {
      const hit = find(rest.trim(), kw);
      if (hit) {
        for (const t of e.types) if (!types.includes(t)) types.push(t);
        rest = rest.split(hit).join(' ');
      }
    }
  }
  const gyms = findGyms(text, data.clubs, data.districts);
  const allGyms = !!(find(text, 'both') || find(text, 'all gyms') || find(text, 'network') || find(text, 'كل الصالات') || find(text, 'الصالتين') || find(text, 'الشبكه'));
  const metrics = Object.entries(METRIC_KWS).filter(([, kws]) => kws.some((k) => find(text, k))).map(([m]) => m);
  const kinds = (Object.keys(KIND_KWS) as InsightKind[]).filter((k) => KIND_KWS[k].some((kw) => find(text, kw)));
  // intent scores; "out of service" is consumed so it does not count as "service"
  const scores: Partial<Record<Intent, number>> = {};
  for (const { id, kws } of INTENT_KWS) {
    let s = 0;
    for (const raw of kws) {
      const [kw, w] = weightOf(raw);
      const hit = find(text, kw);
      if (hit) {
        s += w;
        if (id === 'oos') text = text.split(hit).join(' ').replace(/\s+/g, ' ');
      }
    }
    if (s > 0) scores[id] = s;
  }
  const order = INTENT_KWS.map((x) => x.id);
  let intent: Intent = 'unknown';
  let best = 0;
  for (const id of order) if ((scores[id] ?? 0) > best) { best = scores[id]!; intent = id; }
  // a machine type with no stronger intent: use of that type (with its recommendations)
  if (types.length && (intent === 'unknown' || intent === 'machineUse' || intent === 'people')) intent = 'typeUse';
  // a gym name alone: that gym's overview
  if (intent === 'unknown' && gyms.length) intent = 'people';
  // "compare" with two gyms (or said plainly) wins over the measure it names ("compare energy at A and B")
  if ((scores.compare ?? 0) > 0 && (gyms.length >= 2 || (scores.compare ?? 0) >= 3) && !['help', 'thanks'].includes(intent)) intent = 'compare';
  // two gyms named with a measure: a comparison
  if (gyms.length >= 2 && ['people', 'machineUse', 'energy'].includes(intent) && (scores.compare ?? 0) === 0 && metrics.length) intent = 'compare';
  return { text: norm(q), intent, scores, gyms, types, kinds, metrics, allGyms };
}

// ---------- formatting ----------

interface F {
  lang: Lang;
  t: (k: string, v?: Record<string, string | number>) => string;
  x: Tx;
  n: (v: number, dp?: number) => string;
  pct: (v: number, dp?: number) => string;
  kwh: (v: number) => string;
  kw: (v: number) => string;
  deg: (v?: number) => string;
  time: () => string;
  date: (iso: string) => string;
  dur: (min: number) => string;
  gym: (c: Club | string) => string;
  gymList: (cs: Club[]) => string;
  hours: (h: number) => string;
  /** Keeps a mixed number string left to right inside Arabic text ("+2", "0 / 40", "50 (31%)"). */
  iso: (s: string) => string;
}

function fmt(ctx: EngineCtx): F {
  const { lang, data } = ctx;
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, `assistant.${k}`, v);
  const x = makeTx(lang, data.clubs, data.districts);
  const n = (v: number, dp?: number) => x.num(v, dp);
  const df = new Intl.DateTimeFormat(LOCALE[lang], { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const tf = new Intl.DateTimeFormat(LOCALE[lang], { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' });
  const gym = (c: Club | string) => x.gym(typeof c === 'string' ? c : c.id);
  return {
    lang, t, x, n,
    pct: (v, dp) => `${n(dp == null ? Math.round(v * 10) / 10 : v, dp)}%`,
    kwh: (v) => t('u.kwh', { v: n(Math.round(v)) }),
    kw: (v) => t('u.kw', { v: n(Math.round(v * 10) / 10) }),
    deg: (v) => (v == null ? '-' : t('u.deg', { v: n(v, 1) })),
    time: () => {
      const s = tf.format(new Date(Date.UTC(2000, 0, 1, data.live.hour, data.live.minute)));
      return lang === 'en' ? s.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase()) : s;
    },
    date: (iso) => df.format(new Date(`${iso}T00:00:00Z`)).replace(/\bSept\b/, 'Sep'),
    dur: (min) => {
      const m = Math.max(0, Math.round(min));
      if (m < 60) return t('u.min', { v: n(m) });
      if (m < 48 * 60) return m % 60 ? t('u.hm', { h: n(Math.floor(m / 60)), m: n(m % 60) }) : t('u.h', { v: n(m / 60) });
      return t('u.d', { v: n(Math.floor(m / 1440)) });
    },
    gym,
    gymList: (cs) => (cs.length === 2 ? t('a.and', { a: gym(cs[0]), b: gym(cs[1]) }) : x.list(cs.map(gym))),
    hours: (h) => t('a.hourRange', { a: x.hour(h), b: x.hour(h + 1) }),
    iso: (s) => (lang === 'ar' ? `\u2066${s}\u2069` : s),
  };
}

type Period = 'live' | 'today' | 'w4' | 'w8' | 'month' | 'log';

function source(ctx: EngineCtx, f: F, ps: Period[]): Block {
  const today = ctx.data.live.date;
  const { w4, w8 } = windows(today);
  const parts = [...new Set(ps)].map((p) => {
    switch (p) {
      case 'live': return f.t('src.live', { time: f.time() });
      case 'today': return f.t('src.today', { date: f.date(today) });
      case 'w4': return f.t('src.w4', { from: f.date(w4.from), to: f.date(w4.to) });
      case 'w8': return f.t('src.w8', { from: f.date(w8.from), to: f.date(w8.to) });
      case 'month': return f.t('src.month', { from: f.date(`${today.slice(0, 8)}01`), to: f.date(today) });
      case 'log': return f.t('src.log');
    }
  });
  return { k: 'source', text: `${f.t('src.label')}: ${parts.join(f.t('src.sep'))}` };
}

// ---------- shared data helpers ----------

const statsOf = (d: DemoContextValue, c: Club): GymStats => gymStats(d, c, windows(d.live.date).w4);

function dismissedIds(d: DemoContextValue): Set<string> {
  const st = (d.patches.set.settings?.['coo:plan'] ?? {}) as { dismissed?: { id: string }[] };
  return new Set((st.dismissed ?? []).map((x) => x.id));
}

function recsFor(ctx: EngineCtx, gyms: Club[]): Insight[] {
  const ids = new Set(gyms.map((g) => g.id));
  const gone = dismissedIds(ctx.data);
  let list = buildInsights(ctx.data).filter((i) => !gone.has(i.id) && i.clubIds.some((id) => ids.has(id)));
  if (ctx.role === 'fm') list = list.filter((i) => ['service', 'energy', 'capacity'].includes(i.kind) && i.clubIds.every((id) => ids.has(id)));
  return list;
}

function recItems(ctx: EngineCtx, f: F, list: Insight[]): RecItem[] {
  return list.map((i) => {
    const b = brief(i, f.x);
    const to = ctx.role === 'coo' ? `/overview?action=${encodeURIComponent(i.id)}` : i.kind === 'service' ? '/live-floor' : undefined;
    return {
      id: i.id, kind: i.kind, kindLabel: translate(ctx.lang, `insights.kind.${i.kind}`), text: b.text, key: b.key,
      conf: f.t(`a.recs.${i.confidence}`), to: to && ctx.can(to) ? to : undefined,
    };
  });
}

function links(ctx: EngineCtx, items: { label: string; to: string }[]): Block[] {
  const ok = items.filter((l) => ctx.can(l.to));
  return ok.length ? [{ k: 'links', items: ok }] : [];
}

export interface ZoneState {
  areaId: string; nameEn: string; nameAr: string; clubId: string; people: number; temp?: number; setpoint?: number;
  unitsOn: number; units: number; lightsOn: number; lights: number; overBy: number; maxReading?: number;
}

/** Zones of a gym with AC, lights and people (same rules as the Facility Manager overview). */
export function zoneStates(d: DemoContextValue, clubId: string): ZoneState[] {
  const ac = acOf(d, clubId);
  const ls = lightsOf(d, clubId);
  const pres = new Map(presenceOf(d, clubId).map((p) => [p.area.id, p.people]));
  return areasOf(d, clubId).map((area) => {
    const units = ac.filter((u) => u.areaId === area.id);
    const lights = ls.filter((l) => l.areaId === area.id);
    const on = units.filter((u) => u.live?.on);
    const src = on.length ? on : units;
    const temp = src.length ? Math.round((src.reduce((a, u) => a + (u.live?.reading ?? 0), 0) / src.length) * 10) / 10 : undefined;
    return {
      areaId: area.id, nameEn: area.nameEn, nameAr: area.nameAr, clubId, people: pres.get(area.id) ?? 0, temp,
      setpoint: units[0]?.live?.setpoint, unitsOn: on.length, units: units.length,
      lightsOn: lights.filter((l) => l.live?.on).length, lights: lights.length,
      overBy: on.reduce((m, u) => Math.max(m, (u.live?.reading ?? 0) - (u.live?.setpoint ?? 0)), -99),
      maxReading: on.length ? Math.max(...on.map((u) => u.live?.reading ?? 0)) : undefined,
    };
  });
}

// ---------- answers ----------

function suggestBlock(ctx: EngineCtx): Block {
  return { k: 'suggest', items: suggestions(ctx.role, ctx.lang) };
}

export function suggestions(role: Role, lang: Lang): string[] {
  return ['a', 'b', 'c', 'd', 'e', 'f'].map((k) => translate(lang, `assistant.sugg.${role === 'fm' ? 'fm' : 'coo'}.${k}`));
}

function aPeople(ctx: EngineCtx, f: F, gyms: Club[]): Block[] {
  const d = ctx.data;
  const lives = gyms.map((c) => ({ c, l: d.live.clubs[c.id] }));
  const n = lives.reduce((a, x) => a + (x.l?.peopleIn ?? 0), 0);
  const cap = gyms.reduce((a, c) => a + c.capacity, 0);
  const today = lives.reduce((a, x) => a + (x.l?.peopleToday ?? 0), 0);
  const pct = cap ? Math.round((n / cap) * 100) : 0;
  const out: Block[] = [{
    k: 'p', text: gyms.length === 1
      ? f.t('a.people.one', { n: f.n(n), gym: f.gym(gyms[0]), pct: f.n(pct), cap: f.n(cap), today: f.n(today) })
      : f.t('a.people.all', { n: f.n(n), pct: f.n(pct), cap: f.n(cap), today: f.n(today) }),
  }];
  for (const x of lives) if (x.l && !x.l.isOpen) out.push({ k: 'p', text: f.t('a.people.closed', { gym: f.gym(x.c) }) });
  const alerts = alertsIn(d, gyms);
  out.push({
    k: 'table', end: [1, 2, 3, 4, 5],
    head: [f.t('a.col.gym'), f.t('a.col.peopleIn'), f.t('a.col.full'), f.t('a.col.visitsToday'), f.t('a.col.inUse'), f.t('a.col.alarms')],
    rows: lives.map(({ c, l }) => [
      f.gym(c), f.n(l?.peopleIn ?? 0), f.pct(c.capacity ? Math.round(((l?.peopleIn ?? 0) / c.capacity) * 100) : 0), f.n(l?.peopleToday ?? 0),
      f.iso(`${f.n(l?.machinesInUse ?? 0)} / ${f.n(c.machines)}`), f.n(alerts.filter((a) => a.clubId === c.id).length),
    ]),
  });
  out.push(...links(ctx, [{ label: f.t('a.overview'), to: '/overview' }]));
  out.push(source(ctx, f, ['live', 'today']));
  return out;
}

interface CmpVals { people: number; pctFull: number; machine: number; sessions: number; energy: number; sarVisit: number; kwhM2: number; alarms: number; crit: number; oos: number; machines: number }

function cmpVals(d: DemoContextValue, c: Club): CmpVals {
  const s = statsOf(d, c);
  const l = d.live.clubs[c.id];
  const al = alertsIn(d, [c]);
  const ms = d.machines.filter((m) => m.clubId === c.id);
  return {
    people: l?.peopleIn ?? 0, pctFull: c.capacity ? Math.round(((l?.peopleIn ?? 0) / c.capacity) * 100) : 0,
    machine: s.utilPct, sessions: s.sessionsPerMachineDay, energy: s.kwhPerVisit, sarVisit: s.sarPerVisit, kwhM2: s.kwhPerM2,
    alarms: al.length, crit: al.filter((a) => a.level === 'critical').length, oos: ms.filter((m) => !m.enabled).length, machines: ms.length,
  };
}

function signed(f: F, v: number, dp: number, unit?: 'pts'): string {
  const r = Math.round(v * 10 ** dp) / 10 ** dp;
  const s = f.iso(`${r > 0 ? '+' : r < 0 ? '-' : ''}${f.n(Math.abs(r), dp)}`);
  return unit ? f.t('u.pts', { v: s }) : s;
}

function aCompare(ctx: EngineCtx, f: F, a: Club, b: Club, metrics: string[]): Block[] {
  const d = ctx.data;
  const A = cmpVals(d, a);
  const B = cmpVals(d, b);
  const ga = f.gym(a), gb = f.gym(b);
  const out: Block[] = [{ k: 'p', text: f.t('a.cmp.intro', { a: ga, b: gb }) }];
  const want = metrics.filter((m) => m !== 'people' || metrics.length === 1);
  const show = (m: string) => !want.length || want.includes(m);
  const sent: string[] = [];
  if (show('machine')) {
    sent.push(A.machine === B.machine ? f.t('a.cmp.machineSame', { x: f.n(A.machine, 1) })
      : f.t('a.cmp.machine', { hi: A.machine > B.machine ? ga : gb, x: f.n(Math.max(A.machine, B.machine), 1), y: f.n(Math.min(A.machine, B.machine), 1) }));
  }
  if (show('energy')) {
    sent.push(A.energy === B.energy ? f.t('a.cmp.energySame', { x: f.n(A.energy, 2) })
      : f.t('a.cmp.energy', { lo: A.energy < B.energy ? ga : gb, x: f.n(Math.min(A.energy, B.energy), 2), y: f.n(Math.max(A.energy, B.energy), 2) }));
  }
  if (show('people')) sent.push(f.t('a.cmp.people', { x: f.n(A.people), y: f.n(B.people), a: ga, b: gb }));
  if (want.includes('alarms')) sent.push(f.t('a.cmp.alarms', { x: f.n(A.alarms), y: f.n(B.alarms), a: ga, b: gb }));
  if (want.includes('sessions')) sent.push(f.t('a.cmp.sessions', { x: f.n(A.sessions, 1), y: f.n(B.sessions, 1), a: ga, b: gb }));
  if (want.includes('oos')) sent.push(f.t('a.cmp.oos', { x: f.n(A.oos), y: f.n(B.oos), a: ga, b: gb }));
  if (want.includes('kwhM2')) sent.push(f.t('a.cmp.kwhM2', { x: f.n(A.kwhM2, 1), y: f.n(B.kwhM2, 1), a: ga, b: gb }));
  out.push({ k: 'p', text: sent.join(' ') });
  const rows: [string, string, string, string][] = [];
  if (show('people')) rows.push([f.t('a.m.people'), f.iso(`${f.n(A.people)} (${f.pct(A.pctFull)})`), f.iso(`${f.n(B.people)} (${f.pct(B.pctFull)})`), signed(f, A.people - B.people, 0)]);
  if (show('machine')) rows.push([f.t('a.m.machine'), f.pct(A.machine, 1), f.pct(B.machine, 1), signed(f, A.machine - B.machine, 1, 'pts')]);
  if (show('sessions')) rows.push([f.t('a.m.sessions'), f.n(A.sessions, 1), f.n(B.sessions, 1), signed(f, A.sessions - B.sessions, 1)]);
  if (show('energy')) rows.push([f.t('a.m.energy'), f.t('u.kwh', { v: f.n(A.energy, 2) }), f.t('u.kwh', { v: f.n(B.energy, 2) }), signed(f, A.energy - B.energy, 2)]);
  if (show('kwhM2')) rows.push([f.t('a.m.kwhM2'), f.n(A.kwhM2, 1), f.n(B.kwhM2, 1), signed(f, A.kwhM2 - B.kwhM2, 1)]);
  if (show('alarms')) rows.push([f.t('a.m.alarms'), f.n(A.alarms), f.n(B.alarms), signed(f, A.alarms - B.alarms, 0)]);
  if (show('oos')) rows.push([f.t('a.m.oos'), f.iso(`${f.n(A.oos)} / ${f.n(A.machines)}`), f.iso(`${f.n(B.oos)} / ${f.n(B.machines)}`), signed(f, A.oos - B.oos, 0)]);
  out.push({ k: 'table', head: [f.t('a.col.measure'), ga, gb, f.t('a.col.diff')], rows, end: [1, 2, 3] });
  out.push({ k: 'p', text: f.t('a.cmp.diffNote') });
  out.push(...links(ctx, [{ label: f.t('a.cmp.link'), to: `/overview?compare=${a.id},${b.id}` }]));
  const ps: Period[] = [];
  if (show('people') || show('alarms') || show('oos')) ps.push('live');
  if (show('machine') || show('sessions') || show('energy') || show('kwhM2')) ps.push('w4');
  out.push(source(ctx, f, ps));
  return out;
}

function aTypeUse(ctx: EngineCtx, f: F, gyms: Club[], types: MachineType[]): Block[] {
  const d = ctx.data;
  const out: Block[] = [];
  for (const type of types.slice(0, 3)) {
    const rows = gyms.map((c) => ({ c, u: statsOf(d, c).byType.find((x) => x.type === type), live: machinesByType(d, c.id).find((x) => x.type === type) }));
    const have = rows.filter((r) => r.u);
    if (!have.length) {
      out.push({ k: 'p', text: f.t('a.use.typeNone', { types: f.x.types(type, 2), gyms: f.gymList(gyms) }) });
      continue;
    }
    out.push({ k: 'p', text: f.t('a.use.type', { type: f.x.typeLabel(type), list: f.x.list(have.map((r) => f.t('a.use.typeItem', { pct: f.n(r.u!.utilPct, 1), gym: f.gym(r.c), units: f.n(r.u!.units) }))) }) });
    out.push({
      k: 'table', end: [1, 2, 3, 4, 5],
      head: [f.t('a.col.gym'), f.t('a.col.units'), f.t('a.col.use4w'), f.t('a.col.sessionsDay'), f.t('a.col.peakFull'), f.t('a.col.inUseLive')],
      rows: have.map((r) => [f.gym(r.c), f.n(r.u!.units), f.pct(r.u!.utilPct, 1), f.n(Math.round((r.u!.sessions / r.u!.units / 28) * 10) / 10, 1), f.pct(r.u!.peakFullPct, 1), f.n(r.live?.inUse ?? 0)]),
    });
  }
  const recs = recsFor(ctx, gyms).filter((i) => i.type && types.includes(i.type));
  if (recs.length) {
    out.push({ k: 'p', text: f.t('a.use.recs') });
    out.push({ k: 'recs', items: recItems(ctx, f, recs.slice(0, 4)) });
  }
  out.push(...links(ctx, [{ label: f.t('a.use.link'), to: '/usage-report' }, { label: f.t('a.use.linkFloor'), to: '/live-floor' }].filter((_l, i) => i === 0 || !ctx.can('/usage-report'))));
  out.push(source(ctx, f, ['w4', 'live']));
  return out;
}

function aMachineUse(ctx: EngineCtx, f: F, gyms: Club[]): Block[] {
  const d = ctx.data;
  const st = gyms.map((c) => ({ c, s: statsOf(d, c) }));
  const inUse = gyms.reduce((a, c) => a + (d.live.clubs[c.id]?.machinesInUse ?? 0), 0);
  const n = gyms.reduce((a, c) => a + c.machines, 0);
  const out: Block[] = [{ k: 'p', text: f.t('a.use.gyms', { list: f.x.list(st.map(({ c, s }) => f.t('a.use.gymItem', { gym: f.gym(c), pct: f.n(s.utilPct, 1) }))), inUse: f.n(inUse), n: f.n(n) }) }];
  const types = [...new Set(st.flatMap(({ s }) => s.byType.map((u) => u.type)))];
  const maxOf = (t: MachineType) => Math.max(...st.map(({ s }) => s.byType.find((u) => u.type === t)?.utilPct ?? -1));
  types.sort((a, b) => maxOf(b) - maxOf(a));
  const K = 8;
  const cell = (c: Club, t: MachineType) => {
    const u = st.find((x) => x.c.id === c.id)!.s.byType.find((x) => x.type === t);
    return u ? f.iso(`${f.pct(u.utilPct, 1)} (${f.n(u.units)})`) : '-';
  };
  out.push({
    k: 'table', end: gyms.map((_, i) => i + 1),
    head: [f.t('a.col.type'), ...gyms.map((c) => `${f.gym(c)}, ${f.t('a.col.use4w')}`)],
    rows: types.slice(0, K).map((t) => [f.x.typeLabel(t), ...gyms.map((c) => cell(c, t))]),
  });
  if (types.length > K) out.push({ k: 'p', text: f.t('a.use.top', { k: f.n(K), n: f.n(types.length) }) });
  out.push(...links(ctx, ctx.can('/usage-report') ? [{ label: f.t('a.use.link'), to: '/usage-report' }] : [{ label: f.t('a.use.linkFloor'), to: '/live-floor' }]));
  out.push(source(ctx, f, ['w4', 'live']));
  return out;
}

function aIdleBusy(ctx: EngineCtx, f: F, gyms: Club[], idle: boolean): Block[] {
  const d = ctx.data;
  const rows = gyms.flatMap((c) => statsOf(d, c).byType.map((u) => ({ c, u })));
  rows.sort((a, b) => (idle ? a.u.utilPct - b.u.utilPct : b.u.utilPct - a.u.utilPct));
  const top = rows.slice(0, 6);
  const out: Block[] = [{ k: 'p', text: f.t(idle ? 'a.idle.intro' : 'a.busy.intro') }];
  out.push({
    k: 'table', end: [2, 3, 4],
    head: [f.t('a.col.type'), f.t('a.col.gym'), f.t('a.col.units'), f.t('a.col.use4w'), f.t('a.col.peakFull')],
    rows: top.map(({ c, u }) => [f.x.typeLabel(u.type), f.gym(c), f.n(u.units), f.pct(u.utilPct, 1), f.pct(u.peakFullPct, 1)]),
  });
  if (idle) {
    const ms = d.machines.filter((m) => gyms.some((c) => c.id === m.clubId) && m.enabled);
    const idleNow = ms.filter((m) => d.live.machines[m.id]?.state !== 'inUse').length;
    out.push({ k: 'p', text: f.t('a.idle.live', { idle: f.n(idleNow), n: f.n(ms.length) }) });
  } else if (top[0]) {
    out.push({ k: 'p', text: f.t('a.busy.peak', { type: f.x.typeLabel(top[0].u.type), gym: f.gym(top[0].c), p: f.n(top[0].u.peakFullPct, 1) }) });
  }
  const kinds: InsightKind[] = idle ? ['move', 'retire'] : ['move', 'buy'];
  const tset = new Set(top.map((r) => r.u.type));
  const recs = recsFor(ctx, gyms).filter((i) => kinds.includes(i.kind) && i.type && tset.has(i.type));
  if (recs.length) {
    out.push({ k: 'p', text: f.t(idle ? 'a.idle.recs' : 'a.busy.recs') });
    out.push({ k: 'recs', items: recItems(ctx, f, recs.slice(0, 3)) });
  }
  out.push(...links(ctx, ctx.can('/usage-report') ? [{ label: f.t('a.use.link'), to: '/usage-report' }] : [{ label: f.t('a.use.linkFloor'), to: '/live-floor' }]));
  out.push(source(ctx, f, idle ? ['w4', 'live'] : ['w4']));
  return out;
}

function aRecs(ctx: EngineCtx, f: F, gyms: Club[], p: Parsed): Block[] {
  let list = recsFor(ctx, gyms);
  const filtered = p.kinds.length > 0 || p.types.length > 0;
  if (p.kinds.length) list = list.filter((i) => p.kinds.includes(i.kind));
  if (p.types.length) list = list.filter((i) => i.type && p.types.includes(i.type));
  const out: Block[] = [];
  if (!list.length) {
    out.push({ k: 'p', text: f.t('a.recs.none', { gyms: f.gymList(gyms) }) });
  } else {
    out.push({ k: 'p', text: f.t(`a.recs.${filtered ? 'introKind' : 'intro'}${list.length === 1 ? 'One' : ''}`, { n: f.n(list.length), gyms: f.gymList(gyms) }) });
    out.push({ k: 'recs', items: recItems(ctx, f, list.slice(0, 6)) });
  }
  if (ctx.role === 'fm') out.push({ k: 'p', text: f.t('a.recs.fmNote') });
  out.push(...links(ctx, [{ label: f.t('a.recs.link'), to: '/overview' }].filter(() => ctx.role === 'coo')));
  out.push(source(ctx, f, list.some((i) => i.kind === 'retire') ? ['w4', 'w8', 'log'] : ['w4', 'log']));
  return out;
}

const SEV_RANK: Record<Level, number> = { critical: 0, warning: 1, info: 2 };

function aAlarms(ctx: EngineCtx, f: F, gyms: Club[]): Block[] {
  const d = ctx.data;
  const list: Alert[] = sortAlerts(alertsIn(d, gyms));
  const out: Block[] = [];
  if (!list.length) {
    out.push({ k: 'p', text: f.t('a.alarms.none', { gyms: f.gymList(gyms) }) });
  } else {
    const c = list.filter((a) => a.level === 'critical').length;
    const w = list.filter((a) => a.level === 'warning').length;
    out.push({ k: 'p', text: f.t(list.length === 1 ? 'a.alarms.countOne' : 'a.alarms.count', { n: f.n(list.length), gyms: f.gymList(gyms), c: f.n(c), w: f.n(w), i: f.n(list.length - c - w) }) });
    const ack = list.filter((a) => a.status === 'acknowledged').length;
    if (ack) out.push({ k: 'p', text: f.t('a.alarms.ack', { n: f.n(ack) }) });
    if (gyms.length > 1) {
      out.push({
        k: 'table', end: [1, 2, 3, 4],
        head: [f.t('a.col.gym'), f.t('a.col.critical'), f.t('a.col.warning'), f.t('a.col.info'), f.t('a.col.total')],
        rows: gyms.map((g) => {
          const l = list.filter((a) => a.clubId === g.id);
          const n = (lv: Level) => f.n(l.filter((a) => a.level === lv).length);
          return [f.gym(g), n('critical'), n('warning'), n('info'), f.n(l.length)];
        }),
      });
    }
    out.push({ k: 'p', text: f.t('a.alarms.top') });
    const pick = (en: string, ar: string) => (ctx.lang === 'ar' ? ar : en);
    out.push({
      k: 'table', end: [3],
      head: [f.t('a.col.severity'), f.t('a.col.alarm'), f.t('a.col.where'), f.t('a.col.openFor')],
      rows: [...list].sort((a, b) => SEV_RANK[a.level] - SEV_RANK[b.level] || a.sinceMs - b.sinceMs).slice(0, 5).map((a) => [
        f.t(`a.sev.${a.level}`), pick(a.titleEn, a.titleAr), f.x.list([f.gym(a.clubId), pick(a.areaEn, a.areaAr)]), f.dur((d.live.nowMs - a.sinceMs) / 60_000),
      ]),
    });
  }
  out.push(...links(ctx, [{ label: f.t('a.alarms.link'), to: '/ai-agents' }]));
  out.push(source(ctx, f, ['live']));
  return out;
}

function aEnergy(ctx: EngineCtx, f: F, gyms: Club[]): Block[] {
  const d = ctx.data;
  const kwh = gyms.reduce((a, c) => a + (d.live.clubs[c.id]?.energyTodayKwh ?? 0), 0);
  const base = gyms.reduce((a, c) => a + (d.live.clubs[c.id]?.baselineTodayKwh ?? 0), 0);
  const savedPct = base ? Math.round(((base - kwh) / base) * 1000) / 10 : 0;
  const out: Block[] = [];
  out.push({
    k: 'p', text: savedPct >= 0
      ? f.t('a.energy.today', { kwh: f.kwh(kwh), pct: f.n(savedPct, 1), sar: f.x.sar(Math.max(0, base - kwh) * TARIFF_SAR_PER_KWH) })
      : f.t('a.energy.todayOver', { kwh: f.kwh(kwh), pct: f.n(-savedPct, 1) }),
  });
  const m = savingsSummary(d, gyms).month;
  out.push({ k: 'p', text: f.t('a.energy.month', { sar: f.x.sar(m.savedSar), kwh: f.kwh(m.savedKwh), pct: f.n(m.savedPct, 1) }) });
  out.push({
    k: 'table', end: [1, 2, 3, 4],
    head: [f.t('a.col.gym'), f.t('a.col.energyToday'), f.t('a.col.vsBase'), f.t('a.col.savedMonth'), f.t('a.col.perVisit')],
    rows: gyms.map((c) => {
      const l = d.live.clubs[c.id];
      const b = l?.baselineTodayKwh ?? 0;
      const vs = b ? Math.round((((l?.energyTodayKwh ?? 0) - b) / b) * 1000) / 10 : 0;
      const sm = savingsSummary(d, [c]).month;
      const s = statsOf(d, c);
      return [f.gym(c), f.kwh(l?.energyTodayKwh ?? 0), f.iso(`${vs > 0 ? '+' : vs < 0 ? '-' : ''}${f.n(Math.abs(vs), 1)}%`), f.x.sar(sm.savedSar), f.t('u.kwh', { v: f.n(s.kwhPerVisit, 2) })];
    }),
  });
  const recs = recsFor(ctx, gyms).filter((i) => i.kind === 'energy');
  if (recs.length) {
    out.push({ k: 'p', text: f.t('a.energy.rec') });
    out.push({ k: 'recs', items: recItems(ctx, f, recs.slice(0, 2)) });
  }
  out.push(...links(ctx, [{ label: f.t('a.energy.link'), to: ctx.role === 'coo' ? '/overview?section=energy' : '/overview' }]));
  out.push(source(ctx, f, ['today', 'month', 'w4']));
  return out;
}

function aComfort(ctx: EngineCtx, f: F, gyms: Club[]): Block[] {
  const d = ctx.data;
  const zones = gyms.flatMap((c) => zoneStates(d, c.id));
  const outZ = zones.filter((z) => z.unitsOn > 0 && z.overBy >= 1.5);
  const name = (z: ZoneState) => (ctx.lang === 'ar' ? z.nameAr : z.nameEn);
  const out: Block[] = [{ k: 'p', text: outZ.length ? f.t('a.comfort.out', { k: f.n(outZ.length), n: f.n(zones.length) }) : f.t('a.comfort.ok', { n: f.n(zones.length) }) }];
  const warm = [...zones].filter((z) => z.maxReading != null).sort((a, b) => b.overBy - a.overBy)[0];
  if (warm) out.push({ k: 'p', text: f.t('a.comfort.warmest', { zone: name(warm), at: gyms.length > 1 ? f.t('a.comfort.at', { gym: f.gym(warm.clubId) }) : '', temp: f.deg(warm.maxReading) }) });
  const sorted = [...zones].sort((a, b) => b.overBy - a.overBy || (b.temp ?? 0) - (a.temp ?? 0)).slice(0, 8);
  const multi = gyms.length > 1;
  out.push({
    k: 'table', end: multi ? [2, 3, 4, 5] : [1, 2, 3, 4],
    head: [f.t('a.col.zone'), ...(multi ? [f.t('a.col.gym')] : []), f.t('a.col.temp'), f.t('a.col.setpoint'), f.t('a.col.people'), f.t('a.col.ac')],
    rows: sorted.map((z) => [name(z), ...(multi ? [f.gym(z.clubId)] : []), f.deg(z.temp), f.deg(z.setpoint), f.n(z.people), f.t('a.comfort.acOf', { on: f.n(z.unitsOn), n: f.n(z.units) })]),
  });
  out.push(...links(ctx, [{ label: f.t('a.comfort.link'), to: '/hvac' }]));
  out.push(source(ctx, f, ['live']));
  return out;
}

function aOos(ctx: EngineCtx, f: F, gyms: Club[]): Block[] {
  const d = ctx.data;
  const ms = d.machines.filter((m) => gyms.some((c) => c.id === m.clubId));
  const off = ms.filter((m) => !m.enabled);
  const out: Block[] = [];
  if (!off.length) out.push({ k: 'p', text: f.t('a.oos.none', { m: f.n(ms.length), gyms: f.gymList(gyms) }) });
  else {
    out.push({ k: 'p', text: f.t('a.oos.some', { n: f.n(off.length), m: f.n(ms.length) }) });
    out.push({
      k: 'table',
      head: [f.t('a.col.machine'), f.t('a.col.gym'), f.t('a.col.type')],
      rows: off.slice(0, 10).map((m) => [ctx.lang === 'ar' ? m.nameAr : m.nameEn, f.gym(m.clubId), f.x.typeLabel(m.type)]),
    });
  }
  const due = recsFor(ctx, gyms).filter((i) => i.kind === 'service').reduce((a, i) => a + i.service!.machines.length, 0);
  if (due) out.push({ k: 'p', text: f.t('a.oos.due', { n: f.n(due) }) });
  out.push(...links(ctx, [{ label: f.t('a.oos.link'), to: '/live-floor' }]));
  out.push(source(ctx, f, due ? ['live', 'log'] : ['live']));
  return out;
}

function aService(ctx: EngineCtx, f: F, gyms: Club[]): Block[] {
  const d = ctx.data;
  const recs = recsFor(ctx, gyms).filter((i) => i.kind === 'service');
  const all = recs.flatMap((i) => i.service!.machines.map((m) => ({ ...m, clubId: i.service!.clubId })));
  const out: Block[] = [];
  if (!all.length) out.push({ k: 'p', text: f.t('a.service.none', { gyms: f.gymList(gyms) }) });
  else {
    const per = recs.map((i) => f.t('a.service.item', { n: f.n(i.service!.machines.length), gym: f.gym(i.service!.clubId) }));
    out.push({ k: 'p', text: f.t(all.length === 1 ? 'a.service.someOne' : 'a.service.some', { n: f.n(all.length), list: f.x.list(per) }) });
    all.sort((a, b) => b.hours / b.interval - a.hours / a.interval);
    const K = 8;
    out.push({
      k: 'table', end: [2, 3],
      head: [f.t('a.col.machine'), f.t('a.col.gym'), f.t('a.col.hours'), f.t('a.col.interval')],
      rows: all.slice(0, K).map((m) => [ctx.lang === 'ar' ? m.nameAr : m.nameEn, f.gym(m.clubId), f.t('u.h', { v: f.n(m.hours) }), f.t('u.h', { v: f.n(m.interval) })]),
    });
    if (all.length > K) out.push({ k: 'p', text: f.t('a.service.more', { k: f.n(K) }) });
  }
  const off = d.machines.filter((m) => gyms.some((c) => c.id === m.clubId) && !m.enabled).length;
  if (off) out.push({ k: 'p', text: f.t('a.service.oos', { n: f.n(off) }) });
  if (recs.length) out.push({ k: 'recs', items: recItems(ctx, f, recs) });
  out.push(source(ctx, f, off ? ['log', 'live'] : ['log']));
  return out;
}

function aPeak(ctx: EngineCtx, f: F, gyms: Club[]): Block[] {
  const d = ctx.data;
  const today = d.live.date;
  const out: Block[] = [];
  for (const c of gyms) {
    const a = arrivalsByHour(c, today);
    const h = peakHourOf(c, today);
    const openHs = a.map((v, i) => ({ v, i })).filter(({ i }) => isOpenAt(c, today, i * 60 + 30));
    const q = openHs.reduce((m, x) => (x.v < m.v ? x : m), openHs[0] ?? { v: 0, i: 0 });
    out.push({ k: 'p', text: f.t('a.peak.line', { gym: f.gym(c), h: f.hours(h), n: f.n(Math.round(a[h])), h4: f.hours(statsOf(d, c).peakHour), q: f.hours(q.i) }) });
  }
  out.push({
    k: 'table',
    head: [f.t('a.col.gym'), f.t('a.col.busiestToday'), f.t('a.col.busiest4w'), f.t('a.col.quietToday')],
    rows: gyms.map((c) => {
      const a = arrivalsByHour(c, today);
      const openHs = a.map((v, i) => ({ v, i })).filter(({ i }) => isOpenAt(c, today, i * 60 + 30));
      const q = openHs.reduce((m, x) => (x.v < m.v ? x : m), openHs[0] ?? { v: 0, i: 0 });
      return [f.gym(c), f.hours(peakHourOf(c, today)), f.hours(statsOf(d, c).peakHour), f.hours(q.i)];
    }),
  });
  out.push({ k: 'p', text: f.t('a.peak.machines') });
  out.push(...links(ctx, [{ label: f.t('a.peak.link'), to: ctx.role === 'coo' ? '/overview?section=business' : '/overview' }]));
  out.push(source(ctx, f, ['today', 'w4']));
  return out;
}

function aBuilding(ctx: EngineCtx, f: F, gyms: Club[]): Block[] {
  const d = ctx.data;
  const out: Block[] = [];
  for (const c of gyms) {
    const st = (d.patches.set.settings?.[`fm:${c.id}`] ?? {}) as { mode?: string; modeAt?: number };
    const open = !!d.live.clubs[c.id]?.isOpen;
    let mode: string;
    if (st.mode) {
      const m = translate(ctx.lang, `fm.controls.modes.${st.mode}`);
      const at = st.modeAt ?? d.live.nowMs;
      const sameDay = new Date(at + 3 * 3600_000).toISOString().slice(0, 10) === d.live.date;
      const when = sameDay
        ? new Intl.DateTimeFormat(LOCALE[ctx.lang], { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Riyadh' }).format(new Date(at))
        : new Intl.DateTimeFormat(LOCALE[ctx.lang], { day: 'numeric', month: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(at));
      mode = f.t('a.building.modeAt', { mode: m, when });
    } else {
      mode = f.t('a.building.noMode', { state: f.t(open ? 'a.building.open' : 'a.building.closed') });
    }
    const ac = acOf(d, c.id);
    const on = ac.filter((u) => u.live?.on);
    const sp = on.length ? Math.round((on.reduce((a, u) => a + (u.live?.setpoint ?? 0), 0) / on.length) * 10) / 10 : undefined;
    const kw = on.reduce((a, u) => a + (u.live?.powerKw ?? 0), 0);
    const ls = lightsOf(d, c.id);
    out.push({
      k: 'p', text: f.t('a.building.line', {
        gym: f.gym(c), mode, on: f.n(on.length), n: f.n(ac.length), sp: f.deg(sp), kw: f.kw(kw), lon: f.n(ls.filter((l) => l.live?.on).length), ln: f.n(ls.length),
      }),
    });
    const empty = zoneStates(d, c.id).filter((z) => z.people === 0 && (z.unitsOn > 0 || z.lightsOn > 0));
    out.push({
      k: 'p', text: empty.length
        ? f.t('a.building.empty', { gym: f.gym(c), zones: f.x.list(empty.map((z) => (ctx.lang === 'ar' ? z.nameAr : z.nameEn))) })
        : f.t('a.building.emptyNone', { gym: f.gym(c) }),
    });
  }
  out.push(...links(ctx, ctx.role === 'fm'
    ? [{ label: f.t('a.building.link'), to: '/overview' }, { label: f.t('a.building.linkControl'), to: '/control' }]
    : [{ label: f.t('a.building.linkControl'), to: '/control' }, { label: f.t('a.comfort.link'), to: '/hvac' }]));
  out.push(source(ctx, f, ['live']));
  return out;
}

// ---------- entry point ----------

/** Answers one question from the data in scope, in the UI language. */
export function answer(q: string, ctx: EngineCtx): Answer {
  const f = fmt(ctx);
  const p = parse(q, ctx.data);
  const fm = ctx.role === 'fm';
  const fmGym = ctx.data.clubs.find((c) => c.id === LIVE_CLUB_ID) ?? ctx.scopeClubs[0];
  const pre: Block[] = [];
  // gyms the answer covers
  let gyms: Club[];
  if (fm) {
    gyms = [fmGym];
    if (p.intent !== 'compare' && p.gyms.some((g) => g.id !== fmGym.id)) pre.push({ k: 'p', text: f.t('a.fmOnly', { gym: ctx.lang === 'ar' ? fmGym.nameAr : fmGym.nameEn }) });
  } else if (p.gyms.length && !p.allGyms) {
    gyms = p.gyms;
  } else if (p.allGyms) {
    gyms = ctx.data.clubs;
  } else {
    gyms = ctx.scopeClubs.length ? ctx.scopeClubs : ctx.data.clubs;
  }

  const done = (intent: Intent, blocks: Block[], understood = true): Answer => ({ intent, understood, blocks: [...pre, ...blocks] });

  switch (p.intent) {
    case 'help':
      return done('help', [{ k: 'p', text: fm ? f.t('a.helpFm', { gym: ctx.lang === 'ar' ? fmGym.nameAr : fmGym.nameEn }) : f.t('a.help') }, suggestBlock(ctx)]);
    case 'thanks':
      return done('thanks', [{ k: 'p', text: f.t('a.thanks') }]);
    case 'people':
      return done('people', aPeople(ctx, f, gyms));
    case 'compare': {
      if (fm) return done('compare', [{ k: 'p', text: f.t('a.fmNoCompare', { gym: f.gym(fmGym) }) }, ...aPeople(ctx, f, gyms)]);
      const pair = p.gyms.length >= 2 ? p.gyms.slice(0, 2) : p.gyms.length === 1 ? [p.gyms[0], ...ctx.data.clubs.filter((c) => c.id !== p.gyms[0].id)].slice(0, 2) : ctx.data.clubs.slice(0, 2);
      if (pair.length < 2) return done('compare', [{ k: 'p', text: f.t('a.cmp.one') }, ...aPeople(ctx, f, pair)]);
      if (p.types.length) return done('compare', aTypeUse(ctx, f, pair, p.types));
      return done('compare', aCompare(ctx, f, pair[0], pair[1], p.metrics));
    }
    case 'typeUse':
      return done('typeUse', aTypeUse(ctx, f, p.gyms.length || fm ? gyms : ctx.data.clubs, p.types));
    case 'machineUse':
      return done('machineUse', aMachineUse(ctx, f, gyms));
    case 'idle':
      return done('idle', aIdleBusy(ctx, f, gyms, true));
    case 'busiest':
      return done('busiest', aIdleBusy(ctx, f, gyms, false));
    case 'recs':
      return done('recs', aRecs(ctx, f, gyms, p));
    case 'alarms':
      return done('alarms', aAlarms(ctx, f, gyms));
    case 'energy':
      return done('energy', aEnergy(ctx, f, gyms));
    case 'comfort':
      return done('comfort', aComfort(ctx, f, gyms));
    case 'oos':
      return done('oos', aOos(ctx, f, gyms));
    case 'service':
      return done('service', aService(ctx, f, gyms));
    case 'peak':
      return done('peak', aPeak(ctx, f, gyms));
    case 'building':
      return done('building', aBuilding(ctx, f, gyms));
    default:
      return { intent: 'unknown', understood: false, blocks: [{ k: 'p', text: f.t('a.unknown') }, suggestBlock(ctx)] };
  }
}

/** Plain text of an answer (chat history sent to Claude, the unit check). */
export function blocksToText(blocks: Block[]): string {
  return blocks.map((b) => {
    switch (b.k) {
      case 'p': case 'source': return b.text;
      case 'table': return [b.head.join(' | '), ...b.rows.map((r) => r.join(' | '))].join('\n');
      case 'recs': return b.items.map((i) => `- ${i.kindLabel}: ${i.text} (${i.key}; ${i.conf})`).join('\n');
      case 'links': return b.items.map((l) => `[${l.label}]`).join(' ');
      case 'suggest': return b.items.map((s) => `* ${s}`).join('\n');
    }
  }).join('\n');
}
