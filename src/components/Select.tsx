import { useId } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

export interface SelectOption<T extends string> { value: T; label: string; disabled?: boolean }

/** Native select in a square frame with optional icon and a visually hidden label. */
export function Select<T extends string>({ label, value, options, onChange, icon: Icon, disabled, title, className = '' }: {
  label: string; value: T; options: SelectOption<T>[]; onChange: (v: T) => void; icon?: LucideIcon; disabled?: boolean; title?: string; className?: string;
}) {
  const id = useId();
  return (
    <div className={`select ${Icon ? 'select--with-icon' : ''} ${className}`.trim()} title={title}>
      <label htmlFor={id} className="select__label">{label}</label>
      {Icon && <Icon className="select__icon" aria-hidden />}
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}
      </select>
      <ChevronDown className="select__chev" aria-hidden />
    </div>
  );
}

/** Text input with label (search boxes, forms). */
export function TextField({ label, value, onChange, placeholder, type = 'text', dir, hideLabel, icon: Icon }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string; dir?: 'ltr' | 'rtl'; hideLabel?: boolean; icon?: LucideIcon;
}) {
  const id = useId();
  return (
    <div className={`field ${Icon ? 'field--with-icon' : ''}`}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : 'field__label'}>{label}</label>
      <div className="field__wrap">
        {Icon && <Icon className="field__icon" aria-hidden />}
        <input id={id} className="field__input" type={type} value={value} dir={dir} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
