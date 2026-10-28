/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ROLES, useScope } from './filters';
import { canSee, homeFor } from './access';
import type { Role } from '../data/types';

/**
 * Sign-in without passwords or network: the session is an email address and a role kept in sessionStorage
 * (try/catch, falls back to memory). It gates the map and dashboard routes. Roles: coo (default), fm (Facility Manager).
 * What each role may open lives in src/layout/access.ts.
 */

export interface AuthUser { name: string; email: string; role: Role }

export interface AuthCtx {
  signedIn: boolean;
  user: AuthUser | null;
  /** Signs in with the role picked on the sign-in page. The role is fixed for the session. */
  signIn: (email: string, role?: Role) => void;
  signOut: () => void;
}

export const DEFAULT_EMAIL = 'coo@gymdemo.sa';
const KEY = 'opt.auth';

/** First page after sign-in for the COO: the Kingdom map (the Facility Manager lands on /overview, see homeFor). */
export const HOME_AFTER_SIGNIN = '/map';

/** Router state passed to /signin so a deep link (with a query string) can be restored after sign-in. */
export interface SignInState { from?: string }

function nameFrom(email: string): string {
  const local = email.split('@')[0] || '';
  if (local.toLowerCase() === 'coo') return 'Chief Operating Officer';
  if (local.toLowerCase() === 'fm') return 'Facility Manager';
  return local.split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'User';
}

function readUser(): AuthUser | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as Partial<AuthUser>;
    const role: Role = u.role && ROLES.includes(u.role) ? u.role : 'coo';
    return typeof u.email === 'string' && u.email ? { email: u.email, name: u.name || nameFrom(u.email), role } : null;
  } catch {
    return null;
  }
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readUser);

  const signIn = useCallback((email: string, role: Role = 'coo') => {
    const e = email.trim() || DEFAULT_EMAIL;
    const u: AuthUser = { email: e, name: nameFrom(e), role };
    setUser(u);
    try { sessionStorage.setItem(KEY, JSON.stringify(u)); } catch { /* storage blocked: keep in memory */ }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  }, []);

  const value = useMemo<AuthCtx>(() => ({ signedIn: !!user, user, signIn, signOut }), [user, signIn, signOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside <AuthProvider>');
  return c;
}

/** Keeps the dashboard scope on the role chosen at sign-in (for example after a reload or another tab). */
function RoleSync({ role }: { role: Role }) {
  const { role: current, setRole } = useScope();
  useEffect(() => {
    if (current !== role) setRole(role);
  }, [current, role, setRole]);
  return null;
}

/** Renders children when signed in; otherwise redirects to /signin and remembers the requested path. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { signedIn, user } = useAuth();
  const loc = useLocation();
  if (!signedIn || !user) {
    const state: SignInState = { from: `${loc.pathname}${loc.search}${loc.hash}` };
    return <Navigate to="/signin" replace state={state} />;
  }
  return <><RoleSync role={user.role} />{children}</>;
}

/** Route guard by page id: a page the signed-in role may not open redirects to that role's home page. */
export function RequirePage({ id, children }: { id: string; children: ReactNode }) {
  const { user } = useAuth();
  const role: Role = user?.role ?? 'coo';
  if (!canSee(role, id)) return <Navigate to={homeFor(role)} replace />;
  return <>{children}</>;
}
