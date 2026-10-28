import { useEffect, useState } from 'react';
import { Check, Copy, Eye, EyeOff } from 'lucide-react';
import { useI18n } from '../../../i18n';
import { maskAddress } from './scene';

/** Stream address masked by default, with reveal (until the page is left) and copy of the full address. */
export function StreamAddress({ url, showLabel }: { url: string; showLabel?: boolean }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => { setShown(false); }, [url]);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      ta.remove();
    }
    setCopied(true);
  };

  return (
    <span className="stream">
      {showLabel && <span className="label">{t('cameras.stream.label')}</span>}
      <code className="stream__url ltr" title={shown ? url : undefined}>{shown ? url : maskAddress(url)}</code>
      <button type="button" className="btn btn--sm btn--icon btn--ghost" onClick={() => setShown((s) => !s)}
        aria-label={shown ? t('cameras.stream.hide') : t('cameras.stream.show')} title={shown ? t('cameras.stream.hide') : t('cameras.stream.show')} aria-pressed={shown}>
        {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </button>
      <button type="button" className="btn btn--sm btn--icon btn--ghost" onClick={copy}
        aria-label={t('cameras.stream.copy')} title={copied ? t('cameras.stream.copied') : t('cameras.stream.copy')}>
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </button>
      <span className="visually-hidden" aria-live="polite">{copied ? t('cameras.stream.copied') : ''}</span>
    </span>
  );
}
