import { translate, LOCALE, type Lang } from '../../i18n';
import type { Club, DemoContextValue, MachineType } from '../../data';
import type { Insight } from './insights';

/*
  Plain-language text of the recommendations in a given language (no React): used by the Overview cards,
  the action plan (both languages are kept) and the Ask Conductor assistant.
*/

// ---------- formatting in a given language (also used to snapshot both languages into the plan) ----------

export interface Tx {
  lang: Lang;
  t: (k: string, v?: Record<string, string | number>) => string;
  num: (n: number, dp?: number) => string;
  sar: (v: number) => string;
  gym: (id: string) => string;
  types: (type: MachineType, n: number) => string;
  typeLabel: (type: MachineType) => string;
  hour: (h: number) => string;
  slot: (h: number) => string;
  list: (xs: string[]) => string;
}

export function makeTx(lang: Lang, clubs: Club[], districts: DemoContextValue['districts']): Tx {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, `insights.${k}`, v);
  const nf = new Map<number, Intl.NumberFormat>();
  const num = (n: number, dp?: number) => {
    const k = dp ?? -1;
    let f = nf.get(k);
    if (!f) { f = new Intl.NumberFormat(LOCALE[lang], dp == null ? { maximumFractionDigits: 1 } : { minimumFractionDigits: dp, maximumFractionDigits: dp }); nf.set(k, f); }
    return f.format(n);
  };
  const sar = (v: number) => {
    if (v < 10_000) return lang === 'ar' ? `${num(Math.round(v))} ر.س` : `SAR ${num(Math.round(v))}`;
    if (v < 1_000_000) return lang === 'ar' ? `${num(v / 1000, 1)} ألف ر.س` : `SAR ${num(v / 1000, 1)}k`;
    return lang === 'ar' ? `${num(v / 1e6, 2)} مليون ر.س` : `SAR ${num(v / 1e6, 2)}m`;
  };
  const dById = new Map(districts.map((d) => [d.id, d]));
  const gym = (id: string) => {
    const c = clubs.find((x) => x.id === id);
    const d = c ? dById.get(c.district) : undefined;
    return d ? (lang === 'ar' ? d.nameAr : d.nameEn) : id;
  };
  const hf = new Intl.DateTimeFormat(LOCALE[lang], { hour: 'numeric', hour12: true, timeZone: 'UTC' });
  const hour = (h: number) => {
    const s = hf.format(new Date(Date.UTC(2000, 0, 1, ((h % 24) + 24) % 24)));
    return lang === 'en' ? s.replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase()) : s;
  };
  return {
    lang, t, num, sar, gym, hour,
    types: (type, n) => (lang === 'ar' ? t(`type.${type}.many`) : t(`type.${type}.${n === 1 ? 'one' : 'many'}`)),
    typeLabel: (type) => t(`type.${type}.label`),
    slot: (h) => t('text.slot', { a: hour(h), b: hour(h + 2) }),
    list: (xs) => xs.join(t('text.listSep')),
  };
}


export interface Described { action: string; why: string[]; impact: string[] }

/** Plain-language action, reasons (the numbers) and expected impact of a recommendation. */
export function describe(i: Insight, x: Tx): Described {
  const { t, num, sar, gym } = x;
  if (i.move) {
    const m = i.move;
    return {
      action: t('text.moveAction', { n: num(m.n), types: x.types(i.type!, m.n), from: gym(m.from), to: gym(m.to) }),
      why: [
        t('text.moveWhyTo', { gym: gym(m.to), util: num(m.toUtil), s: num(m.toSessionsDay), units: num(m.toUnits), peak: num(Math.round(m.toPeakFull)) }),
        t('text.moveWhyFrom', { gym: gym(m.from), util: num(m.fromUtil), s: num(m.fromSessionsDay), units: num(m.fromUnits) }),
      ],
      impact: [
        t('text.moveImpactUse', { to: gym(m.to), a: num(m.toUtil), b: num(m.toAfter), from: gym(m.from), c: num(m.fromUtil), d: num(m.fromAfter) }),
        t('text.moveImpactSar', { n: num(m.n), sar: sar(m.avoidedSar), cost: sar(m.moveCostSar) }),
      ],
    };
  }
  if (i.buy) {
    const b = i.buy;
    const list = x.list(b.perGym.map((g) => t('text.gymN', { gym: gym(g.clubId), n: num(g.n) })));
    return {
      action: t('text.buyAction', { n: num(b.total), types: x.types(i.type!, b.total), list }),
      why: [
        t('text.buyWhy', { k: num(b.highGyms), m: num(b.ofGyms), peak: num(Math.round(Math.max(...b.perGym.map((g) => g.peakFull)))) }),
        t('text.buyWhyNoSpare', { types: x.types(i.type!, 2) }),
      ],
      impact: [
        t('text.buyImpactUse', { list: x.list(b.perGym.map((g) => t('text.fromTo', { gym: gym(g.clubId), a: num(g.util), b: num(g.after) }))) }),
        t('text.buyImpactSar', { sar: sar(b.costSar), price: sar(b.unitPrice) }),
      ],
    };
  }
  if (i.retire) {
    const r = i.retire;
    const list = x.list(r.perGym.map((g) => t('text.gymN', { gym: gym(g.clubId), n: num(g.n) })));
    return {
      action: t('text.retireAction', { n: num(r.total), units: num(r.units), types: x.types(i.type!, r.units), list }),
      why: [
        t('text.retireWhy', { util: num(r.networkUtil) }),
        t('text.retireWhyPeak', { a: num(i.weeksHeld), b: num(i.weeksOf) }),
      ],
      impact: [t('text.retireImpactSar'), t('text.retireImpactKeep')],
    };
  }
  if (i.service) {
    const s = i.service;
    const nm = (m: { nameEn: string; nameAr: string }) => (x.lang === 'ar' ? m.nameAr : m.nameEn);
    const shown = s.machines.slice(0, 3).map(nm);
    const names = x.list(s.machines.length > 3 ? [...shown, t('text.more', { n: num(s.machines.length - 3) })] : shown);
    return {
      action: s.machines.length === 1 ? t('text.serviceActionOne', { names, gym: gym(s.clubId) }) : t('text.serviceAction', { n: num(s.machines.length), gym: gym(s.clubId), names }),
      why: s.machines.slice(0, 2).map((m) => t('text.serviceWhy', { name: nm(m), h: num(m.hours), i: num(m.interval) })),
      impact: [t('text.serviceImpact'), t('text.serviceImpactTime')],
    };
  }
  if (i.energy) {
    const e = i.energy;
    const why = [
      t('text.energyWhy', { gym: gym(e.clubId), kpv: num(e.kwhPerVisit, 2), gap: num(e.gapPct), best: gym(e.bestClubId), bpv: num(e.bestKwhPerVisit, 2) }),
      t('text.energyWhyAc', { h: num(e.afterHoursAcH) }),
    ];
    if (e.emptyZoneH > 0) why.push(t('text.energyWhyStudio', { h: num(e.emptyZoneH) }));
    return {
      action: t('text.energyAction', { gym: gym(e.clubId) }),
      why,
      impact: [t('text.energyImpact', { kwh: num(e.wasteKwhMonth), sar: sar(e.wasteSarMonth) })],
    };
  }
  const c = i.capacity!;
  return {
    action: c.classes === 1
      ? t('text.capacityActionOne', { gym: gym(c.clubId), slot: x.hour(c.slotH), quiet: x.hour(c.quietH) })
      : t('text.capacityAction', { n: num(c.classes), gym: gym(c.clubId), slot: x.hour(c.slotH), quiet: x.hour(c.quietH) }),
    why: [
      t('text.capacityWhy', { d: num(c.days), of: num(c.ofDays) }),
      t('text.capacityWhySlots', { slot: x.slot(c.slotH), p: num(c.peakPct), quiet: x.slot(c.quietH), q: num(c.quietPct) }),
    ],
    impact: [t('text.capacityImpact', { a: num(c.afterPct) })],
  };
}

/** One-line brief of the action and its one key number (the collapsed row). */
export function brief(i: Insight, x: Tx): { text: string; key: string } {
  const { t, num, sar, gym } = x;
  if (i.move) {
    const m = i.move;
    return { text: t('text.moveAction', { n: num(m.n), types: x.types(i.type!, m.n), from: gym(m.from), to: gym(m.to) }), key: t('brief.moveKey', { sar: sar(m.avoidedSar) }) };
  }
  if (i.buy) return { text: t('brief.buy', { n: num(i.buy.total), types: x.types(i.type!, i.buy.total) }), key: t('brief.buyKey', { sar: sar(i.buy.costSar) }) };
  if (i.retire) return { text: t('brief.retire', { n: num(i.retire.total), types: x.types(i.type!, i.retire.total) }), key: t('brief.retireKey', { util: num(i.retire.networkUtil) }) };
  if (i.service) {
    const s = i.service;
    const over = Math.max(...s.machines.map((m) => m.hours - m.interval));
    const nm = (m: { nameEn: string; nameAr: string }) => (x.lang === 'ar' ? m.nameAr : m.nameEn);
    return {
      text: s.machines.length === 1 ? t('brief.serviceOne', { name: nm(s.machines[0]), gym: gym(s.clubId) }) : t('brief.service', { n: num(s.machines.length), gym: gym(s.clubId) }),
      key: t('brief.serviceKey', { h: num(Math.max(0, Math.round(over))) }),
    };
  }
  if (i.energy) return { text: t('brief.energy', { gym: gym(i.energy.clubId) }), key: t('brief.energyKey', { sar: sar(i.energy.wasteSarMonth) }) };
  const c = i.capacity!;
  return {
    text: c.classes === 1 ? t('brief.capacityOne', { gym: gym(c.clubId), quiet: x.hour(c.quietH) }) : t('brief.capacity', { n: num(c.classes), gym: gym(c.clubId), quiet: x.hour(c.quietH) }),
    key: t('brief.capacityKey', { a: num(c.peakPct), b: num(c.afterPct) }),
  };
}
