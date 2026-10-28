import { Hammer } from 'lucide-react';
import { useI18n } from '../i18n';
import { PageHeader } from './Card';
import { EmptyState } from './EmptyState';

/** Placeholder used by stub pages until their agent replaces them. */
export function ComingNext({ titleKey }: { titleKey: string }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <PageHeader title={t(titleKey)} />
      <div className="card card--pad-lg">
        <EmptyState icon={Hammer} title={t('common.comingNext')} body={t('common.comingNextBody')} />
      </div>
    </div>
  );
}
