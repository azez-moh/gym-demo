import markPng from '../assets/pw-mark.png';
import { useI18n } from '../i18n';

/**
 * GYM Demo lockup in the Primewave design system: the Primewave wave mark (shipped artwork, never redrawn)
 * beside the product name in Clash Display. Same component name and props as the original kit so every page ports 1:1.
 * `height` sizes the name text; the mark scales with it. `badge` is accepted for compatibility and ignored.
 */
export function BrandLogo({ className = '', height = 22 }: { className?: string; height?: number; badge?: number }) {
  const { t } = useI18n();
  return (
    <span className={`brand-logo-wrap pw-lockup ${className}`.trim()} style={{ ['--lockup-h' as string]: `${height}px` }}>
      <img className="pw-lockup__mark" src={markPng} alt="" aria-hidden="true" />
      <span className="pw-lockup__text">
        <span className="pw-lockup__name">GYM Demo</span>
        <span className="pw-lockup__by">{t('app.poweredBy')}</span>
      </span>
    </span>
  );
}

/** Lockup: Primewave mark, product name and "Powered by Primewave". */
export function BrandMark({ compact }: { compact?: boolean }) {
  return (
    <span className="brand" aria-label="GYM Demo, powered by Primewave">
      <BrandLogo height={compact ? 18 : 22} />
    </span>
  );
}
