import { useState } from 'react';
import { Eye, Zap, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, ConfirmDialog, InfoTip, Segmented, Toggle } from '../../components';
import { useI18n } from '../../i18n';
import { useDemo, agentsOf } from '../../data';
import { useSaveBms, useSavedLine } from './saved';

type Row = ReturnType<typeof agentsOf>[number];
type Pending = { kind: 'control'; rows: Row[] } | { kind: 'stop'; row: Row } | null;

export function AgentsTab({ clubId }: { clubId: string }) {
  const { t, pick, fmtNumber } = useI18n();
  const data = useDemo();
  const save = useSaveBms();
  const savedLine = useSavedLine();
  const rows = agentsOf(data, clubId);
  const [pending, setPending] = useState<Pending>(null);
  const key = (r: Row) => `${clubId}:${r.id}`;

  const setState = (r: Row, f: Record<string, unknown>) => { data.patch('agentStates', key(r), f); save({}); };
  const setMode = (r: Row, mode: 'read' | 'control') => {
    if (mode === 'control') setPending({ kind: 'control', rows: [r] });
    else setState(r, { mode });
  };
  const allRead = () => { rows.filter((r) => !r.readOnly && r.state.mode !== 'read').forEach((r) => data.patch('agentStates', key(r), { mode: 'read' })); save({}); };
  const allControl = () => setPending({ kind: 'control', rows: rows.filter((r) => !r.readOnly && r.state.mode !== 'control') });

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'control') { pending.rows.forEach((r) => data.patch('agentStates', key(r), { mode: 'control' })); save({}); }
    else setState(pending.row, { running: false });
    setPending(null);
  };

  const running = rows.filter((r) => r.state.running).length;
  const control = rows.filter((r) => r.state.running && r.state.mode === 'control' && !r.readOnly).length;

  return (
    <div className="stack">
      <Card title={t('bmsSettings.modes')} info={t('bmsSettings.modesInfo')}
        actions={<>
          <Button size="sm" icon={Eye} onClick={allRead}>{t('bmsSettings.allRead')}</Button>
          <Button size="sm" icon={Zap} onClick={allControl}>{t('bmsSettings.allControl')}</Button>
        </>}>
        <div className="stack">
          <div className="bmss__modes">
            <div className="bmss__mode"><Eye aria-hidden /><span>{t('bmsSettings.readOnly')}</span><InfoTip text={t('bmsSettings.readOnlyInfo')} /></div>
            <div className="bmss__mode"><Zap aria-hidden /><span>{t('bmsSettings.readControl')}</span><InfoTip text={t('bmsSettings.readControlInfo')} /></div>
            <div className="bmss__mode bmss__mode--fire"><ShieldCheck aria-hidden /><span>{t('bmsSettings.fireNote')}</span><InfoTip text={t('bmsSettings.fireInfo')} /></div>
          </div>
          <div className="dt">
            <div className="dt__scroll">
              <table>
                <thead><tr>
                  <th><span className="dt__th">{t('bmsSettings.colAgent')}</span></th>
                  <th className="bmss__hide-sm"><span className="dt__th">{t('bmsSettings.colWatches')}</span></th>
                  <th className="dt--center"><span className="dt__th">{t('bmsSettings.colRunning')}</span></th>
                  <th className="dt--end"><span className="dt__th">{t('bmsSettings.colMode')}</span></th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => {
                    const name = pick(r.nameEn, r.nameAr);
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="bmss__agent">
                            <span className="num faint">{r.num}</span>
                            <span>{name}</span>
                            {!r.state.connected && <Badge tone="neutral">{t('bmsSettings.notConnected')}</Badge>}
                            {r.readOnly && <InfoTip text={t('bmsSettings.fireInfo')} />}
                          </div>
                        </td>
                        <td className="bmss__hide-sm muted bmss__watch">
                          {pick(r.descEn, r.descAr)}
                          {r.state.connected && r.state.watching > 0 && <span className="faint num"> · {t(r.state.watching === 1 ? 'bmsSettings.watchingOne' : 'bmsSettings.watching', { n: fmtNumber(r.state.watching) })}</span>}
                        </td>
                        <td className="dt--center">
                          <span className="bmss__center"><Toggle checked={r.state.running} label={t('bmsSettings.runningLabel', { name })}
                            onChange={(v) => (v ? setState(r, { running: true }) : setPending({ kind: 'stop', row: r }))} /></span>
                        </td>
                        <td className="dt--end">
                          <span className="bmss__end">
                            <Segmented size="sm" ariaLabel={t('bmsSettings.modeLabel', { name })} value={r.state.mode} onChange={(m) => setMode(r, m)}
                              options={[{ value: 'read', label: t('bmsSettings.readOnly'), disabled: r.readOnly }, { value: 'control', label: t('bmsSettings.readControl'), disabled: r.readOnly }]} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="row-between bmss__foot">
            <span className="muted num">{t('bmsSettings.summary', { running: fmtNumber(running), total: fmtNumber(rows.length), control: fmtNumber(control) })}</span>
            <span className="faint">{savedLine}</span>
          </div>
        </div>
      </Card>
      <ConfirmDialog open={!!pending} onCancel={() => setPending(null)} onConfirm={confirm}
        tone={pending?.kind === 'stop' ? 'danger' : 'primary'}
        title={!pending ? '' : pending.kind === 'control' ? t('bmsSettings.confirmControlTitle') : t('bmsSettings.confirmStopTitle', { name: pick(pending.row.nameEn, pending.row.nameAr) })}
        body={!pending ? '' : pending.kind === 'stop' ? t('bmsSettings.confirmStopBody', { name: pick(pending.row.nameEn, pending.row.nameAr) })
          : pending.rows.length === 0 ? t('bmsSettings.confirmControlNone')
          : pending.rows.length === 1 ? t('bmsSettings.confirmControlOne', { name: pick(pending.rows[0].nameEn, pending.rows[0].nameAr) })
          : t('bmsSettings.confirmControlAll', { names: pending.rows.map((r) => pick(r.nameEn, r.nameAr)).join(', ') })}
        confirmLabel={pending?.kind === 'stop' ? t('bmsSettings.confirmStopBtn') : t('bmsSettings.confirmControlBtn')} />
    </div>
  );
}
