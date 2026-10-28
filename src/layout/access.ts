import { LIVE_CLUB_ID } from '../data/clubs';
import type { Role, Scope } from '../data/types';
import { useScope } from './filters';
import { useAuth } from './auth';

/*
  One place for what each role may open. Shell (top bar menu), routes (guard) and in-page links all read it.
  COO: every page, the Kingdom map (after sign-in only), Branches and Settings, and may change the gym (branch
  switcher by the logo). He works at two levels (navLevel): network (All branches, no left menu) and branch.
  Facility Manager (fm): one gym (Hittin Gym (Men)), always branch level, no map and no other gyms. His top menu
  is Branch overview (his gym overview, Fm.tsx) and Ask Conductor; his left menu Branch settings (only operating hours
  and alert thresholds editable, see canEditBranch) and his BMS Core and AI Vision pages (no camera images).
  /overview stays open to him (old links) and forwards to /branch.
  Ask Conductor (assistant) is open to both; for the Facility Manager it answers about his gym only.
*/

/** The only gym a Facility Manager sees. */
export const FM_CLUB_ID = LIVE_CLUB_ID;
export const FM_SCOPE: Scope = { level: 'club', clubId: FM_CLUB_ID };

/** Page ids (route path without the slash) open to the Facility Manager. Everything else is COO only. */
const FM_PAGES = new Set([
  'overview', 'assistant', 'branch', 'branch-settings',
  'bms-overview', 'hvac', 'lights', 'ai-agents', 'control', 'bms-settings',
  'vision-overview', 'live-floor', 'heatmap', 'machines', 'reports',
]);

/** True when the role may open the page with this id ('map', 'settings', 'hvac', ...). */
export function canSee(role: Role, pageId: string): boolean {
  if (role === 'coo') return true;
  return FM_PAGES.has(pageId);
}

/** Same check for a path such as "/settings/site-entities?x=1" (first segment decides). */
export function canSeePath(role: Role, path: string): boolean {
  const first = path.replace(/^[#/]+/, '').split(/[/?#]/)[0] || '';
  if (!first) return true;
  return canSee(role, first);
}

/** First page after sign-in. */
export function homeFor(role: Role): string {
  return role === 'fm' ? '/branch' : '/map';
}

/**
 * Navigation level: 'network' (All branches: top menu Overview, Ask Conductor, Branches; no left menu) or 'branch'
 * (one gym: top menu "← Overview", Branch overview, Ask Conductor, Branches; left menu with the gym's pages).
 * The Facility Manager is always at branch level; the Kingdom map is always network level.
 */
export type NavLevel = 'network' | 'branch';
export function navLevel(role: Role, scope: Scope, pageId: string): NavLevel {
  if (role === 'fm') return 'branch';
  if (pageId === 'map') return 'network';
  return scope.level === 'club' ? 'branch' : 'network';
}

/** Whether the role may change the scope (branch switcher by the logo, the map, the Branches list). */
export function canChangeScope(role: Role): boolean {
  return role === 'coo';
}

/** Whether the role sees camera images, camera names and the camera pop-up. */
export function canSeeCameras(role: Role): boolean {
  return role === 'coo';
}

/** Whether the role may edit layouts, delete or remove items and reset history. */
export function canManage(role: Role): boolean {
  return role === 'coo';
}

/** Branch settings sections the role may edit: COO everything; Facility Manager operating hours and alert thresholds. */
export function canEditBranch(role: Role, section: 'details' | 'floors' | 'hours' | 'thresholds'): boolean {
  if (role === 'coo') return true;
  return section === 'hours' || section === 'thresholds';
}

/** Hook for components: the signed-in role with the checks bound to it. */
export function useAccess() {
  const { role: scopeRole } = useScope();
  const { user } = useAuth();
  const role: Role = user?.role ?? scopeRole;
  return {
    role,
    isFm: role === 'fm',
    can: (pageId: string) => canSee(role, pageId),
    canPath: (path: string) => canSeePath(role, path),
    cameras: canSeeCameras(role),
    manage: canManage(role),
    changeScope: canChangeScope(role),
  };
}
