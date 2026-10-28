import { Component, lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRight, Download, RotateCcw, RefreshCw } from 'lucide-react';
import { Badge, Button, InfoTip, PageHeader, Toggle } from '../../components';
import { useDemo, LIVE_CLUB_ID } from '../../data';
import type { LibraryModel, MachineType } from '../../data/types';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme/theme';
import { machinePalette } from '../../three/machines';
import { renderMachineThumbnails } from '../../three/thumbnails';
import './machineLibrary.css';

const Viewer = lazy(() => import('./Viewer'));

const SEL_KEY = 'opt.machineLibrary.selected';

class ViewerBoundary extends Component<{ fallback: ReactNode; children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(prev: { resetKey: string }) { if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function webglOk(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

export default function MachineLibraryPage() {
  const d = useDemo();
  const { t, pick, fmtNumber } = useI18n();
  const { theme, chart } = useTheme();
  const models = useMemo(() => [...d.library].sort((a, b) => a.number.localeCompare(b.number)), [d.library]);
  const [selId, setSelId] = useState<MachineType>(() => {
    try { const s = localStorage.getItem(SEL_KEY) as MachineType | null; if (s && d.library.some((m) => m.id === s)) return s; } catch { /* ignore */ }
    return models[0]?.id ?? 'stair-climber';
  });
  const sel = models.find((m) => m.id === selId) ?? models[0];
  const choose = (id: MachineType) => {
    setSelId(id);
    try { localStorage.setItem(SEL_KEY, id); } catch { /* ignore */ }
  };

  const [webgl] = useState(webglOk);
  const [autoRotate, setAutoRotate] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => { setMsg(null); }, [selId]);

  const pal = machinePalette(theme);
  const accent = chart.state.inUse;
  const colors = useMemo(() => ({ ...pal, accent }), [pal.frame, pal.soft, pal.metal, pal.screen, accent]); // eslint-disable-line react-hooks/exhaustive-deps

  // thumbnails rendered once with one offscreen renderer
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!webgl) return;
    const id = window.setTimeout(() => {
      setThumbs(renderMachineThumbnails(models.map((m) => m.id), colors, theme === 'dark' ? '#1c1830' : '#f4f4f2', 320));
    }, 50);
    return () => window.clearTimeout(id);
  }, [models, colors, theme, webgl]);

  const onFloor = useMemo(() => {
    const m = new Map<MachineType, number>();
    for (const x of d.machines) if (x.clubId === LIVE_CLUB_ID) m.set(x.type, (m.get(x.type) ?? 0) + 1);
    return m;
  }, [d.machines]);

  const download = async () => {
    if (!sel) return;
    setBusy(true);
    setMsg(null);
    try {
      const { downloadMachineGlb } = await import('../../three/exportGlb');
      const file = `${sel.id}.glb`;
      await downloadMachineGlb(sel.id, colors, file);
      setMsg({ tone: 'ok', text: t('machineLibrary.downloaded', { file }) });
    } catch {
      setMsg({ tone: 'err', text: t('machineLibrary.downloadFail') });
    } finally {
      setBusy(false);
    }
  };

  const groups: { key: 'cardio' | 'strength'; list: LibraryModel[] }[] = [
    { key: 'cardio', list: models.filter((m) => m.category === 'cardio') },
    { key: 'strength', list: models.filter((m) => m.category === 'strength') },
  ];
  const catCount = groups.filter((g) => g.list.length).length;
  const unavailable = <div className="ml-viewer__msg">{t('machineLibrary.unavailable')}</div>;

  return (
    <div className="page ml-page">
      <PageHeader title={t('machineLibrary.title')}
        actions={<span className="ml-count">{t('machineLibrary.models', { n: fmtNumber(models.length) })}</span>} />
      <p className="ml-intro">{t('machineLibrary.intro')}</p>

      {sel && (
        <section className="ml-hero">
          <div className="ml-viewer">
            <span className="ml-viewer__hint">{t('machineLibrary.viewerHint')}</span>
            {webgl ? (
              <ViewerBoundary fallback={unavailable} resetKey={sel.id}>
                <Suspense fallback={<div className="ml-viewer__msg ml-viewer__msg--loading" aria-busy="true">{t('machineLibrary.loading')}</div>}>
                  <Viewer type={sel.id} theme={theme} accent={accent} autoRotate={autoRotate} resetSignal={resetSignal}
                    ariaLabel={t('machineLibrary.viewerAria', { name: pick(sel.nameEn, sel.nameAr) })} />
                </Suspense>
              </ViewerBoundary>
            ) : unavailable}
            <div className="ml-viewer__tools">
              <span className="ml-viewer__tool">
                <RefreshCw aria-hidden />
                <span>{t('machineLibrary.autoRotate')}</span>
                <Toggle checked={autoRotate} onChange={setAutoRotate} label={t('machineLibrary.autoRotate')} />
              </span>
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setResetSignal((n) => n + 1)}>{t('machineLibrary.reset')}</Button>
            </div>
          </div>

          <aside className="ml-detail">
            <span className="label">{t('machineLibrary.study', { num: sel.number })}</span>
            <h2 className="ml-detail__name">{pick(sel.nameEn, sel.nameAr)}</h2>
            <div className="ml-tags">
              <Badge tone="neutral">{sel.builtin ? t('machineLibrary.tags.builtin') : t('machineLibrary.tags.custom')}</Badge>
              <Badge tone={sel.active ? 'success' : 'neutral'}>{sel.active ? t('machineLibrary.tags.active') : t('machineLibrary.tags.inactive')}</Badge>
              <Badge tone={sel.approximate ? 'warning' : 'info'}>{sel.approximate ? t('machineLibrary.tags.approximate') : t('machineLibrary.tags.photo')}</Badge>
            </div>
            <Block label={t('machineLibrary.description')}>{pick(sel.descriptionEn, sel.descriptionAr)}</Block>
            <Block label={t('machineLibrary.motion')} info={t('machineLibrary.motionInfo')}>{pick(sel.motionZoneEn, sel.motionZoneAr)}</Block>
            <Block label={t('machineLibrary.operator')} info={t('machineLibrary.operatorInfo')}>{pick(sel.operatorZoneEn, sel.operatorZoneAr)}</Block>
            <div className="ml-facts">
              <Block label={t('machineLibrary.footprint')} info={t('machineLibrary.footprintInfo')}>
                <span className="num">{t('machineLibrary.footprintValue', { l: fmtNumber(sel.footprint.l, 2), w: fmtNumber(sel.footprint.w, 2), h: fmtNumber(sel.footprint.h, 2) })}</span>
                <span className="ml-sub">{t('machineLibrary.clearance', { c: fmtNumber(sel.footprint.clearance, 1) })}</span>
              </Block>
              <Block label={t('machineLibrary.onFloor')}>
                <span className="num">{t('machineLibrary.onFloorValue', { n: fmtNumber(onFloor.get(sel.id) ?? 0) })}</span>
              </Block>
            </div>
            <Button icon={Download} onClick={download} disabled={busy} className="ml-download">
              {busy ? t('machineLibrary.downloading') : t('machineLibrary.download')}
            </Button>
            {msg && <p className={`ml-msg ml-msg--${msg.tone}`} role={msg.tone === 'err' ? 'alert' : 'status'}>{msg.text}</p>}
          </aside>
        </section>
      )}

      <section className="ml-catalog" aria-labelledby="ml-catalog-title">
        <div className="ml-catalog__head">
          <h2 id="ml-catalog-title" className="ml-catalog__title">{t('machineLibrary.yourEquipment')}</h2>
          <span className="ml-catalog__meta">
            {t('machineLibrary.selectHint')} · {t('machineLibrary.models', { n: fmtNumber(models.length) })} · {t('machineLibrary.categories', { n: fmtNumber(catCount) })}
          </span>
        </div>
        {groups.map((g) => g.list.length > 0 && (
          <div key={g.key} className="ml-group">
            <h3 className="ml-group__title label">{t(`machineLibrary.${g.key}`)} <span className="num">({fmtNumber(g.list.length)})</span></h3>
            <div className="ml-row" role="listbox" aria-label={t(`machineLibrary.${g.key}`)}>
              {g.list.map((m) => (
                <button key={m.id} type="button" role="option" aria-selected={m.id === sel?.id} className="ml-card" onClick={() => choose(m.id)}
                  aria-label={t('machineLibrary.open', { name: pick(m.nameEn, m.nameAr) })}>
                  <span className="ml-card__thumb">
                    {thumbs[m.id] ? <img src={thumbs[m.id]} alt="" /> : <span className="ml-card__ph" aria-hidden />}
                    <span className="ml-card__num num">{m.number}</span>
                  </span>
                  <span className="ml-card__body">
                    <span className="ml-card__name">{pick(m.nameEn, m.nameAr)}</span>
                    <span className="ml-card__foot">
                      <Badge tone={m.approximate ? 'warning' : 'info'}>{m.approximate ? t('machineLibrary.badge.approximate') : t('machineLibrary.badge.photo')}</Badge>
                      <ArrowUpRight aria-hidden className="ml-card__go flip-rtl" />
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Block({ label, info, children }: { label: string; info?: string; children: ReactNode }) {
  return (
    <div className="ml-block">
      <span className="ml-block__label">{label}{info && <InfoTip text={info} />}</span>
      <div className="ml-block__text">{children}</div>
    </div>
  );
}
