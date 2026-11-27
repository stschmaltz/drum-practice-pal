import { pathOf, sparklinePoints } from './chartScale';

const SPARKLINE = { width: 64, height: 24, pad: 4 } as const;

/**
 * A loop's speed over its practice days in a row of the progress list: the
 * shape only, beside the row's own "70% → 85%", so it is hidden from screen
 * readers. A line with one dot, at its end, however many days it has (never
 * a dot a day, as the chart under the row stops drawing past thirty); the
 * dot is green once the loop is at full speed.
 */
export function Sparkline({ percents }: { percents: readonly number[] }) {
  const points = sparklinePoints(percents, SPARKLINE);
  const last = points[points.length - 1];
  const lastPercent = percents[percents.length - 1] ?? 0;
  return (
    <svg
      viewBox={`0 0 ${SPARKLINE.width} ${SPARKLINE.height}`}
      aria-hidden="true"
      focusable="false"
      className="h-6 w-16 shrink-0"
      data-testid="sparkline"
    >
      {points.length > 1 && (
        <path
          d={pathOf(points)}
          fill="none"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-selected-line"
        />
      )}
      {last && (
        <circle
          cx={last.x}
          cy={last.y}
          r="2.5"
          className={lastPercent >= 100 ? 'fill-success' : 'fill-selected-line'}
        />
      )}
    </svg>
  );
}
