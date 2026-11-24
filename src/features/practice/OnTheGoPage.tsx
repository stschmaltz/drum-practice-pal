import { Link, useSearchParams } from 'react-router';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { Icon } from '@/components/icons';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import {
  cardClass,
  inlineIconClass,
  linkClass,
  primaryButtonClass,
  segmentOffClass,
  segmentOnClass,
} from '@/components/styles';
import { findStatusButton, neighbourAfterLeaving } from '@/features/loops/loopFocus';
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
import type { LoopStatus } from '@/lib/schema';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import { waitsForNetwork } from '@/lib/network';
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
  const focusWhenReady = useFocusWhenReady();
  const listed = loops.data ? practiceLoopsFor(loops.data, tab) : [];

  // "Mark finished" and "Reopen" take their loop off the tab on show, button and all.
  // Focus goes to the next loop's button, or to the tab the loop went to when it was the last.
  const followStatusChange = (loop: PracticeLoop, status: LoopStatus) => {
    const nextId = neighbourAfterLeaving(
      listed.map((item) => item.id),
      loop.id,
    );
    const wentTo: PracticeTab = status === 'finished' ? 'finished' : 'active';
    focusWhenReady(() => {
      // Still listed: the optimistic move hasn't rendered yet.
      if (findStatusButton(loop.id)) return null;
      return (nextId === null ? null : findStatusButton(nextId)) ?? findTabButton(wentTo);
    });
  };

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
      <PracticeTabButtons tab={tab} loops={loops.data} onShow={showTab} />
      {waitsForNetwork(loops) ? (
        <EmptyState icon="offline">
          You're offline, and your loops haven't been opened on this device yet. They show once
          you're back online.
        </EmptyState>
      ) : loops.isPending ? (
        <LoadingLine>Loading your loops…</LoadingLine>
      ) : loops.isLoadingError ? (
        // isLoadingError, not isError: a failed background refetch keeps the list.
        <LoadErrorAlert onRetry={() => void loops.refetch()}>
          Couldn't load your loops.
        </LoadErrorAlert>
      ) : (
        <PracticeLoopList loops={listed} tab={tab} onStatusSet={followStatusChange} />
      )}
    </div>
  );
}

/** The two tabs, each with its count once the loops are in. */
function PracticeTabButtons({
  tab,
  loops,
  onShow,
}: {
  tab: PracticeTab;
  loops: readonly PracticeLoop[] | undefined;
  onShow: (tab: PracticeTab) => void;
}) {
  return (
    // Toggle buttons rather than ARIA tabs: two views of one list, with no arrow-key model to keep up.
    <div
      role="group"
      aria-label="Loops to show"
      className="inline-flex gap-1 self-start rounded-card border border-line bg-surface p-1"
    >
      {PRACTICE_TABS.map((option) => (
        <button
          key={option}
          type="button"
          className={option === tab ? segmentOnClass : segmentOffClass}
          aria-pressed={option === tab}
          data-practice-tab={option}
          onClick={() => onShow(option)}
        >
          {TAB_LABELS[option]}
          {loops && ` (${practiceLoopsFor(loops, option).length})`}
        </button>
      ))}
    </div>
  );
}

function findTabButton(tab: PracticeTab): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-practice-tab="${tab}"]`);
}

function PracticeLoopList({
  loops,
  tab,
  onStatusSet,
}: {
  loops: PracticeLoop[];
  tab: PracticeTab;
  onStatusSet: (loop: PracticeLoop, status: LoopStatus) => void;
}) {
  if (loops.length === 0) {
    return (
      <EmptyState
        icon={tab === 'active' ? 'loop' : 'check'}
        action={
          tab === 'active' && (
            <Link to="/library" className={linkClass}>
              Go to Library
            </Link>
          )
        }
      >
        {EMPTY_COPY[tab]}
      </EmptyState>
    );
  }
  return (
    <ul aria-label={TAB_LABELS[tab]} className="flex flex-col gap-3">
      {loops.map((loop) => (
        <PracticeLoopItem
          key={loop.id}
          loop={loop}
          onStatusSet={(status) => onStatusSet(loop, status)}
        />
      ))}
    </ul>
  );
}

function PracticeLoopItem({
  loop,
  onStatusSet,
}: {
  loop: PracticeLoop;
  onStatusSet: (status: LoopStatus) => void;
}) {
  const finished = loop.status === 'finished';
  const now = new Date();

  return (
    <li className={`${cardClass} flex flex-col gap-3 p-4`}>
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold break-words">{loop.name}</p>
        <p className="break-words text-ink-soft">
          <Icon name="library" className={`${inlineIconClass} size-4 text-ink-muted`} />
          {loop.song.title}
          {loop.song.artist && ` · ${loop.song.artist}`}
        </p>
        <p className="text-sm text-ink-muted">
          {barsLabel(loop.start_bar, loop.end_bar)} · {ratioToPercent(loop.speed_ratio)}%
          {loop.target_ratio !== null && ` · target ${ratioToPercent(loop.target_ratio)}%`}
        </p>
        <p className="text-sm text-ink-muted">
          {lastPracticedLabel(loop.last_practiced_at, now)}
          {finished &&
            loop.finished_at !== null &&
            ` · finished ${practiceDayInSentence(loop.finished_at, now)}`}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {/* A link, so the song opens on the loop; playback needs a tap on that page (iOS audio). */}
        <Link to={loopPracticePath(loop.song_id, loop.id)} className={`${primaryButtonClass} mr-1`}>
          <Icon name="play" />
          Practice<span className="sr-only"> {loop.name}</span>
        </Link>
        <LoopStatusButton loop={loop} onSet={onStatusSet} />
      </div>
    </li>
  );
}
