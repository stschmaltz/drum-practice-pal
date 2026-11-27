import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Icon } from '@/components/icons';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { OverflowMenu } from '@/components/OverflowMenu';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar, ProgressRing } from '@/components/ProgressMarks';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import { focusRing, ghostButtonClass, sectionHeadingClass } from '@/components/styles';
import { songFactsLabel, type Song } from '@/features/library/songForm';
import { NO_DRUM_TRACK_NOTE } from '@/features/library/songMetadata';
import { ConfirmDeleteLoop } from '@/features/loops/ConfirmDeleteLoop';
import { findFormOpener, NEW_LOOP_BUTTON_ATTRIBUTES } from '@/features/loops/loopFocus';
import { barsLabel, type Loop } from '@/features/loops/loopForm';
import {
  fullSpeedFraction,
  isMastered,
  masteryFraction,
  masteryOf,
  masterySummary,
} from '@/features/loops/mastery';
import { practiceLoopsFor } from '@/features/loops/practiceList';
import { useLoops, useSetLoopStatus } from '@/features/loops/useLoops';
import { ratioToPercent } from '@/features/player/speed';
import { LoopHistory } from '@/features/practice/LoopHistory';
import { lastPracticedLabel } from '@/features/practice/sessions';
import { failureCopy } from '@/lib/errorCopy';
import {
  findItemControl,
  isItemListed,
  itemAttributes,
  itemMenuAttributes,
  neighbourAfterLeaving,
} from '@/lib/itemFocus';
import { waitsForNetwork } from '@/lib/network';
import type { LoopStatus } from '@/lib/schema';
import {
  editLoopPath,
  legacyLoopRedirect,
  loopPracticePath,
  newLoopPath,
  songPlayPath,
} from '@/lib/routes';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import { BackLink, SongGate } from './SongGate';

/**
 * /songs/:id, a song's overview (Unit 16): how much of it is mastered, and its
 * loops, the ones on the go first (last practised first), then the mastered
 * ones. Each loop opens its practice screen; "New loop" and "Play whole song"
 * open the player. This screen loads no player and no file, so a loop's speed
 * is a percent only (its BPM needs the file's tempo). An old link,
 * `/songs/:id?loop=<id>`, goes on to that loop's practice screen.
 */
export function SongOverviewPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const redirect = legacyLoopRedirect(id, params);
  if (redirect) return <Navigate to={redirect} replace />;
  return <SongGate songId={id}>{(song) => <SongOverview song={song} />}</SongGate>;
}

function SongOverview({ song }: { song: Song }) {
  const loops = useLoops(song.id);
  const mastery = loops.data ? masteryOf(loops.data) : null;

  return (
    <div className="flex flex-col gap-5">
      <BackLink to="/">Songs</BackLink>
      <PageHeader title={song.title}>
        {song.artist && <span className="block">{song.artist}</span>}
        <span className="block text-sm" data-testid="song-facts">
          {songFactsLabel(song)}
          {mastery && mastery.total > 0 && <> · {masterySummary(mastery)}</>}
        </span>
        {song.drum_track_index === null && (
          <span className="mt-1 flex items-start gap-2 text-sm text-warning">
            <Icon name="alert" className="mt-0.5 size-4" />
            {NO_DRUM_TRACK_NOTE}
          </span>
        )}
      </PageHeader>
      <div className="flex flex-wrap gap-x-2 gap-y-1">
        <Link
          to={newLoopPath(song.id)}
          className={`${ghostButtonClass} -ml-4`}
          {...NEW_LOOP_BUTTON_ATTRIBUTES}
        >
          <Icon name="plus" />
          New loop
        </Link>
        <Link to={songPlayPath(song.id)} className={ghostButtonClass}>
          <Icon name="music" />
          Play whole song
        </Link>
      </div>
      <SongLoops song={song} loops={loops} />
    </div>
  );
}

function SongLoops({ song, loops }: { song: Song; loops: ReturnType<typeof useLoops> }) {
  const focusWhenReady = useFocusWhenReady();

  if (waitsForNetwork(loops)) {
    return (
      <EmptyState icon="offline">
        You're offline, and this song's loops haven't been opened on this device yet.
      </EmptyState>
    );
  }
  if (loops.isPending) return <LoadingLine>Loading loops…</LoadingLine>;
  if (loops.isLoadingError) {
    return (
      <LoadErrorAlert onRetry={() => void loops.refetch()}>
        Couldn't load this song's loops. {failureCopy(loops.error)}
      </LoadErrorAlert>
    );
  }
  if (loops.data.length === 0) {
    return (
      <EmptyState icon="loop">
        No loops yet. Choose New loop, then pick the bars you want to practise.
      </EmptyState>
    );
  }

  const active = practiceLoopsFor(loops.data, 'active');
  const finished = practiceLoopsFor(loops.data, 'finished');
  const listed = [...active, ...finished].map((loop) => loop.id);
  // The loop moves to the other list: focus follows it to its "More" button there.
  const followStatus = (loop: Loop) => focusWhenReady(() => findItemControl(loop.id, 'delete'));
  // A deleted loop takes its buttons with it: focus goes to the next loop's "More".
  const followDelete = (loop: Loop) => {
    const nextId = neighbourAfterLeaving(listed, loop.id);
    focusWhenReady(() => {
      if (isItemListed(loop.id)) return null;
      // The last loop gone: to "New loop", the way to the next one.
      return (
        (nextId === null ? null : findItemControl(nextId, 'delete')) ??
        findFormOpener({ kind: 'new' })
      );
    });
  };
  const rows = (shown: Loop[]) =>
    shown.map((loop) => (
      <LoopRow
        key={loop.id}
        song={song}
        loop={loop}
        onStatusSet={() => followStatus(loop)}
        onDeletePressed={() => followDelete(loop)}
      />
    ));

  return (
    <div className="flex flex-col gap-6">
      {active.length > 0 && (
        <section aria-labelledby="active-loops-heading" className="flex flex-col gap-1">
          <h2 id="active-loops-heading" className={sectionHeadingClass}>
            Loops
          </h2>
          <ul aria-label="Loops on the go" className="divide-y divide-line border-y border-line">
            {rows(active)}
          </ul>
        </section>
      )}
      {finished.length > 0 && (
        <section aria-labelledby="mastered-loops-heading" className="flex flex-col gap-1">
          <h2 id="mastered-loops-heading" className={sectionHeadingClass}>
            Mastered
          </h2>
          <ul aria-label="Mastered loops" className="divide-y divide-line border-y border-line">
            {rows(finished)}
          </ul>
        </section>
      )}
      {isMastered(masteryOf(loops.data)) && (
        <p className="flex items-center gap-2 text-ink-soft">
          <ProgressRing fraction={masteryFraction(masteryOf(loops.data))} className="size-6" />
          Every loop of this song is mastered.
        </p>
      )}
    </div>
  );
}

/**
 * One loop: its name, bars and saved speed, a thin bar of that speed towards
 * full speed, and a round play button into its practice screen. Edit,
 * history, finish or reopen, and delete are in its "More" menu, Delete last.
 */
function LoopRow({
  song,
  loop,
  onStatusSet,
  onDeletePressed,
}: {
  song: Song;
  loop: Loop;
  onStatusSet: () => void;
  onDeletePressed: () => void;
}) {
  const navigate = useNavigate();
  const status = useSetLoopStatus(song.id, loop.id);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [showingHistory, setShowingHistory] = useState(false);
  const focusWhenReady = useFocusWhenReady();
  const finished = loop.status === 'finished';
  const percent = ratioToPercent(loop.speed_ratio);
  const nextStatus: LoopStatus = finished ? 'active' : 'finished';

  return (
    <li className="flex flex-col gap-2 py-3" {...itemAttributes(loop.id)}>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex items-center gap-2 font-semibold wrap-anywhere">
            {finished && <Icon name="trophy" className="size-4 shrink-0 text-success" />}
            {/* The name opens the loop too, as a song's title does on the Songs list. */}
            <Link
              to={loopPracticePath(song.id, loop.id)}
              className={`inline-flex min-h-touch max-w-full min-w-touch items-center rounded-sm wrap-anywhere text-ink hover:text-brand ${focusRing}`}
            >
              {loop.name}
            </Link>
          </p>
          <p className="text-sm text-ink-muted">
            {barsLabel(loop.start_bar, loop.end_bar)} · {percent}%
            <span className="max-sm:hidden">
              {' '}
              · {lastPracticedLabel(loop.last_practiced_at, new Date())}
            </span>
          </p>
          {!finished && <ProgressBar fraction={fullSpeedFraction(percent)} className="max-w-48" />}
        </div>
        <OverflowMenu
          name={loop.name}
          buttonAttributes={itemMenuAttributes(loop.id)}
          items={[
            {
              id: 'edit',
              label: 'Edit',
              icon: 'edit',
              onSelect: () => void navigate(editLoopPath(song.id, loop.id)),
            },
            {
              id: 'history',
              label: showingHistory ? 'Hide history' : 'Show history',
              icon: 'history',
              onSelect: () => setShowingHistory((showing) => !showing),
            },
            {
              id: 'status',
              label: finished ? 'Reopen' : 'Mark finished',
              icon: finished ? 'reopen' : 'check',
              disabled: status.isPending,
              onSelect: () => {
                if (status.setStatus(nextStatus)) onStatusSet();
              },
            },
            {
              id: 'delete',
              label: 'Delete',
              icon: 'trash',
              danger: true,
              onSelect: () => setConfirmingDelete(true),
            },
          ]}
        />
        <Link
          to={loopPracticePath(song.id, loop.id)}
          className={`inline-flex size-12 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised text-brand transition-colors duration-150 hover:bg-raised-hover ${focusRing}`}
        >
          <Icon name="play" className="size-5" />
          <span className="sr-only">Practise {loop.name}</span>
        </Link>
      </div>
      {confirmingDelete && (
        <ConfirmDeleteLoop
          songId={song.id}
          loop={loop}
          onCancel={() => {
            setConfirmingDelete(false);
            focusWhenReady(() => findItemControl(loop.id, 'delete'));
          }}
          onDeletePressed={onDeletePressed}
        />
      )}
      {status.error && (
        <ErrorAlert>
          {finished ? "Couldn't reopen the loop." : "Couldn't mark the loop finished."}{' '}
          {failureCopy(status.error)}
        </ErrorAlert>
      )}
      {showingHistory && <LoopHistory loopId={loop.id} loopName={loop.name} tempo={null} />}
    </li>
  );
}
