import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface TabDef<T extends string> { id: T; label: ReactNode; icon?: LucideIcon; count?: number }

/** Page sub-tabs with arrow-key navigation (mirrored in RTL). Render the panel yourself under the tabs. */
export function Tabs<T extends string>({ tabs, value, onChange, ariaLabel }: { tabs: TabDef<T>[]; value: T; onChange: (v: T) => void; ariaLabel: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const rtl = document.documentElement.dir === 'rtl';
    const next = e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const prev = e.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    if (!next && !prev) return;
    e.preventDefault();
    const n = (i + (next ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} className="tabs">
      {tabs.map((t, i) => {
        const Icon = t.icon;
        const on = t.id === value;
        return (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} type="button" role="tab" aria-selected={on} tabIndex={on ? 0 : -1}
            className="tab" onClick={() => onChange(t.id)} onKeyDown={(e) => onKey(e, i)}>
            {Icon && <Icon aria-hidden />}
            {t.label}
            {t.count != null && <span className="tab__count num">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
