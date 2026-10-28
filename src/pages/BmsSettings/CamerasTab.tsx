import { useState } from 'react';
import { AlertTriangle, EyeOff, ShieldCheck } from 'lucide-react';
import { Card, ConfirmDialog, Toggle } from '../../components';
import { useI18n } from '../../i18n';
import { useDemo } from '../../data';
import { useAuth } from '../../layout/auth';
import { useSaveBms, useSavedLine } from './saved';

export function CamerasTab() {
  const { t } = useI18n();
  const data = useDemo();
  const { user } = useAuth();
  const save = useSaveBms();
  const savedLine = useSavedLine();
  const [ask, setAsk] = useState(false);
  const blur = data.settings.blurCameras;
  const name = user?.name || user?.email || '';

  const onToggle = (v: boolean) => { if (v) save({ blurCameras: true }); else setAsk(true); };

  return (
    <div className="stack">
      <Card title={<span className="row" style={{ gap: 8 }}><EyeOff aria-hidden className="bmss__ticon" />{t('bmsSettings.privacy')}</span>} info={t('bmsSettings.privacyInfo')}
        actions={<span className={`bmss__blurchip ${blur ? 'is-on' : 'is-off'}`}>{blur ? <ShieldCheck aria-hidden /> : <AlertTriangle aria-hidden />}{blur ? t('bmsSettings.blurOn') : t('bmsSettings.blurOff')}</span>}>
        <div className="stack">
          <div className="bmss__blurrow">
            <Toggle checked={blur} label={t('bmsSettings.blurLabel')} onChange={onToggle} />
            <span>{t('bmsSettings.blurLabel')}</span>
          </div>
          {blur
            ? <p className="muted">{t('bmsSettings.blurOnLine')}</p>
            : <p className="bmss__warn" role="status"><AlertTriangle aria-hidden />{t('bmsSettings.blurOffWarn', { name })}</p>}
          <div className="bmss__scope">
            <span className="label">{t('bmsSettings.scope')}</span>
            <span className="bmss__scopelist">
              <span className="ctl-like">{t('bmsSettings.scopeWall')}</span>
              <span className="ctl-like">{t('bmsSettings.scopeMonitor')}</span>
              <span className="ctl-like">{t('bmsSettings.scopeFloor')}</span>
            </span>
          </div>
          <p className="faint bmss__used">{savedLine}</p>
        </div>
      </Card>
      <ConfirmDialog open={ask} onCancel={() => setAsk(false)} onConfirm={() => { save({ blurCameras: false }); setAsk(false); }}
        title={t('bmsSettings.confirmBlurTitle')} body={t('bmsSettings.confirmBlurBody', { name })} confirmLabel={t('bmsSettings.confirmBlurBtn')} />
    </div>
  );
}
