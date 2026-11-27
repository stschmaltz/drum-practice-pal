import { useId } from 'react';
import { Link } from 'react-router';
import { focusRing, smallHeadingClass } from '@/components/styles';
import type { PracticeLoop } from '@/features/loops/practiceList';
import type { PracticeSession } from '@/features/practice/sessions';
import { loopPracticePath } from '@/lib/routes';
import { neglectedLabel, neglectedLoops } from './neglected';

/**
 * "Not practised lately", under Loop progress: up to three active loops left
 * a week or more, the longest first, each with its song, how long it has
 * been, and its name as the way to its practice screen. Nothing at all when
 * no loop has been left that long: the page doesn't say "all caught up".
 */
export function NeglectedLoops({
  sessions,
  loops,
  now,
}: {
  sessions: readonly PracticeSession[];
  loops: readonly PracticeLoop[];
  now: Date;
}) {
  const headingId = useId();
  const neglected = neglectedLoops(sessions, loops, now);
  if (neglected.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 pt-2">
      <h3 id={headingId} className={smallHeadingClass}>
        Not practised lately
      </h3>
      <ul aria-labelledby={headingId} className="divide-y divide-line border-y border-line">
        {neglected.map((each) => (
          <li
            key={each.loop.id}
            className="flex flex-col pb-3"
            data-testid="neglected-loop"
            data-loop={each.loop.id}
          >
            <p className="font-semibold wrap-anywhere">
              <Link
                to={loopPracticePath(each.loop.song_id, each.loop.id)}
                className={`inline-flex min-h-touch max-w-full min-w-touch items-center rounded-sm wrap-anywhere text-ink hover:text-brand ${focusRing}`}
              >
                {each.loop.name}
              </Link>
            </p>
            {/* The song gives way to how long it has been: a long title is cut, the days never. */}
            <p className="flex min-w-0 gap-1 text-sm text-ink-muted">
              <span className="truncate" title={each.loop.song.title}>
                {each.loop.song.title}
              </span>
              <span className="shrink-0 text-ink-soft tabular-nums">
                · <span data-testid="neglected-when">{neglectedLabel(each)}</span>
              </span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
