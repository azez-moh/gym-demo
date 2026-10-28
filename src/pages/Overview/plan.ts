import { useCallback } from 'react';
import type { DemoContextValue } from '../../data';
import type { InsightKind } from './insights';

/*
  The COO action plan and dismissed recommendations, kept in the demo store (settings `coo:plan`),
  so they persist like every other user change and reset with "Reset demo data".
*/

export type PlanStatus = 'planned' | 'progress' | 'done';
export const PLAN_STATUSES: PlanStatus[] = ['planned', 'progress', 'done'];
export type DismissReason = 'done' | 'notPractical' | 'data' | 'other';
export const DISMISS_REASONS: DismissReason[] = ['done', 'notPractical', 'data', 'other'];

export interface PlanItem {
  id: string;
  kind: InsightKind;
  clubIds: string[];
  status: PlanStatus;
  at: number;
  /** Action text at the time it was planned, in both languages. */
  textEn: string;
  textAr: string;
}
export interface Dismissal { id: string; reason: DismissReason; at: number }

interface PlanState { items?: PlanItem[]; dismissed?: Dismissal[] }

const KEY = 'coo:plan';

export function usePlan(data: DemoContextValue) {
  const st = (data.patches.set.settings?.[KEY] ?? {}) as PlanState;
  const items = st.items ?? [];
  const dismissed = st.dismissed ?? [];
  const write = useCallback((next: PlanState) => data.patch('settings', KEY, next as Record<string, unknown>), [data]);
  return {
    items,
    dismissed,
    planned: (id: string) => items.find((i) => i.id === id),
    isDismissed: (id: string) => dismissed.find((x) => x.id === id),
    add: (item: Omit<PlanItem, 'status' | 'at'>) => {
      if (items.some((i) => i.id === item.id)) return;
      write({ items: [{ ...item, status: 'planned', at: data.live.nowMs }, ...items], dismissed: dismissed.filter((x) => x.id !== item.id) });
    },
    setStatus: (id: string, status: PlanStatus) => write({ items: items.map((i) => (i.id === id ? { ...i, status } : i)) }),
    remove: (id: string) => write({ items: items.filter((i) => i.id !== id) }),
    dismiss: (id: string, reason: DismissReason) => write({ dismissed: [...dismissed.filter((x) => x.id !== id), { id, reason, at: data.live.nowMs }] }),
    restore: (id: string) => write({ dismissed: dismissed.filter((x) => x.id !== id) }),
  };
}

export type Plan = ReturnType<typeof usePlan>;
