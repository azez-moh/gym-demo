import type { ThemeName } from '../../theme/chartTokens';

/*
  Sequential crowding scale: cool neutral (empty) to brand yellow (busy) to warm red above 85% of capacity.
  Stops are share of comfortable capacity (0..1). Values above 1 stay at the last stop.
*/
type Stop = [number, [number, number, number]];

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const STOPS: Record<ThemeName, Stop[]> = {
  dark: [
    [0, hex('#1c1830')],
    [0.3, hex('#3a3452')],
    [0.55, hex('#6a4fc0')],
    [0.72, hex('#7c3aed')],
    [0.85, hex('#f5a623')],
    [1, hex('#e5484d')],
  ],
  light: [
    [0, hex('#f1eef9')],
    [0.3, hex('#d4cde6')],
    [0.55, hex('#b49af5')],
    [0.72, hex('#7c3aed')],
    [0.85, hex('#f0901c')],
    [1, hex('#e5484d')],
  ],
};

export const HOT_RATIO = 0.85;

export function heatRgb(ratio: number, theme: ThemeName): [number, number, number] {
  const s = STOPS[theme];
  const v = Math.max(0, Math.min(1, ratio));
  for (let i = 1; i < s.length; i++) {
    if (v <= s[i][0]) {
      const [a, ca] = s[i - 1];
      const [b, cb] = s[i];
      const t = (v - a) / (b - a || 1);
      return [0, 1, 2].map((k) => Math.round(ca[k] + (cb[k] - ca[k]) * t)) as [number, number, number];
    }
  }
  return s[s.length - 1][1];
}

export function heatColor(ratio: number, theme: ThemeName): string {
  const [r, g, b] = heatRgb(ratio, theme);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Dark or light text for a label sitting on the heat colour. */
export function inkOn(ratio: number, theme: ThemeName): string {
  const [r, g, b] = heatRgb(ratio, theme).map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.28 ? '#241f30' : '#ffffff';
}

/** CSS gradient for the legend (inline start = empty). */
export function legendGradient(theme: ThemeName, dir: 'to right' | 'to left' = 'to right'): string {
  const parts = STOPS[theme].map(([p]) => `${heatColor(p, theme)} ${Math.round(p * 100)}%`);
  return `linear-gradient(${dir}, ${parts.join(', ')})`;
}
