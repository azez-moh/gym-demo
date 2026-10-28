import { useCallback } from 'react';
import { useDemo } from '../../data';
import { useAuth } from '../../layout/auth';
import { useI18n } from '../../i18n';

/** ST-04: saves on BMS Settings record savedBy / savedRole / savedAt alongside the settings (collection 'settings', id 'bms'). */
export function useSaveBms() {
  const data = useDemo();
  const { user } = useAuth();
  return useCallback((fields: Record<string, unknown>) => {
    data.patch('settings', 'bms', { ...fields, savedBy: user?.name ?? '', savedRole: user?.role ?? 'coo', savedAt: Date.now() });
  }, [data, user]);
}

export function useSavedLine(): string {
  const data = useDemo();
  const { t, fmtDate } = useI18n();
  const s = data.settings as unknown as { savedBy?: string; savedRole?: string; savedAt?: number };
  if (!s.savedAt) return t('bmsSettings.notSaved');
  // Riyadh time, 24-hour Latin digits in both languages
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(s.savedAt));
  return t('bmsSettings.lastSaved', { name: s.savedBy ?? '', role: t(`role.${s.savedRole === 'fm' ? 'fm' : 'coo'}Short`), time: `${fmtDate(s.savedAt, 'short')} ${time}` });
}
