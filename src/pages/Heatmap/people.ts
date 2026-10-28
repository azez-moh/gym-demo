import { useI18n } from '../../i18n';

/** "1 person", "2 people", "17 people" with Arabic number agreement (شخص واحد، شخصان، 3 أشخاص، 11 شخصًا). */
export function usePeopleText() {
  const { t, fmtNumber } = useI18n();
  return (n: number) => {
    if (n === 1) return t('heatmap.area.people1');
    if (n === 2) return t('heatmap.area.people2');
    if (n === 0 || (n >= 3 && n <= 10)) return t('heatmap.area.peopleFew', { n: fmtNumber(n) });
    return t('heatmap.area.people', { n: fmtNumber(n) });
  };
}
