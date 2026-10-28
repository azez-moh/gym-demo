import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, ConfirmDialog, DataTable, KpiTile, PageHeader, StatusBadge, type Column } from '../../components';
import { useDemo } from '../../data/store';
import { useI18n } from '../../i18n';
import type { Camera } from '../../data/types';
import { CameraForm } from '../Cameras/vision/CameraForm';
import { StreamAddress } from '../Cameras/vision/StreamAddress';
import { Toast, useToast } from '../Cameras/vision/BlurChip';
import { feedOf, useVision } from '../Cameras/vision/model';
import '../Cameras/vision/vision.css';
import './cameraList.css';

type Row = Camera & { zones: number; idx: number };

export default function CameraListPage() {
  const { t, pick, fmtNumber } = useI18n();
  const { remove } = useDemo();
  const v = useVision();
  const [edit, setEdit] = useState<Camera | null | 'new'>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [toast, setToast] = useToast();

  const rows = useMemo<Row[]>(() => v.cameras.map((c, idx) => ({ ...c, idx, zones: v.zonesByCam.get(c.id)?.length ?? 0 })), [v.cameras, v.zonesByCam]);
  const online = rows.filter((r) => r.online).length;
  const empty = rows.filter((r) => r.zones === 0).length;

  const columns: Column<Row>[] = [
    {
      key: 'name', header: t('cameraList.col.camera'), value: (r) => r.idx,
      render: (r) => (
        <span className="vis-name">
          <span className="cl__name">{pick(r.nameEn, r.nameAr)}{r.isTest && <Badge>{t('cameras.testTag')}</Badge>}</span>
          <span className="faint cl__area">{pick(r.areaEn, r.areaAr)}</span>
        </span>
      ),
    },
    {
      key: 'stream', header: t('cameraList.col.stream'), sortable: false,
      render: (r) => (
        <span className="cl__stream">
          <span className="cl__feed">{t(`cameraList.feed.${feedOf(r)}`)}</span>
          <StreamAddress url={r.stream} />
        </span>
      ),
    },
    {
      key: 'status', header: t('cameraList.col.status'), value: (r) => (r.online ? 1 : 0),
      render: (r) => (r.online ? <StatusBadge status="online" label={t('cameraList.enabled')} /> : <StatusBadge status="offline" label={t('cameraList.offline')} />),
    },
    {
      key: 'zones', header: t('cameraList.col.zones'), align: 'end', value: (r) => r.zones,
      render: (r) => (r.zones > 0
        ? <span className="num">{fmtNumber(r.zones)}</span>
        : <span className="cl__none"><span className="num">0</span><Badge tone="warning">{t('cameraList.notWatching')}</Badge></span>),
    },
    {
      key: 'actions', header: <span className="visually-hidden">{t('cameraList.col.actions')}</span>, sortable: false, align: 'end',
      render: (r) => (
        <span className="cl__actions">
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEdit(r)} aria-label={`${t('cameraList.edit')}: ${pick(r.nameEn, r.nameAr)}`}>{t('cameraList.edit')}</Button>
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDel(r)} aria-label={`${t('cameraList.remove')}: ${pick(r.nameEn, r.nameAr)}`}>{t('cameraList.remove')}</Button>
        </span>
      ),
    },
  ];

  const confirmRemove = () => {
    if (!del) return;
    // zones on the camera go with it (the reference build removes the camera's zones)
    for (const z of v.zonesByCam.get(del.id) ?? []) remove('zones', z.id);
    remove('cameras', del.id);
    setToast(t('cameraList.removed', { name: pick(del.nameEn, del.nameAr) }));
    setDel(null);
  };

  const delName = del ? pick(del.nameEn, del.nameAr) : '';
  const delBody = !del ? '' : del.zones === 0 ? t('cameraList.confirmBodyNone', { name: delName })
    : del.zones === 1 ? t('cameraList.confirmBodyZone1', { name: delName })
    : t('cameraList.confirmBodyZones', { name: delName, n: fmtNumber(del.zones) });

  return (
    <div className="page">
      <PageHeader title={t('cameraList.title')} actions={<Button variant="primary" icon={Plus} onClick={() => setEdit('new')}>{t('cameraList.addCamera')}</Button>} />
      <p className="vis-lede">{t('cameraList.lede')}</p>

      <div className="vis-kpis">
        <KpiTile label={t('cameraList.kpi.cameras')} value={fmtNumber(rows.length)} info={t('cameraList.kpi.camerasInfo')} />
        <KpiTile live label={t('cameraList.kpi.online')} value={`${fmtNumber(online)} / ${fmtNumber(rows.length)}`} info={t('cameraList.kpi.onlineInfo')} />
        <KpiTile label={t('cameraList.kpi.zones')} value={fmtNumber(v.zones.length)} info={t('cameraList.kpi.zonesInfo')} />
        <KpiTile label={t('cameraList.kpi.noZones')} value={fmtNumber(empty)} info={t('cameraList.kpi.noZonesInfo')} />
      </div>

      <div className="cl">
        <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} pageSize={50} caption={t('cameraList.title')} />
      </div>

      <CameraForm open={edit !== null} camera={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={setToast} />
      <ConfirmDialog open={!!del} onCancel={() => setDel(null)} onConfirm={confirmRemove}
        title={t('cameraList.confirmTitle')} body={delBody} confirmLabel={t('cameraList.remove')} />
      <Toast msg={toast} />
    </div>
  );
}
