import { useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import { Icon } from '@/components/icons';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { OverflowMenu } from '@/components/OverflowMenu';
import { PageHeader } from '@/components/PageHeader';
import { ProgressBar, ProgressRing } from '@/components/ProgressMarks';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import {
  focusRing,
  ghostButtonAtEdgeClass,
  nameLinkClass,
  sectionHeadingClass,
} from '@/components/styles';
import { songFactsLabel, type Song } from '@/features/library/songForm';
import { NO_DRUM_TRACK_NOTE } from '@/features/library/songMetadata';
import { ConfirmDeleteLoop } from '@/features/loops/ConfirmDeleteLoop';
import {
  findFormOpener,
  findStatusButtonAfterRefusal,
  NEW_LOOP_BUTTON_ATTRIBUTES,
  statusButtonAttributes,
} from '@/features/loops/loopFocus';
import { barsLabel, type Loop } from '@/features/loops/loopForm';
import {
  fullSpeedFraction,
  isMastered,
  masteryFraction,
  masteryOf,
  masterySummary,
} from '@/features/loops/mastery';
import { practiceLoopsFor } from '@/features/loops/practiceList';
import { StatusRefusal } from '@/features/loops/LoopStatusButton';
import { useLoops, useLoopStatusRefusals, useSetLoopStatus } from '@/features/loops/useLoops';
import { ratioToPercent } from '@/features/player/speed';
import { LoopHistory } from '@/features/practice/LoopHistory';
import { lastPracticedLabel } from '@/features/practice/sessions';
import { useVisitSittings } from '@/features/practice/useVisitSittings';
import { VisitSummary } from '@/features/practice/VisitSummary';
import { isVisitSummaryShown } from '@/features/practice/visitSummaryFocus';
import { PlayAlong } from '@/features/recordings/PlayAlong';
import {
  findRecordingsOpener,
  RECORDINGS_MENU_ATTRIBUTES,
} from '@/features/recordings/recordingFocus';
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
import { editLoopPath, legacyLoopRedirect, loopPracticePath, newLoopPath } from '@/lib/routes';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import { BackLink, SongGate } from './SongGate';

/**
 * /songs/:id, a song's overview (Unit 16): how much of it is mastered, and its
 * loops, the ones on the go first (last practised first), then the mastered
 * ones. Each loop opens its practice screen; "New loop" opens the player on
 * the loop form. "Play along" above the loops (Unit 14) has the ways of
 * hearing the whole song: the tab's own player ("Tab"), and, for a song with
 * links to its recordings, the original and a drumless version; "Manage
 * recordings" in the header's menu edits the links. This screen loads
 * no player, no file and nothing of YouTube's, so a loop's speed
 * is a percent only (its BPM needs the file's tempo). Under the header, once,
 * what was practised on the song in this visit (`VisitSummary`). An old link,
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
  const visit = useVisitSittings(song.id);
  const focusWhenReady = useFocusWhenReady();
  // The recordings form, in place of the Play along buttons while it is open.
  const [managingRecordings, setManagingRecordings] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <BackLink to="/">Songs</BackLink>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
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
        </div>
        <OverflowMenu
          name={song.title}
          buttonAttributes={RECORDINGS_MENU_ATTRIBUTES}
          items={[
            {
              id: 'recordings',
              label: 'Manage recordings',
              icon: 'video',
              // Open already: the form is on the page, and takes focus when it mounts.
              onSelect: () => setManagingRecordings(true),
            },
          ]}
        />
      </div>
      <VisitSummary
        sittings={visit.sittings}
        onDismiss={() => {
          visit.dismiss();
          // Dismiss goes with the summary: focus to "New loop", the next control down the page.
          focusWhenReady(() => (isVisitSummaryShown() ? null : findFormOpener({ kind: 'new' })));
        }}
      />
      <PlayAlong
        song={song}
        managing={managingRecordings}
        onManage={() => setManagingRecordings(true)}
        onDoneManaging={() => {
          setManagingRecordings(false);
          // The form goes: focus back to what opened it, once that is on the page again.
          focusWhenReady(findRecordingsOpener);
        }}
        actions={
          <Link
            to={newLoopPath(song.id)}
            className={ghostButtonAtEdgeClass}
            {...NEW_LOOP_BUTTON_ATTRIBUTES}
          >
            <Icon name="plus" />
            New loop
          </Link>
        }
      />
      <SongLoops song={song} loops={loops} />
    </div>
  );
}

function SongLoops({ song, loops }: { song: Song; loops: ReturnType<typeof useLoops> }) {
  const focusWhenReady = useFocusWhenReady();
  // A refused "Mark finished" or "Reopen" moves the loop back to its list, away from the
  // focus that followed it: on to its "More" button there. Leaving the page puts the
  // refusals' messages away.
  useLoopStatusRefusals((loopId, refused) => {
    const find = findStatusButtonAfterRefusal(loopId, refused);
    if (find) focusWhenReady(find);
  });

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
              className={`${nameLinkClass} wrap-anywhere`}
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
          // The button stands for the status change its menu holds, in the list the loop is in.
          buttonAttributes={{ ...itemMenuAttributes(loop.id), ...statusButtonAttributes(loop) }}
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
        <StatusRefusal
          loopName={loop.name}
          onDismiss={() => {
            // "Dismiss" goes with the message: the menu that holds the change takes focus.
            findItemControl(loop.id, 'delete')?.focus();
            status.dismissError();
          }}
        >
          {finished ? "Couldn't reopen the loop." : "Couldn't mark the loop finished."}{' '}
          {failureCopy(status.error)}
        </StatusRefusal>
      )}
      {showingHistory && <LoopHistory loopId={loop.id} loopName={loop.name} tempo={null} />}
    </li>
  );
}
