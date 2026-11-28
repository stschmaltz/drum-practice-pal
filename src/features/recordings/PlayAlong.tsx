import { useId, useState, type MouseEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ExpandButton } from '@/components/ExpandButton';
import { Icon } from '@/components/icons';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import {
  buttonClass,
  dangerCardClass,
  ghostButtonClass,
  inlineIconClass,
  lockableLinkClass,
  sectionHeadingClass,
} from '@/components/styles';
import type { Song } from '@/features/library/songForm';
import { useMarkSongPlayed } from '@/features/library/songPlayed';
import { failureCopy } from '@/lib/errorCopy';
import { useOnline } from '@/lib/network';
import { songPlayPath, songSourcePath } from '@/lib/routes';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import { LinkOut } from './LinkOut';
import { ADD_RECORDING_ATTRIBUTES, findRecordingsOpener } from './recordingFocus';
import { canOpenRecording, refuseUnlessCanOpen } from './recordingGate';
import { RecordingsForm } from './RecordingsForm';
import {
  isRecordingSource,
  otherLinkLabel,
  otherLinkSpokenAs,
  playAlongLabel,
  type SongLink,
} from './songLinks';
import { useSongLinks, useSongLinkSaves, useUsableLinks } from './useSongLinks';

/** How many other links are listed before "Show all n links". */
export const OTHER_LINKS_SHOWN = 3;

/**
 * The song overview's ways of hearing the whole song (Unit 14), above its
 * loops: "Play along", with one button per way the song has. "Tab" (the tab's
 * own player) is there from the first render; "Original" and "Drumless" join
 * it once the song's links are read, or a quiet "Add a recording" when it has
 * none. A YouTube link opens the song's play screen on that source; a Spotify
 * or other link leaves the app, and its button says where to. Other links are
 * a quiet list under the buttons, three of them and then "Show all n links".
 * `managing` swaps the block for the form that adds, changes and removes
 * links. `actions` is the overview's own row under it (New loop).
 *
 * One layout whether the song has links or not, so nothing already on the
 * page moves or changes when the links arrive on a cold load (14 QA issue 7):
 * what comes joins the end of the buttons' row.
 *
 * Loads no player and no YouTube code: the buttons are links.
 */
export function PlayAlong({
  song,
  managing,
  onManage,
  onDoneManaging,
  actions,
}: {
  song: Song;
  managing: boolean;
  onManage: () => void;
  onDoneManaging: () => void;
  actions: ReactNode;
}) {
  const links = useSongLinks(song.id);
  const usable = useUsableLinks(links);
  const online = useOnline();
  const markPlayed = useMarkSongPlayed();
  const saves = useSongLinkSaves(song.id);
  const focusWhenReady = useFocusWhenReady();

  if (managing) {
    return (
      <>
        <RecordingsForm song={song} links={links} onClose={onDoneManaging} />
        <ActionRow>{actions}</ActionRow>
      </>
    );
  }

  const recordings = (usable ?? []).filter((link) => isRecordingSource(link.kind));
  const others = (usable ?? []).filter((link) => link.kind === 'other');
  const hasLinks = recordings.length + others.length > 0;
  // A link out records that the song was played along to; a refused press (offline) does nothing.
  const onLinkOut = (event: MouseEvent) => {
    if (!canOpenRecording()) {
      event.preventDefault();
      return;
    }
    markPlayed(song.id);
  };
  const dismissSaveFailure = () => {
    saves.forgetFailure();
    // The alert goes with its button: focus to the way back into the form.
    focusWhenReady(findRecordingsOpener);
  };

  return (
    <>
      <section aria-labelledby="play-along-heading" className="flex flex-col gap-2">
        <h2 id="play-along-heading" className={sectionHeadingClass}>
          Play along
        </h2>
        <div className="flex flex-wrap gap-2" data-testid="play-along-buttons">
          <Link to={songPlayPath(song.id)} className={buttonClass}>
            <Icon name="music" />
            Tab
          </Link>
          {recordings.map((link) => (
            <RecordingButton
              key={link.id}
              songId={song.id}
              link={link}
              off={!online}
              onLinkOut={onLinkOut}
            />
          ))}
          {/* Only once the links are read: until then it isn't known that there are none. */}
          {links.data !== undefined && !hasLinks && (
            <button
              type="button"
              className={ghostButtonClass}
              onClick={onManage}
              {...ADD_RECORDING_ATTRIBUTES}
            >
              <Icon name="video" />
              Add a recording
            </button>
          )}
        </div>
        {links.isLoadingError && (
          <LoadErrorAlert compact onRetry={() => void links.refetch()}>
            Couldn't load this song's recordings. {failureCopy(links.error)}
          </LoadErrorAlert>
        )}
        {saves.error && <SaveFailureAlert error={saves.error} onDismiss={dismissSaveFailure} />}
        {/* Above the list, not under it: with many links it would be a screen away from the buttons it explains. */}
        {!online && hasLinks && (
          <OfflineNote>
            You're offline. Recordings need a connection; the tab and its loops play without one.
          </OfflineNote>
        )}
        {others.length > 0 && <OtherLinks links={others} off={!online} onOpen={onLinkOut} />}
      </section>
      <ActionRow>{actions}</ActionRow>
    </>
  );
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-2 gap-y-1">{children}</div>;
}

/**
 * The button for the song's Original or Drumless. A YouTube video opens the
 * play screen on that source; anything else (Spotify, another site) leaves
 * the app, and the button says where to.
 */
function RecordingButton({
  songId,
  link,
  off,
  onLinkOut,
}: {
  songId: string;
  link: SongLink;
  off: boolean;
  onLinkOut: (event: MouseEvent) => void;
}) {
  if (link.provider === 'youtube' && isRecordingSource(link.kind)) {
    return (
      <Link
        to={songSourcePath(songId, link.kind)}
        className={buttonClass}
        aria-disabled={off || undefined}
        // The play screen records the opening itself, once its video shows.
        onClick={refuseUnlessCanOpen}
      >
        <Icon name="video" />
        {playAlongLabel(link)}
      </Link>
    );
  }
  return (
    <LinkOut
      link={link}
      className={`${buttonClass} max-w-full`}
      textClassName="wrap-anywhere"
      off={off}
      onClick={onLinkOut}
    >
      {playAlongLabel(link)}
    </LinkOut>
  );
}

/**
 * A save of the recordings that failed after its form was left (the page's
 * links stay live while it saves): said here, to whoever is on the overview
 * when it lands or comes back to it, until it is dismissed.
 */
function SaveFailureAlert({ error, onDismiss }: { error: unknown; onDismiss: () => void }) {
  return (
    <div
      role="alert"
      className={`${dangerCardClass} flex flex-wrap items-center gap-x-4 gap-y-2 py-1 pr-1 pl-3`}
    >
      <p className="flex-1 basis-64 text-sm text-danger">
        <Icon name="alert" className={`${inlineIconClass} size-4`} />
        Couldn't save the recordings. {failureCopy(error)} Some changes may have been saved: this
        shows what is saved now.
      </p>
      <button type="button" className={buttonClass} onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}

/**
 * The song's other links (a lesson, a drum cover): the first few, then one
 * button for the rest, so twenty of them don't push the loops off the screen.
 * Each reads as a link (its host and the start of its path), with its whole
 * address in its title and its accessible name.
 */
function OtherLinks({
  links,
  off,
  onOpen,
}: {
  links: readonly SongLink[];
  off: boolean;
  onOpen: (event: MouseEvent) => void;
}) {
  const [showingAll, setShowingAll] = useState(false);
  const listId = useId();
  const shown = showingAll ? links : links.slice(0, OTHER_LINKS_SHOWN);
  return (
    <>
      <ul id={listId} aria-label="Other links" className="flex flex-col">
        {shown.map((link) => (
          <li key={link.id} className="min-w-0">
            <LinkOut
              link={link}
              className={`${lockableLinkClass} max-w-full gap-1.5 text-sm`}
              textClassName="line-clamp-1 wrap-anywhere"
              title={link.url}
              // The words are a shortened address; a screen reader gets all of it.
              spokenAs={otherLinkSpokenAs(link)}
              off={off}
              onClick={onOpen}
            >
              {otherLinkLabel(link)}
            </LinkOut>
          </li>
        ))}
      </ul>
      {links.length > OTHER_LINKS_SHOWN && (
        <ExpandButton
          expanded={showingAll}
          controls={listId}
          onToggle={() => setShowingAll((all) => !all)}
        >
          {showingAll ? 'Show fewer links' : `Show all ${links.length} links`}
        </ExpandButton>
      )}
    </>
  );
}
