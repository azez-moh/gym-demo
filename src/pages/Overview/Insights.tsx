/* eslint-disable react-refresh/only-export-components */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, BatteryCharging, Check, ChevronDown, ClipboardList, PackageMinus, ShoppingCart, Trash2, Users, Wrench, X, type LucideIcon } from 'lucide-react';
import { Card, ChipGroup, ConfirmDialog, Drawer, EmptyState, Modal, Segmented, Select } from '../../components';
import { useI18n } from '../../i18n';
import { brief, describe, makeTx, type Tx } from './describe';
import { useDemo } from '../../data';
import type { Insight, InsightKind } from './insights';
import './insights.css';
import { DISMISS_REASONS, PLAN_STATUSES, type DismissReason, type Plan } from './plan';

export { makeTx, describe, brief } from './describe';
export type { Tx, Described } from './describe';

export function useTx(): Tx {
  const { lang } = useI18n();
  const { clubs, districts } = useDemo();
  return useMemo(() => makeTx(lang, clubs, districts), [lang, clubs, districts]);
}

export const KIND_ICON: Record<InsightKind, LucideIcon> = {
  move: ArrowLeftRight, buy: ShoppingCart, retire: PackageMinus, service: Wrench, energy: BatteryCharging, capacity: Users,
};

export function KindChip({ kind }: { kind: InsightKind }) {
  const { t } = useI18n();
  const Icon = KIND_ICON[kind];
  return <span className={`in-kind in-kind--${kind}`}><Icon aria-hidden />{t(`insights.kind.${kind}`)}</span>;
}

function Confidence({ i }: { i: Insight }) {
  const { t, fmtNumber } = useI18n();
  const basis = i.kind === 'service' ? t('insights.recs.conf.log') : t('insights.recs.conf.weeks', { a: fmtNumber(i.weeksHeld), b: fmtNumber(i.weeksOf) });
  return (
    <span className={`in-conf in-conf--${i.confidence}`} title={t(`insights.recs.conf.${i.confidence}Info`)}>
      <span className="in-conf__dot" aria-hidden />
      {t(`insights.recs.conf.${i.confidence}`)} · <span className="num">{basis}</span>
    </span>
  );
}

// ---------- one recommendation ----------

export function InsightCard({ i, plan, onPlan, onDismiss, onViewPlan, highlight, compact }: {
  i: Insight; plan: Plan; onPlan: (i: Insight) => void; onDismiss: (i: Insight) => void; onViewPlan: () => void; highlight?: boolean; compact?: boolean;
}) {
  const { t } = useI18n();
  const x = useTx();
  const d = describe(i, x);
  const p = plan.planned(i.id);
  return (
    <article className={`in-card ${highlight ? 'is-hl' : ''} ${compact ? 'is-compact' : ''}`} id={`rec-${i.id.replace(/[^a-z0-9-]/gi, '_')}`} data-kind={i.kind}>
      <div className="in-card__top">
        <KindChip kind={i.kind} />
        <Confidence i={i} />
      </div>
      <h3 className="in-card__action">{d.action}</h3>
      <dl className="in-card__facts">
        <dt>{t('insights.recs.why')}</dt>
        <dd><ul>{d.why.map((w, k) => <li key={k}>{w}</li>)}</ul></dd>
        <dt>{t('insights.recs.impact')}</dt>
        <dd><ul className="in-card__impact">{d.impact.map((w, k) => <li key={k}>{w}</li>)}</ul></dd>
      </dl>
      <div className="in-card__foot">
        {p ? (
          <>
            <span className="in-planned"><Check aria-hidden />{t('insights.recs.planned')} · {t(`insights.plan.st.${p.status}`)}</span>
            <button type="button" className="btn btn--sm btn--ghost" onClick={onViewPlan}>{t('insights.recs.viewPlan')}</button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--sm in-plan-btn" onClick={() => onPlan(i)}><ClipboardList aria-hidden />{t('insights.recs.plan')}</button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => onDismiss(i)}><X aria-hidden />{t('insights.recs.dismiss')}</button>
          </>
        )}
      </div>
    </article>
  );
}

/** Recommendation as a compact row (type, brief, key number, confidence); opens to the full details. */
export function InsightRow({ i, plan, open, onToggle, onPlan, onDismiss, onViewPlan, highlight }: {
  i: Insight; plan: Plan; open: boolean; onToggle: () => void; onPlan: (i: Insight) => void; onDismiss: (i: Insight) => void; onViewPlan: () => void; highlight?: boolean;
}) {
  const { t } = useI18n();
  const x = useTx();
  const d = describe(i, x);
  const b = brief(i, x);
  const p = plan.planned(i.id);
  const uid = useId();
  const panelId = `${uid}-panel`;
  return (
    <li className={`in-row ${open ? 'is-open' : ''} ${highlight ? 'is-hl' : ''}`} id={`rec-${i.id.replace(/[^a-z0-9-]/gi, '_')}`} data-kind={i.kind}>
      <button type="button" className="in-row__head" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <KindChip kind={i.kind} />
        <span className="in-row__brief">{b.text}</span>
        <span className="in-row__key num">{b.key}</span>
        <span className="in-row__meta">
          {p && <span className="in-row__planned" title={t('insights.recs.planned')}><Check aria-hidden /><span className="visually-hidden">{t('insights.recs.planned')}</span></span>}
          <span className={`in-conf in-conf--${i.confidence}`} title={t(`insights.recs.conf.${i.confidence}`)}>
            <span className="in-conf__dot" aria-hidden />
            <span className="visually-hidden">{t(`insights.recs.conf.${i.confidence}`)}</span>
          </span>
          <ChevronDown aria-hidden className="in-row__chev" />
        </span>
      </button>
      <div className="in-row__panel" id={panelId} role="region" aria-label={b.text}>
        <div className="in-row__inner">
          <div className="in-row__body">
            <p className="in-row__action">{d.action}</p>
            <dl className="in-card__facts">
              <dt>{t('insights.recs.why')}</dt>
              <dd><ul>{d.why.map((w, k) => <li key={k}>{w}</li>)}</ul></dd>
              <dt>{t('insights.recs.impact')}</dt>
              <dd><ul className="in-card__impact">{d.impact.map((w, k) => <li key={k}>{w}</li>)}</ul></dd>
            </dl>
            <div className="in-card__foot">
              <Confidence i={i} />
              <span className="in-row__btns">
                {p ? (
                  <>
                    <span className="in-planned"><Check aria-hidden />{t('insights.recs.planned')} · {t(`insights.plan.st.${p.status}`)}</span>
                    <button type="button" className="btn btn--sm btn--ghost" onClick={onViewPlan}>{t('insights.recs.viewPlan')}</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn--sm in-plan-btn" onClick={() => onPlan(i)}><ClipboardList aria-hidden />{t('insights.recs.plan')}</button>
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => onDismiss(i)}><X aria-hidden />{t('insights.recs.dismiss')}</button>
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

/** Adds a recommendation to the plan with its text in both languages. */
export function usePlanAdd(plan: Plan) {
  const data = useDemo();
  return (i: Insight) => {
    const en = describe(i, makeTx('en', data.clubs, data.districts)).action;
    const ar = describe(i, makeTx('ar', data.clubs, data.districts)).action;
    plan.add({ id: i.id, kind: i.kind, clubIds: i.clubIds, textEn: en, textAr: ar });
  };
}

export function DismissDialog({ insight, onClose, onConfirm }: { insight: Insight | null; onClose: () => void; onConfirm: (r: DismissReason) => void }) {
  const { t } = useI18n();
  const x = useTx();
  const [reason, setReason] = useState<DismissReason>('done');
  return (
    <Modal open={!!insight} onClose={onClose} title={t('insights.dismiss.title')} width={480}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn--danger" onClick={() => onConfirm(reason)}>{t('insights.dismiss.confirm')}</button>
      </>}>
      {insight && (
        <div className="stack">
          <p className="in-dismiss__action">{describe(insight, x).action}</p>
          <p className="confirm__body">{t('insights.dismiss.body')}</p>
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">{t('insights.dismiss.reason')}</span>
            <ChipGroup ariaLabel={t('insights.dismiss.reason')} value={reason} onChange={setReason}
              options={DISMISS_REASONS.map((r) => ({ value: r, label: t(`insights.dismiss.r.${r}`) }))} />
          </div>
        </div>
      )}
    </Modal>
  );
}

// ---------- the section ----------

export function RecommendedActions({ list, scopeIds, isAll, plan, highlightId, onViewPlan }: {
  list: Insight[]; scopeIds: string[]; isAll: boolean; plan: Plan; highlightId: string | null; onViewPlan: () => void;
}) {
  const { t, fmtNumber } = useI18n();
  const deep = highlightId ? list.find((i) => i.id === highlightId) : undefined;
  const [which, setWhich] = useState<'in' | 'all'>(() => (deep && !isAll && !deep.clubIds.some((id) => scopeIds.includes(id)) ? 'all' : 'in'));
  const [showAll, setShowAll] = useState(() => !!deep && list.filter((i) => !plan.isDismissed(i.id)).indexOf(deep) >= 6);
  const [openId, setOpenId] = useState<string | null>(deep ? deep.id : null);
  const listRef = useRef<HTMLUListElement>(null);
  // deep link ?action=<id>: open that one and bring it into view (once)
  useEffect(() => {
    if (!deep) return;
    setOpenId(deep.id);
    const id = window.setTimeout(() => {
      document.getElementById(`rec-${deep.id.replace(/[^a-z0-9-]/gi, '_')}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(id);
  }, [deep]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissing, setDismissing] = useState<Insight | null>(null);
  const addToPlan = usePlanAdd(plan);
  const inScope = isAll || which === 'all' ? list : list.filter((i) => i.clubIds.some((id) => scopeIds.includes(id)));
  const visible = inScope.filter((i) => !plan.isDismissed(i.id));
  const dismissed = inScope.filter((i) => plan.isDismissed(i.id));
  const shown = showAll ? visible : visible.slice(0, 6);

  return (
    <Card className="in-recs" title={<span className="ov-card-title">{t('insights.recs.title')}</span>} info={t('insights.recs.info')}
      actions={(
        <div className="in-recs__actions">
          <span className="in-recs__count num">{t('insights.recs.count', { n: fmtNumber(visible.length) })}</span>
          {!isAll && (
            <Segmented size="sm" ariaLabel={t('insights.recs.scopeLabel')} value={which} onChange={setWhich}
              options={[{ value: 'in', label: t('insights.recs.scopeIn') }, { value: 'all', label: t('insights.recs.scopeAll') }]} />
          )}
        </div>
      )}>
      {visible.length === 0
        ? <EmptyState title={t('insights.recs.none')} body={t('insights.recs.noneBody')} compact />
        : (
          <ul className="in-rows" ref={listRef}>
            {shown.map((i) => (
              <InsightRow key={i.id} i={i} plan={plan} highlight={highlightId === i.id} onViewPlan={onViewPlan}
                open={openId === i.id} onToggle={() => setOpenId((o) => (o === i.id ? null : i.id))}
                onPlan={addToPlan} onDismiss={setDismissing} />
            ))}
          </ul>
        )}
      <div className="in-recs__more">
        {visible.length > 6 && (
          <button type="button" className="btn btn--sm" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
            {showAll ? t('insights.recs.showFewer') : t('insights.recs.showAll', { n: fmtNumber(visible.length) })}
          </button>
        )}
        {dismissed.length > 0 && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setShowDismissed((v) => !v)} aria-expanded={showDismissed}>
            {showDismissed ? t('insights.recs.hideDismissed') : t('insights.recs.showDismissed', { n: fmtNumber(dismissed.length) })}
          </button>
        )}
      </div>
      {showDismissed && dismissed.length > 0 && (
        <ul className="in-dismissed">
          {dismissed.map((i) => {
            const why = plan.isDismissed(i.id)!;
            return (
              <li key={i.id}>
                <KindChip kind={i.kind} />
                <span className="in-dismissed__text"><DescribedAction i={i} /></span>
                <span className="in-dismissed__why">{t('insights.recs.dismissedBecause', { reason: t(`insights.dismiss.r.${why.reason}`) })}</span>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => plan.restore(i.id)}>{t('insights.recs.restore')}</button>
              </li>
            );
          })}
        </ul>
      )}
      <DismissDialog key={dismissing?.id ?? 'none'} insight={dismissing} onClose={() => setDismissing(null)}
        onConfirm={(r) => { if (dismissing) plan.dismiss(dismissing.id, r); setDismissing(null); }} />
    </Card>
  );
}

function DescribedAction({ i }: { i: Insight }) {
  const x = useTx();
  return <>{describe(i, x).action}</>;
}

/** Drawer with the recommendations of one cell or one gym (opened from the equipment matrix). */
export function RecDrawer({ open, title, items, plan, onClose, onViewPlan }: {
  open: boolean; title: string; items: Insight[]; plan: Plan; onClose: () => void; onViewPlan: () => void;
}) {
  const { t } = useI18n();
  const [dismissing, setDismissing] = useState<Insight | null>(null);
  const addToPlan = usePlanAdd(plan);
  return (
    <Drawer open={open} onClose={onClose} title={title} width={560}>
      {items.length === 0
        ? <EmptyState title={t('insights.matrix.noRec')} compact />
        : (
          <div className="stack">
            {items.map((i) => (
              <InsightCard key={i.id} i={i} plan={plan} onPlan={addToPlan} onViewPlan={() => { onClose(); onViewPlan(); }}
                onDismiss={setDismissing} compact />
            ))}
          </div>
        )}
      <DismissDialog key={dismissing?.id ?? 'none'} insight={dismissing} onClose={() => setDismissing(null)}
        onConfirm={(r) => { if (dismissing) plan.dismiss(dismissing.id, r); setDismissing(null); }} />
    </Drawer>
  );
}

// ---------- action plan ----------

export function ActionPlan({ plan }: { plan: Plan }) {
  const { t, pick, fmtAgo, fmtNumber } = useI18n();
  const data = useDemo();
  const x = useTx();
  const [removing, setRemoving] = useState<string | null>(null);
  const items = plan.items;
  const n = (s: string) => items.filter((i) => i.status === s).length;
  const rm = items.find((i) => i.id === removing);
  return (
    <Card className={`in-plan ${items.length ? '' : 'is-empty'}`} title={<span className="ov-card-title">{t('insights.plan.title')}</span>} info={t('insights.plan.info')}
      actions={items.length ? <span className="in-recs__count num">{t('insights.plan.count', { n: fmtNumber(n('planned')), p: fmtNumber(n('progress')), d: fmtNumber(n('done')) })}</span> : undefined}>
      {items.length === 0
        ? <p className="in-plan__empty"><span>{t('insights.plan.empty')}.</span> {t('insights.plan.emptyBody')}</p>
        : (
          <ul className="in-plan__list">
            {items.map((i) => (
              <li key={i.id} className={`in-plan__row is-${i.status}`}>
                <KindChip kind={i.kind} />
                <span className="in-plan__text">
                  <span className="in-plan__action">{pick(i.textEn, i.textAr)}</span>
                  <span className="in-plan__meta">{x.list(i.clubIds.map(x.gym))} · {t('insights.plan.added', { ago: fmtAgo((data.live.nowMs - i.at) / 1000) })}</span>
                </span>
                <Select label={t('insights.plan.status')} value={i.status} onChange={(s) => plan.setStatus(i.id, s)}
                  options={PLAN_STATUSES.map((s) => ({ value: s, label: t(`insights.plan.st.${s}`) }))} className="in-plan__status" />
                <button type="button" className="btn btn--sm btn--ghost btn--icon" aria-label={`${t('insights.plan.remove')}: ${pick(i.textEn, i.textAr)}`} onClick={() => setRemoving(i.id)}>
                  <Trash2 aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      <ConfirmDialog open={!!rm} onCancel={() => setRemoving(null)} onConfirm={() => { if (rm) plan.remove(rm.id); setRemoving(null); }}
        title={t('insights.plan.removeTitle')} body={rm ? t('insights.plan.removeBody', { action: pick(rm.textEn, rm.textAr) }) : ''} confirmLabel={t('insights.plan.remove')} />
    </Card>
  );
}

