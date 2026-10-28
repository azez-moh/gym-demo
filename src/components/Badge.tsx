import type { ReactNode } from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Circle, Info, MinusCircle, type LucideIcon } from 'lucide-react';
import { useI18n } from '../i18n';

export type Tone = 'danger' | 'warning' | 'success' | 'info' | 'neutral' | 'accent';

export function Badge({ tone = 'neutral', icon: Icon, children, size = 'sm' }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; size?: 'sm' | 'md' }) {
  return (
    <span className={`badge badge--${tone} ${size === 'md' ? 'badge--md' : ''}`.trim()}>
      {Icon && <Icon aria-hidden />}
      {children}
    </span>
  );
}

export type StatusKind =
  | 'critical' | 'warning' | 'ok' | 'info'
  | 'inUse' | 'idle' | 'cooling' | 'offline' | 'online' | 'running' | 'stopped';

const MAP: Record<StatusKind, { tone: Tone; icon: LucideIcon }> = {
  critical: { tone: 'danger', icon: AlertOctagon },
  warning: { tone: 'warning', icon: AlertTriangle },
  ok: { tone: 'success', icon: CheckCircle2 },
  info: { tone: 'info', icon: Info },
  inUse: { tone: 'accent', icon: Circle },
  idle: { tone: 'neutral', icon: MinusCircle },
  cooling: { tone: 'info', icon: Circle },
  offline: { tone: 'danger', icon: MinusCircle },
  online: { tone: 'success', icon: CheckCircle2 },
  running: { tone: 'success', icon: CheckCircle2 },
  stopped: { tone: 'neutral', icon: MinusCircle },
};

/** Status or severity, always icon plus label (never colour alone). Label defaults to t('status.<kind>'). */
export function StatusBadge({ status, label, size }: { status: StatusKind; label?: string; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  const m = MAP[status];
  return <Badge tone={m.tone} icon={m.icon} size={size}>{label ?? t(`status.${status}`)}</Badge>;
}
