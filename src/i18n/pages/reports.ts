// Page strings for "reports". Keys resolve as t('reports.<key>'). Only the agent that owns this page edits this file.
export const en = {
  title: 'Reports',
  intro: 'Every machine once, with its current state. Expand a row for today\'s used and idle time, utilisation and hours.',
  refresh: 'Refresh',
  refreshedAt: 'Updated {time}',
  liveInfo: 'States update every 10 seconds. Refresh reloads the header and every row together.',
  tableInfo: 'One row per machine. Where the cameras send several records for one machine, the latest one is shown.',
  col: { state: 'State', rule: 'Rule', zones: 'Zones' },
  zonesN: '{n} zones',
  zonesN1: '1 zone',
  zonesN2: '2 zones',
};

export const ar: typeof en = {
  title: 'التقارير',
  intro: 'كل جهاز مرة واحدة مع حالته الحالية. افتح الصف لرؤية وقت الاستخدام والخمول ونسبة الاستخدام وساعات اليوم.',
  refresh: 'تحديث',
  refreshedAt: 'آخر تحديث {time}',
  liveInfo: 'تتحدث الحالات كل 10 ثوانٍ. يعيد التحديث تحميل العنوان وكل الصفوف معًا.',
  tableInfo: 'صف واحد لكل جهاز. إذا أرسلت الكاميرات عدة سجلات لجهاز واحد يظهر أحدثها.',
  col: { state: 'الحالة', rule: 'القاعدة', zones: 'المناطق' },
  zonesN: '{n} مناطق',
  zonesN1: 'منطقة واحدة',
  zonesN2: 'منطقتان',
};
