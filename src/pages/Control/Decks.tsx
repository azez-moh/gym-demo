import { useMemo, useState } from 'react';
import { ChevronDown, Flame, RefreshCw, Search, ShieldAlert, Droplets } from 'lucide-react';
import { Button, ConfirmDialog, InfoTip, Select, Segmented, TextField, Toggle } from '../../components';
import { useI18n } from '../../i18n';
import { FLOORS, onAt, type CircuitLevel, type ControlModel, type Kind, type Op, type Thing } from './model';
import type { Commit } from './index';
import { readingOf } from './DataTab';

type GroupId = 'data' | 'machines' | 'sensors' | 'fans' | 'lights' | 'switches' | 'circuits' | 'fireAlarm' | 'fireFighting' | 'doors' | 'windows' | 'barriers';

interface Action { key: string; value?: boolean | CircuitLevel; tone?: 'danger'; special?: 'clear' | 'reset' }
interface GroupDef { id: GroupId; kinds: Kind[]; actions: Action[]; safety?: boolean }

const GROUPS: GroupDef[] = [
  { id: 'data', kinds: [], actions: [] },
  { id: 'machines', kinds: ['ac'], actions: [{ key: 'allOn', value: true }, { key: 'allOff', value: false }] },
  { id: 'sensors', kinds: ['sensor'], actions: [] },
  { id: 'fans', kinds: ['fan'], actions: [{ key: 'allOn', value: true }, { key: 'allOff', value: false }] },
  { id: 'lights', kinds: ['light'], actions: [{ key: 'allOn', value: true }, { key: 'allOff', value: false }] },
  { id: 'switches', kinds: ['switch'], actions: [{ key: 'allOn', value: true }, { key: 'allOff', value: false }] },
  { id: 'circuits', kinds: ['circuit'], actions: [{ key: 'allOn', value: 'full' }, { key: 'allOff', value: 'off' }, { key: 'full', value: 'full' }, { key: 'half', value: 'half' }] },
  { id: 'fireAlarm', kinds: ['detector'], actions: [{ key: 'clearAlarm', tone: 'danger', special: 'clear' }], safety: true },
  { id: 'fireFighting', kinds: ['head'], actions: [{ key: 'resetHeads', tone: 'danger', special: 'reset' }], safety: true },
  { id: 'doors', kinds: ['door'], actions: [{ key: 'openAll', value: true }, { key: 'closeAll', value: false }] },
  { id: 'windows', kinds: ['window'], actions: [{ key: 'openAll', value: true }, { key: 'shutAll', value: false }] },
  { id: 'barriers', kinds: ['barrier'], actions: [{ key: 'openAll', value: true }, { key: 'closeAll', value: false }] },
];

type Pending = { group: GroupDef; action: Action; items: Thing[]; ops: Op[] };

export function Decks({ ctl, commit, say }: { ctl: ControlModel; commit: Commit; say: (m: string) => void }) {
  const { t, pick, fmtNumber } = useI18n();
  const [q, setQ] = useState('');
  const [floor, setFloor] = useState('all');
  const [open, setOpen] = useState<Set<GroupId>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return ctl.things.filter((x) => (floor === 'all' || x.floorEn === floor)
      && (!s || x.nameEn.toLowerCase().includes(s) || x.nameAr.includes(s) || x.areaEn.toLowerCase().includes(s) || x.areaAr.includes(s)));
  }, [ctl.things, q, floor]);

  const of = (k: Kind) => visible.filter((x) => x.kind === k);
  const count = (k: Kind) => of(k).filter(ctl.isOn).length;
  const peopleSensors = of('sensor').filter((x) => (ctl.presence.get(x.areaId) ?? 0) > 0).length;
  const contacts = of('door').length + of('window').length;
  const dataItems = visible.filter((x) => { const s = ctl.sourceOf(x); return s.sim || s.entity; });

  const chips = {
    equipment: [
      { txt: t('control.chip.running', { n: fmtNumber(count('ac')) }), on: count('ac') > 0 },
      { txt: t('control.chip.fans', { n: fmtNumber(count('fan')) }) },
      { txt: t('control.chip.lights', { n: fmtNumber(count('light')) }) },
      { txt: t('control.chip.switches', { n: fmtNumber(count('switch')), m: fmtNumber(of('switch').length) }) },
    ],
    people: [{ txt: t('control.chip.people', { n: fmtNumber(peopleSensors) }) }],
    fire: [
      ctl.alarm === 'clear' ? { txt: t('control.chip.alarmClear'), on: true } : { txt: t('control.chip.alarmOn'), bad: true },
      ctl.heads === 'ready' ? { txt: t('control.chip.sprinklersReady'), on: true } : { txt: t('control.chip.sprinklersOff'), bad: true },
    ],
    openings: [
      { txt: t('control.chip.contacts', { n: fmtNumber(contacts) }) },
      { txt: t('control.chip.doors', { n: fmtNumber(count('door')) }), warn: count('door') > 0 },
      { txt: t('control.chip.windows', { n: fmtNumber(count('window')) }), warn: count('window') > 0 },
      { txt: t('control.chip.barriers', { n: fmtNumber(count('barrier')) }), warn: count('barrier') > 0 },
    ],
  };

  const toggleGroup = (id: GroupId) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const ask = (group: GroupDef, action: Action) => {
    const items = group.kinds.flatMap((k) => of(k));
    const ops = action.value !== undefined ? items.map((x) => ctl.opFor(x, action.value!)).filter(Boolean) as Op[] : [];
    setPending({ group, action, items, ops });
  };

  const confirm = () => {
    if (!pending) return;
    const { group, action, ops } = pending;
    const gName = t(`control.g.${group.id}`);
    if (action.special === 'clear') commit(t('control.history.clear'), [ctl.ctlOp('alarm', 'clear')]);
    else if (action.special === 'reset') commit(t('control.history.reset'), [ctl.ctlOp('heads', 'ready')]);
    else commit(t('control.history.bulk', { action: t(`control.act.${action.key}`), group: gName }), ops);
    setPending(null);
  };

  const sync = () => {
    const { dow, minuteOfDay } = ctl.nowParts;
    const ops: (Op | null)[] = [];
    for (const x of ctl.things) {
      const tm = ctl.timesOf(x);
      if (!tm) continue;
      const want = onAt(tm, dow, minuteOfDay);
      ops.push(ctl.opFor(x, x.kind === 'circuit' ? (want ? 'full' : 'off') : want));
    }
    const n = ops.filter(Boolean).length;
    commit(t('control.history.sync'), ops);
    say(n ? t('control.synced', { n: fmtNumber(n) }) : t('control.syncedNone'));
  };

  const floorOpts = [{ value: 'all', label: t('control.floorAll') }, ...FLOORS.map((f) => ({ value: f.en, label: pick(f.en, f.ar) }))];

  return (
    <div className="stack">
      <div className="ctl__toolbar">
        <span className="row" style={{ gap: 6 }}>
          <Button variant="primary" icon={RefreshCw} onClick={sync}>{t('control.sync')}</Button>
          <InfoTip text={t('control.syncInfo')} />
        </span>
        <div className="ctl__search"><TextField label={t('control.find')} hideLabel placeholder={t('control.find')} value={q} onChange={setQ} icon={Search} /></div>
        <Select label={t('control.floor')} value={floor} options={floorOpts} onChange={setFloor} />
      </div>

      <div className="ctl__status" aria-label={t('control.statusLabel')}>
        {(Object.keys(chips) as (keyof typeof chips)[]).map((g) => (
          <div key={g} className="ctl__statusgrp">
            <span className="label">{t(`control.grp.${g}`)}</span>
            <div className="ctl__chips">
              {chips[g].map((c, i) => {
                const cc = c as { txt: string; on?: boolean; bad?: boolean; warn?: boolean };
                return (
                  <span key={i} className={`ctl__chip ${cc.bad ? 'is-bad' : cc.warn ? 'is-warn' : cc.on ? 'is-ok' : ''}`}>
                    {(cc.bad || cc.warn || cc.on) && <span className="ctl__dot" aria-hidden />}
                    {cc.bad && <ShieldAlert aria-hidden />}
                    {cc.txt}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="ctl__groups">
        {GROUPS.map((g) => {
          const items = g.id === 'data' ? dataItems : g.kinds.flatMap((k) => of(k));
          const isOpen = open.has(g.id);
          const Icon = g.id === 'fireAlarm' ? Flame : g.id === 'fireFighting' ? Droplets : null;
          return (
            <section key={g.id} className={`ctl__grp ${g.safety ? 'is-safety' : ''}`}>
              <div className="ctl__grphead">
                <button type="button" className="ctl__grptoggle" aria-expanded={isOpen} onClick={() => toggleGroup(g.id)}>
                  <ChevronDown aria-hidden className={`ctl__chev ${isOpen ? '' : 'is-closed'}`} />
                  <span className="ctl__grpname">{t(`control.g.${g.id}`)}</span>
                  <span className="ctl__count num">{fmtNumber(items.length)}</span>
                  {Icon && <Icon aria-hidden className="ctl__safeicon" />}
                  <span className="ctl__hint">{items.length ? t(`control.hint.${g.id}`) : t('control.noneHere')}</span>
                </button>
                <InfoTip text={t(`control.hintFull.${g.id}`)} />
                {g.actions.length > 0 && (
                  <div className="ctl__acts">
                    {g.actions.map((a) => (
                      <Button key={a.key} size="sm" variant={a.tone === 'danger' ? 'danger' : 'default'} icon={a.special === 'clear' ? Flame : a.special === 'reset' ? Droplets : undefined}
                        onClick={() => ask(g, a)}>
                        {t(`control.act.${a.key}`)}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
              {isOpen && items.length > 0 && (
                <ul className="ctl__items">
                  {items.map((x) => <ItemRow key={x.id} x={x} g={g.id} ctl={ctl} commit={commit} />)}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <ConfirmDialog
        open={!!pending}
        onCancel={() => setPending(null)}
        onConfirm={confirm}
        tone={pending?.action.tone === 'danger' || pending?.action.value === false || pending?.action.value === 'off' ? 'danger' : 'primary'}
        title={!pending ? '' : pending.action.special === 'clear' ? t('control.confirm.clearTitle')
          : pending.action.special === 'reset' ? t('control.confirm.resetTitle')
          : t('control.confirm.bulkTitle', { action: t(`control.act.${pending.action.key}`), group: t(`control.g.${pending.group.id}`) })}
        body={!pending ? '' : pending.action.special === 'clear' ? t('control.confirm.clearBody', { loops: t('control.loops'), n: fmtNumber(pending.items.length) })
          : pending.action.special === 'reset' ? t('control.confirm.resetBody', { n: fmtNumber(pending.items.length) })
          : pending.ops.length ? t('control.confirm.bulkBody', { n: fmtNumber(pending.ops.length), group: t(`control.g.${pending.group.id}`) })
          : t('control.confirm.bulkNone', { group: t(`control.g.${pending.group.id}`) })}
        confirmLabel={!pending ? undefined : pending.action.special === 'clear' ? t('control.confirm.clearBtn')
          : pending.action.special === 'reset' ? t('control.confirm.resetBtn') : t(`control.act.${pending.action.key}`)}
      />
    </div>
  );
}

function ItemRow({ x, g, ctl, commit }: { x: Thing; g: GroupId; ctl: ControlModel; commit: Commit }) {
  const { t, pick, fmtNumber } = useI18n();
  const name = pick(x.nameEn, x.nameAr);
  const where = `${pick(x.areaEn, x.areaAr)} · ${pick(x.floorEn, x.floorAr)}`;
  let control: JSX.Element;
  if (g === 'data') {
    control = <span className="ctl__state">{readingOf(x, ctl, t, fmtNumber)}</span>;
  } else if (x.kind === 'sensor') {
    const n = ctl.presence.get(x.areaId) ?? 0;
    control = <span className="ctl__state">{n > 0 ? t('control.state.people', { n: fmtNumber(n) }) : t('control.state.empty')}</span>;
  } else if (x.kind === 'detector') {
    control = <span className={`ctl__state ${ctl.alarm === 'alarm' ? 'is-bad' : ''}`}>{t(`control.state.${ctl.alarm}`)}</span>;
  } else if (x.kind === 'head') {
    control = <span className={`ctl__state ${ctl.heads === 'released' ? 'is-bad' : ''}`}>{t(`control.state.${ctl.heads}`)}</span>;
  } else if (x.kind === 'circuit') {
    const v = ctl.stateOf(x) as CircuitLevel;
    control = (
      <Segmented size="sm" ariaLabel={t('control.item.level', { name })} value={v}
        options={[{ value: 'off', label: t('control.state.off') }, { value: 'half', label: t('control.state.half') }, { value: 'full', label: t('control.state.full') }]}
        onChange={(nv) => commit(t('control.history.toggle', { name }), [ctl.opFor(x, nv)])} />
    );
  } else {
    const on = ctl.isOn(x);
    const word = x.kind === 'door' || x.kind === 'barrier' ? (on ? 'open' : 'closed') : x.kind === 'window' ? (on ? 'open' : 'shut') : on ? 'on' : 'off';
    control = (
      <span className="row" style={{ gap: 10 }}>
        <span className="ctl__state">{t(`control.state.${word}`)}</span>
        <Toggle checked={on} label={t('control.item.toggle', { name })} onChange={(v) => commit(t('control.history.toggle', { name }), [ctl.opFor(x, v)])} />
      </span>
    );
  }
  return (
    <li className="ctl__item">
      <span className="ctl__itemtext"><span>{name}</span><span className="faint">{where}</span></span>
      {control}
    </li>
  );
}
