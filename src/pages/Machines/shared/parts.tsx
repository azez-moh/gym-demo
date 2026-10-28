import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, ChevronRight, MapPin, Pencil, X } from 'lucide-react';
import { InfoTip, StatusBadge } from '../../../components';
import { useI18n } from '../../../i18n';
import { useDemo, type Club, type Machine, type MachineState, type MachineType } from '../../../data';
import { useChartTokens } from '../../../theme/theme';
import { todayUsage } from './usage';
import './machines.css';

export function useTypeLabel() {
  const { t } = useI18n();
  return (type: MachineType | string) => t(`machines.type.${type}`);
}

export function StatePill({ state }: { state: MachineState }) {
  return <StatusBadge status={state} />;
}

/** Expand / collapse button for a row (mouse, keyboard Enter or Space, touch). */
export function ExpandButton({ open, onToggle, label }: { open: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" className="mr-expand" aria-expanded={open} aria-label={label} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
      <ChevronRight aria-hidden className={`flip-rtl ${open ? 'is-open' : ''}`} />
    </button>
  );
}

/** Inline rename: pencil, then input with Save and Cancel. Escape cancels, empty names are rejected. */
export function RenameCell({ machine, onOpenChange }: { machine: Machine; onOpenChange?: (open: boolean) => void }) {
  const { t, pick } = useI18n();
  const { patch } = useDemo();
  const name = pick(machine.nameEn, machine.nameAr);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) ref.current?.select(); }, [editing]);
  const open = (v: boolean) => { setEditing(v); onOpenChange?.(v); };
  const save = () => {
    const v = value.trim().replace(/\s+/g, ' ');
    if (!v) { setError(t('machines.rename.empty')); return; }
    if (v.length > 60) { setError(t('machines.rename.long')); return; }
    patch('machines', machine.id, { nameEn: v, nameAr: v });
    setError('');
    open(false);
  };
  const cancel = () => { setValue(name); setError(''); open(false); };
  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    if (e.key === 'Enter') { e.preventDefault(); save(); }
  };
  if (!editing) {
    return (
      <span className="mr-name">
        <span className="mr-name__text">{name}</span>
        <button type="button" className="mr-name__edit" aria-label={t('machines.rename.button', { name })} title={t('machines.rename.button', { name })}
          onClick={(e) => { e.stopPropagation(); setValue(name); open(true); }}>
          <Pencil aria-hidden />
        </button>
      </span>
    );
  }
  return (
    <span className="mr-rename" onClick={(e) => e.stopPropagation()}>
      <span className="mr-rename__row">
        <input ref={ref} className="field__input mr-rename__input" value={value} aria-label={t('machines.rename.label')} aria-invalid={!!error}
          onChange={(e) => { setValue(e.target.value); if (error) setError(''); }} onKeyDown={onKey} maxLength={80} />
        <button type="button" className="btn btn--sm btn--primary btn--icon" onClick={save} aria-label={t('common.save')} title={t('common.save')}><Check aria-hidden /></button>
        <button type="button" className="btn btn--sm btn--icon" onClick={cancel} aria-label={t('common.cancel')} title={t('common.cancel')}><X aria-hidden /></button>
      </span>
      {error && <span className="mr-rename__err" role="alert">{error}</span>}
    </span>
  );
}

/** Today's usage for one machine: Used, Idle, Utilisation and an hourly chart. Shared by Machines and Reports. */
export function TodayPanel({ machine, club, from }: { machine: Machine; club: Club; from: string }) {
  const { t, fmtDuration, fmtNumber } = useI18n();
  const d = useDemo();
  const ct = useChartTokens();
  const location = useLocation();
  const u = todayUsage(d, machine, club);
  const max = Math.max(60, ...u.hourly);
  const nowH = d.live.hour;
  const hasPlacement = Number.isFinite(machine.x) && Number.isFinite(machine.z);
  const peakH = u.hourly.indexOf(Math.max(...u.hourly));
  return (
    <div className="mr-panel">
      <div className="mr-panel__figs">
        <Fig label={t('machines.panel.used')} value={fmtDuration(u.usedMin * 60)} info={t('machines.panel.usedInfo')} />
        <Fig label={t('machines.panel.idle')} value={fmtDuration(u.idleMin * 60)} info={t('machines.panel.idleInfo')} />
        <Fig label={t('machines.panel.util')} value={`${fmtNumber(u.utilPct, 1)}%`} info={t('machines.panel.utilInfo')} />
        <Fig label={t('machines.panel.sessions')} value={fmtNumber(u.sessions)} info={t('machines.panel.sessionsInfo')} />
      </div>
      <div className="mr-panel__chart">
        <div className="mr-panel__charthead">
          <span className="label">{t('machines.panel.hourly')}</span>
          {u.usedMin > 0 && <span className="muted mr-small">{t('machines.panel.busiest', { h: `${String(peakH).padStart(2, '0')}:00` })}</span>}
        </div>
        <div className="mr-hours" role="img" aria-label={t('machines.panel.hourlyAria', { name: machine.nameEn })}>
          {u.hourly.map((v, h) => (
            <div key={h} className={`mr-hours__col ${u.openHours[h] ? '' : 'is-closed'} ${h > nowH ? 'is-future' : ''}`}
              title={`${String(h).padStart(2, '0')}:00  ${fmtDuration(v * 60)}`}>
              <span className="mr-hours__bar" style={{ height: `${(v / max) * 100}%`, background: h === peakH && v > 0 ? ct.series[0] : ct.series[2] }} />
              <span className="mr-hours__lbl num">{h % 3 === 0 ? String(h).padStart(2, '0') : ''}</span>
            </div>
          ))}
        </div>
        <p className="mr-small faint">{t('machines.panel.hourlyNote')}</p>
      </div>
      {hasPlacement && (
        <Link className="btn btn--sm mr-panel__floor" to={`/live-floor?machine=${encodeURIComponent(machine.id)}`} state={{ from: from || location.pathname + location.search }}>
          <MapPin aria-hidden />{t('machines.panel.showOnFloor')}
        </Link>
      )}
    </div>
  );
}

function Fig({ label, value, info }: { label: string; value: string; info: string }) {
  return (
    <div className="mr-fig">
      <span className="mr-fig__label">{label}<InfoTip text={info} /></span>
      <span className="mr-fig__value num">{value}</span>
    </div>
  );
}

/** "N of M in use" with a fill bar. */
export function FillBar({ n, of, text, tone = 'accent' }: { n: number; of: number; text: string; tone?: 'accent' | 'muted' }) {
  const pct = of > 0 ? Math.min(100, (n / of) * 100) : 0;
  return (
    <span className="mr-fill">
      <span className="mr-fill__track" aria-hidden><span className={`mr-fill__bar mr-fill__bar--${tone}`} style={{ width: `${pct}%` }} /></span>
      <span className="mr-fill__text num">{text}</span>
    </span>
  );
}
