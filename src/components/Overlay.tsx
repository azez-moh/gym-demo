import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';

interface OverlayBase { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; footer?: ReactNode; children?: ReactNode }

function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const body = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => panelRef.current?.focus(), 0);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = body; prev?.focus?.(); };
  }, [open, onClose]);
  return panelRef;
}

/** Side panel from the inline end (details on click). */
export function Drawer({ open, onClose, title, subtitle, footer, children, width = 520 }: OverlayBase & { width?: number }) {
  const { t } = useI18n();
  const ref = useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay--drawer" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="panel panel--drawer" role="dialog" aria-modal="true" tabIndex={-1} style={{ width: `min(${width}px, 100vw)` }}>
        <div className="panel__head">
          <div><h2 className="panel__title">{title}</h2>{subtitle && <p className="panel__subtitle">{subtitle}</p>}</div>
          <button type="button" className="btn btn--icon btn--ghost" onClick={onClose} aria-label={t('common.close')}><X aria-hidden /></button>
        </div>
        <div className="panel__body">{children}</div>
        {footer && <div className="panel__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Centred dialog. */
export function Modal({ open, onClose, title, subtitle, footer, children, width = 560 }: OverlayBase & { width?: number }) {
  const { t } = useI18n();
  const ref = useOverlay(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="overlay overlay--modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className="panel panel--modal" role="dialog" aria-modal="true" tabIndex={-1} style={{ width: `min(${width}px, 100%)` }}>
        <div className="panel__head">
          <div><h2 className="panel__title">{title}</h2>{subtitle && <p className="panel__subtitle">{subtitle}</p>}</div>
          <button type="button" className="btn btn--icon btn--ghost" onClick={onClose} aria-label={t('common.close')}><X aria-hidden /></button>
        </div>
        <div className="panel__body">{children}</div>
        {footer && <div className="panel__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirmation for destructive actions (Remove, Delete, Reset usage history, Stop, Clear the alarm, All off).
 * Every destructive control must go through this dialog.
 */
export function ConfirmDialog({ open, onCancel, onConfirm, title, body, confirmLabel, tone = 'danger' }: {
  open: boolean; onCancel: () => void; onConfirm: () => void; title: ReactNode; body?: ReactNode; confirmLabel?: string; tone?: 'danger' | 'primary';
}) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onCancel} title={title} width={440}
      footer={<>
        <button type="button" className="btn" onClick={onCancel}>{t('common.cancel')}</button>
        <button type="button" className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm}>{confirmLabel ?? t('common.confirm')}</button>
      </>}>
      {body && <p className="confirm__body">{body}</p>}
    </Modal>
  );
}
