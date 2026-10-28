import type { Club, District, OpeningHours } from './types';

/*
  The demo network: 2 men's gyms in Riyadh (Hittin, Al Sahafa). Pins, addresses, floor areas and every
  operational figure are illustrative.
*/

export const DISTRICTS: District[] = [
  { id: 'hittin', region: 'riyadh', cityEn: 'Riyadh', cityAr: 'الرياض', nameEn: 'Hittin', nameAr: 'حطين', lat: 24.7640, lng: 46.6010 },
  { id: 'sahafa', region: 'riyadh', cityEn: 'Riyadh', cityAr: 'الرياض', nameEn: 'Al Sahafa', nameAr: 'الصحافة', lat: 24.8095, lng: 46.6380 },
];

const MEN_HOURS: OpeningHours = { open: 6, close: 25, labelEn: 'Daily 06:00 to 01:00', labelAr: 'يوميًا من 06:00 إلى 01:00' };
const WOMEN_HOURS: OpeningHours = {
  open: 6, close: 23, sat: { open: 13, close: 22 },
  labelEn: 'Sun to Fri 06:00 to 23:00, Sat 13:00 to 22:00', labelAr: 'الأحد إلى الجمعة 06:00 إلى 23:00، السبت 13:00 إلى 22:00',
};

interface Seed {
  id: string; code: string; district: string; gender: Club['gender'];
  lat?: number; lng?: number; areaM2: number; capacity: number; addressEn: string; addressAr: string;
  openedEn: string; openedAr: string; live?: boolean;
}

const SEEDS: Seed[] = [
  { id: 'gym-hittin-men', code: 'GYM-HTN-M', district: 'hittin', gender: 'men', lat: 24.7646, lng: 46.6003, areaM2: 3600, capacity: 160,
    addressEn: 'Prince Turki Ibn Abdulaziz Al Awwal Rd, Hittin, Riyadh', addressAr: 'طريق الأمير تركي بن عبدالعزيز الأول، حطين، الرياض', openedEn: 'Mar 2023', openedAr: 'مارس 2023', live: true },
  { id: 'gym-sahafa-men', code: 'GYM-SHF-M', district: 'sahafa', gender: 'men', lat: 24.8101, lng: 46.6392, areaM2: 3400, capacity: 140,
    addressEn: 'King Abdulaziz Rd, Al Sahafa, Riyadh', addressAr: 'طريق الملك عبدالعزيز، الصحافة، الرياض', openedEn: '2024', openedAr: '2024' },
];

const DISTRICT_BY_ID = Object.fromEntries(DISTRICTS.map((d) => [d.id, d]));

export function buildClubs(): Club[] {
  return SEEDS.map((s) => {
    const d = DISTRICT_BY_ID[s.district];
    const gEn = s.gender === 'men' ? 'Men' : 'Women';
    const gAr = s.gender === 'men' ? 'رجال' : 'نساء';
    const hours = s.gender === 'women' ? WOMEN_HOURS : MEN_HOURS;
    const scale = s.areaM2 / 3600;
    return {
      id: s.id,
      code: s.code,
      nameEn: `${d.nameEn} Gym (${gEn})`,
      nameAr: `صالة ${d.nameAr} (${gAr})`,
      shortEn: `${d.nameEn} ${gEn}`,
      shortAr: `${d.nameAr} ${gAr}`,
      region: d.region,
      district: d.id,
      gender: s.gender,
      lat: s.lat ?? d.lat,
      lng: s.lng ?? d.lng,
      exactPin: s.lat != null,
      addressEn: s.addressEn,
      addressAr: s.addressAr,
      areaM2: s.areaM2,
      capacity: s.capacity,
      hours,
      openedEn: s.openedEn,
      openedAr: s.openedAr,
      staff: Math.round(14 + 18 * scale),
      // counts below are filled in by build.ts from the generated inventories
      machines: 0,
      cameras: 0,
      zones: 0,
      acUnits: 0,
      lightCircuits: 0,
      live: !!s.live,
    };
  });
}

/** The live club (it has the full demo floor and floor plan). */
export const LIVE_CLUB_ID = 'gym-hittin-men';

/** Commercial electricity tariff used for savings in SAR. Assumption: 0.32 SAR per kWh (commercial, incl. fees). */
export const TARIFF_SAR_PER_KWH = 0.32;

/** Share of a club's energy by end use ("Where it goes"). */
export const ENERGY_SPLIT: { key: string; en: string; ar: string; pct: number }[] = [
  { key: 'ac', en: 'Air conditioning', ar: 'التكييف', pct: 48 },
  { key: 'ahu', en: 'Ventilation and AHU', ar: 'التهوية ووحدات مناولة الهواء', pct: 19 },
  { key: 'lighting', en: 'Lighting', ar: 'الإضاءة', pct: 14 },
  { key: 'water', en: 'Water heating', ar: 'تسخين المياه', pct: 10 },
  { key: 'plug', en: 'Machines and plug loads', ar: 'الأجهزة والأحمال الكهربائية', pct: 6 },
  { key: 'lifts', en: 'Lifts and pumps', ar: 'المصاعد والمضخات', pct: 3 },
];
