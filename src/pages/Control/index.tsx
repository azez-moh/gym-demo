import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, Redo2, Undo2 } from 'lucide-react';
import { Button, PageHeader, Tabs, type TabDef } from '../../components';
import { useI18n } from '../../i18n';
import { useAuth } from '../../layout/auth';
import { useControl, type HistoryEntry, type Op } from './model';
import { Decks } from './Decks';
import { Boards } from './Boards';
import { Schedule } from './Schedule';
import { DataTab } from './DataTab';
import { Times } from './Times';
import { Designer } from './Designer';
import './control.css';

type TabId = 'decks' | 'schedule' | 'times' | 'boards' | 'data';
const TABS: TabId[] = ['decks', 'schedule', 'times', 'boards', 'data'];

/** Undo and redo stacks per club, kept for the session (survive tab and page switches). */
const STACKS = new Map<string, { undo: HistoryEntry[]; redo: HistoryEntry[] }>();

export type Commit = (label: string, ops: (Op | null)[]) => void;

export default function ControlPage() {
  const { t, pick, fmtTime, fmtDate } = useI18n();
  const ctl = useControl();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get('view');
  const tabParam = params.get('tab') as TabId | null;
  const tab: TabId = tabParam && TABS.includes(tabParam) ? tabParam : 'decks';
  const setTab = (id: TabId) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', id); return n; });

  const stack = useMemo(() => {
    let s = STACKS.get(ctl.club.id);
    if (!s) { s = { undo: [], redo: [] }; STACKS.set(ctl.club.id, s); }
    return s;
  }, [ctl.club.id]);
  const [, force] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>();
  const say = useCallback((msg: string) => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const stamp = useCallback(() => {
    ctl.data.patch('settings', ctl.ctlId, { savedBy: user?.name ?? '', savedRole: user?.role ?? 'coo', savedAt: Date.now() });
  }, [ctl, user]);

  const commit = useCallback<Commit>((label, raw) => {
    const ops = raw.filter(Boolean) as Op[];
    if (!ops.length) return;
    ctl.applyOps(ops, 'after');
    stack.undo.push({ label, ops });
    stack.redo = [];
    stamp();
    force((x) => x + 1);
  }, [ctl, stack, stamp]);

  const undo = useCallback(() => {
    const e = stack.undo.pop();
    if (!e) return;
    ctl.applyOps([...e.ops].reverse(), 'before');
    stack.redo.push(e);
    stamp();
    force((x) => x + 1);
    say(t('control.undone', { what: e.label }));
  }, [ctl, stack, stamp, say, t]);

  const redo = useCallback(() => {
    const e = stack.redo.pop();
    if (!e) return;
    ctl.applyOps(e.ops, 'after');
    stack.undo.push(e);
    stamp();
    force((x) => x + 1);
    say(t('control.redone', { what: e.label }));
  }, [ctl, stack, stamp, say, t]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  if (view === 'designer') return <Designer ctl={ctl} onBack={() => navigate(-1)} />;

  const canUndo = stack.undo.length > 0;
  const canRedo = stack.redo.length > 0;
  const tabs: TabDef<TabId>[] = TABS.map((id) => ({ id, label: t(`control.tab.${id}`) }));
  const savedLine = ctl.savedAt
    ? t('control.lastSaved', { name: ctl.savedBy || '', role: t(`role.${ctl.savedRole === 'fm' ? 'fm' : 'coo'}Short`), time: `${fmtDate(ctl.savedAt, 'short')} ${fmtTime(ctl.savedAt)}` })
    : t('control.notSaved');

  return (
    <div className="page ctl">
      <PageHeader
        eyebrow={pick(ctl.club.nameEn, ctl.club.nameAr)}
        title={t('control.title')}
        actions={<>
          <Button icon={Undo2} onClick={undo} disabled={!canUndo} title={canUndo ? t('control.undoHint') : t('control.nothingUndo')} aria-keyshortcuts="Control+Z Meta+Z">
            {t('control.undo')}
          </Button>
          <Button icon={Redo2} onClick={redo} disabled={!canRedo} title={canRedo ? t('control.redoHint') : t('control.nothingRedo')} aria-keyshortcuts="Shift+Control+Z Shift+Meta+Z">
            {t('control.redo')}
          </Button>
          <Button icon={Box} title={t('control.modelHint')} onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('view', 'designer'); return n; })}>
            {t('control.model')}
          </Button>
        </>}
      />
      <div className="ctl__tabs">
        <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel={t('control.tabsLabel')} />
        <span className="ctl__saved faint">{savedLine}</span>
      </div>
      <div role="tabpanel" aria-label={t(`control.tab.${tab}`)} className="ctl__panel">
        {tab === 'decks' && <Decks ctl={ctl} commit={commit} say={say} />}
        {tab === 'schedule' && <Schedule ctl={ctl} />}
        {tab === 'times' && <Times ctl={ctl} commit={commit} />}
        {tab === 'boards' && <Boards ctl={ctl} />}
        {tab === 'data' && <DataTab ctl={ctl} commit={commit} />}
      </div>
      {toast && <div className="ctl__toast" role="status">{toast}</div>}
    </div>
  );
}
