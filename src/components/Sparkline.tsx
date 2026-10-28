import { useI18n } from '../i18n';
import { useChartTokens } from '../theme/theme';

/** Tiny trend line. Time runs right to left in Arabic. */
export function Sparkline({ data, slot = 0, color, height = 36, width = 96 }: { data: number[]; slot?: number; color?: string; height?: number; width?: number }) {
  const ct = useChartTokens();
  const { isRtl } = useI18n();
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - 3 - ((v - min) / span) * (height - 6);
    return [isRtl ? width - x : x, y];
  });
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const stroke = color ?? ct.series[slot % ct.series.length];
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      <rect x={last[0] - 2} y={last[1] - 2} width={4} height={4} fill={stroke} />
    </svg>
  );
}
