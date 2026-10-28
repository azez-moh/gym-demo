import { isOpenAt, sessionsOn, type Camera, type Club, type Machine } from '../../data';
import { rngFor, chance, int } from '../../data/rng';

/*
  Activity log: machine state transitions today, from the same sessions as every other AI Vision page.
  A session start is "Into use", its end "Back to idle". Now and then a zone loses confidence
  (camera picture dropped, glare, a person blocking the view): an "Uncertain" period, seeded per machine and date.
*/

export type Kind = 'use' | 'idle' | 'uncertain';

export interface LogEvent {
  id: string;
  machineId: string;
  kind: Kind;
  /** Minute of the day. */
  at: number;
  /** Length of the state before this change, minutes. */
  prevMin: number;
  /** Length of the uncertain period, minutes (uncertain only). */
  spanMin?: number;
  reason?: 'offline' | 'confidence';
}

function firstOpen(club: Club, date: string): number {
  for (let m = 0; m < 1440; m += 5) if (isOpenAt(club, date, m)) return m;
  return 0;
}

export function buildLog(machines: Machine[], cams: Map<string, Camera>, club: Club, date: string, nowMin: number): LogEvent[] {
  const out: LogEvent[] = [];
  const open = firstOpen(club, date);
  for (const m of machines) {
    const ss = sessionsOn(m, club, date, nowMin).sort((a, b) => a.start - b.start);
    let prevEnd = Math.min(open, ss[0]?.start ?? open);
    const gaps: { from: number; to: number }[] = [];
    ss.forEach((s, i) => {
      out.push({ id: `${m.id}|u|${i}`, machineId: m.id, kind: 'use', at: s.start, prevMin: Math.max(0, s.start - prevEnd) });
      if (s.end < nowMin) {
        out.push({ id: `${m.id}|i|${i}`, machineId: m.id, kind: 'idle', at: s.end, prevMin: s.end - s.start });
        const next = ss[i + 1]?.start ?? nowMin;
        if (next - s.end > 14) gaps.push({ from: s.end, to: next });
      }
      prevEnd = s.end;
    });
    // uncertain periods: about one machine in four has one today, inside an idle gap
    const r = rngFor(club.id, date, m.id, 'uncertain');
    const cam = cams.get(m.cameraId);
    const p = cam && !cam.online ? 1 : cam?.kind === 'nvr' ? 0.4 : 0.2;
    if (gaps.length && chance(r, p)) {
      const g = gaps[int(r, 0, gaps.length - 1)];
      const span = int(r, 2, Math.min(9, g.to - g.from - 6));
      const at = g.from + int(r, 2, Math.max(2, g.to - g.from - span - 2));
      if (at < nowMin) {
        out.push({ id: `${m.id}|x|${at}`, machineId: m.id, kind: 'uncertain', at, prevMin: at - g.from, spanMin: span, reason: cam && !cam.online ? 'offline' : chance(r, 0.4) ? 'offline' : 'confidence' });
      }
    }
  }
  return out.sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
}
