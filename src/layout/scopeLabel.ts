import type { Club, District, Scope } from '../data/types';
import type { I18n } from '../i18n';

/** Human label of a scope: "All branches", "Riyadh", "Hittin", "Hittin Gym (Men)". */
export function scopeLabel(scope: Scope, i18n: Pick<I18n, 't' | 'pick'>, clubs: Club[], districts: District[]): string {
  const { t, pick } = i18n;
  switch (scope.level) {
    case 'all': return t('scope.all');
    case 'region': return t(`region.${scope.region}`);
    case 'district': {
      const d = districts.find((x) => x.id === scope.district);
      return d ? pick(d.nameEn, d.nameAr) : t('scope.all');
    }
    case 'club': {
      const c = clubs.find((x) => x.id === scope.clubId);
      return c ? pick(c.nameEn, c.nameAr) : t('scope.all');
    }
  }
}
