import { useEffect, useMemo, useState } from 'react';
import type { Camera } from '../../../data/types';
import { Modal, Segmented, Select, TextField } from '../../../components';
import { useDemo } from '../../../data/store';
import { useI18n } from '../../../i18n';
import { feedOf, useVision } from './model';

/**
 * Add / Edit camera form (the reference build: name, RTSP or MJPEG feed, stream address). Full addresses are
 * accepted and saved exactly as typed; only display elsewhere is masked.
 */
export function CameraForm({ open, camera, onClose, onSaved }: {
  open: boolean; camera: Camera | null; onClose: () => void; onSaved?: (msg: string) => void;
}) {
  const { t, pick } = useI18n();
  const { patch, add, areas } = useDemo();
  const { club } = useVision();
  const clubAreas = useMemo(() => areas.filter((a) => a.clubId === club.id), [areas, club.id]);

  const [nameEn, setNameEn] = useState('');
  const [nameAr, setNameAr] = useState('');
  const [area, setArea] = useState('');
  const [feed, setFeed] = useState<'rtsp' | 'mjpeg'>('rtsp');
  const [address, setAddress] = useState('');
  const [fps, setFps] = useState('5');
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTried(false);
    if (camera) {
      setNameEn(camera.nameEn); setNameAr(camera.nameAr);
      setArea(clubAreas.find((a) => a.nameEn === camera.areaEn)?.id ?? clubAreas[0]?.id ?? '');
      setFeed(feedOf(camera)); setAddress(camera.stream); setFps(String(camera.fps));
    } else {
      setNameEn(''); setNameAr(''); setArea(clubAreas[0]?.id ?? ''); setFeed('rtsp'); setAddress('rtsp://'); setFps('5');
    }
  }, [open, camera, clubAreas]);

  const addrOk = feed === 'rtsp' ? /^rtsp:\/\/.+/i.test(address.trim()) : /^https?:\/\/.+/i.test(address.trim());
  const nameOk = nameEn.trim().length > 0 || nameAr.trim().length > 0;

  const save = () => {
    setTried(true);
    if (!nameOk || !addrOk) return;
    const a = clubAreas.find((x) => x.id === area);
    const fields = {
      nameEn: nameEn.trim() || nameAr.trim(),
      nameAr: nameAr.trim() || nameEn.trim(),
      areaEn: a?.nameEn ?? camera?.areaEn ?? '',
      areaAr: a?.nameAr ?? camera?.areaAr ?? '',
      stream: address.trim(),
      fps: Math.max(1, Math.min(30, Number(fps) || 5)),
    };
    if (camera) {
      patch('cameras', camera.id, fields);
      onSaved?.(t('cameras.form.saved'));
    } else {
      add('cameras', { id: `${club.id}:cam-${Date.now().toString(36)}`, clubId: club.id, kind: 'nvr', online: true, isTest: false, ...fields });
      onSaved?.(t('cameras.form.added'));
    }
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={camera ? t('cameras.form.editTitle') : t('cameras.form.addTitle')}
      subtitle={camera ? pick(camera.nameEn, camera.nameAr) : undefined}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn--primary" onClick={save}>{camera ? t('cameras.form.save') : t('cameras.form.add')}</button>
      </>}>
      <div className="vform">
        <TextField label={t('cameras.form.nameEn')} value={nameEn} onChange={setNameEn} dir="ltr" />
        <TextField label={t('cameras.form.nameAr')} value={nameAr} onChange={setNameAr} dir="rtl" />
        {tried && !nameOk && <p className="vform__err">{t('cameras.form.errName')}</p>}
        <div className="vform__field">
          <span className="field__label">{t('cameras.form.area')}</span>
          <Select label={t('cameras.form.area')} value={area} onChange={setArea}
            options={clubAreas.map((a) => ({ value: a.id, label: pick(a.nameEn, a.nameAr) }))} />
        </div>
        <div className="vform__field">
          <span className="field__label">{t('cameras.form.feed')}</span>
          <Segmented ariaLabel={t('cameras.form.feed')} value={feed}
            onChange={(v) => { setFeed(v); if (address === 'rtsp://' || address === 'http://' || !address) setAddress(v === 'rtsp' ? 'rtsp://' : 'http://'); }}
            options={[{ value: 'rtsp', label: t('cameras.form.rtsp') }, { value: 'mjpeg', label: t('cameras.form.mjpeg') }]} />
        </div>
        <TextField label={t('cameras.form.address')} value={address} onChange={setAddress} dir="ltr"
          placeholder={feed === 'rtsp' ? t('cameras.form.addressHintRtsp') : t('cameras.form.addressHintMjpeg')} />
        {tried && !addrOk && <p className="vform__err">{feed === 'rtsp' ? t('cameras.form.errAddressRtsp') : t('cameras.form.errAddressMjpeg')}</p>}
        <TextField label={t('cameras.form.fps')} value={fps} onChange={setFps} type="number" dir="ltr" />
      </div>
    </Modal>
  );
}
