import { AlertOctagon, AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import { Badge } from '../../components';
import { useI18n } from '../../i18n';
import type { UnitStatus } from './bms';

const MAP = {
  on: { tone: 'success', icon: CheckCircle2 },
  off: { tone: 'neutral', icon: MinusCircle },
  watch: { tone: 'warning', icon: AlertTriangle },
  alarm: { tone: 'danger', icon: AlertOctagon },
} as const;

/** Unit state as icon plus label (On, Off, Watch, Alarm), never colour alone. */
export function StatusChip({ status }: { status: UnitStatus }) {
  const { t } = useI18n();
  const m = MAP[status];
  return <Badge tone={m.tone} icon={m.icon}>{t(`bmsOverview.state.${status}`)}</Badge>;
}
