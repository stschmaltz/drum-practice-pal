import type { PlayerSnapshot } from './PlayerService';

/**
 * The count-in as one big number over the score, sized to read from the drum
 * throne. Render it inside a `relative` box around the score viewport. It
 * shows nothing outside a count-in and never takes taps from the score.
 */
export function CountInCounter({ snapshot }: { snapshot: PlayerSnapshot }) {
  if (snapshot.status !== 'countingIn') return null;
  const { countIn } = snapshot;

  return (
    <div
      data-testid="count-in"
      // The status line announces "Counting in"; reading every beat aloud would lag behind the clicks.
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-lg bg-neutral-950/80"
    >
      <span
        data-testid="count-in-beat"
        // Beat one gets the accent colour, like the accented click.
        className={`text-[min(40vw,45dvh)] font-bold leading-none tabular-nums ${
          countIn?.beat === 1 ? 'text-sky-300' : 'text-white'
        }`}
      >
        {/* A non-breaking space keeps the box's height before the first click. */}
        {countIn ? countIn.beat : ' '}
      </span>
      {countIn && countIn.bars > 1 && (
        <span className="text-2xl font-semibold text-neutral-200" data-testid="count-in-bar">
          Bar {countIn.bar} of {countIn.bars}
        </span>
      )}
    </div>
  );
}
