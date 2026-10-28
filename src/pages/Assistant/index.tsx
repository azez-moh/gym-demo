import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bot, KeyRound, MessageCircle, SendHorizontal, SlidersHorizontal, Trash2, UserRound } from 'lucide-react';
import { ConfirmDialog, Drawer, PageHeader, Toggle } from '../../components';
import { useI18n } from '../../i18n';
import { useDemo } from '../../data';
import { useScope } from '../../layout/filters';
import { useAccess } from '../../layout/access';
import { KindChip } from '../Overview/Insights';
import { answer, blocksToText, suggestions, type Block } from './engine';
import { askClaude, ClaudeFail, lastTurns, MODEL, readKey, readMode, snapshot, systemPrompt, writeKey, writeMode, type Turn } from './claude';
import './assistant.css';

/*
  Ask Conductor: a chat over the dashboard data. Built-in answers (engine.ts, no network) by default; optional Claude
  answers with the user's own key (claude.ts). Chat history is kept per role in sessionStorage (this tab only).
*/

interface Msg {
  id: string;
  from: 'user' | 'bot';
  text?: string;
  blocks?: Block[];
  via?: 'builtin' | 'claude';
  note?: string;
  at: number;
}

const chatKey = (role: string) => `opt.assistant.chat.${role}`;

function readChat(role: string): Msg[] {
  try {
    const raw = sessionStorage.getItem(chatKey(role));
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}
function writeChat(role: string, msgs: Msg[]) {
  try {
    if (msgs.length) sessionStorage.setItem(chatKey(role), JSON.stringify(msgs.slice(-60)));
    else sessionStorage.removeItem(chatKey(role));
  } catch { /* storage unavailable: keep in memory */ }
}

let seq = 0;
const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Light Markdown (paragraphs, bullets, pipe tables, **bold**) from Claude into answer blocks. */
function mdToBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r/g, '').split('\n');
  const clean = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1').replace(/`([^`]+)`/g, '$1').replace(/^#+\s*/, '').trim();
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ k: 'p', text: clean(para.join(' ')) }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l) { flush(); continue; }
    if (l.startsWith('|')) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => clean(c));
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i++;
      }
      i--;
      if (rows.length) out.push({ k: 'table', head: rows[0], rows: rows.slice(1) });
      continue;
    }
    if (/^([-*•]|\d+[.)])\s+/.test(l)) { flush(); out.push({ k: 'p', text: `• ${clean(l.replace(/^([-*•]|\d+[.)])\s+/, ''))}` }); continue; }
    para.push(l);
  }
  flush();
  return out;
}

function BlockView({ b, onAsk }: { b: Block; onAsk: (q: string) => void }) {
  const { t } = useI18n();
  switch (b.k) {
    case 'p':
      return <p className="as-p">{b.text}</p>;
    case 'source':
      return <p className="as-src">{b.text}</p>;
    case 'table':
      return (
        <div className="as-table-wrap">
          <table className="as-table">
            <thead><tr>{b.head.map((h, i) => <th key={i} scope="col" className={b.end?.includes(i) ? 'is-end' : ''}>{h}</th>)}</tr></thead>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>{r.map((c, ci) => (ci === 0 ? <th key={ci} scope="row">{c}</th> : <td key={ci} className={`${b.end?.includes(ci) ? 'is-end num' : ''}`}>{c}</td>))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'recs':
      return (
        <ul className="as-recs">
          {b.items.map((i) => {
            const body = (
              <>
                <KindChip kind={i.kind} />
                <span className="as-recs__text">{i.text}</span>
                <span className="as-recs__key num">{i.key}</span>
                {i.to && <ArrowRight aria-hidden className="as-recs__go flip-rtl" />}
              </>
            );
            return <li key={i.id}>{i.to ? <Link to={i.to} className="as-recs__row" title={i.conf}>{body}</Link> : <span className="as-recs__row" title={i.conf}>{body}</span>}</li>;
          })}
        </ul>
      );
    case 'links':
      return (
        <div className="as-links">
          {b.items.map((l) => <Link key={l.to} to={l.to} className="btn btn--sm">{l.label}<ArrowRight aria-hidden className="flip-rtl" /></Link>)}
        </div>
      );
    case 'suggest':
      return (
        <div className="as-chips as-chips--wrap" role="group" aria-label={t('assistant.suggestions')}>
          {b.items.map((s) => <button key={s} type="button" className="as-chip" onClick={() => onAsk(s)}>{s}</button>)}
        </div>
      );
  }
}

export default function AssistantPage() {
  const i18n = useI18n();
  const { t, lang, pick, fmtTime } = i18n;
  const data = useDemo();
  const { clubs } = useScope();
  const { role, canPath } = useAccess();
  const [msgs, setMsgs] = useState<Msg[]>(() => readChat(role));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mode, setModeState] = useState(readMode);
  const [hasKey, setHasKey] = useState(() => !!readKey());
  const [draftKey, setDraftKey] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const keyId = useId();
  const dataRef = useRef(data);
  dataRef.current = data;

  const scopeClubs = useMemo(() => clubs, [clubs]);
  const sugg = useMemo(() => suggestions(role, lang), [role, lang]);
  const claudeOn = mode === 'claude' && hasKey;

  useEffect(() => { writeChat(role, msgs); }, [role, msgs]);
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: msgs.length > 1 ? 'smooth' : 'auto' });
  }, [msgs.length, busy]);

  const setMode = (m: 'builtin' | 'claude') => { setModeState(m); writeMode(m); };

  const grow = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const send = async (q0?: string) => {
    const q = (q0 ?? input).trim();
    if (!q || busy) return;
    setInput('');
    window.requestAnimationFrame(grow);
    const user: Msg = { id: newId(), from: 'user', text: q, at: dataRef.current.live.nowMs };
    const history = [...msgs, user];
    setMsgs(history);
    setBusy(true);
    // let the question paint before the (first, heavier) analysis runs
    await new Promise((r) => window.setTimeout(r, 40));
    const d = dataRef.current;
    const ctx = { data: d, lang, role, scopeClubs, can: canPath };
    const built = answer(q, ctx);
    const builtin = (note?: string): Msg => ({ id: newId(), from: 'bot', blocks: built.blocks, via: 'builtin', note, at: dataRef.current.live.nowMs });
    let reply: Msg;
    if (mode === 'claude') {
      const key = readKey();
      if (!key) reply = builtin(t('assistant.err.noKey'));
      else {
        try {
          abortRef.current = new AbortController();
          const turns: Turn[] = lastTurns(history.map((m) => ({
            role: m.from === 'user' ? 'user' : 'assistant',
            content: m.text ?? blocksToText((m.blocks ?? []).filter((b) => b.k !== 'suggest' && b.k !== 'links')),
          })), 8);
          const text = await askClaude(key, systemPrompt(role, lang, scopeClubs, snapshot(d, scopeClubs, role, lang)), turns, abortRef.current.signal);
          reply = { id: newId(), from: 'bot', blocks: [...mdToBlocks(text), ...built.blocks.filter((b) => b.k === 'links')], via: 'claude', at: dataRef.current.live.nowMs };
        } catch (e) {
          const k = e instanceof ClaudeFail ? e.kind : 'other';
          reply = builtin(t(`assistant.err.${k}`, { status: e instanceof ClaudeFail ? e.status : 0 }));
        }
      }
    } else {
      reply = builtin();
    }
    setMsgs((m) => [...m, reply]);
    setBusy(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const scopeLine = role === 'fm'
    ? t('assistant.scopeFm', { gym: pick(scopeClubs[0]?.nameEn ?? '', scopeClubs[0]?.nameAr ?? '') })
    : t('assistant.scopeAll', { gyms: scopeClubs.map((c) => pick(c.nameEn, c.nameAr)).join(lang === 'ar' ? ' و' : ' and ') });
  const single = import.meta.env.MODE === 'single';

  return (
    <div className="page as-page">
      <div className="as-head">
        <PageHeader
          title={t('assistant.title')}
          actions={(
            <div className="as-head__actions">
              <button type="button" className={`btn btn--sm as-mode ${claudeOn ? 'is-claude' : ''}`} onClick={() => setSettingsOpen(true)}>
                <SlidersHorizontal aria-hidden />
                {t('assistant.settingsBtn', { mode: claudeOn ? t('assistant.modeClaude') : t('assistant.modeBuiltin') })}
              </button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setConfirmClear(true)} disabled={!msgs.length || busy}>
                <Trash2 aria-hidden />{t('assistant.clear')}
              </button>
            </div>
          )}
        />
        <p className="as-scope">{scopeLine}</p>
      </div>

      <section className="card as-chat" aria-label={t('assistant.title')}>
        <div className="as-log" ref={logRef} role="log" aria-live="polite" aria-label={t('assistant.log')} tabIndex={0}>
          {msgs.length === 0 && (
            <div className="as-empty">
              <MessageCircle aria-hidden className="as-empty__icon" />
              <h2 className="as-empty__title">{t('assistant.introTitle')}</h2>
              <p className="as-empty__body">{t('assistant.intro')}</p>
              <div className="as-chips as-chips--grid" role="group" aria-label={t('assistant.suggestions')}>
                {sugg.map((s) => <button key={s} type="button" className="as-chip" onClick={() => void send(s)}>{s}</button>)}
              </div>
            </div>
          )}
          {msgs.map((m) => (
            <div key={m.id} className={`as-msg as-msg--${m.from}`}>
              <div className="as-msg__who">
                {m.from === 'user' ? <UserRound aria-hidden /> : <Bot aria-hidden />}
                <span>{m.from === 'user' ? t('assistant.you') : t('assistant.bot')}</span>
                {m.from === 'bot' && <span className={`as-via ${m.via === 'claude' ? 'is-claude' : ''}`}>{m.via === 'claude' ? t('assistant.viaClaude') : t('assistant.viaBuiltin')}</span>}
                <span className="as-msg__time">{fmtTime(m.at)}</span>
              </div>
              <div className="as-msg__body">
                {m.note && <p className="as-note"><AlertTriangle aria-hidden />{m.note}</p>}
                {m.text && <p className="as-p" dir="auto">{m.text}</p>}
                {m.blocks?.map((b, i) => <BlockView key={i} b={b} onAsk={(q) => void send(q)} />)}
              </div>
            </div>
          ))}
          {busy && (
            <div className="as-msg as-msg--bot as-msg--busy" role="status">
              <div className="as-msg__who"><Bot aria-hidden /><span>{t('assistant.bot')}</span></div>
              <div className="as-msg__body"><span className="as-dots" aria-hidden><i /><i /><i /></span><span className="as-busy">{t('assistant.thinking')}</span></div>
            </div>
          )}
        </div>

        {msgs.length > 0 && (
          <div className="as-chips as-chips--row" role="group" aria-label={t('assistant.suggestions')}>
            {sugg.map((s) => <button key={s} type="button" className="as-chip" onClick={() => void send(s)} disabled={busy}>{s}</button>)}
          </div>
        )}

        <form className="as-input" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label className="visually-hidden" htmlFor="as-q">{t('assistant.inputLabel')}</label>
          <textarea id="as-q" ref={inputRef} rows={1} value={input} placeholder={t('assistant.placeholder')} dir="auto"
            onChange={(e) => { setInput(e.target.value); grow(); }} onKeyDown={onKey} aria-describedby="as-hint" />
          <button type="submit" className="btn btn--primary as-send" disabled={!input.trim() || busy} aria-label={t('assistant.send')} title={t('assistant.send')}>
            <SendHorizontal aria-hidden className="flip-rtl" />
          </button>
        </form>
        <p className="as-hint" id="as-hint">{t('assistant.sendHint')}</p>
      </section>

      <Drawer open={settingsOpen} onClose={() => setSettingsOpen(false)} title={t('assistant.set.title')} width={480}>
        <div className="as-set">
          <section className="as-set__sec">
            <h3>{t('assistant.set.builtinTitle')}</h3>
            <p>{t('assistant.set.builtinBody')}</p>
          </section>
          <section className="as-set__sec">
            <div className="as-set__row">
              <h3>{t('assistant.set.claudeTitle')}</h3>
              <Toggle checked={mode === 'claude' && hasKey} disabled={!hasKey} label={t('assistant.set.toggle')} onChange={(v) => setMode(v ? 'claude' : 'builtin')} />
            </div>
            <p>{t('assistant.set.claudeBody')}</p>
            {!hasKey && <p className="as-set__muted">{t('assistant.set.needKey')}</p>}
            {hasKey ? (
              <div className="as-set__saved">
                <KeyRound aria-hidden />
                <span>{t('assistant.set.saved')}</span>
                <button type="button" className="btn btn--sm btn--danger" onClick={() => setConfirmRemove(true)}>{t('assistant.set.remove')}</button>
              </div>
            ) : (
              <form className="as-set__key" onSubmit={(e) => {
                e.preventDefault();
                const k = draftKey.trim();
                if (!k) return;
                writeKey(k);
                setDraftKey('');
                setHasKey(true);
                setMode('claude');
              }}>
                <div className="field">
                  <label htmlFor={keyId} className="field__label">{t('assistant.set.key')}</label>
                  <div className="field__wrap">
                    <input id={keyId} className="field__input" type="password" autoComplete="off" spellCheck={false} dir="ltr"
                      placeholder={t('assistant.set.keyPlaceholder')} value={draftKey} onChange={(e) => setDraftKey(e.target.value)} />
                  </div>
                </div>
                <button type="submit" className="btn btn--sm btn--primary" disabled={!draftKey.trim()}>{t('assistant.set.save')}</button>
              </form>
            )}
            <p className="as-set__note"><KeyRound aria-hidden />{t('assistant.set.note')}</p>
            <p className="as-set__muted">{t('assistant.set.model', { model: MODEL })}</p>
            {single && <p className="as-set__muted">{t('assistant.set.single')}</p>}
          </section>
        </div>
      </Drawer>

      <ConfirmDialog open={confirmClear} onCancel={() => setConfirmClear(false)}
        onConfirm={() => { abortRef.current?.abort(); setMsgs([]); setConfirmClear(false); }}
        title={t('assistant.clearTitle')} body={t('assistant.clearBody')} confirmLabel={t('assistant.clear')} />
      <ConfirmDialog open={confirmRemove} onCancel={() => setConfirmRemove(false)}
        onConfirm={() => { writeKey(null); setHasKey(false); setMode('builtin'); setConfirmRemove(false); }}
        title={t('assistant.set.removeTitle')} body={t('assistant.set.removeBody')} confirmLabel={t('assistant.set.remove')} />
    </div>
  );
}
