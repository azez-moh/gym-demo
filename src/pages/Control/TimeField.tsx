import { useState } from 'react';

/** 24-hour "HH:MM" entry with Latin digits in both languages (native time inputs follow the browser's 12-hour locale). */
export function TimeField({ value, onChange, label, className = '' }: { value: string; onChange: (v: string) => void; label: string; className?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = (raw: string) => {
    setDraft(null);
    const m = /^(\d{1,2})(?::?(\d{2}))?$/.exec(raw.trim());
    if (!m) return;
    const h = Number(m[1]), mi = Number(m[2] ?? 0);
    if (h > 23 || mi > 59) return;
    onChange(`${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);
  };
  const bad = draft != null && !/^\d{1,2}(:?\d{2})?$/.test(draft.trim());
  return (
    <input type="text" inputMode="numeric" dir="ltr" maxLength={5} placeholder="HH:MM" aria-label={label} aria-invalid={bad}
      className={`field__input timefield ${className}`.trim()} value={draft ?? value}
      onChange={(e) => setDraft(e.target.value)} onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
