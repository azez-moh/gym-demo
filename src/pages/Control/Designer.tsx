import { ArrowLeft } from 'lucide-react';
import { Button, Card, DataTable, PageHeader, type Column } from '../../components';
import { useI18n } from '../../i18n';
import type { Area } from '../../data';
import { FLOORS, type ControlModel } from './model';

/** Building designer (ST-26): unaudited in the reference build, so a clean read-only page with its purpose and floors. */
export function Designer({ ctl, onBack }: { ctl: ControlModel; onBack: () => void }) {
  const { t, pick, fmtNumber } = useI18n();
  const acs = ctl.things.filter((x) => x.kind === 'ac');
  const lights = ctl.things.filter((x) => x.kind === 'light');
  const floors = FLOORS.filter((f) => ctl.areas.some((a) => a.floorEn === f.en));
  const cols: Column<Area>[] = [
    { key: 'name', sortable: false, header: t('control.designer.area'), render: (a) => pick(a.nameEn, a.nameAr) },
    { key: 'm2', sortable: false, header: t('control.designer.size'), align: 'end', render: (a) => <span className="num">{fmtNumber(a.m2)} m²</span> },
    { key: 'ac', sortable: false, header: t('control.designer.ac'), align: 'end', render: (a) => <span className="num">{fmtNumber(acs.filter((x) => x.areaId === a.id).length)}</span> },
    { key: 'l', sortable: false, header: t('control.designer.lights'), align: 'end', hideOnMobile: true, render: (a) => <span className="num">{fmtNumber(lights.filter((x) => x.areaId === a.id).length)}</span> },
    { key: 's', sortable: false, header: t('control.designer.people'), align: 'end', hideOnMobile: true, render: (a) => <span className="num">{fmtNumber(Math.round(a.share * 100))}%</span> },
  ];
  return (
    <div className="page ctl">
      <div><Button variant="ghost" size="sm" icon={ArrowLeft} className="ctl__back flip-icon-rtl" onClick={onBack}>{t('control.designer.back')}</Button></div>
      <PageHeader eyebrow={pick(ctl.club.nameEn, ctl.club.nameAr)} title={t('control.designer.title')} />
      <p className="muted" style={{ maxWidth: '70ch' }}>{t('control.designer.purpose')} <span className="num">{t('control.designer.floors', { n: fmtNumber(floors.length) })}</span></p>
      {floors.map((f) => (
        <Card key={f.en} title={pick(f.en, f.ar)} info={t('control.designer.floorInfo')} pad="md">
          <DataTable rows={ctl.areas.filter((a) => a.floorEn === f.en)} columns={cols} rowKey={(a) => a.id} dense />
        </Card>
      ))}
    </div>
  );
}
