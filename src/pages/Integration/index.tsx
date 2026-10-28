import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Activity, Cable, FileText, Home, Plus, Power, RotateCw, Settings, Stethoscope, Trash2, Waypoints } from 'lucide-react';
import { Badge, Button, Drawer, InfoTip, KpiTile, Modal, PageHeader, Select, StatusBadge, TextField } from '../../components';
import { useI18n } from '../../i18n';
import { useDemo, focusClub, integrationsOf, type Integration } from '../../data';
import { useScope } from '../../layout/filters';
import './integration.css';

type Conn = Integration & { startedAt?: number; stoppedAt?: number; pollSec?: number };
type Live = { lastRead: number | null; lastPush: number | null; pushed: number; uptimeSec: number };

/** Live figures that move with the store clock: reads every few seconds, pushes accumulate, uptime grows. */
function liveOf(c: Conn, nowMs: number): Live {
  const seed = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  const poll = c.pollSec ?? 40;
  const nowS = Math.floor(nowMs / 1000);
  const uptimeSec = c.startedAt ? Math.max(0, (nowMs - c.startedAt) / 1000) : c.uptimeH * 3600 + ((nowS + seed) % 3600);
  if (!c.running) {
    const since = c.stoppedAt ? Math.max(0, (nowMs - c.stoppedAt) / 1000) : 0;
    return { lastRead: c.lastReadSec + since, lastPush: c.kind === 'bacnet' ? c.lastPushSec + since : null, pushed: c.pushed, uptimeSec: 0 };
  }
  const lastRead = c.kind === 'home-assistant' && c.covers === 0 ? null : (c.lastReadSec + nowS + seed) % poll;
  const lastPush = c.kind === 'bacnet' ? (c.lastPushSec + nowS + seed * 7) % Math.max(60, c.lastPushSec * 2) : null;
  const pushed = c.pushed + (c.kind === 'bacnet' ? Math.floor((nowS % 86400) / 30) : 0);
  return { lastRead, lastPush, pushed, uptimeSec };
}

type Confirm = { kind: 'stop' | 'restart' | 'remove'; c: Conn } | null;

export default function IntegrationPage() {
  const { t, pick, fmtNumber, fmtAgo, fmtDuration, isRtl } = useI18n();
  const data = useDemo();
  const { scope } = useScope();
  const club = focusClub(data, scope);
  const conns = integrationsOf(data, club.id) as Conn[];
  const now = data.live.nowMs;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [word, setWord] = useState('');
  const [settingsOf, setSettingsOf] = useState<Conn | null>(null);
  const [logOf, setLogOf] = useState<Conn | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [restarting, setRestarting] = useState<Set<string>>(new Set());
  const timer = useRef<number>();
  const say = (m: string) => { setToast(m); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), 3500); };

  const name = (c: Conn) => pick(c.nameEn, c.nameAr);
  const bac = conns.filter((c) => c.kind === 'bacnet');
  const running = conns.filter((c) => c.running).length;
  const covers = bac.filter((c) => c.running).reduce((a, c) => a + c.covers, 0);
  const coversOf = Math.max(0, ...bac.map((c) => c.coversOf));
  const subs = bac.filter((c) => c.running).reduce((a, c) => a + c.subscriptions, 0);
  const latest = conns.filter((c) => c.running).map((c) => liveOf(c, now).lastRead).filter((x): x is number => x != null);
  const latestRead = latest.length ? Math.min(...latest) : null;

  const doConfirm = () => {
    if (!confirm) return;
    const { kind, c } = confirm;
    if (kind === 'stop') data.patch('integrations', c.id, { running: false, stoppedAt: Date.now() });
    if (kind === 'restart') {
      setRestarting((s) => new Set(s).add(c.id));
      window.setTimeout(() => {
        data.patch('integrations', c.id, { running: true, startedAt: data.live.nowMs, uptimeH: 0, stoppedAt: undefined });
        setRestarting((s) => { const n = new Set(s); n.delete(c.id); return n; });
        say(t('integration.restarted', { name: name(c) }));
      }, 1200);
    }
    if (kind === 'remove') data.remove('integrations', c.id);
    setConfirm(null);
    setWord('');
  };

  const start = (c: Conn) => { data.patch('integrations', c.id, { running: true, startedAt: data.live.nowMs, stoppedAt: undefined }); say(t('integration.started', { name: name(c) })); };
  const probe = (c: Conn) => {
    if (!c.running) { say(t('integration.probeFail', { name: name(c) })); return; }
    const ms = 12 + ([...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 60);
    say(t('integration.probeOk', { name: name(c), ms: fmtNumber(ms), n: fmtNumber(c.kind === 'bacnet' ? c.covers * 8 : 42) }));
  };

  const word2 = t('integration.confirm.word');

  return (
    <div className="page intg">
      <PageHeader eyebrow={pick(club.nameEn, club.nameAr)} title={<span className="intg__title">{t('integration.title')}<InfoTip text={`${t('integration.intro')} ${t('integration.introInfo')}`} /></span>}
        actions={<Button icon={Plus} onClick={() => setAdding(true)}>{t('integration.addBtn')}</Button>} />

      <div className="grid-kpi">
        <KpiTile icon={Power} live label={t('integration.kpi.running')} value={fmtNumber(running)} unit={t('integration.kpi.of', { n: fmtNumber(conns.length) })} info={t('integration.kpi.runningInfo')} />
        <KpiTile icon={Waypoints} label={t('integration.kpi.covers')} value={fmtNumber(covers)} unit={t('integration.kpi.of', { n: fmtNumber(coversOf || covers) })} info={t('integration.kpi.coversInfo')} />
        <KpiTile icon={Cable} live label={t('integration.kpi.subs')} value={fmtNumber(subs)} info={t('integration.kpi.subsInfo')} />
        <KpiTile icon={Activity} label={t('integration.kpi.lastRead')} value={latestRead == null ? t('integration.never') : fmtDuration(latestRead)} info={t('integration.kpi.lastReadInfo')} />
      </div>

      <div className="intg__list">
        {conns.map((c) => {
          const lv = liveOf(c, now);
          const isRestarting = restarting.has(c.id);
          const status = isRestarting ? 'restarting' : c.running ? 'running' : 'stopped';
          const Icon = c.kind === 'home-assistant' ? Home : Cable;
          const pct = c.coversOf ? Math.round((c.covers / c.coversOf) * 100) : 0;
          const sockets = Math.max(1, Math.ceil(c.subscriptions / 255));
          const metrics: { k: string; v: ReactNode; info?: string }[] = [
            { k: 'uptime', v: c.running ? fmtDuration(lv.uptimeSec) : t('integration.stoppedFor'), info: t('integration.mInfo.uptime') },
            { k: 'gateway', v: c.gateway ? <span className="ltr">{c.gateway}{c.device != null ? ` · ${t('integration.device', { n: c.device })}` : ''}</span> : t('integration.notSet'), info: t('integration.mInfo.gateway') },
            { k: 'covers', v: c.coversOf ? (
              <span className="intg__covers"><span>{t('integration.coversOf', { n: fmtNumber(c.covers), m: fmtNumber(c.coversOf) })}</span>
                <span className="intg__bar" aria-hidden><span style={{ inlineSize: `${pct}%` }} /></span></span>
            ) : t('integration.units', { n: fmtNumber(c.covers) }), info: t('integration.mInfo.covers') },
            { k: 'lastRead', v: lv.lastRead == null ? t('integration.never') : fmtAgoShort(lv.lastRead, fmtAgo, fmtDuration, isRtl) },
          ];
          if (c.kind === 'bacnet') {
            metrics.push(
              { k: 'subs', v: t('integration.live', { n: fmtNumber(c.running ? c.subscriptions : 0) }), info: t('integration.mInfo.subs') },
              { k: 'across', v: t(sockets === 1 ? 'integration.sockets' : 'integration.socketsPl', { n: fmtNumber(sockets), each: fmtNumber(255) }), info: t('integration.mInfo.across') },
              { k: 'pushed', v: fmtNumber(lv.pushed), info: t('integration.mInfo.pushed') },
              { k: 'lastPush', v: lv.lastPush == null ? t('integration.never') : fmtAgo(lv.lastPush) },
            );
          }
          return (
            <article key={c.id} className={`intg__card ${c.running ? '' : 'is-stopped'}`}>
              <header className="intg__head">
                <span className="intg__icon"><Icon aria-hidden /></span>
                <div className="intg__titles">
                  <h3 className="intg__name">{name(c)}</h3>
                  {t(`integration.kind.${c.kind}`) !== name(c) && <span className="intg__type faint">{t(`integration.kind.${c.kind}`)}{c.device != null ? ` · ${t('integration.device', { n: c.device })}` : ''}</span>}
                </div>
                {status === 'running' && <StatusBadge status="running" label={t('integration.status.running')} size="md" />}
                {status === 'stopped' && <StatusBadge status="stopped" label={t('integration.status.stopped')} size="md" />}
                {status === 'restarting' && <Badge tone="warning" icon={RotateCw} size="md">{t('integration.status.restarting')}</Badge>}
              </header>
              <dl className="intg__metrics">
                {metrics.map((m) => (
                  <div key={m.k} className="intg__metric">
                    <dt className="label">{t(`integration.m.${m.k}`)}{m.info && <InfoTip text={m.info} />}</dt>
                    <dd className="num">{m.v}</dd>
                  </div>
                ))}
              </dl>
              <div className="intg__acts">
                <Button size="sm" variant="primary" icon={Settings} onClick={() => setSettingsOf(c)}>{t('integration.act.settings')}</Button>
                <Button size="sm" icon={Stethoscope} onClick={() => probe(c)}>{t('integration.act.probe')}</Button>
                <Button size="sm" icon={RotateCw} disabled={isRestarting} onClick={() => setConfirm({ kind: 'restart', c })}>{t('integration.act.restart')}</Button>
                <Button size="sm" icon={FileText} onClick={() => setLogOf(c)}>{t('integration.act.log')}</Button>
                <span className="intg__spacer" />
                {c.running
                  ? <Button size="sm" variant="danger" icon={Power} disabled={isRestarting} onClick={() => setConfirm({ kind: 'stop', c })}>{t('integration.act.stop')}</Button>
                  : <Button size="sm" icon={Power} onClick={() => start(c)}>{t('integration.act.start')}</Button>}
                <Button size="sm" variant="danger" icon={Trash2} onClick={() => setConfirm({ kind: 'remove', c })}>{t('integration.act.remove')}</Button>
              </div>
            </article>
          );
        })}

        <button type="button" className="intg__add" onClick={() => setAdding(true)}>
          <span className="intg__addicon"><Plus aria-hidden /></span>
          <span className="intg__addtext"><span>{t('integration.addTitle')}</span><span className="muted">{t('integration.addBody')}</span></span>
          <span className="btn btn--sm">{t('integration.addBtn')}</span>
        </button>
      </div>

      <Modal open={!!confirm} onClose={() => { setConfirm(null); setWord(''); }} width={460}
        title={!confirm ? '' : t(`integration.confirm.${confirm.kind}Title`, { name: name(confirm.c) })}
        footer={<>
          <button type="button" className="btn" onClick={() => { setConfirm(null); setWord(''); }}>{t('common.cancel')}</button>
          <button type="button" className={`btn ${confirm?.kind === 'restart' ? 'btn--primary' : 'btn--danger'}`}
            disabled={confirm?.kind === 'remove' && word.trim().toUpperCase() !== word2.toUpperCase()} onClick={doConfirm}>
            {confirm ? t(`integration.confirm.${confirm.kind}Btn`) : ''}
          </button>
        </>}>
        {confirm && (
          <div className="stack">
            <p className="confirm__body">{t(`integration.confirm.${confirm.kind}Body`, { name: name(confirm.c), n: fmtNumber(confirm.c.subscriptions), uses: confirm.c.kind === 'bacnet' ? t('integration.usesHvac') : t('integration.usesHa') })}</p>
            {confirm.kind === 'remove' && <TextField label={t('integration.confirm.typeWord', { word: word2 })} value={word} onChange={setWord} />}
          </div>
        )}
      </Modal>

      {settingsOf && <SettingsDrawer c={settingsOf} onClose={() => setSettingsOf(null)} onSave={(f) => { data.patch('integrations', settingsOf.id, f); setSettingsOf(null); }} />}
      {logOf && <LogDrawer c={logOf} nowMs={now} onClose={() => setLogOf(null)} />}
      {adding && <AddModal clubId={club.id} count={conns.length} onClose={() => setAdding(false)}
        onAdd={(item) => { data.add('integrations', item); setAdding(false); say(t('integration.added', { name: String(item.nameEn) })); }} />}
      {toast && <div className="intg__toast" role="status">{toast}</div>}
    </div>
  );
}

/** fmtAgo rounds to minutes; a read under a minute old reads better in seconds ("19 s ago"). */
function fmtAgoShort(sec: number, fmtAgo: (s: number) => string, fmtDuration: (s: number) => string, isRtl: boolean): string {
  if (sec >= 60) return fmtAgo(sec);
  return isRtl ? `منذ ${fmtDuration(sec)}` : `${fmtDuration(sec)} ago`;
}

function SettingsDrawer({ c, onClose, onSave }: { c: Conn; onClose: () => void; onSave: (f: Record<string, unknown>) => void }) {
  const { t, pick } = useI18n();
  const [nm, setNm] = useState(pick(c.nameEn, c.nameAr));
  const [gw, setGw] = useState(c.gateway);
  const [dev, setDev] = useState(c.device != null ? String(c.device) : '');
  const [poll, setPoll] = useState(String(c.pollSec ?? 40));
  return (
    <Drawer open onClose={onClose} title={t('integration.settingsTitle')} subtitle={pick(c.nameEn, c.nameAr)} width={460}
      footer={<>
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={() => onSave({ nameEn: nm, nameAr: nm, gateway: gw.trim(), ...(c.kind === 'bacnet' ? { device: Number(dev) || c.device } : {}), pollSec: Math.max(5, Number(poll) || 40) })}>{t('integration.save')}</Button>
      </>}>
      <div className="stack">
        <TextField label={t('integration.name')} value={nm} onChange={setNm} />
        <TextField label={t('integration.gatewayAddr')} value={gw} onChange={setGw} dir="ltr" />
        {c.kind === 'bacnet' && <TextField label={t('integration.deviceNo')} value={dev} onChange={setDev} type="number" dir="ltr" />}
        <TextField label={t('integration.pollSec')} value={poll} onChange={setPoll} type="number" dir="ltr" />
      </div>
    </Drawer>
  );
}

function LogDrawer({ c, nowMs, onClose }: { c: Conn; nowMs: number; onClose: () => void }) {
  const { t, pick, fmtNumber } = useI18n();
  const lines = useMemo(() => {
    const out: { at: number; txt: string }[] = [];
    const seed = [...c.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
    const start = c.startedAt ?? nowMs - c.uptimeH * 3600_000;
    out.push({ at: start, txt: t('integration.log.start') });
    out.push({ at: start + 1200, txt: c.kind === 'bacnet' ? t('integration.log.connect', { gw: c.gateway }) : t('integration.log.ha') });
    if (c.kind === 'bacnet') out.push({ at: start + 2600, txt: t('integration.log.subscribe', { n: fmtNumber(c.subscriptions) }) });
    const end = c.running ? nowMs : (c.stoppedAt ?? nowMs);
    for (let i = 8; i >= 1; i--) {
      const at = end - i * (5 * 60_000 + (seed % 7) * 10_000);
      if (at <= start) continue;
      out.push({ at, txt: c.kind === 'bacnet' ? t('integration.log.push', { n: fmtNumber(20 + ((seed * i) % 60)) }) : t('integration.log.read', { n: fmtNumber(c.covers) }) });
    }
    if (!c.running && c.stoppedAt) out.push({ at: c.stoppedAt, txt: t('integration.log.stopped') });
    return out.reverse();
  }, [c, nowMs, t, fmtNumber]);
  const fmt = (ms: number) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Riyadh', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(ms));
  return (
    <Drawer open onClose={onClose} title={t('integration.logTitle')} subtitle={pick(c.nameEn, c.nameAr)} width={520}>
      {lines.length === 0 ? <p className="muted">{t('integration.logEmpty')}</p> : (
        <ol className="intg__log">
          {lines.map((l, i) => <li key={i}><span className="intg__logtime ltr">{fmt(l.at)}</span><span>{l.txt}</span></li>)}
        </ol>
      )}
    </Drawer>
  );
}

function AddModal({ clubId, count, onClose, onAdd }: { clubId: string; count: number; onClose: () => void; onAdd: (item: { id: string } & Record<string, unknown>) => void }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<'bacnet' | 'home-assistant'>('bacnet');
  const [nm, setNm] = useState('');
  const [gw, setGw] = useState('');
  const [dev, setDev] = useState('');
  const [tried, setTried] = useState(false);
  const nameErr = !nm.trim();
  const gwErr = !/^\d{1,3}(\.\d{1,3}){3}$/.test(gw.trim());
  const submit = () => {
    setTried(true);
    if (nameErr || gwErr) return;
    onAdd({
      id: `${clubId}:added${Date.now()}`, clubId, kind, nameEn: nm.trim(), nameAr: nm.trim(), gateway: gw.trim(),
      ...(kind === 'bacnet' ? { device: Number(dev) || 30 + count } : {}),
      covers: 0, coversOf: kind === 'bacnet' ? 90 : 0, subscriptions: 0, running: true, uptimeH: 0, lastReadSec: 3, pushed: 0, lastPushSec: 0, startedAt: Date.now(),
    });
  };
  return (
    <Modal open onClose={onClose} title={t('integration.addTitle')} subtitle={t('integration.addBody')} width={480}
      footer={<><Button onClick={onClose}>{t('common.cancel')}</Button><Button variant="primary" icon={Plus} onClick={submit}>{t('integration.addCreate')}</Button></>}>
      <div className="stack">
        <div className="field"><span className="field__label">{t('integration.addType')}</span>
          <Select label={t('integration.addType')} value={kind} onChange={setKind}
            options={[{ value: 'bacnet', label: t('integration.kind.bacnet') }, { value: 'home-assistant', label: t('integration.kind.home-assistant') }]} /></div>
        <div>
          <TextField label={t('integration.addName')} value={nm} onChange={setNm} placeholder={t('integration.addNamePh')} />
          {tried && nameErr && <p className="intg__err" role="alert">{t('integration.addNameReq')}</p>}
        </div>
        <div>
          <TextField label={t('integration.addGateway')} value={gw} onChange={setGw} dir="ltr" placeholder="10.20.1.10" />
          {tried && gwErr && <p className="intg__err" role="alert">{t('integration.addGwReq')}</p>}
        </div>
        {kind === 'bacnet' && <TextField label={t('integration.addDevice')} value={dev} onChange={setDev} type="number" dir="ltr" />}
      </div>
    </Modal>
  );
}
