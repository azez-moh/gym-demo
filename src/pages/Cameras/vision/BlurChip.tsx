import { useEffect, useState } from 'react';
import { EyeOff, Lock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../../data/store';
import { useI18n } from '../../../i18n';

/** Small "Blur on / off" chip shown on camera pages; links to BMS Settings where the toggle lives. */
export function BlurChip() {
  const { t } = useI18n();
  const { settings } = useDemo();
  const on = settings.blurCameras;
  return (
    <Link to="/bms-settings" className={`vis-chip ${on ? 'vis-chip--on' : ''}`} title={t('cameras.frame.blurInfo')}>
      {on ? <Lock aria-hidden /> : <EyeOff aria-hidden />}
      {on ? t('cameras.frame.blurChipOn') : t('cameras.frame.blurChipOff')}
    </Link>
  );
}

export function Toast({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return <div className="vis-toast" role="status">{msg}</div>;
}

/** Short status message after a save, swap or removal. */
export function useToast(): [string | null, (m: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const id = window.setTimeout(() => setMsg(null), 2400);
    return () => window.clearTimeout(id);
  }, [msg]);
  return [msg, setMsg];
}

