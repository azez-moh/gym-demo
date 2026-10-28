import { useI18n } from '../i18n';

/**
 * Small "Live" tag (green dot + "Live" / "مباشر") for boxes, KPI tiles and charts that show
 * current-moment figures. Sits at the top inline-end of the box, just before the "i" button,
 * so it mirrors to the top left in Arabic. Replaces "now" / "الآن" in titles and labels.
 */
export function LiveTag({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span className={`live-tag ${className}`.trim()} title={t('common.live')}>
      <span className="live-tag__dot" aria-hidden />
      <span className="live-tag__label">{t('common.live')}</span>
    </span>
  );
}
