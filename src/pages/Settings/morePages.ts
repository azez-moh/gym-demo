/**
 * the reference build "More pages" (Settings, card "More pages"). The inventory text says 23, but its list and
 * screenshot 22-settings.jpg show these 21. Each gets a nested route /settings/<slug>.
 *
 * kind 'mirror': the page duplicates an AI Vision page; /settings/<slug> renders that page's own component
 *   (same data source, so the counts agree, ST-10).
 * kind 'view': no live source; renders a clean page with its purpose and the data it lists, shaped like
 *   the closest audited equivalent (`relatedPage`), with no invented controls (BUILD-DECISIONS defaults).
 * The Settings agent owns this file and src/pages/Settings/.
 */
export type MoreGroup = 'business' | 'building' | 'vision' | 'history';

export const MORE_GROUPS: MoreGroup[] = ['business', 'building', 'vision', 'history'];

export interface MorePage {
  slug: string;
  group: MoreGroup;
  /** Label in the Settings directory (plain words, no internal ids). */
  nameEn: string;
  nameAr: string;
  /** Heading on the page itself (Conductor pages drop the prefix, ST-13). */
  titleEn: string;
  titleAr: string;
  /** One-line description in the directory and the purpose line on the page. */
  descEn: string;
  descAr: string;
  kind: 'mirror' | 'view';
  /** For mirrors: the folder under src/pages whose default component is rendered. */
  mirrorFolder?: 'CameraList' | 'Zones' | 'ZonesLive' | 'Machines' | 'Reports';
  /** Route id of the grouped page that covers the same ground (for the cross-link). */
  relatedPage?: string;
}

export const MORE_PAGES: MorePage[] = [
  // Business views
  { slug: 'overview-fb', group: 'business', kind: 'view', relatedPage: 'overview',
    nameEn: 'Overview (alternative layout)', nameAr: 'نظرة عامة (تخطيط بديل)',
    titleEn: 'Overview (alternative layout)', titleAr: 'نظرة عامة (تخطيط بديل)',
    descEn: 'The network at a glance, laid out per gym.', descAr: 'الشبكة في لمحة، مرتبة صالة رياضية تلو الأخرى.' },
  { slug: 'branches-fb', group: 'business', kind: 'view', relatedPage: 'branches',
    nameEn: 'Branches (alternative layout)', nameAr: 'الفروع (تخطيط بديل)',
    titleEn: 'Branches (alternative layout)', titleAr: 'الفروع (تخطيط بديل)',
    descEn: 'Every gym with its city, hours and live status.', descAr: 'كل صالة رياضية مع مدينتها وساعات عملها وحالتها المباشرة.' },
  { slug: 'conductor-building', group: 'business', kind: 'view', relatedPage: 'bms-overview',
    nameEn: 'Conductor: building overview', nameAr: 'المايسترو: نظرة عامة على المبنى',
    titleEn: 'Building overview', titleAr: 'نظرة عامة على المبنى',
    descEn: 'The building in view: people, energy, comfort and open items.', descAr: 'المبنى المعروض: الأشخاص والطاقة والراحة والبنود المفتوحة.' },
  { slug: 'conductor-energy', group: 'business', kind: 'view', relatedPage: 'ai-agents',
    nameEn: 'Conductor: energy and demand', nameAr: 'المايسترو: الطاقة والطلب',
    titleEn: 'Energy and demand', titleAr: 'الطاقة والطلب',
    descEn: 'Energy used today against the baseline, and the savings in SAR.', descAr: 'الطاقة المستهلكة اليوم مقارنة بخط الأساس، والوفر بالريال.' },
  { slug: 'conductor-spaces', group: 'business', kind: 'view', relatedPage: 'hvac',
    nameEn: 'Conductor: spaces and comfort', nameAr: 'المايسترو: المساحات والراحة',
    titleEn: 'Spaces and comfort', titleAr: 'المساحات والراحة',
    descEn: 'Each area with the people in it and its temperature against the setpoint.', descAr: 'كل منطقة مع عدد الأشخاص فيها وحرارتها مقارنة بالضبط المحدد.' },
  { slug: 'conductor-systems', group: 'business', kind: 'view', relatedPage: 'control',
    nameEn: 'Conductor: systems and controls', nameAr: 'المايسترو: الأنظمة والتحكم',
    titleEn: 'Systems and controls', titleAr: 'الأنظمة والتحكم',
    descEn: 'The connectors and agents that read and run the building.', descAr: 'الموصلات والوكلاء الذين يقرؤون المبنى ويشغلونه.' },
  { slug: 'conductor-alarms', group: 'business', kind: 'view', relatedPage: 'ai-agents',
    nameEn: 'Conductor: alarms and work orders', nameAr: 'المايسترو: الإنذارات وأوامر العمل',
    titleEn: 'Alarms and work orders', titleAr: 'الإنذارات وأوامر العمل',
    descEn: 'Open and acknowledged alarms, most severe first.', descAr: 'الإنذارات المفتوحة والمؤكدة، الأشد أولًا.' },
  { slug: 'conductor-reports', group: 'business', kind: 'view', relatedPage: 'usage-report',
    nameEn: 'Conductor: reports', nameAr: 'المايسترو: التقارير',
    titleEn: 'Reports', titleAr: 'التقارير',
    descEn: 'Machine use today, summed by machine type.', descAr: 'استخدام الأجهزة اليوم، مجمّعًا حسب نوع الجهاز.' },

  // Building data
  { slug: 'site-entities', group: 'building', kind: 'view', relatedPage: 'integration',
    nameEn: 'Site entities', nameAr: 'كيانات الموقع',
    titleEn: 'Site entities', titleAr: 'كيانات الموقع',
    descEn: 'Entities read from the integrations and the appliance each one maps to.', descAr: 'الكيانات المقروءة من التكاملات والجهاز المرتبط بكل منها.' },
  { slug: 'appliances', group: 'building', kind: 'view', relatedPage: 'hvac',
    nameEn: 'Appliances', nameAr: 'الأجهزة الكهربائية',
    titleEn: 'Appliances', titleAr: 'الأجهزة الكهربائية',
    descEn: 'Every AC unit and light circuit in the building, with its rated load.', descAr: 'كل وحدة تكييف ودائرة إضاءة في المبنى مع حملها المقنن.' },
  { slug: 'machine-data', group: 'building', kind: 'view', relatedPage: 'machines',
    nameEn: 'Machine data', nameAr: 'بيانات الأجهزة الرياضية',
    titleEn: 'Machine data', titleAr: 'بيانات الأجهزة الرياضية',
    descEn: 'Which machines report live, simulated or no data.', descAr: 'الأجهزة التي ترسل بيانات مباشرة أو محاكاة أو بلا مصدر.' },
  { slug: 'live-data', group: 'building', kind: 'view', relatedPage: 'control',
    nameEn: 'Live data', nameAr: 'البيانات المباشرة',
    titleEn: 'Live data', titleAr: 'البيانات المباشرة',
    descEn: 'The latest reading of each appliance and where it comes from.', descAr: 'أحدث قراءة لكل جهاز ومصدرها.' },
  { slug: 'ac-coverage', group: 'building', kind: 'view', relatedPage: 'hvac',
    nameEn: 'AC coverage', nameAr: 'تغطية التكييف',
    titleEn: 'AC coverage', titleAr: 'تغطية التكييف',
    descEn: 'How many AC units are read, and which areas they serve.', descAr: 'عدد وحدات التكييف المقروءة والمناطق التي تخدمها.' },

  // Cameras and machines (same pages as their AI Vision namesakes)
  { slug: 'cctv-list', group: 'vision', kind: 'mirror', mirrorFolder: 'CameraList', relatedPage: 'camera-list',
    nameEn: 'CCTV list', nameAr: 'قائمة كاميرات المراقبة', titleEn: 'CCTV list', titleAr: 'قائمة كاميرات المراقبة',
    descEn: 'Every camera feed, with add, edit and remove.', descAr: 'كل بث كاميرا، مع الإضافة والتعديل والإزالة.' },
  { slug: 'zones', group: 'vision', kind: 'mirror', mirrorFolder: 'Zones', relatedPage: 'zones',
    nameEn: 'Zones', nameAr: 'المناطق', titleEn: 'Zones', titleAr: 'المناطق',
    descEn: 'Every watched region, grouped by camera.', descAr: 'كل منطقة مراقبة، مجمعة حسب الكاميرا.' },
  { slug: 'zones-live', group: 'vision', kind: 'mirror', mirrorFolder: 'ZonesLive', relatedPage: 'zones-live',
    nameEn: 'Zones live readings', nameAr: 'قراءات المناطق المباشرة', titleEn: 'Zones live readings', titleAr: 'قراءات المناطق المباشرة',
    descEn: 'Live motion and baseline change per zone.', descAr: 'الحركة المباشرة وتغير خط الأساس لكل منطقة.' },
  { slug: 'machines', group: 'vision', kind: 'mirror', mirrorFolder: 'Machines', relatedPage: 'machines',
    nameEn: 'Machines', nameAr: 'الأجهزة الرياضية', titleEn: 'Machines', titleAr: 'الأجهزة الرياضية',
    descEn: 'Every machine and the zones that monitor it.', descAr: 'كل جهاز والمناطق التي تراقبه.' },
  { slug: 'reports', group: 'vision', kind: 'mirror', mirrorFolder: 'Reports', relatedPage: 'reports',
    nameEn: 'Reports', nameAr: 'التقارير', titleEn: 'Reports', titleAr: 'التقارير',
    descEn: 'Every machine once, with its state and today\'s use.', descAr: 'كل جهاز مرة واحدة، مع حالته واستخدامه اليوم.' },

  // History and automation
  { slug: 'device-history', group: 'history', kind: 'view', relatedPage: 'usage-report',
    nameEn: 'Device history', nameAr: 'سجل الأجهزة', titleEn: 'Device history', titleAr: 'سجل الأجهزة',
    descEn: 'Today\'s machine sessions, newest first.', descAr: 'جلسات الأجهزة اليوم، الأحدث أولًا.' },
  { slug: 'history', group: 'history', kind: 'view', relatedPage: 'ai-agents',
    nameEn: 'History', nameAr: 'السجل', titleEn: 'History', titleAr: 'السجل',
    descEn: 'What the agents did in the building, newest first.', descAr: 'ما قام به الوكلاء في المبنى، الأحدث أولًا.' },
  { slug: 'automations', group: 'history', kind: 'view', relatedPage: 'bms-settings',
    nameEn: 'Automations', nameAr: 'الأتمتة', titleEn: 'Automations', titleAr: 'الأتمتة',
    descEn: 'The building rules each agent runs, and in which mode.', descAr: 'قواعد المبنى التي يشغلها كل وكيل، وبأي وضع.' },
];

export function morePageBySlug(slug: string | undefined): MorePage | undefined {
  return MORE_PAGES.find((p) => p.slug === slug);
}
