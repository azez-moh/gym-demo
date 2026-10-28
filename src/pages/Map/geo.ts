import type { Club, District, RegionId, Scope } from '../../data/types';
import { REGIONS } from '../../layout/filters';

/** Kingdom view: mainland Saudi Arabia. */
export const SAUDI_BOUNDS: [[number, number], [number, number]] = [[16.4, 34.6], [32.1, 55.6]];

/** Map drill-down state. `clubId` = the club whose fact card is open. */
export interface Selection {
  region?: RegionId;
  district?: string;
  clubId?: string;
}

export type MapLevel = 'kingdom' | 'region' | 'district';

export const levelOf = (s: Selection): MapLevel => (s.district ? 'district' : s.region ? 'region' : 'kingdom');

export interface RegionPlace { id: RegionId; lat: number; lng: number; clubs: Club[]; cityEn: string; cityAr: string }
export interface DistrictPlace { id: string; district: District; lat: number; lng: number; clubs: Club[] }

const centroid = (cs: { lat: number; lng: number }[]) => ({
  lat: cs.reduce((n, c) => n + c.lat, 0) / cs.length,
  lng: cs.reduce((n, c) => n + c.lng, 0) / cs.length,
});

export function regionPlaces(clubs: Club[], districts: District[]): RegionPlace[] {
  return REGIONS.map((id) => {
    const cs = clubs.filter((c) => c.region === id);
    const d = districts.find((x) => x.region === id);
    return { id, clubs: cs, cityEn: d?.cityEn ?? '', cityAr: d?.cityAr ?? '', ...(cs.length ? centroid(cs) : { lat: 0, lng: 0 }) };
  }).filter((r) => r.clubs.length > 0);
}

/** Districts of a region with their clubs, largest first then by name. */
export function districtPlaces(clubs: Club[], districts: District[], region: RegionId): DistrictPlace[] {
  return districts
    .filter((d) => d.region === region)
    .map((d) => {
      const cs = clubs.filter((c) => c.district === d.id);
      return { id: d.id, district: d, clubs: cs, ...(cs.length ? centroid(cs) : { lat: d.lat, lng: d.lng }) };
    })
    .filter((d) => d.clubs.length > 0)
    .sort((a, b) => b.clubs.length - a.clubs.length || a.district.nameEn.localeCompare(b.district.nameEn));
}

export function clubsOfSelection(clubs: Club[], s: Selection): Club[] {
  if (s.district) return clubs.filter((c) => c.district === s.district);
  if (s.region) return clubs.filter((c) => c.region === s.region);
  return clubs;
}

/** Map selection that matches a global scope (a club scope opens its district). */
export function selectionFromScope(scope: Scope, clubs: Club[], districts: District[]): Selection {
  switch (scope.level) {
    case 'all': return {};
    case 'region': return { region: scope.region };
    case 'district': {
      const d = districts.find((x) => x.id === scope.district);
      return d ? { region: d.region, district: d.id } : {};
    }
    case 'club': {
      const c = clubs.find((x) => x.id === scope.clubId);
      return c ? { region: c.region, district: c.district } : {};
    }
  }
}

/** Global scope for the "All of ..." top row at a map level. */
export function scopeOfSelection(s: Selection): Scope {
  if (s.district) return { level: 'district', district: s.district };
  if (s.region) return { level: 'region', region: s.region };
  return { level: 'all' };
}

export function boundsOf(pts: { lat: number; lng: number }[]): [[number, number], [number, number]] {
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
}
