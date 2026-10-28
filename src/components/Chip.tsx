import type { ReactNode } from 'react';

export interface ChipOption<T extends string> { value: T; label: ReactNode; count?: number; disabled?: boolean }

export function Chip({ pressed, onClick, children, count, disabled }: { pressed?: boolean; onClick?: () => void; children: ReactNode; count?: number; disabled?: boolean }) {
  return (
    <button type="button" className="chip" aria-pressed={pressed} onClick={onClick} disabled={disabled}>
      {children}
      {count != null && <span className="chip__count num">{count}</span>}
    </button>
  );
}

/** Single-select chip row (radio semantics). `scroll` keeps one line with horizontal scroll on phones. */
export function ChipGroup<T extends string>({ options, value, onChange, ariaLabel, scroll, className = '' }: {
  options: ChipOption<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string; scroll?: boolean; className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`chip-group ${scroll ? 'chip-group--scroll' : ''} ${className}`.trim()}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} className="chip" disabled={o.disabled}
          onClick={() => onChange(o.value)}>
          {o.label}
          {o.count != null && <span className="chip__count num">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Segmented control (e.g. Light | Dark, Live read | Live control). */
export function Segmented<T extends string>({ options, value, onChange, ariaLabel, size = 'md' }: {
  options: { value: T; label: ReactNode; disabled?: boolean }[]; value: T; onChange: (v: T) => void; ariaLabel: string; size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`seg ${size === 'sm' ? 'seg--sm' : ''}`}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={o.value === value} disabled={o.disabled} className="seg__opt" onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** On/off switch. */
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className="toggle" onClick={() => onChange(!checked)}>
      <span className="toggle__knob" aria-hidden />
    </button>
  );
}
