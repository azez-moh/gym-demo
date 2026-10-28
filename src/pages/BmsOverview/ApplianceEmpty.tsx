import { Link } from 'react-router-dom';
import { PlugZap } from 'lucide-react';
import { useI18n } from '../../i18n';
import { useAccess } from '../../layout/access';

/** BMS-10: plain empty state for HVAC and Lights with two numbered steps and text links. */
export function ApplianceEmpty({ title, building }: { title: string; building: string }) {
  const { t } = useI18n();
  const { can } = useAccess();
  // links to pages the role may not open render as plain text
  const to = (path: string, id: string, label: string) => (can(id) ? <Link to={path}>{label}</Link> : <span>{label}</span>);
  return (
    <div className="apl-empty" role="status">
      <span className="apl-empty__icon"><PlugZap aria-hidden /></span>
      <div>
        <h3>{title}</h3>
        <ol>
          <li>{t('hvac.emptyStep1a')} {to('/integration', 'integration', t('hvac.emptyIntegration'))}{t('hvac.emptyStep1b')}</li>
          <li>{t('hvac.emptyStep2a', { building })} {to('/settings/site-entities', 'settings', t('hvac.emptySiteEntities'))}{t('hvac.emptyStep2b')}</li>
        </ol>
      </div>
    </div>
  );
}
