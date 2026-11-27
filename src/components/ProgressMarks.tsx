/**
 * The one mark of progress each list row carries (Unit 14): a ring for a
 * song's mastered loops, a thin bar for a loop's speed towards full speed.
 * Decoration beside the words that say the same (`aria-hidden`): a row's
 * text is "2 of 4 loops mastered" or "92%", never the mark alone.
 */

const RING_RADIUS = 15;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Filled for `fraction` of the way round from the top. `empty`: a song with
 * no loops yet, drawn as a dashed ring, so it doesn't read as 0% of something.
 */
export function ProgressRing({
  fraction,
  empty = false,
  className = 'size-10',
}: {
  fraction: number;
  empty?: boolean;
  className?: string;
}) {
  const filled = Math.min(Math.max(fraction, 0), 1) * RING_LENGTH;
  const complete = !empty && fraction >= 1;
  return (
    <svg
      viewBox="0 0 36 36"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 -rotate-90 ${className}`}
      data-testid="progress-ring"
    >
      <circle
        cx="18"
        cy="18"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="3"
        className={empty ? 'stroke-line-strong' : 'stroke-line'}
        strokeDasharray={empty ? '3 4' : undefined}
      />
      {!empty && filled > 0 && (
        <circle
          cx="18"
          cy="18"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className={complete ? 'stroke-success' : 'stroke-selected-line'}
          strokeDasharray={`${filled} ${RING_LENGTH}`}
        />
      )}
    </svg>
  );
}

/** A thin bar, `fraction` full. */
export function ProgressBar({
  fraction,
  className = '',
}: {
  fraction: number;
  className?: string;
}) {
  const percent = Math.min(Math.max(fraction, 0), 1) * 100;
  return (
    <div
      aria-hidden="true"
      className={`h-1 overflow-hidden rounded-full bg-line ${className}`}
      data-testid="progress-bar"
    >
      <div
        className={`h-full rounded-full ${percent >= 100 ? 'bg-success' : 'bg-selected-line'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
