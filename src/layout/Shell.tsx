import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Bell, Check, ChevronDown, ChevronLeft, Globe, LayoutGrid, LogOut, Menu, Moon, PanelLeftClose, PanelLeftOpen, Settings, Store, Sun, UserRound, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { useTheme } from '../theme/theme';
import { BrandMark, StatusBadge } from '../components';
import { useDemo } from '../data/store';
import { alertsIn } from '../data/selectors';
import type { Scope } from '../data/types';
import { BMS_PAGES, BRANCH_TOP, NETWORK_TOP, SIDE_PAGES, VISION_PAGES, type PageDef, type TopItem } from './nav';
import { useScope } from './filters';
import { useAuth } from './auth';
import { scopeLabel } from './scopeLabel';
import { navLevel, useAccess, type NavLevel } from './access';
import './layout.css';

/*
  App shell, two levels (navLevel in src/layout/access.ts, menus from src/layout/nav.ts):
    Network level (All branches, and the Kingdom map after sign-in): top bar only, no left menu, the page uses the
    full width. Top bar: logo, divider, branch switcher ("All branches"); centre menu Overview, Ask Conductor, Branches;
    alerts, theme, language, user, sign out and the Settings gear on the inline end.
    Branch level (one gym picked from the map, Branches or the switcher): centre menu "← Overview" (back to the
    network Overview), Branch overview, Ask Conductor, Branches; a slim left menu (collapsible to icons; a drawer under
    1024px) with Branch settings and the BMS Core and AI Vision groups (filtered by role).
  The Facility Manager is always at branch level, locked to his gym: the branch name is a plain label, top menu Branch
  overview and Ask Conductor only. Under 900px the centre menu moves into the drawer, above the left menu items.
*/

const GROUPS_KEY = 'opt.navGroups';
const SIDE_KEY = 'opt.sideCollapsed';

function readGroups(): Record<'bms' | 'vision', boolean> {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (raw) return { bms: true, vision: true, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { bms: true, vision: true };
}

function readCollapsed(): boolean {
  try { return localStorage.getItem(SIDE_KEY) === '1'; } catch { return false; }
}

const firstSegment = (pathname: string) => pathname.replace(/^\/+/, '').split(/[/?#]/)[0];

export function ThemeToggle() {
  const { t } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? t('shell.themeLight') : t('shell.themeDark');
  return (
    <button type="button" className="btn btn--icon btn--ghost icon-btn" onClick={toggleTheme} aria-label={label} title={label}>
      {theme === 'dark' ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </button>
  );
}

export function LangToggle() {
  const { t, toggleLang, lang } = useI18n();
  return (
    <button type="button" className="btn btn--ghost lang-btn" onClick={toggleLang} aria-label={t('shell.langSwitchLabel')} lang={lang === 'ar' ? 'en' : 'ar'}>
      <Globe aria-hidden />
      <span className="lang-btn__full">{t('shell.langSwitch')}</span>
      <span className="lang-btn__short">{lang === 'ar' ? 'EN' : 'ع'}</span>
    </button>
  );
}

export function SignOutButton() {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <button type="button" className="btn btn--icon btn--ghost icon-btn" onClick={() => { signOut(); navigate('/signin', { replace: true }); }}
      aria-label={t('shell.signOut')} title={t('shell.signOut')}>
      <LogOut aria-hidden className="flip-rtl" />
    </button>
  );
}

export function RoleLabel() {
  const { t } = useI18n();
  const { role } = useScope();
  return (
    <span className="role-label" title={t('role.changeHint')}>
      <UserRound aria-hidden />
      <span className="visually-hidden">{t('role.label')}: </span>
      <span className="role-label__name">{t(`role.${role}Short`)}</span>
    </span>
  );
}

/** Small gear in the top bar corner: opens Settings (not a menu item). */
function SettingsGear() {
  const { t } = useI18n();
  const { can } = useAccess();
  if (!can('settings')) return null;
  return (
    <NavLink to="/settings" className={({ isActive }) => `btn btn--icon btn--ghost icon-btn topbar__gear${isActive ? ' is-active' : ''}`}
      aria-label={t('nav.settings')} title={t('nav.settings')}>
      <Settings aria-hidden />
    </NavLink>
  );
}

/** Bell with the count of open alerts in scope; opens a short list. */
function AlertsBell() {
  const { t, pick, fmtAgo } = useI18n();
  const data = useDemo();
  const { clubs } = useScope();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const list = alertsIn(data, clubs);
  const clubName = (id: string) => { const c = data.clubs.find((x) => x.id === id); return c ? pick(c.shortEn, c.shortAr) : ''; };
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const label = list.length ? t('shell.alertsCount', { n: list.length }) : t('shell.alertsNone');
  return (
    <div className="bell" ref={ref}>
      <button type="button" className="btn btn--icon btn--ghost icon-btn bell__btn" aria-label={label} title={label} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        <Bell aria-hidden />
        {list.length > 0 && <span className="bell__count num" aria-hidden>{list.length}</span>}
      </button>
      {open && (
        <div className="bell__menu" role="dialog" aria-label={t('shell.alerts')}>
          <div className="bell__head"><span className="label">{t('shell.alerts')}</span><span className="num muted">{list.length}</span></div>
          {list.length === 0 && <p className="bell__empty">{t('shell.alertsNone')}</p>}
          <ul className="bell__list">
            {list.slice(0, 8).map((a) => (
              <li key={a.id} className="bell__item">
                <StatusBadge status={a.level === 'critical' ? 'critical' : a.level === 'warning' ? 'warning' : 'info'} />
                <span className="bell__title">{pick(a.titleEn, a.titleAr)}</span>
                <span className="bell__meta">{clubName(a.clubId)} · {pick(a.areaEn, a.areaAr)} · {fmtAgo((data.now.getTime() - a.sinceMs) / 1000)}</span>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn--sm bell__all" onClick={() => { setOpen(false); navigate('/ai-agents'); }}>{t('shell.alertsViewAll')}</button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Branch switcher beside the logo
// ---------------------------------------------------------------------------------------------------------

/**
 * Current scope beside the logo ("All branches" or the gym name). Click opens a compact list: All branches, then
 * each gym. Choosing keeps the user on the equivalent page: network pages stay; a gym page falls back to Overview
 * when switching to All branches; Overview and Branches (network pages) open the chosen gym's Branch overview.
 * For the Facility Manager it is a plain label (locked to his gym).
 */
function ScopeSwitcher() {
  const i18n = useI18n();
  const { t, pick } = i18n;
  const { scope, setScope, allClubs, districts } = useScope();
  const { changeScope } = useAccess();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const label = scopeLabel(scope, i18n, allClubs, districts);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus());
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  if (!changeScope) {
    return (
      <span className="scopesw scopesw--fixed" title={label}>
        <span className="visually-hidden">{t('nav.context')}: </span>
        <span className="scopesw__name">{label}</span>
      </span>
    );
  }

  // "All branches" behaves like "← Overview" (network Overview); a gym keeps a gym page or Ask Conductor and opens
  // Branch overview from a network page (Overview, Branches, map).
  const choose = (s: Scope) => {
    setOpen(false);
    trigger.current?.focus();
    const page = firstSegment(pathname);
    if (s.level === 'all') navigate('/overview');
    else if (s.level === 'club' && (page === 'branches' || page === 'overview' || page === 'map')) navigate('/branch');
    setScope(s);
  };
  const items = () => Array.from(list.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  const focusAt = (i: number) => { const l = items(); if (l.length) l[(i + l.length) % l.length].focus(); };
  const onListKey = (e: ReactKeyboardEvent) => {
    const l = items();
    const i = l.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
    else if (e.key === 'End') { e.preventDefault(); focusAt(-1); }
    else if (e.key === 'Tab') setOpen(false);
  };
  const isAll = scope.level === 'all';
  const gyms = [...allClubs].sort((a, b) => pick(a.nameEn, a.nameAr).localeCompare(pick(b.nameEn, b.nameAr)));

  return (
    <div className={`scopesw${open ? ' is-open' : ''}`} ref={wrap}>
      <button ref={trigger} type="button" className="scopesw__btn" aria-haspopup="true" aria-expanded={open} aria-controls={listId}
        title={t('nav.switchScope')} onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); setOpen(true); } }}>
        <span className="visually-hidden">{t('nav.switchScope')}. {t('nav.context')}: </span>
        <span className="scopesw__name">{label}</span>
        <ChevronDown aria-hidden className="scopesw__chev" />
      </button>
      <ul id={listId} ref={list} className="scopesw__menu" hidden={!open} role="menu" aria-label={t('nav.switchScope')} onKeyDown={onListKey}>
        <li role="none">
          <button type="button" role="menuitemradio" aria-checked={isAll} className={`scopesw__item${isAll ? ' is-current' : ''}`} onClick={() => choose({ level: 'all' })}>
            <LayoutGrid aria-hidden className="scopesw__icon" />
            <span className="scopesw__text">{t('nav.allBranches')}</span>
            {isAll && <Check aria-hidden className="scopesw__check" />}
          </button>
        </li>
        <li role="separator" className="scopesw__sep" />
        {gyms.map((c) => {
          const on = scope.level === 'club' && scope.clubId === c.id;
          return (
            <li key={c.id} role="none">
              <button type="button" role="menuitemradio" aria-checked={on} className={`scopesw__item${on ? ' is-current' : ''}`} onClick={() => choose({ level: 'club', clubId: c.id })}>
                <Store aria-hidden className="scopesw__icon" />
                <span className="scopesw__text">{pick(c.nameEn, c.nameAr)}</span>
                {on && <Check aria-hidden className="scopesw__check" />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Top centre menu: network level Overview, Ask Conductor, Branches; branch level "← Overview", Branch overview,
// Ask Conductor, Branches (filtered by role)
// ---------------------------------------------------------------------------------------------------------

function useLevel(): NavLevel {
  const { scope } = useScope();
  const { role } = useAccess();
  const { pathname } = useLocation();
  return navLevel(role, scope, firstSegment(pathname));
}

function useTopItems(): TopItem[] {
  const { can, changeScope } = useAccess();
  const level = useLevel();
  const items = level === 'network' ? NETWORK_TOP : BRANCH_TOP;
  return items.filter((p) => (p === 'back' ? changeScope : can(p.id)));
}

/** "← Overview": back to all branches (scope All branches, network Overview). The chevron mirrors in Arabic. */
function useBack() {
  const { setScope } = useScope();
  return useCallback(() => setScope({ level: 'all' }), [setScope]);
}

function TopNav() {
  const { t } = useI18n();
  const items = useTopItems();
  const back = useBack();
  return (
    <nav className="topnav" aria-label={t('nav.main')}>
      <ul className="topnav__list">
        {items.map((p) => p === 'back' ? (
          <li key="back" className="topnav__item">
            <Link to="/overview" className="topnav__link topnav__link--back" onClick={back} title={t('nav.about.back')} aria-label={t('nav.back')}>
              <ChevronLeft aria-hidden className="topnav__backicon flip-rtl" />
              <span>{t('nav.overview')}</span>
            </Link>
          </li>
        ) : (
          <li key={p.id} className="topnav__item">
            <NavLink to={`/${p.id}`} className="topnav__link" title={t(`nav.about.${p.key}`)}>{t(`nav.${p.key}`)}</NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ---------------------------------------------------------------------------------------------------------
// Left menu (branch level only): Branch settings, then the gym's BMS Core and AI Vision groups
// ---------------------------------------------------------------------------------------------------------

interface MenuGroup { id: 'bms' | 'vision'; label: string; pages: PageDef[] }

function SideLink({ p, collapsed, onNavigate, sub }: { p: PageDef; collapsed: boolean; onNavigate: () => void; sub?: boolean }) {
  const { t } = useI18n();
  const Icon = p.icon;
  const name = t(`nav.${p.key}`);
  return (
    <li>
      <NavLink to={`/${p.id}`} className={`sidenav__link${sub ? ' sidenav__link--sub' : ''}`} title={collapsed ? name : t(`nav.about.${p.key}`)}
        aria-label={collapsed ? name : undefined} onClick={onNavigate}>
        <Icon aria-hidden className="sidenav__icon" />
        <span className="sidenav__text">{name}</span>
      </NavLink>
    </li>
  );
}

function Sidebar({ collapsed, onToggleCollapsed, onNavigate, onClose }: { collapsed: boolean; onToggleCollapsed: () => void; onNavigate: () => void; onClose: () => void }) {
  const { t } = useI18n();
  const { can } = useAccess();
  const topItems = useTopItems();
  const back = useBack();
  const gym = useLevel() === 'branch';
  const sideItems = gym ? SIDE_PAGES.filter((p) => can(p.id)) : [];
  const groups = (gym ? [
    { id: 'bms', label: t('nav.groupBms'), pages: BMS_PAGES.filter((p) => can(p.id)) },
    { id: 'vision', label: t('nav.groupVision'), pages: VISION_PAGES.filter((p) => can(p.id)) },
  ] : []).filter((g) => g.pages.length > 0) as MenuGroup[];
  const [open, setOpen] = useState(readGroups);
  const toggle = (k: 'bms' | 'vision') => setOpen((g) => {
    const n = { ...g, [k]: !g[k] };
    try { localStorage.setItem(GROUPS_KEY, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  // Opening a page of a closed group (from a link) opens that group so the active page shows.
  const { pathname } = useLocation();
  const page = firstSegment(pathname);
  useEffect(() => {
    const g = groups.find((x) => x.pages.some((p) => p.id === page));
    if (g && !open[g.id]) setOpen((o) => ({ ...o, [g.id]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  const CollapseIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      <div className="sidenav__head">
        <span className="label">{t('nav.menu')}</span>
        <button type="button" className="btn btn--icon btn--ghost" onClick={onClose} aria-label={t('nav.closeMenu')}><X aria-hidden /></button>
      </div>
      <nav className="sidenav" aria-label={t('nav.menu')}>
        {/* centre menu items, shown here only under 900px where the top bar has no room for them */}
        <ul className="sidenav__list sidenav__list--top">
          {topItems.map((p) => p === 'back' ? (
            <li key="back">
              <Link to="/overview" className="sidenav__link sidenav__link--back" onClick={() => { back(); onNavigate(); }} aria-label={t('nav.back')}>
                <ChevronLeft aria-hidden className="sidenav__icon flip-rtl" />
                <span className="sidenav__text">{t('nav.overview')}</span>
              </Link>
            </li>
          ) : <SideLink key={p.id} p={p} collapsed={false} onNavigate={onNavigate} />)}
        </ul>
        {sideItems.length > 0 && (
          <ul className="sidenav__list sidenav__list--branch">
            {sideItems.map((p) => <SideLink key={p.id} p={p} collapsed={collapsed} onNavigate={onNavigate} />)}
          </ul>
        )}
        {groups.map((g) => {
          const isOpen = open[g.id];
          return (
            <div key={g.id} className="sidenav__group" role="group" aria-label={g.label}>
              <button type="button" className="sidenav__grouphead" aria-expanded={isOpen} aria-controls={`navgroup-${g.id}`} onClick={() => toggle(g.id)}
                title={`${g.label}: ${isOpen ? t('nav.collapse') : t('nav.expand')}`}>
                <span className="sidenav__grouplabel">{g.label}</span>
                <span className="sidenav__groupcount num">{g.pages.length}</span>
                <ChevronDown aria-hidden className={`sidenav__chev${isOpen ? '' : ' is-closed'}`} />
              </button>
              <ul id={`navgroup-${g.id}`} className="sidenav__list" hidden={!isOpen}>
                {g.pages.map((p) => <SideLink key={p.id} p={p} collapsed={collapsed} onNavigate={onNavigate} sub />)}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="sidenav__foot">
        <button type="button" className="btn btn--icon btn--ghost icon-btn sidenav__collapse" onClick={onToggleCollapsed}
          aria-label={collapsed ? t('nav.expandSide') : t('nav.collapseSide')} title={collapsed ? t('nav.expandSide') : t('nav.collapseSide')} aria-pressed={collapsed}>
          <CollapseIcon aria-hidden className="flip-rtl" />
        </button>
        <span className="sidenav__powered">{t('app.poweredBy')}</span>
        <span className="sidenav__role"><RoleLabel /></span>
      </div>
    </>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { t } = useI18n();
  const { changeScope } = useAccess();
  return (
    <div className="topbar">
      <div className="topbar__start">
        <button type="button" className="btn btn--icon btn--ghost topbar__menu" onClick={onMenu} aria-label={t('nav.menu')}><Menu aria-hidden /></button>
        <NavLink to={changeScope ? '/overview' : '/branch'} className="topbar__brand" aria-label={t('app.title')}><BrandMark /></NavLink>
        <span className="topbar__divider" aria-hidden />
        <ScopeSwitcher />
      </div>
      <TopNav />
      <div className="topbar__actions">
        <AlertsBell />
        <ThemeToggle />
        <LangToggle />
        <RoleLabel />
        <SignOutButton />
        <SettingsGear />
      </div>
    </div>
  );
}

export function Shell() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const { role: viewerRole } = useScope();
  const level = useLevel();
  const side = useRef<HTMLElement>(null);
  const closeDrawer = useCallback(() => setDrawer(false), []);
  const toggleCollapsed = useCallback(() => setCollapsed((c) => {
    try { localStorage.setItem(SIDE_KEY, c ? '0' : '1'); } catch { /* ignore */ }
    return !c;
  }), []);
  useEffect(() => { document.documentElement.dataset.role = viewerRole; }, [viewerRole]);
  useEffect(() => { window.scrollTo(0, 0); setDrawer(false); }, [pathname]);
  useEffect(() => {
    if (!drawer) return;
    window.requestAnimationFrame(() => side.current?.querySelector<HTMLElement>('button, a')?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawer]);
  return (
    <div className={`shell shell--${level}${drawer ? ' is-drawer-open' : ''}${collapsed ? ' is-collapsed' : ''}`}>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>{t('shell.skip')}</a>
      <header className="shell__top"><TopBar onMenu={() => setDrawer(true)} /></header>
      <aside ref={side} className="shell__side">
        <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} onNavigate={closeDrawer} onClose={closeDrawer} />
      </aside>
      {drawer && <div className="shell__scrim" onClick={closeDrawer} aria-hidden />}
      <main id="main" tabIndex={-1} className="shell__main">
        <div className="shell__content"><Outlet /></div>
      </main>
    </div>
  );
}
