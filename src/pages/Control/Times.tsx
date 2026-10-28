import { useState } from 'react';
import { CalendarClock, Search } from 'lucide-react';
import { Button, DataTable, Drawer, InfoTip, TextField, Toggle, type Column } from '../../components';
import { useI18n } from '../../i18n';
import { TimeField } from './TimeField';
import { SWITCHABLE, weekHours, spanHours, type ControlModel, type DaySpan, type Thing } from './model';
import type { Commit } from './index';

const DAYS = [0, 1, 2, 3, 4, 5, 6];

export function Times({ ctl, commit }: { ctl: ControlModel; commit: Commit }) {
  const { t, pick, fmtNumber } = useI18n();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Thing | null>(null);
  const pool = ctl.things.filter((x) => SWITCHABLE.includes(x.kind) && x.kind !== 'switch');
  const s = q.trim().toLowerCase();
  const rows = pool.filter((x) => !s || x.nameEn.toLowerCase().includes(s) || x.nameAr.includes(s));
  const withTimes = pool.filter((x) => ctl.timesOf(x));
  const totalH = withTimes.reduce((a, x) => a + weekHours(ctl.timesOf(x)!), 0);

  const describe = (tm: DaySpan[] | null) => {
    if (!tm) return <span className="faint">{t('control.times.notSet')}</span>;
    const on = tm.filter((d) => d.on);
    const same = on.every((d) => d.from === on[0]?.from && d.to === on[0]?.to);
    if (on.length === 7 && same) return t('control.times.daily', { from: on[0].from, to: on[0].to });
    if (same && on.length) {
      const days = DAYS.filter((d) => tm[d].on).map((d) => t(`control.dayShort.${d}`)).join(', ');
      return t('control.times.someDays', { days, from: on[0].from, to: on[0].to });
    }
    return t('control.times.mixed', { n: fmtNumber(on.length) });
  };

  const cols: Column<Thing>[] = [
    { key: 'name', header: t('control.times.colThing'), sortable: true, value: (x) => pick(x.nameEn, x.nameAr), render: (x) => pick(x.nameEn, x.nameAr) },
    { key: 'where', sortable: false, header: t('control.times.colWhere'), hideOnMobile: true, render: (x) => <span className="muted">{pick(x.areaEn, x.areaAr)}</span> },
    { key: 'times', sortable: false, header: t('control.times.colTimes'), render: (x) => <span className="num">{describe(ctl.timesOf(x))}</span> },
    { key: 'h', header: t('control.times.colHours'), align: 'end', sortable: true, hideOnMobile: true, value: (x) => { const tm = ctl.timesOf(x); return tm ? weekHours(tm) : 0; },
      render: (x) => { const tm = ctl.timesOf(x); return <span className="num">{tm ? fmtNumber(weekHours(tm)) : ''}</span>; } },
    { key: 'edit', sortable: false, header: <span className="visually-hidden">{t('control.times.edit')}</span>, align: 'end',
      render: (x) => <Button size="sm" icon={CalendarClock} onClick={() => setEdit(x)}>{t('control.times.edit')}</Button> },
  ];

  return (
    <div className="stack">
      <div className="ctl__toolbar">
        <div className="ctl__search"><TextField label={t('control.findThing')} hideLabel placeholder={t('control.findThing')} value={q} onChange={setQ} icon={Search} /></div>
      </div>
      <div className="ctl__summary">
        <span className="ctl__chip">{t('control.times.summary', { n: fmtNumber(withTimes.length), m: fmtNumber(pool.length) })}</span>
        <span className="ctl__chip">{t('control.times.hours', { h: fmtNumber(Math.round(totalH)) })}</span>
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(x) => x.id} dense pageSize={20} empty={pool.length ? t('control.noMatch') : t('control.times.empty')} />
      {edit && <TimesEditor key={edit.id} x={edit} initial={ctl.timesOf(edit) ?? ctl.defTimes} hadTimes={!!ctl.timesOf(edit)} onClose={() => setEdit(null)}
        onSave={(tm) => { commit(t('control.history.times', { name: pick(edit.nameEn, edit.nameAr) }), [ctl.ctlOp(`t:${edit.id}`, tm)]); setEdit(null); }} />}
    </div>
  );
}

function TimesEditor({ x, initial, hadTimes, onClose, onSave }: { x: Thing; initial: DaySpan[]; hadTimes: boolean; onClose: () => void; onSave: (t: DaySpan[] | null) => void }) {
  const { t, pick, fmtNumber, fmtDuration } = useI18n();
  const [tm, setTm] = useState<DaySpan[]>(initial.map((d) => ({ ...d })));
  const set = (i: number, f: Partial<DaySpan>) => setTm((a) => a.map((d, j) => (j === i ? { ...d, ...f } : d)));
  return (
    <Drawer open onClose={onClose} title={t('control.times.editTitle')} subtitle={pick(x.nameEn, x.nameAr)} width={480}
      footer={<>
        {hadTimes && <Button variant="ghost" onClick={() => onSave(null)}>{t('control.times.clear')}</Button>}
        <Button onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" onClick={() => onSave(tm)}>{t('control.times.save')}</Button>
      </>}>
      <div className="stack">
        <div className="row-between">
          <span className="row" style={{ gap: 6 }}><span className="num">{t('control.times.weekTotal', { h: fmtNumber(weekHours(tm)) })}</span><InfoTip text={t('control.times.info')} /></span>
        </div>
        <ul className="week">
          {tm.map((d, i) => (
            <li key={i} className={`week__row ${d.on ? '' : 'is-off'}`}>
              <span className="week__day">{t(`control.day.${i}`)}</span>
              <Toggle checked={d.on} label={`${t(`control.day.${i}`)}: ${t('control.times.open')}`} onChange={(v) => set(i, { on: v })} />
              {d.on ? (
                <span className="week__times">
                  <TimeField className="week__time" value={d.from} label={`${t(`control.day.${i}`)} ${t('control.times.from')}`} onChange={(v) => set(i, { from: v })} />
                  <span className="faint">{t('control.times.to')}</span>
                  <TimeField className="week__time" value={d.to} label={`${t(`control.day.${i}`)} ${t('control.times.to')}`} onChange={(v) => set(i, { to: v })} />
                  <span className="num faint week__h">{fmtDuration(spanHours(d) * 3600)}</span>
                </span>
              ) : <span className="faint">{t('control.times.off')}</span>}
            </li>
          ))}
        </ul>
      </div>
    </Drawer>
  );
}
