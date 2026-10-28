import { useSearchParams } from 'react-router-dom';
import { Bot, Building2, Cctv } from 'lucide-react';
import { InfoTip, PageHeader, Tabs, type TabDef } from '../../components';
import { useI18n } from '../../i18n';
import { useDemo, focusClub } from '../../data';
import { useScope } from '../../layout/filters';
import { useAccess } from '../../layout/access';
import { AgentsTab } from './AgentsTab';
import { BuildingTab } from './BuildingTab';
import { CamerasTab } from './CamerasTab';
import './bmsSettings.css';

type TabId = 'agents' | 'building' | 'cameras';
const TABS: TabId[] = ['agents', 'building', 'cameras'];
const ICONS = { agents: Bot, building: Building2, cameras: Cctv };

export default function BmsSettingsPage() {
  const { t, pick } = useI18n();
  const data = useDemo();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const [params, setParams] = useSearchParams();
  // The Facility Manager has no camera access, so the camera privacy tab is not shown to him.
  const { cameras } = useAccess();
  const shown = cameras ? TABS : TABS.filter((x) => x !== 'cameras');
  const p = params.get('tab') as TabId | null;
  const tab: TabId = p && shown.includes(p) ? p : 'agents';
  const tabs: TabDef<TabId>[] = shown.map((id) => ({ id, label: t(`bmsSettings.tab.${id}`), icon: ICONS[id] }));
  return (
    <div className="page bmss">
      <PageHeader eyebrow={pick(club.nameEn, club.nameAr)} title={<span className="bmss__title">{t('bmsSettings.title')}<InfoTip text={t('bmsSettings.intro')} /></span>} />
      <Tabs tabs={tabs} value={tab} ariaLabel={t('bmsSettings.tabsLabel')}
        onChange={(id) => setParams((q) => { const n = new URLSearchParams(q); n.set('tab', id); return n; })} />
      <div role="tabpanel" aria-label={t(`bmsSettings.tab.${tab}`)}>
        {tab === 'agents' && <AgentsTab clubId={club.id} />}
        {tab === 'building' && <BuildingTab />}
        {tab === 'cameras' && <CamerasTab />}
      </div>
    </div>
  );
}
