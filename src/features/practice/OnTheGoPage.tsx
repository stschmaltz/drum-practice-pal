import { Link, useSearchParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { buttonClass, pressedButtonClass, primaryButtonClass } from '@/components/styles';
import { barsLabel } from '@/features/loops/loopForm';
import {
  PRACTICE_TABS,
  practiceLoopsFor,
  practiceTabFrom,
  type PracticeLoop,
  type PracticeTab,
} from '@/features/loops/practiceList';
import { LoopStatusButton } from '@/features/loops/LoopStatusButton';
import { usePracticeLoops } from '@/features/loops/useLoops';
import { ratioToPercent } from '@/features/player/speed';
import { loopPracticePath } from '@/lib/routes';
import { lastPracticedLabel, practiceDayInSentence } from './sessions';

const TAB_PARAM = 'tab';

const TAB_LABELS: Record<PracticeTab, string> = { active: 'On the go', finished: 'Finished' };

const EMPTY_COPY: Record<PracticeTab, string> = {
  active: 'Nothing on the go. Open a song from the library and save a loop to practice.',
  finished: 'No finished loops yet. Mark a loop finished once you have it at speed.',
};

/**
 * `/`, the home page: the loops being worked on, last practiced first, and
 * beside them the finished ones. A loop's name is a link into its song with
 * the loop set up, so practice is one tap and then Play.
 */
export function OnTheGoPage() {
  const loops = usePracticeLoops();
  const [params, setParams] = useSearchParams();
  // In the URL, so coming back from a song returns to the same tab.
  const tab = practiceTabFrom(params.get(TAB_PARAM));

  const showTab = (next: PracticeTab) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === 'active') updated.delete(TAB_PARAM);
        else updated.set(TAB_PARAM, next);
        return updated;
      },
      { replace: true },
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="On the go">Your loops, most recently practiced first.</PageHeader>
      {/* Toggle buttons rather than ARIA tabs: two views of one list, with no arrow-key model to keep up. */}
      <div role="group" aria-label="Loops to show" className="flex gap-2">
        {PRACTICE_TABS.map((option) => (
          <button
            key={option}
            type="button"
            className={option === tab ? pressedButtonClass : buttonClass}
            aria-pressed={option === tab}
            onClick={() => showTab(option)}
          >
            {TAB_LABELS[option]}
            {loops.data && ` (${practiceLoopsFor(loops.data, option).length})`}
          </button>
        ))}
      </div>
      {loops.isPending ? (
        <p className="text-neutral-400">Loading your loops…</p>
      ) : loops.isLoadingError ? (
        // isLoadingError, not isError: a failed background refetch keeps the list.
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-red-300">Couldn't load your loops.</p>
          <button type="button" className={buttonClass} onClick={() => void loops.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <PracticeLoopList loops={practiceLoopsFor(loops.data, tab)} tab={tab} />
      )}
    </div>
  );
}

function PracticeLoopList({ loops, tab }: { loops: PracticeLoop[]; tab: PracticeTab }) {
  if (loops.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-neutral-400">{EMPTY_COPY[tab]}</p>
        {tab === 'active' && (
          <Link to="/library" className="text-sky-400 underline">
            Go to Library
          </Link>
        )}
      </div>
    );
  }
  return (
    <ul aria-label={TAB_LABELS[tab]} className="flex flex-col gap-3">
      {loops.map((loop) => (
        <PracticeLoopItem key={loop.id} loop={loop} />
      ))}
    </ul>
  );
}

function PracticeLoopItem({ loop }: { loop: PracticeLoop }) {
  const finished = loop.status === 'finished';
  const now = new Date();

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-4">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold break-words">{loop.name}</p>
        <p className="break-words text-neutral-300">
          {loop.song.title}
          {loop.song.artist && ` · ${loop.song.artist}`}
        </p>
        <p className="text-sm text-neutral-400">
          {barsLabel(loop.start_bar, loop.end_bar)} · {ratioToPercent(loop.speed_ratio)}%
          {loop.target_ratio !== null && ` · target ${ratioToPercent(loop.target_ratio)}%`}
        </p>
        <p className="text-sm text-neutral-400">
          {lastPracticedLabel(loop.last_practiced_at, now)}
          {finished &&
            loop.finished_at !== null &&
            ` · finished ${practiceDayInSentence(loop.finished_at, now)}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {/* A link, so the song opens on the loop; playback needs a tap on that page (iOS audio). */}
        <Link
          to={loopPracticePath(loop.song_id, loop.id)}
          className={`${primaryButtonClass} inline-flex items-center`}
        >
          Practice<span className="sr-only"> {loop.name}</span>
        </Link>
        <LoopStatusButton loop={loop} />
      </div>
    </li>
  );
}
