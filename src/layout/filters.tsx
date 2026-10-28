/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Club, District, RegionId, Role, Scope } from '../data/types';
import { LIVE_CLUB_ID } from '../data/clubs';

/**
 * Global scope (all / region / district / club), set from the branch switcher by the logo, the Kingdom map or the Branches list, plus the
 * signed-in role. Both persist in localStorage (opt.scope, opt.role). Pages read the scope with useScope()
 * and pass it to the selectors in src/data/selectors.ts.
 * The Facility Manager is locked to one gym: his scope is always Hittin Gym (Men) and setScope is ignored.
 */

export const ROLES: Role[] = ['coo', 'fm'];

/** Fixed scope of the Facility Manager (also in src/layout/access.ts). */
const FM_LOCK: Scope = { level: 'club', clubId: LIVE_CLUB_ID };
export const REGIONS: RegionId[] = ['riyadh'];

const SCOPE_KEY = 'opt.scope';
const ROLE_KEY = 'opt.role';

function readScope(): Scope {
  try {
    const raw = localStorage.getItem(SCOPE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Scope;
      if (s && typeof s === 'object' && ['all', 'region', 'district', 'club'].includes(s.level)) return s;
    }
  } catch { /* ignore */ }
  return { level: 'all' };
}

function readRole(): Role {
  try {
    const r = localStorage.getItem(ROLE_KEY) as Role | null;
    if (r && ROLES.includes(r)) return r;
  } catch { /* ignore */ }
  return 'coo';
}

export interface ScopeCtx {
  scope: Scope;
  setScope: (s: Scope) => void;
  role: Role;
  setRole: (r: Role) => void;
  /** Facility Manager: one gym, limited menu. */
  isFm: boolean;
  /** Clubs inside the current scope. */
  clubs: Club[];
  allClubs: Club[];
  districts: District[];
}

const Ctx = createContext<ScopeCtx | null>(null);

export function FiltersProvider({ children, clubs, districts }: { children: ReactNode; clubs: Club[]; districts: District[] }) {
  const [scopeState, setScopeState] = useState<Scope>(readScope);
  const [role, setRoleState] = useState<Role>(readRole);

  const setScope = useCallback((s: Scope) => {
    if (role === 'fm') return; // locked to one gym
    setScopeState(s);
    try { localStorage.setItem(SCOPE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }, [role]);

  const setRole = useCallback((r: Role) => {
    setRoleState(r);
    try { localStorage.setItem(ROLE_KEY, r); } catch { /* ignore */ }
  }, []);

  const value = useMemo<ScopeCtx>(() => {
    // A stored gym that no longer exists falls back to all branches.
    const scope = role === 'fm' ? FM_LOCK
      : scopeState.level === 'club' && !clubs.some((c) => c.id === scopeState.clubId) ? { level: 'all' as const } : scopeState;
    const inScope = scope.level === 'all' ? clubs
      : scope.level === 'region' ? clubs.filter((c) => c.region === scope.region)
      : scope.level === 'district' ? clubs.filter((c) => c.district === scope.district)
      : clubs.filter((c) => c.id === scope.clubId);
    return { scope, setScope, role, setRole, isFm: role === 'fm', clubs: inScope.length ? inScope : clubs, allClubs: clubs, districts };
  }, [scopeState, setScope, role, setRole, clubs, districts]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScope(): ScopeCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useScope must be used inside <FiltersProvider>');
  return c;
}

/** Dunkin-compatible alias. */
export const useFilters = useScope;

/**
 * Gym-level pages (BMS Core, AI Vision) need one gym. Opened at network scope, the scope switches to the live gym
 * (Hittin Gym (Men), the gym with data) before the page renders, and the left menu shows the gym's BMS Core and AI Vision pages.
 */
export function RequireGym({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const { scope, setScope } = useScope();
  const need = scope.level !== 'club';
  useEffect(() => {
    if (need) setScope({ level: 'club', clubId: LIVE_CLUB_ID });
  }, [need, setScope]);
  return <>{need ? fallback : children}</>;
}
