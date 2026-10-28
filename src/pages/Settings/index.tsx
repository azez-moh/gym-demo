import { lazy, Suspense, useMemo, useState, type ComponentType } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { Card, EmptyState, InfoTip, PageHeader, Segmented, TextField } from '../../components';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme/theme';
import { useDemo, focusClub } from '../../data';
import { useScope } from '../../layout/filters';
import { MORE_GROUPS, MORE_PAGES, morePageBySlug, type MorePage } from './morePages';
import { MoreView } from './MoreViews';
import './settings.css';

/**
 * Settings (gear in the top bar): app-wide settings only. Appearance (theme, language), a pointer to Branch settings
 * (gym details, floor areas, operating hours, alert thresholds moved there) and the More pages directory.
 */
export default function SettingsPage() {
  const { t } = useI18n();
  return (
    <div className="page">
      <PageHeader title={<span className="st-title">{t('nav.settings')}<InfoTip text={t('settings.about')} /></span>} />
      <div className="st-top">
        <AppearanceCard />
        <BranchCard />
      </div>
      <MorePagesCard />
    </div>
  );
}

function AppearanceCard() {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  return (
    <Card title={t('settings.appearance.title')} info={t('settings.appearance.info')}>
      <div className="st-field">
        <span className="st-field__label">{t('settings.appearance.theme')}</span>
        <Segmented ariaLabel={theme === 'dark' ? t('settings.appearance.toLight') : t('settings.appearance.toDark')} value={theme} onChange={setTheme}
          options={[{ value: 'light', label: t('settings.appearance.light') }, { value: 'dark', label: t('settings.appearance.dark') }]} />
      </div>
      <div className="st-field">
        <span className="st-field__label">{t('settings.appearance.language')}</span>
        <Segmented ariaLabel={t('settings.appearance.language')} value={lang} onChange={setLang}
          options={[{ value: 'en', label: <span lang="en">{t('settings.appearance.english')}</span> }, { value: 'ar', label: <span lang="ar">{t('settings.appearance.arabic')}</span> }]} />
      </div>
    </Card>
  );
}

/** Gym settings moved to Branch settings (left menu once a gym is picked); this card links there. */
function BranchCard() {
  const { t, pick } = useI18n();
  const data = useDemo();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const picked = scope.level === 'club';
  return (
    <Card title={t('settings.branch.title')} info={t('settings.branch.info')}>
      <p className="st-note">{t('settings.branch.body')}</p>
      <div className="st-meta">
        <div className="st-meta__row"><span>{t('settings.branch.gym')}</span><span>{picked ? pick(club.nameEn, club.nameAr) : t('settings.branch.noneYet', { gym: pick(club.nameEn, club.nameAr) })}</span></div>
      </div>
      <p className="st-note"><Link className="st-link" to="/branch-settings">{t('settings.branch.open')}<ChevronRight aria-hidden className="flip-rtl" /></Link></p>
    </Card>
  );
}

function MorePagesCard() {
  const { t, pick, fmtNumber } = useI18n();
  const [q, setQ] = useState('');
  const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[ً-ْ]/g, '');
  const list = useMemo(() => {
    const n = norm(q.trim());
    if (!n) return MORE_PAGES;
    return MORE_PAGES.filter((p) => [p.nameEn, p.nameAr, p.descEn, p.descAr].some((s) => norm(s).includes(n)));
  }, [q]);
  return (
    <Card title={t('settings.more.title')} info={t('settings.more.info')} subtitle={t('settings.more.count', { n: fmtNumber(MORE_PAGES.length) })}>
      <div className="st-search">
        <TextField label={t('settings.more.search')} hideLabel icon={Search} value={q} onChange={setQ} placeholder={t('settings.more.searchPlaceholder')} type="search" />
      </div>
      {list.length === 0 ? <p className="st-empty">{t('settings.more.none')}</p> : (
        <div className="st-groups">
          {MORE_GROUPS.map((g) => {
            const items = list.filter((p) => p.group === g);
            if (!items.length) return null;
            return (
              <section key={g} aria-labelledby={`st-g-${g}`}>
                <div className="st-group__title"><h3 id={`st-g-${g}`}>{t(`settings.more.groups.${g}`)}</h3><span className="num">{fmtNumber(items.length)}</span></div>
                <ul className="st-list">
                  {items.map((p) => (
                    <li key={p.slug}>
                      <Link className="st-item" to={`/settings/${p.slug}`}>
                        <span className="st-item__text">
                          <span className="st-item__name">{pick(p.nameEn, p.nameAr)}</span>
                          <span className="st-item__desc">{pick(p.descEn, p.descAr)}</span>
                        </span>
                        <ChevronRight aria-hidden className="st-item__chev flip-rtl" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ---------- /settings/:slug ---------- */

// Pages that duplicate an AI Vision page render that page's own component (read-only import), so figures agree.
const MIRRORS: Record<NonNullable<MorePage['mirrorFolder']>, ComponentType> = {
  CameraList: lazy(() => import('../CameraList')),
  Zones: lazy(() => import('../Zones')),
  ZonesLive: lazy(() => import('../ZonesLive')),
  Machines: lazy(() => import('../Machines')),
  Reports: lazy(() => import('../Reports')),
};

function Crumbs({ p }: { p: MorePage }) {
  const { t, isRtl } = useI18n();
  const Back = isRtl ? ChevronRight : ChevronLeft;
  return (
    <div className="mp-crumbs">
      <Link to="/settings"><Back aria-hidden />{t('settings.page.back')}</Link>
      {p.kind === 'mirror' && p.relatedPage && (
        <Link to={`/${p.relatedPage}`}>{t('settings.page.alsoIn')}<ExternalLink aria-hidden /></Link>
      )}
    </div>
  );
}

/** One "More page" at /settings/:slug. */
export function MorePageView() {
  const { slug } = useParams();
  const { t, pick } = useI18n();
  const p = morePageBySlug(slug);
  if (!p) {
    return (
      <div className="page">
        <PageHeader eyebrow={<Link to="/settings">{t('settings.page.back')}</Link>} title={t('settings.page.notFound')} />
        <Card pad="lg"><EmptyState title={t('settings.page.notFound')} body={t('settings.page.notFoundBody')} action={<Link className="btn" to="/settings">{t('settings.page.back')}</Link>} /></Card>
      </div>
    );
  }
  if (p.kind === 'mirror' && p.mirrorFolder) {
    const Mirror = MIRRORS[p.mirrorFolder];
    return (
      <div className="mp-mirror">
        <Crumbs p={p} />
        <Suspense fallback={<div className="page-loading" aria-busy="true" />}><Mirror /></Suspense>
      </div>
    );
  }
  return (
    <div className="page">
      <Crumbs p={p} />
      <PageHeader title={<span className="st-title">{pick(p.titleEn, p.titleAr)}<InfoTip text={pick(p.descEn, p.descAr)} /></span>} />
      <MoreView page={p} />
    </div>
  );
}
