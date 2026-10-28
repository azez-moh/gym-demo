import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, ImagePlus, Power, RefreshCw, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, InfoTip, PageHeader, Select } from '../../components';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme/theme';
import { focusClub, useDemo, type LibraryModel, type MachineType } from '../../data';
import { useScope } from '../../layout/filters';
import { useTypeLabel } from '../Machines/shared/parts';
import { MachineThumb } from '../Machines/shared/Thumb';
import '../Machines/shared/machines.css';
import './library.css';

type Model = LibraryModel & { shape?: MachineType; photo?: string; draft?: boolean };

/** Downscale a photo to a small data URL so it fits in the local store. */
function readPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 320 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

export default function LibraryManagementPage() {
  const { t, pick, fmtNumber, fmtTime } = useI18n();
  const d = useDemo();
  const { theme } = useTheme();
  const typeLabel = useTypeLabel();
  const [refreshedAt, setRefreshedAt] = useState(() => d.now.getTime());
  const [gridKey, setGridKey] = useState(0);
  const lib = d.library as Model[];
  const builtins = useMemo(() => lib.filter((m) => m.builtin), [lib]);
  const active = lib.filter((m) => m.active && m.approved).length;
  const { scope } = useScope();
  const club = focusClub(d, scope);
  const machinesOfType = (type: string) => d.machines.filter((m) => m.clubId === club.id && m.type === type && m.enabled).length;

  // form
  const [name, setName] = useState('');
  const [shape, setShape] = useState<string>('');
  const [category, setCategory] = useState<'cardio' | 'strength' | ''>('');
  const [sub, setSub] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [photoErr, setPhotoErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const nameErr = touched.name && !name.trim() ? t('libraryManagement.form.nameReq') : '';
  const shapeErr = touched.shape && !shape ? t('libraryManagement.form.shapeReq') : '';
  const fileErr = photoErr || (touched.file && !file ? t('libraryManagement.form.photoReq') : '');
  const ready = !!name.trim() && !!shape && !!file && !photoErr && !busy;

  const onFile = (f: File | null) => {
    setTouched((s) => ({ ...s, file: true }));
    setPhotoErr('');
    if (f && !/^image\//.test(f.type)) { setPhotoErr(t('libraryManagement.form.photoType')); setFile(null); return; }
    if (f && f.size > 15 * 1024 * 1024) { setPhotoErr(t('libraryManagement.form.photoSize')); setFile(null); return; }
    setFile(f);
  };

  const upload = async () => {
    setTouched({ name: true, shape: true, file: true });
    if (!ready || !file) return;
    setBusy(true);
    try {
      const photo = await readPhoto(file);
      const tpl = builtins.find((m) => m.id === shape) ?? builtins[0];
      const cat = category || tpl.category;
      const n = name.trim();
      const id = `draft-${d.now.getTime().toString(36)}`;
      const item: Model = {
        ...tpl,
        id: id as MachineType,
        number: String(lib.length + 1).padStart(2, '0'),
        nameEn: n, nameAr: n,
        category: cat,
        subcategoryEn: sub.trim() || tpl.subcategoryEn, subcategoryAr: sub.trim() || tpl.subcategoryAr,
        builtin: false, approved: false, active: false, approximate: true,
        shape: tpl.id, photo, draft: true,
      };
      d.add('library', item as unknown as { id: string } & Record<string, unknown>);
      setNotice(t('libraryManagement.form.added', { name: n }));
      setName(''); setShape(''); setCategory(''); setSub(''); setFile(null); setTouched({});
      if (fileRef.current) fileRef.current.value = '';
    } catch {
      setPhotoErr(t('libraryManagement.form.photoRead'));
    } finally {
      setBusy(false);
    }
  };

  // actions
  const [confirm, setConfirm] = useState<{ kind: 'deactivate' | 'remove'; model: Model } | null>(null);
  const approve = (m: Model) => d.patch('library', m.id, { approved: true });
  const activate = (m: Model) => d.patch('library', m.id, { active: true });
  const doConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === 'deactivate') d.patch('library', confirm.model.id, { active: false });
    else d.remove('library', confirm.model.id);
    setConfirm(null);
  };

  const shapeOptions = [{ value: '', label: t('libraryManagement.form.shapePick') }, ...builtins.map((m) => ({ value: m.id, label: pick(m.nameEn, m.nameAr) }))];
  const ordered = useMemo(() => [...lib].sort((a, b) => Number(!!b.draft && !b.approved) - Number(!!a.draft && !a.approved)), [lib]);

  return (
    <div className="page">
      <PageHeader title={t('libraryManagement.title')} actions={<>
        <span className="mr-headchip">
          <strong className="num">{t('libraryManagement.models', { n: fmtNumber(lib.length) })}</strong><span className="mr-headchip__sep" />
          <span className="num">{t('libraryManagement.active', { n: fmtNumber(active) })}</span>
        </span>
        <Button icon={RefreshCw} onClick={() => { setRefreshedAt(d.now.getTime()); setGridKey((k) => k + 1); }}>{t('libraryManagement.refresh')}</Button>
      </>} />
      <div className="row-between">
        <p className="mr-intro">{t('libraryManagement.intro')}</p>
        <span className="mr-refreshed">{t('reports.refreshedAt', { time: fmtTime(refreshedAt) })}</span>
      </div>

      <Card title={t('libraryManagement.form.title')} info={t('libraryManagement.form.info')}>
        <form className="lm-form" onSubmit={(e) => { e.preventDefault(); upload(); }} noValidate>
          <label className="field">
            <span className="field__label">{t('libraryManagement.form.name')} *</span>
            <input className="field__input" value={name} placeholder={t('libraryManagement.form.namePh')} maxLength={60} aria-invalid={!!nameErr}
              onChange={(e) => { setName(e.target.value); setNotice(''); }} onBlur={() => setTouched((s) => ({ ...s, name: true }))} />
            {nameErr && <span className="lm-err" role="alert">{nameErr}</span>}
          </label>
          <div className="field">
            <span className="field__label">{t('libraryManagement.form.shape')} *<InfoTip text={t('libraryManagement.form.shapeInfo')} /></span>
            <Select<string> label={t('libraryManagement.form.shape')} value={shape} options={shapeOptions}
              onChange={(v) => { setShape(v); setTouched((s) => ({ ...s, shape: true })); const tpl = builtins.find((m) => m.id === v); if (tpl && !category) setCategory(tpl.category); }} />
            {shapeErr && <span className="lm-err" role="alert">{shapeErr}</span>}
          </div>
          <div className="field">
            <span className="field__label">{t('libraryManagement.form.category')}</span>
            <Select<string> label={t('libraryManagement.form.category')} value={category} onChange={(v) => setCategory(v as 'cardio' | 'strength' | '')}
              options={[{ value: '', label: t('libraryManagement.form.fromShape') }, { value: 'cardio', label: t('libraryManagement.cat.cardio') }, { value: 'strength', label: t('libraryManagement.cat.strength') }]} />
          </div>
          <label className="field">
            <span className="field__label">{t('libraryManagement.form.sub')}</span>
            <input className="field__input" value={sub} placeholder={t('libraryManagement.form.subPh')} maxLength={40} onChange={(e) => setSub(e.target.value)} />
          </label>
          <div className="field lm-form__file">
            <span className="field__label">{t('libraryManagement.form.photo')} *</span>
            <span className="lm-file">
              <input ref={fileRef} id="lm-photo" type="file" accept="image/*" className="visually-hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              <label htmlFor="lm-photo" className="btn btn--sm"><ImagePlus aria-hidden />{t('libraryManagement.form.choose')}</label>
              <span className={`lm-file__name ${file ? '' : 'faint'}`}>{file ? file.name : t('libraryManagement.form.noFile')}</span>
            </span>
            {fileErr && <span className="lm-err" role="alert">{fileErr}</span>}
          </div>
          <div className="lm-form__go">
            <Button type="submit" variant="primary" icon={Upload} disabled={!ready}>{busy ? t('libraryManagement.form.uploading') : t('libraryManagement.form.upload')}</Button>
            <span className="faint mr-small">{t('libraryManagement.form.needs')}</span>
          </div>
          {notice && <p className="lm-notice" role="status"><CheckCircle2 aria-hidden />{notice}</p>}
        </form>
      </Card>

      <div className="lm-grid" key={gridKey}>
        {ordered.map((m) => {
          const isDraft = !m.approved;
          const typeKey = (m.shape ?? m.id) as string;
          const used = m.builtin ? machinesOfType(m.id) : 0;
          const name = pick(m.nameEn, m.nameAr);
          return (
            <article key={m.id} className={`lm-card ${isDraft ? 'is-draft' : ''} ${!m.active ? 'is-off' : ''}`}>
              <MachineThumb type={typeKey} photo={m.photo} alt={name} theme={theme} />
              <div className="lm-card__body">
                <h3 className="lm-card__name">{name}</h3>
                <div className="lm-tags">
                  <Badge tone="neutral">{m.builtin ? t('libraryManagement.tag.builtin') : t('libraryManagement.tag.custom')}</Badge>
                  {isDraft ? <Badge tone="warning">{t('libraryManagement.tag.draft')}</Badge> : <Badge tone="success" icon={CheckCircle2}>{t('libraryManagement.tag.approved')}</Badge>}
                  {m.active ? <Badge tone="accent">{t('libraryManagement.tag.active')}</Badge> : <Badge tone="neutral">{t('libraryManagement.tag.inactive')}</Badge>}
                </div>
                <p className="faint mr-small">{t('libraryManagement.shape', { s: typeLabel(typeKey) })}</p>
                <dl className="lm-meta">
                  <div><dt className="label">{t('libraryManagement.form.category')}</dt><dd>{t(`libraryManagement.cat.${m.category}`)}</dd></div>
                  <div><dt className="label">{t('libraryManagement.form.sub')}</dt><dd>{pick(m.subcategoryEn, m.subcategoryAr)}</dd></div>
                </dl>
                {m.builtin && <p className="faint mr-small">{t('libraryManagement.onFloor', { n: fmtNumber(used), club: pick(club.shortEn, club.shortAr) })}</p>}
              </div>
              <div className="lm-card__actions">
                {isDraft && <Button size="sm" variant="primary" icon={CheckCircle2} onClick={() => approve(m)}>{t('libraryManagement.approve')}</Button>}
                {!isDraft && m.active && <Button size="sm" icon={Power} onClick={() => setConfirm({ kind: 'deactivate', model: m })}>{t('libraryManagement.deactivate')}</Button>}
                {!isDraft && !m.active && <Button size="sm" icon={Power} onClick={() => activate(m)}>{t('libraryManagement.activate')}</Button>}
                {!m.builtin && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm({ kind: 'remove', model: m })} aria-label={t('libraryManagement.removeLabel', { name })}>{t('common.remove')}</Button>}
              </div>
            </article>
          );
        })}
      </div>

      <ConfirmDialog open={!!confirm} onCancel={() => setConfirm(null)} onConfirm={doConfirm}
        title={confirm?.kind === 'remove' ? t('libraryManagement.confirm.removeTitle') : t('libraryManagement.confirm.offTitle')}
        confirmLabel={confirm?.kind === 'remove' ? t('common.remove') : t('libraryManagement.deactivate')}
        body={confirm ? (confirm.kind === 'remove'
          ? t('libraryManagement.confirm.removeBody', { name: pick(confirm.model.nameEn, confirm.model.nameAr) })
          : t('libraryManagement.confirm.offBody', { name: pick(confirm.model.nameEn, confirm.model.nameAr), n: fmtNumber(confirm.model.builtin ? machinesOfType(confirm.model.id) : 0), club: pick(club.shortEn, club.shortAr), active: fmtNumber(active - 1), total: fmtNumber(lib.length) })) : undefined} />
    </div>
  );
}
