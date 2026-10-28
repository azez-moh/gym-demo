import type { LibraryModel, MachineType } from './types';
import { LIBRARY_SEED } from './floorData';

/** Real-world footprints (metres, length x width x height) and a 0.6 m service clearance. Cardio watts are typical catalogue values. */
const FOOTPRINT: Record<MachineType, { l: number; w: number; h: number; watts: number }> = {
  'treadmill': { l: 2.1, w: 0.9, h: 1.5, watts: 1500 },
  'slat-treadmill': { l: 2.0, w: 0.95, h: 1.55, watts: 0 },
  'incline-treadmill': { l: 2.2, w: 0.95, h: 1.6, watts: 2200 },
  'stair-climber': { l: 1.2, w: 0.9, h: 1.8, watts: 700 },
  'indoor-bike': { l: 1.2, w: 0.55, h: 1.3, watts: 0 },
  'recumbent-bike': { l: 1.7, w: 0.7, h: 1.3, watts: 60 },
  'elliptical': { l: 2.0, w: 0.7, h: 1.7, watts: 150 },
  'adaptive-cross-trainer': { l: 1.9, w: 0.8, h: 1.75, watts: 150 },
  'rower': { l: 2.4, w: 0.5, h: 1.0, watts: 0 },
  'upper-body-ergometer': { l: 1.2, w: 0.7, h: 1.4, watts: 60 },
  'flat-bench': { l: 1.9, w: 1.4, h: 1.3, watts: 0 },
  'incline-bench': { l: 1.9, w: 1.5, h: 1.6, watts: 0 },
  'preacher-curl': { l: 1.3, w: 1.0, h: 1.1, watts: 0 },
  'standing-preacher': { l: 1.1, w: 1.0, h: 1.3, watts: 0 },
};

const AR: Record<MachineType, { name: string; sub: string; desc: string; motion: string; operator: string }> = {
  'stair-climber': { name: 'جهاز صعود الدرج', sub: 'صعود الدرج', desc: 'جهاز درجات طويل بلوحة تحكم عريضة وهيكل منحوت ومقابض محيطة.', motion: 'حافة درجة ظاهرة أو قدم على الدرجات', operator: 'الجذع بين المقابض' },
  'rower': { name: 'جهاز تجديف', sub: 'تجديف', desc: 'جهاز تجديف بمقعد منزلق على سكة طويلة ومقبض سحب أمامي.', motion: 'المقعد المنزلق أو السكة المكشوفة بجانبه أو مقبض السحب', operator: 'الجذع على مسار التجديف دون المحطات المجاورة' },
  'indoor-bike': { name: 'دراجة داخلية', sub: 'دراجة داخلية', desc: 'دراجة تمرين قائمة بمقود رياضي وحذافة أمامية.', motion: 'حافة الدواسة أو الذراع أو الساق السفلى للمتدرب', operator: 'الجذع فوق المقعد' },
  'elliptical': { name: 'جهاز إهليلجي', sub: 'إهليلجي', desc: 'جهاز بمسار بيضاوي للقدمين ومقابض متحركة ولوحة تحكم أمامية.', motion: 'وصلة دواسة واحدة أو مقبض متحرك أسفل القبضة', operator: 'الجذع خلف لوحة التحكم' },
  'treadmill': { name: 'مشاية بسير مسطح', sub: 'مشاية', desc: 'مشاية بسير مسطح وقضبان جانبية ولوحة تحكم مرتفعة.', motion: 'القدمان أو الساقان فوق سير الجري', operator: 'الجذع في المنتصف بين القضبان الجانبية' },
  'slat-treadmill': { name: 'مشاية بسير شرائحي', sub: 'مشاية شرائحية', desc: 'مشاية بسير من شرائح مطاطية وممر جري منحني قليلًا.', motion: 'القدمان أو الساقان فوق الشرائح', operator: 'الجذع داخل ممر الجري' },
  'preacher-curl': { name: 'جهاز ثني الذراع جلوسًا', sub: 'ثني الذراع', desc: 'جهاز ثني ذراع بمقعد ووسادة مائلة للذراعين.', motion: 'اليدان والقضيب أمام وسادة الذراع', operator: 'الجذع داخل مساحة الجهاز دون المحطات المجاورة' },
  'standing-preacher': { name: 'جهاز ثني الذراع وقوفًا', sub: 'ثني الذراع وقوفًا', desc: 'منصة وقوف بوسادة مائلة للذراعين.', motion: 'اليدان ترتفعان أمام الوسادة', operator: 'الجذع داخل مساحة الجهاز دون المحطات المجاورة' },
  'incline-bench': { name: 'بنش مائل', sub: 'بنش مائل', desc: 'بنش مائل بحامل قضيب ومساند.', motion: 'طرف القضيب فوق أعلى الصدر', operator: 'الجذع داخل مساحة الجهاز دون المحطات المجاورة' },
  'flat-bench': { name: 'بنش أفقي', sub: 'بنش أفقي', desc: 'بنش أفقي بحامل قضيب قائم.', motion: 'طرف القضيب فوق الصدر', operator: 'الجذع داخل مساحة الجهاز دون المحطات المجاورة' },
  'incline-treadmill': { name: 'مشاية مائلة', sub: 'مشاية مائلة', desc: 'مشاية بزاوية ميل عالية وقاعدة مرتفعة.', motion: 'القدمان فوق السير مع استبعاد السير الفارغ', operator: 'الجذع داخل مساحة الجهاز دون المحطات المجاورة' },
  'upper-body-ergometer': { name: 'جهاز تمرين الجزء العلوي', sub: 'تمرين الجزء العلوي', desc: 'جهاز بذراعي تدوير يدويين على عمود قائم.', motion: 'ذراع تدوير أو الساعد', operator: 'الجذع داخل مساحة الجهاز دون المحطات المجاورة' },
  'recumbent-bike': { name: 'دراجة بمسند ظهر', sub: 'دراجة بمسند ظهر', desc: 'دراجة بمقعد منخفض ومسند ظهر ودواسات أمامية.', motion: 'ذراع الدواسة أو الساق السفلى', operator: 'الجذع داخل مساحة الجهاز دون المحطات المجاورة' },
  'adaptive-cross-trainer': { name: 'جهاز الخطوة المتكيفة', sub: 'جهاز الخطوة المتكيفة', desc: 'جهاز تمرين بطول خطوة متغير ومقابض متحركة.', motion: 'وصلة الدواسة أو المقبض المتحرك', operator: 'الجذع داخل مساحة الجهاز دون المحطات المجاورة' },
};

export function buildLibrary(): LibraryModel[] {
  return LIBRARY_SEED.map((s) => {
    const id = s.id as MachineType;
    const fp = FOOTPRINT[id];
    const ar = AR[id];
    return {
      id,
      number: s.number,
      nameEn: s.name,
      nameAr: ar.name,
      category: s.category.toLowerCase() === 'strength' ? 'strength' : 'cardio',
      subcategoryEn: s.subcategory,
      subcategoryAr: ar.sub,
      descriptionEn: s.description,
      descriptionAr: ar.desc,
      motionZoneEn: s.motion_zone,
      motionZoneAr: ar.motion,
      operatorZoneEn: s.operator_zone.replace(/\.$/, ''),
      operatorZoneAr: ar.operator,
      approximate: s.provisional,
      builtin: true,
      approved: true,
      active: true,
      footprint: { l: fp.l, w: fp.w, h: fp.h, clearance: 0.6 },
      watts: fp.watts,
    };
  });
}

export const MACHINE_FOOTPRINT = FOOTPRINT;
