import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/** Toolbar button that opens a small panel under it (closes on outside click or Escape). */
export function Popover({ icon: Icon, label, children, align = 'start' }: { icon?: LucideIcon; label: ReactNode; children: ReactNode; align?: 'start' | 'end' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  return (
    <div className="bpop" ref={ref}>
      <button type="button" className="btn btn--sm bpop__btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {Icon && <Icon aria-hidden />}
        <span>{label}</span>
        <ChevronDown aria-hidden className="bpop__chev" />
      </button>
      {open && <div className={`bpop__panel bpop__panel--${align}`} role="group">{children}</div>}
    </div>
  );
}

export function CheckRow({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="bpop__row">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
