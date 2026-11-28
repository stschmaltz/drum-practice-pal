import { useId, useState } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/icons';
import { nameLinkClass, quietButtonClass } from '@/components/styles';
import type { PracticeLoop } from '@/features/loops/practiceList';
import { loopPracticePath } from '@/lib/routes';
import { ExpandButton } from './ExpandButton';
import { LOOP_PROGRESS_SHOWN, loopProgress, speedChange, type LoopProgress } from './loopProgress';
import { Sparkline } from './Sparkline';
import { SpeedChart } from './SpeedChart';
import { daysLabel, minutesLabel } from './statLabels';
import type { StatsData } from './statsData';

/**
 * "Loop progress" (Unit 17): every loop that has been practised, with where
 * its speed started and where it is now, its play time and practice days.
 * A row's name goes to the loop's practice screen; its "Chart" opens the
 * loop's speed over its practice days under the row, one at a time.
 */
export function LoopProgressList({ sessions, loops, now }: StatsData & { now: Date }) {
  const progress = loopProgress(sessions, loops);
  const [showingAll, setShowingAll] = useState(false);
  const [chartOf, setChartOf] = useState<string | null>(null);
  const listId = useId();

  if (progress.length === 0) {
    // Loops marked finished without ever being practised: stats, but no speeds.
    return <p className="text-ink-muted">Practise a loop to see how its speed moves.</p>;
  }
  const hidden = progress.length - LOOP_PROGRESS_SHOWN;
  const listed = showingAll ? progress : progress.slice(0, LOOP_PROGRESS_SHOWN);

  return (
    <>
      <ul
        id={listId}
        aria-label="Loop progress"
        className="divide-y divide-line border-y border-line"
      >
        {listed.map((each) => (
          <LoopProgressRow
            key={each.loop.id}
            progress={each}
            now={now}
            chartOpen={chartOf === each.loop.id}
            onToggleChart={() =>
              setChartOf((open) => (open === each.loop.id ? null : each.loop.id))
            }
          />
        ))}
      </ul>
      {hidden > 0 && (
        <ExpandButton
          expanded={showingAll}
          controls={listId}
          onToggle={() => setShowingAll((all) => !all)}
        >
          {showingAll ? 'Show fewer' : `Show all ${progress.length} loops`}
        </ExpandButton>
      )}
    </>
  );
}

function LoopProgressRow({
  progress,
  now,
  chartOpen,
  onToggleChart,
}: {
  progress: LoopProgress<PracticeLoop>;
  now: Date;
  chartOpen: boolean;
  onToggleChart: () => void;
}) {
  const { loop, days, change } = progress;
  const chartId = useId();
  const finished = loop.status === 'finished';
  // "70% → 85%" stays one colour; only the change after it is green when it is a gain.
  const { span, moved } = speedChange(progress);

  return (
    <li className="flex flex-col gap-2 py-3" data-testid="loop-progress" data-loop={loop.id}>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="flex items-center gap-2 font-semibold wrap-anywhere">
            {finished && <Icon name="trophy" className="size-4 shrink-0 text-success" />}
            <Link
              to={loopPracticePath(loop.song_id, loop.id)}
              className={`${nameLinkClass} wrap-anywhere`}
            >
              {loop.name}
              {finished && <span className="sr-only">, mastered</span>}
            </Link>
          </p>
          <p className="truncate text-sm text-ink-muted" title={loop.song.title}>
            {loop.song.title}
          </p>
          <p className="mt-1 text-sm text-ink-soft tabular-nums">
            <span data-testid="loop-progress-speed">
              <span className="font-semibold text-ink">{span}</span>
              {moved && <span className={change > 0 ? 'text-success' : undefined}>, {moved}</span>}
            </span>
            <span className="text-ink-muted" data-testid="loop-progress-time">
              {' '}
              · {/* One piece, so a narrow row never leaves "days" alone on a line (17 QA). */}
              <span className="whitespace-nowrap">
                {minutesLabel(progress.seconds)} · {daysLabel(days.length)}
              </span>
            </span>
          </p>
        </div>
        <Sparkline percents={days.map((day) => day.percent)} />
        <button
          type="button"
          className={`${quietButtonClass} min-w-touch shrink-0`}
          aria-expanded={chartOpen}
          aria-controls={chartId}
          onClick={onToggleChart}
        >
          <Icon name={chartOpen ? 'chevronUp' : 'chevronDown'} />
          <span className="max-md:sr-only">Chart</span>
          <span className="sr-only"> of {loop.name}</span>
        </button>
      </div>
      <div id={chartId} hidden={!chartOpen}>
        {chartOpen && <SpeedChart days={days} loopName={loop.name} now={now} />}
      </div>
    </li>
  );
}
