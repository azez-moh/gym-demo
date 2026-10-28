import { useState } from 'react';
import { Search } from 'lucide-react';
import { DataTable, Select, TextField, type Column } from '../../components';
import { useI18n } from '../../i18n';
import { FLOORS, WIRED_KINDS, type ControlModel, type Kind, type Thing } from './model';

export function Schedule({ ctl }: { ctl: ControlModel }) {
  const { t, pick, fmtNumber } = useI18n();
  const [kind, setKind] = useState<'all' | Kind>('all');
  const [floor, setFloor] = useState('all');
  const [unwired, setUnwired] = useState(false);
  const [q, setQ] = useState('');
  const pool = ctl.things.filter((x) => WIRED_KINDS.includes(x.kind));
  const nUnwired = pool.filter((x) => !x.board).length;
  const s = q.trim().toLowerCase();
  const rows = pool.filter((x) => (kind === 'all' || x.kind === kind) && (floor === 'all' || x.floorEn === floor)
    && (!unwired || !x.board) && (!s || x.nameEn.toLowerCase().includes(s) || x.nameAr.includes(s)));
  const watts = rows.reduce((a, x) => a + x.watts, 0);
  const boardName = (id?: string) => { const b = ctl.boards.find((x) => x.id === id); return b ? pick(b.nameEn, b.nameAr) : ''; };
  const wattsTxt = watts >= 10000 ? `${fmtNumber(watts / 1000, 1)} kW` : `${fmtNumber(watts)} W`;

  const cols: Column<Thing>[] = [
    { key: 'name', header: t('control.sched.colThing'), sortable: true, value: (x) => pick(x.nameEn, x.nameAr), render: (x) => pick(x.nameEn, x.nameAr) },
    { key: 'kind', header: t('control.sched.kind'), hideOnMobile: true, value: (x) => t(`control.kind.${x.kind}`), render: (x) => <span className="muted">{t(`control.kind.${x.kind}`)}</span> },
    { key: 'where', header: t('control.sched.colWhere'), hideOnMobile: true, value: (x) => pick(x.floorEn, x.floorAr), render: (x) => <span className="muted">{pick(x.areaEn, x.areaAr)} · {pick(x.floorEn, x.floorAr)}</span> },
    { key: 'board', header: t('control.sched.colBoard'), value: (x) => `${x.board ?? 'z'}${String(x.way ?? 0).padStart(3, '0')}`, sortable: true,
      render: (x) => x.board ? <span className="num">{boardName(x.board)} · {x.way}</span> : <span className="ctl__state is-warn">{t('control.sched.notWired')}</span> },
    { key: 'w', header: t('control.sched.colWatts'), align: 'end', sortable: true, value: (x) => x.watts, render: (x) => <span className="num">{fmtNumber(x.watts)}</span> },
  ];

  return (
    <div className="stack">
      <div className="ctl__toolbar">
        <Select label={t('control.sched.kind')} value={kind} onChange={setKind}
          options={[{ value: 'all' as const, label: `${t('control.sched.kindAll')} (${fmtNumber(pool.length)})` },
            ...WIRED_KINDS.map((k) => ({ value: k, label: `${t(`control.kind.${k}`)} (${fmtNumber(pool.filter((x) => x.kind === k).length)})` }))]} />
        <Select label={t('control.floor')} value={floor} onChange={setFloor}
          options={[{ value: 'all', label: t('control.floorAll') }, ...FLOORS.map((f) => ({ value: f.en, label: pick(f.en, f.ar) }))]} />
        <label className="ctl__check">
          <input type="checkbox" checked={unwired} onChange={(e) => setUnwired(e.target.checked)} />
          <span>{t('control.sched.unwired')} <span className="num faint">({fmtNumber(nUnwired)})</span></span>
        </label>
        <div className="ctl__search"><TextField label={t('control.findThing')} hideLabel placeholder={t('control.findThing')} value={q} onChange={setQ} icon={Search} /></div>
      </div>
      <div className="ctl__summary">
        <span className="ctl__chip">{t('control.sched.summary', { n: fmtNumber(rows.length), m: fmtNumber(pool.length) })}</span>
        <span className="ctl__chip">{t('control.sched.watts', { w: wattsTxt })}</span>
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(x) => x.id} dense pageSize={20} empty={t('control.sched.empty')} />
    </div>
  );
}
