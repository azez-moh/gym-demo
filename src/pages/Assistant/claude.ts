import type { Club, DemoContextValue, Role } from '../../data';
import { acOf, alertsIn, lightsOf, machinesByType, savingsSummary, TARIFF_SAR_PER_KWH } from '../../data';
import type { Lang } from '../../i18n';
import { buildInsights, gymStats, windows } from '../Overview/insights';
import { brief, describe, makeTx } from '../Overview/describe';
import { zoneStates } from './engine';

/*
  Ask Conductor, Claude mode (optional). The question, the last 8 chat turns and a compact JSON snapshot of the data
  in scope go straight from this browser to the Anthropic Messages API with the user's own key. The key lives in
  localStorage on this browser only (KEY_STORE); it is never logged, bundled or sent anywhere else.
*/

export const KEY_STORE = 'opt.assistant.key';
export const MODE_STORE = 'opt.assistant.mode';
export const MODEL = 'claude-sonnet-5-5';
const API = 'https://api.anthropic.com/v1/messages';
const SNAPSHOT_MAX = 12_000;

export function readKey(): string {
  try { return localStorage.getItem(KEY_STORE) ?? ''; } catch { return ''; }
}
export function writeKey(k: string | null) {
  try { if (k) localStorage.setItem(KEY_STORE, k); else localStorage.removeItem(KEY_STORE); } catch { /* storage unavailable */ }
}
export function readMode(): 'builtin' | 'claude' {
  try { return localStorage.getItem(MODE_STORE) === 'claude' ? 'claude' : 'builtin'; } catch { return 'builtin'; }
}
export function writeMode(m: 'builtin' | 'claude') {
  try { localStorage.setItem(MODE_STORE, m); } catch { /* storage unavailable */ }
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Compact JSON of the scoped data (gyms, KPIs, alarms, recommendations, use per type, energy, zones), under ~12k characters. */
export function snapshot(d: DemoContextValue, gyms: Club[], role: Role, lang: Lang): string {
  const pick = (en: string, ar: string) => (lang === 'ar' ? ar : en);
  const x = makeTx(lang, d.clubs, d.districts);
  const { w4 } = windows(d.live.date);
  const ids = new Set(gyms.map((g) => g.id));
  const gone = new Set((((d.patches.set.settings?.['coo:plan'] ?? {}) as { dismissed?: { id: string }[] }).dismissed ?? []).map((z) => z.id));
  let recs = buildInsights(d).filter((i) => !gone.has(i.id) && i.clubIds.some((id) => ids.has(id)));
  if (role === 'fm') recs = recs.filter((i) => ['service', 'energy', 'capacity'].includes(i.kind) && i.clubIds.every((id) => ids.has(id)));
  const full = {
    asAt: `${d.live.date} ${String(d.live.hour).padStart(2, '0')}:${String(d.live.minute).padStart(2, '0')} Riyadh time`,
    periods: { live: 'at asAt', today: d.live.date, last4Weeks: `${w4.from} to ${w4.to}`, monthToDate: `${d.live.date.slice(0, 8)}01 to ${d.live.date}` },
    tariffSarPerKwh: TARIFF_SAR_PER_KWH,
    gyms: gyms.map((c) => {
      const l = d.live.clubs[c.id];
      const s = gymStats(d, c, w4);
      const live = new Map(machinesByType(d, c.id).map((r) => [r.type, r.inUse]));
      const ac = acOf(d, c.id);
      const ls = lightsOf(d, c.id);
      const month = savingsSummary(d, [c]).month;
      const ms = d.machines.filter((m) => m.clubId === c.id);
      return {
        name: pick(c.nameEn, c.nameAr), capacity: c.capacity, areaM2: c.areaM2, hours: pick(c.hours.labelEn, c.hours.labelAr), openAtThisHour: !!l?.isOpen,
        live: { peopleIn: l?.peopleIn ?? 0, occupancyPct: l?.occupancyPct ?? 0, machinesInUse: l?.machinesInUse ?? 0, machines: ms.length, outOfService: ms.filter((m) => !m.enabled).map((m) => pick(m.nameEn, m.nameAr)) },
        today: { visits: l?.peopleToday ?? 0, energyKwh: Math.round(l?.energyTodayKwh ?? 0), baselineKwh: Math.round(l?.baselineTodayKwh ?? 0) },
        monthToDate: { savedKwh: month.savedKwh, savedSar: month.savedSar, savedPct: month.savedPct },
        last4Weeks: { machineUsePct: s.utilPct, sessionsPerMachineDay: s.sessionsPerMachineDay, visits: s.visits, kwhPerVisit: s.kwhPerVisit, kwhPerM2: s.kwhPerM2, busiestHour: s.peakHour },
        usePerType4Weeks: s.byType.map((u) => ({ type: x.typeLabel(u.type), units: u.units, usePct: u.utilPct, allBusyAtEveningPeakPct: u.peakFullPct, inUseLive: live.get(u.type) ?? 0 })),
        building: {
          mode: ((d.patches.set.settings?.[`fm:${c.id}`] ?? {}) as { mode?: string }).mode ?? 'not set (opening hours apply)',
          acRunning: ac.filter((u) => u.live?.on).length, acUnits: ac.length, acPowerKw: r1(ac.reduce((a, u) => a + (u.live?.on ? u.live.powerKw : 0), 0)),
          lightsOn: ls.filter((q) => q.live?.on).length, lightCircuits: ls.length,
        },
        zones: zoneStates(d, c.id).map((z) => ({ zone: pick(z.nameEn, z.nameAr), tempC: z.temp, setpointC: z.setpoint, people: z.people, acOn: `${z.unitsOn}/${z.units}`, lightsOn: `${z.lightsOn}/${z.lights}` })),
      };
    }),
    openAlarms: alertsIn(d, gyms).map((a) => ({ level: a.level, status: a.status, alarm: pick(a.titleEn, a.titleAr), gym: x.gym(a.clubId), where: pick(a.areaEn, a.areaAr), minutesOpen: Math.round((d.live.nowMs - a.sinceMs) / 60_000) })),
    recommendations: recs.map((i) => {
      const t = describe(i, x);
      return { kind: i.kind, action: t.action, keyNumber: brief(i, x).key, confidence: i.confidence, why: t.why, impact: t.impact };
    }),
  };
  // shrink in steps until it fits
  const steps: ((o: typeof full) => void)[] = [
    (o) => { o.recommendations = o.recommendations.map((r) => ({ ...r, why: r.why.slice(0, 1), impact: r.impact.slice(0, 1) })); },
    (o) => { o.openAlarms = o.openAlarms.slice(0, 10); },
    (o) => { for (const g of o.gyms) g.zones = g.zones.slice(0, 6); },
    (o) => { o.recommendations = o.recommendations.slice(0, 6).map((r) => ({ ...r, why: [], impact: [] })); },
    (o) => { for (const g of o.gyms) g.usePerType4Weeks = g.usePerType4Weeks.slice(0, 8); },
    (o) => { o.openAlarms = o.openAlarms.slice(0, 5); for (const g of o.gyms) g.zones = []; },
  ];
  let json = JSON.stringify(full);
  for (const step of steps) {
    if (json.length <= SNAPSHOT_MAX) break;
    step(full);
    json = JSON.stringify(full);
  }
  return json;
}

export function systemPrompt(role: Role, lang: Lang, gyms: Club[], data: string): string {
  const who = role === 'fm'
    ? `the Facility Manager of ${gyms[0]?.nameEn ?? 'Hittin Gym (Men)'}, who runs that one building (air conditioning, lights, alarms, machines). Only discuss that gym; if asked about another gym, say the Facility Manager view covers this gym only.`
    : 'the COO of a gym chain, who oversees its gyms in Riyadh: Hittin Gym (Men) and Al Sahafa Gym (Men).';
  return [
    "You are Ask Conductor, the operations assistant in Gym's Conductor by Primewave.",
    `You are talking to ${who}`,
    lang === 'ar'
      ? 'Answer in Arabic: formal, contextual wording (not a literal translation), minimal diacritics. Keep numbers in Latin digits.'
      : 'Answer in plain formal English.',
    'Copy rules: say "gyms" (Arabic: صالة رياضية, plural الصالات الرياضية), never "clubs"; write "per gym", not "by gym"; never use the em dash character; no "demo", "sample" or "dummy" wording.',
    'Answer from the provided data. Quote the numbers and the period they cover (live, today, month to date, last 4 weeks). Say so plainly when the data does not cover the question, and never invent numbers.',
    'General fitness or facility questions may be answered generally, without inventing figures for these gyms.',
    'Keep answers short: about 120 words at most. Use a small Markdown pipe table when comparing gyms or listing several items; plain sentences otherwise. No headings.',
    `DATA (JSON): ${data}`,
  ].join('\n');
}

export type ClaudeError = 'auth' | 'rate' | 'busy' | 'blocked' | 'timeout' | 'other' | 'empty';
export class ClaudeFail extends Error {
  constructor(public kind: ClaudeError, public status = 0) { super(kind); }
}

export interface Turn { role: 'user' | 'assistant'; content: string }

/** Keeps the last 8 turns, starting with the user and alternating roles (same-role neighbours merged). */
export function lastTurns(turns: Turn[], n = 8): Turn[] {
  const merged: Turn[] = [];
  for (const t of turns) {
    if (!t.content.trim()) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.role === t.role) prev.content += `\n\n${t.content}`;
    else merged.push({ ...t });
  }
  let out = merged.slice(-n);
  while (out.length && out[0].role !== 'user') out = out.slice(1);
  return out;
}

export async function askClaude(key: string, system: string, turns: Turn[], signal?: AbortSignal): Promise<string> {
  const ctl = new AbortController();
  const timer = window.setTimeout(() => ctl.abort(), 45_000);
  signal?.addEventListener('abort', () => ctl.abort());
  let res: Response;
  try {
    res = await fetch(API, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, system, messages: turns }),
      signal: ctl.signal,
    });
  } catch (e) {
    window.clearTimeout(timer);
    if ((e as Error)?.name === 'AbortError') throw new ClaudeFail('timeout');
    throw new ClaudeFail('blocked');
  }
  window.clearTimeout(timer);
  if (res.status === 401 || res.status === 403) throw new ClaudeFail('auth', res.status);
  if (res.status === 429) throw new ClaudeFail('rate', res.status);
  if (res.status === 529 || res.status >= 500) throw new ClaudeFail('busy', res.status);
  if (!res.ok) throw new ClaudeFail('other', res.status);
  let body: { content?: { type: string; text?: string }[] };
  try { body = await res.json(); } catch { throw new ClaudeFail('empty', res.status); }
  const text = (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n').trim();
  if (!text) throw new ClaudeFail('empty', res.status);
  // house rule: no em dash character in anything shown
  return text.replace(/\u2014/g, ', ');
}
