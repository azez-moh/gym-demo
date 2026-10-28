import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useI18n } from '../i18n';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Cell content. Default: String(row[key]). */
  render?: (row: T) => ReactNode;
  /** Value used for sorting and CSV. */
  value?: (row: T) => string | number | null | undefined;
  align?: 'start' | 'end' | 'center';
  sortable?: boolean;
  width?: number | string;
  /** Hidden below 640px. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  empty?: ReactNode;
  dense?: boolean;
  toolbar?: ReactNode;
  /** Shows a "Download CSV" button with this file name (no extension). */
  csvName?: string;
  isHighlighted?: (row: T) => boolean;
  /** Expandable row content (rendered under the row when expanded). */
  renderExpanded?: (row: T) => ReactNode;
  caption?: string;
}

/** CSV with a UTF-8 BOM so Arabic opens correctly in Excel. */
export function exportCsv(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [header, ...rows].map((r) => r.map(esc).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}.csv`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function DataTable<T>({ rows, columns, rowKey, onRowClick, pageSize = 25, initialSort, empty, dense, toolbar, csvName, isHighlighted, renderExpanded, caption }: DataTableProps<T>) {
  const { t, isRtl, fmtNumber } = useI18n();
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const val = col.value ?? ((r: T) => (r as Record<string, unknown>)[col.key] as string | number);
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null) return 1;
      if (y == null) return -1;
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      return sort.dir === 'asc' ? c : -c;
    });
  }, [rows, columns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const p = Math.min(page, pages - 1);
  const view = sorted.slice(p * pageSize, (p + 1) * pageSize);

  const onSort = (key: string) => {
    setPage(0);
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }));
  };

  const csv = () => {
    if (!csvName) return;
    const header = columns.map((c) => (typeof c.header === 'string' ? c.header : c.key));
    const data = sorted.map((r) => columns.map((c) => (c.value ? c.value(r) : ((r as Record<string, unknown>)[c.key] as string | number))));
    exportCsv(csvName, header, data);
  };

  const Prev = isRtl ? ChevronRight : ChevronLeft;
  const Next = isRtl ? ChevronLeft : ChevronRight;
  const alignCls = (c: Column<T>) => `${c.align === 'end' ? 'dt--end' : c.align === 'center' ? 'dt--center' : ''} ${c.hideOnMobile ? 'dt--hide-sm' : ''}`;

  return (
    <div className={`dt ${dense ? 'dt--dense' : ''}`}>
      {(toolbar || csvName) && (
        <div className="dt__toolbar">
          <div className="row">{toolbar}</div>
          {csvName && <button type="button" className="btn btn--sm" onClick={csv}><Download aria-hidden />{t('common.export')}</button>}
        </div>
      )}
      <div className="dt__scroll">
        <table>
          {caption && <caption className="visually-hidden">{caption}</caption>}
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={alignCls(c)} style={{ width: c.width }} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                  {c.sortable !== false ? (
                    <button type="button" className="dt__sort" data-active={sort?.key === c.key} onClick={() => onSort(c.key)}>
                      {c.header}
                      {sort?.key === c.key ? (sort.dir === 'asc' ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />) : <ArrowUpDown aria-hidden />}
                    </button>
                  ) : <span className="dt__th">{c.header}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr><td colSpan={columns.length} className="dt__empty">{empty ?? t('common.noResults')}</td></tr>
            )}
            {view.map((r) => {
              const k = rowKey(r);
              const expanded = open.has(k);
              const click = renderExpanded
                ? () => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })
                : onRowClick ? () => onRowClick(r) : undefined;
              return [
                <tr key={k} data-click={!!click} aria-expanded={renderExpanded ? expanded : undefined} className={isHighlighted?.(r) ? 'is-highlight' : undefined}
                  onClick={click} tabIndex={click ? 0 : undefined} onKeyDown={click ? (e) => { if (e.key === 'Enter') click(); } : undefined}>
                  {columns.map((c) => (
                    <td key={c.key} className={alignCls(c)}>
                      {c.render ? c.render(r) : String((r as Record<string, unknown>)[c.key] ?? '')}
                    </td>
                  ))}
                </tr>,
                expanded && renderExpanded ? <tr key={`${k}:x`} className="dt__expanded"><td colSpan={columns.length}>{renderExpanded(r)}</td></tr> : null,
              ];
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="dt__foot">
          <span className="num">{t('common.rowsOf', { from: fmtNumber(p * pageSize + 1), to: fmtNumber(Math.min(sorted.length, (p + 1) * pageSize)), n: fmtNumber(sorted.length) })}</span>
          <div className="dt__pager">
            <button type="button" className="btn btn--sm btn--icon" disabled={p === 0} onClick={() => setPage(p - 1)} aria-label={t('common.prev')}><Prev aria-hidden /></button>
            <button type="button" className="btn btn--sm btn--icon" disabled={p >= pages - 1} onClick={() => setPage(p + 1)} aria-label={t('common.next')}><Next aria-hidden /></button>
          </div>
        </div>
      )}
    </div>
  );
}
