import { lazy, Suspense, type ComponentType } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './layout/Shell';
import { RequireAuth, RequirePage, useAuth } from './layout/auth';
import { homeFor } from './layout/access';
import { RequireGym } from './layout/filters';
import { ComingNext } from './components';
import SignInPage from './pages/SignIn';
import { BMS_PAGES, BRANCH_PAGES, CHAIN_PAGES, MAP_PAGE, VISION_PAGES, isGymPage } from './layout/nav';

/*
  Routes: /signin (public), then one route per dashboard page inside the shell (ids from src/layout/nav.ts).
  Pages are lazy-loaded from src/pages/<Folder>/index.tsx. The Kingdom map is its own page (/map): in no menu, the
  COO lands on it after sign-in; an old /branches?view=map link redirects there and keeps its region/district/club query.
  Branch overview, Branch settings, BMS Core and AI Vision pages are gym level: opened at network scope they switch
  to the live gym first. /overview is always the overview of all branches (the Facility Manager is forwarded to /branch, his gym).
  Settings has nested routes /settings/<slug> for the the reference build "More pages".
  Every route is guarded by role (src/layout/access.ts): a page the role may not open redirects to its home.
*/

const modules = import.meta.glob<{ default: ComponentType }>('./pages/*/index.tsx');
const lazyPage = (folder: string, key: string) => {
  const load = modules[`./pages/${folder}/index.tsx`] as (() => Promise<{ default: ComponentType }>) | undefined;
  // A page folder that is not there yet renders the shared placeholder instead of breaking the app.
  if (!load) return function Pending() { return <ComingNext titleKey={`nav.${key}`} />; };
  return lazy(load);
};

const SettingsPage = lazyPage('Settings', 'settings');
const MorePageView = lazy(() => import('./pages/Settings').then((m) => ({ default: (m as unknown as { MorePageView: ComponentType }).MorePageView })));

const DASH = [...CHAIN_PAGES, MAP_PAGE, ...BRANCH_PAGES, ...BMS_PAGES, ...VISION_PAGES].map((p) => ({ ...p, Component: lazyPage(p.folder, p.key) }));

/** "/" goes to the role's home: the Kingdom map for the COO, Branch overview (his gym) for the Facility Manager. */
function Home() {
  const { user } = useAuth();
  return <Navigate to={homeFor(user?.role ?? 'coo')} replace />;
}

function Loading() {
  return <div className="page-loading" aria-busy="true" />;
}

export default function App() {
  return (
    <HashRouter>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="signin" element={<SignInPage />} />
          <Route element={<RequireAuth><Shell /></RequireAuth>}>
            <Route index element={<Home />} />
            {DASH.map(({ id, Component }) => {
              const page = <Suspense fallback={<Loading />}><Component /></Suspense>;
              return (
                <Route key={id} path={id} element={
                  <RequirePage id={id}>{isGymPage(id) ? <RequireGym fallback={<Loading />}>{page}</RequireGym> : page}</RequirePage>
                } />
              );
            })}
            <Route path="settings" element={<RequirePage id="settings"><Suspense fallback={<Loading />}><SettingsPage /></Suspense></RequirePage>} />
            <Route path="settings/:slug" element={<RequirePage id="settings"><Suspense fallback={<Loading />}><MorePageView /></Suspense></RequirePage>} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  );
}
