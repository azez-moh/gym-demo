import { useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { EmptyState, InfoTip, TextField } from '../../components';
import { useI18n } from '../../i18n';
import type { ControlModel } from './model';

export function Boards({ ctl }: { ctl: ControlModel }) {
  const { t, pick, fmtNumber } = useI18n();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set(ctl.boards.slice(0, 1).map((b) => b.id)));
  const s = q.trim().toLowerCase();
  const wired = ctl.things.filter((x) => x.mains);
  const off = wired.filter((x) => !x.board).length;
  const totalWays = ctl.boards.reduce((a, b) => a + b.ways, 0);

  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="stack">
      <div className="ctl__toolbar">
        <div className="ctl__search"><TextField label={t('control.findThing')} hideLabel placeholder={t('control.findThing')} value={q} onChange={setQ} icon={Search} /></div>
      </div>
      <div className="ctl__summary">
        <span className="ctl__chip">{t('control.boards.summary', { boards: fmtNumber(ctl.boards.length) })}</span>
        <span className="ctl__chip">{t('control.boards.ways', { n: fmtNumber(totalWays) })}</span>
        <span className={`ctl__chip ${off ? 'is-warn' : 'is-ok'}`}><span className="ctl__dot" aria-hidden />
          {off === 0 ? t('control.boards.allOnWay') : off === 1 ? t('control.boards.notOnWayOne') : t('control.boards.notOnWay', { n: fmtNumber(off) })}</span>
        <span className="row muted ctl__intro" style={{ gap: 6 }}>{t('control.boards.intro')}<InfoTip text={t('control.boards.info')} /></span>
      </div>
      {ctl.boards.length === 0 && <EmptyState compact title={t('control.boards.empty')} />}
      <div className="ctl__groups">
        {ctl.boards.map((b) => {
          const on = wired.filter((x) => x.board === b.id).sort((a, z) => (a.way ?? 0) - (z.way ?? 0));
          const watts = on.reduce((a, x) => a + x.watts, 0);
          const pct = Math.round((watts / (b.ratingA * 230 * 3)) * 100);
          const ways = Array.from({ length: b.ways }, (_, i) => ({ n: i + 1, thing: on.find((x) => x.way === i + 1) }));
          const shown = s ? ways.filter((w) => w.thing && (w.thing.nameEn.toLowerCase().includes(s) || w.thing.nameAr.includes(s))) : ways;
          if (s && !shown.length) return null;
          const isOpen = open.has(b.id) || !!s;
          return (
            <section key={b.id} className="ctl__grp">
              <div className="ctl__grphead">
                <button type="button" className="ctl__grptoggle" aria-expanded={isOpen} onClick={() => toggle(b.id)}>
                  <ChevronDown aria-hidden className={`ctl__chev ${isOpen ? '' : 'is-closed'}`} />
                  <span className="ctl__grpname">{pick(b.nameEn, b.nameAr)}</span>
                  <span className="ctl__hint">{t('control.boards.rating', { a: fmtNumber(b.ratingA) })} · {t('control.boards.used', { n: fmtNumber(on.length), m: fmtNumber(b.ways) })}</span>
                </button>
                <div className="ctl__meter" title={t('control.boards.load', { pct: fmtNumber(pct) })}>
                  <span className="ctl__meterbar"><span style={{ inlineSize: `${Math.min(100, pct)}%` }} className={pct > 85 ? 'is-bad' : ''} /></span>
                  <span className="num muted">{t('control.boards.load', { pct: fmtNumber(pct) })}</span>
                </div>
              </div>
              {isOpen && (
                <div className="dt__scroll ctl__waytable">
                  <table className="dt">
                    <thead><tr><th><span className="dt__th">{t('control.boards.way')}</span></th><th><span className="dt__th">{t('control.boards.thing')}</span></th><th className="dt--end"><span className="dt__th">{t('control.boards.watts')}</span></th></tr></thead>
                    <tbody>
                      {shown.map((w) => (
                        <tr key={w.n}>
                          <td className="num" style={{ inlineSize: 64 }}>{fmtNumber(w.n)}</td>
                          <td>{w.thing ? <>{pick(w.thing.nameEn, w.thing.nameAr)} <span className="faint">· {pick(w.thing.floorEn, w.thing.floorAr)}</span></> : <span className="faint">{t('control.boards.spare')}</span>}</td>
                          <td className="dt--end num">{w.thing ? fmtNumber(w.thing.watts) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
