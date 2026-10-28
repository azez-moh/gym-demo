import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { focusClub, machinesOf, useDemo, type MachineRow } from '../../../data';
import { useScope } from '../../../layout/filters';

/** The club these AI Vision pages show (the live club when it is in scope) and its machines with live state. */
export function useVisionClub() {
  const d = useDemo();
  const { scope } = useScope();
  const club = focusClub(d, scope);
  const rows: MachineRow[] = useMemo(() => machinesOf(d, club.id).filter((m) => m.enabled), [d, club.id]);
  return { d, club, rows };
}

/** One URL search param as state (replace, so Back leaves the page rather than stepping through toggles). */
export function useParam(key: string, fallback: string): [string, (v: string | null) => void] {
  const [sp, setSp] = useSearchParams();
  const value = sp.get(key) ?? fallback;
  const set = (v: string | null) => {
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      if (v == null || v === fallback) n.delete(key); else n.set(key, v);
      return n;
    }, { replace: true });
  };
  return [value, set];
}
