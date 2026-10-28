import {
  Activity, AirVent, BarChart3, Bot, Building2, Camera, Cctv, Cpu, Dumbbell, FileBarChart, Flame, Gauge, Grid3x3, LayoutDashboard,
  Library, Lightbulb, Eye, Waves, Bath, ScrollText, ShieldCheck, Images, Home, Cog, ListVideo, Map as MapIcon, MessageCircle, PlugZap, Radar, ScanEye, Settings, Settings2, SlidersHorizontal, Store, type LucideIcon,
} from 'lucide-react';

/**
 * One source of truth for the dashboard pages: menu order (the reference build), route path and i18n key.
 * Navigation (src/layout/Shell.tsx), two levels (navLevel in src/layout/access.ts):
 *   network level (All branches, and the Kingdom map): top centre menu NETWORK_TOP (Overview, Ask Conductor, Branches),
 *     no left menu;
 *   branch level (one gym picked): top centre menu BRANCH_TOP ("← Overview" back item, Branch overview, Ask Conductor,
 *     Branches); left menu SIDE_PAGES (Branch settings) then the BMS Core and AI Vision groups (AI Vision starts with
 *     AI Vision overview).
 *   The Kingdom map (MAP_PAGE, /map) is in no menu: the COO lands on it after sign-in.
 *   Settings is the gear icon in the top bar corner. Every menu is filtered by role (canSee in access.ts).
 * Route path = `/${id}`. Label = t(`nav.${key}`), tooltip = t(`nav.about.${key}`).
 * Page folders: src/pages/<folder>/index.tsx (lazy-loaded in src/App.tsx).
 */
export type NavGroup = 'chain' | 'branch' | 'bms' | 'vision';

export interface PageDef {
  id: string;
  key: string;
  folder: string;
  group: NavGroup;
  icon: LucideIcon;
}

export const CHAIN_PAGES: PageDef[] = [
  { id: 'overview', key: 'overview', folder: 'Overview', group: 'chain', icon: LayoutDashboard },
  { id: 'assistant', key: 'assistant', folder: 'Assistant', group: 'chain', icon: MessageCircle },
  { id: 'branches', key: 'branches', folder: 'Branches', group: 'chain', icon: Store },
];

/** Kingdom map drill-down: the COO's first page after sign-in, in no menu. */
export const MAP_PAGE: PageDef = { id: 'map', key: 'map', folder: 'Map', group: 'chain', icon: MapIcon };

/** One gym: Branch overview (top menu at branch level) and Branch settings (first item of the left menu). */
export const BRANCH_OVERVIEW_PAGE: PageDef = { id: 'branch', key: 'branch', folder: 'Branch', group: 'branch', icon: Home };
export const BRANCH_SETTINGS_PAGE: PageDef = { id: 'branch-settings', key: 'branchSettings', folder: 'BranchSettings', group: 'branch', icon: Cog };
export const BRANCH_PAGES: PageDef[] = [BRANCH_OVERVIEW_PAGE, BRANCH_SETTINGS_PAGE];

export const BMS_PAGES: PageDef[] = [
  { id: 'bms-overview', key: 'bmsOverview', folder: 'BmsOverview', group: 'bms', icon: Building2 },
  { id: 'hvac', key: 'hvac', folder: 'Hvac', group: 'bms', icon: AirVent },
  { id: 'lights', key: 'lights', folder: 'Lights', group: 'bms', icon: Lightbulb },
  { id: 'ai-agents', key: 'aiAgents', folder: 'AiAgents', group: 'bms', icon: Bot },
  { id: 'control', key: 'control', folder: 'Control', group: 'bms', icon: SlidersHorizontal },
  { id: 'bms-settings', key: 'bmsSettings', folder: 'BmsSettings', group: 'bms', icon: Settings2 },
  { id: 'integration', key: 'integration', folder: 'Integration', group: 'bms', icon: PlugZap },
];

export const VISION_PAGES: PageDef[] = [
  { id: 'vision-overview', key: 'visionOverview', folder: 'VisionOverview', group: 'vision', icon: Eye },
  { id: 'monitor', key: 'monitor', folder: 'Monitor', group: 'vision', icon: ScanEye },
  { id: 'live-floor', key: 'liveFloor', folder: 'LiveFloor', group: 'vision', icon: Grid3x3 },
  { id: 'heatmap', key: 'heatmap', folder: 'Heatmap', group: 'vision', icon: Flame },
  { id: 'pool', key: 'pool', folder: 'Pool', group: 'vision', icon: Waves },
  { id: 'jacuzzis', key: 'jacuzzis', folder: 'Jacuzzis', group: 'vision', icon: Bath },
  { id: 'cameras', key: 'cameras', folder: 'Cameras', group: 'vision', icon: Cctv },
  { id: 'camera-list', key: 'cameraList', folder: 'CameraList', group: 'vision', icon: ListVideo },
  { id: 'zones', key: 'zones', folder: 'Zones', group: 'vision', icon: Radar },
  { id: 'zones-live', key: 'zonesLive', folder: 'ZonesLive', group: 'vision', icon: Activity },
  { id: 'policies', key: 'policies', folder: 'Policies', group: 'vision', icon: ShieldCheck },
  { id: 'reports', key: 'reports', folder: 'Reports', group: 'vision', icon: FileBarChart },
  { id: 'machine-library', key: 'machineLibrary', folder: 'MachineLibrary', group: 'vision', icon: Library },
  { id: 'machines', key: 'machines', folder: 'Machines', group: 'vision', icon: Dumbbell },
  { id: 'usage-report', key: 'usageReport', folder: 'UsageReport', group: 'vision', icon: BarChart3 },
  { id: 'library-management', key: 'libraryManagement', folder: 'LibraryManagement', group: 'vision', icon: Cpu },
  { id: 'snapshot-history', key: 'snapshotHistory', folder: 'SnapshotHistory', group: 'vision', icon: Images },
  { id: 'activity-log', key: 'activityLog', folder: 'ActivityLog', group: 'vision', icon: ScrollText },
];

/** Top centre menu at network level (All branches). */
export const NETWORK_TOP: PageDef[] = CHAIN_PAGES;

/** 'back' is the "← Overview" item: switches the scope to All branches and opens the network Overview. */
export type TopItem = PageDef | 'back';

/** Top centre menu at branch level, always in this order. */
export const BRANCH_TOP: TopItem[] = ['back', BRANCH_OVERVIEW_PAGE, CHAIN_PAGES[1], CHAIN_PAGES[2]];

/** Left menu (branch level only): these items, then the BMS Core and AI Vision groups. */
export const SIDE_PAGES: PageDef[] = [BRANCH_SETTINGS_PAGE];

export const SETTINGS_PAGE: PageDef = { id: 'settings', key: 'settings', folder: 'Settings', group: 'chain', icon: Settings };

export const ALL_PAGES: PageDef[] = [...CHAIN_PAGES, MAP_PAGE, SETTINGS_PAGE, ...BRANCH_PAGES, ...BMS_PAGES, ...VISION_PAGES];

export function pageById(id: string): PageDef | undefined {
  return ALL_PAGES.find((p) => p.id === id);
}

/** Pages that belong to one gym (Branch, BMS Core and AI Vision). Opened at network scope they switch to the live gym. */
export const GYM_PAGES: PageDef[] = [...BRANCH_PAGES, ...BMS_PAGES, ...VISION_PAGES];
export const isGymPage = (id: string) => GYM_PAGES.some((p) => p.id === id);

/** Camera icon re-export for pages that want the same glyph as the sidebar. */
export { Camera, Gauge };
