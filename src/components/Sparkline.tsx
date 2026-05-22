import { useId } from 'react';

interface SparklineProps {
  /** Series of numbers to plot, oldest first. */
  data: number[];
  /** CSS classes for the wrapping <svg>. Width/height come from the parent. */
  className?: string;
  /** Stroke + fill-gradient color. Defaults to brand orange. */
  color?: string;
  /** Stroke width in viewBox units. */
  strokeWidth?: number;
}

/**
 * Minimal sparkline — a single SVG polyline with a faded gradient fill
 * underneath. Pure inline SVG, no chart library, ~30 lines of code.
 *
 * The viewBox is fixed at 100×30 with `preserveAspectRatio="none"` so the
 * parent can size it freely. All data points are normalized to that viewBox,
 * which means the actual pixel curve is fully determined by the parent's
 * width/height — you get nice scaling without recharts overhead.
 *
 * A unique `useId()` gradient id is generated per instance so multiple
 * sparklines on the same page don't fight over fill references.
 */
export function Sparkline({
  data,
  className = '',
  color = '#ea580c',
  strokeWidth = 1.5,
}: SparklineProps) {
  const gradientId = useId();

  if (data.length === 0) {
    return <div className={className} aria-hidden="true" />;
  }

  const W = 100;
  const H = 30;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;

  const points = data.map((value, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * W;
    const y = H - ((value - min) / range) * H;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  // Filled area path: line points + close back along the baseline.
  const areaPath = `0,${H} ${points.join(' ')} ${W},${H}`;
  const linePath = points.join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polyline fill={`url(#${gradientId})`} stroke="none" points={areaPath} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={linePath}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
