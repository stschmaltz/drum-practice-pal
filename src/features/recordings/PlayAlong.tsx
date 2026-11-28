import type { MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from '@/components/icons';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import {
  buttonClass,
  ghostButtonClass,
  lockableLinkClass,
  sectionHeadingClass,
} from '@/components/styles';
import type { Song } from '@/features/library/songForm';
import { useMarkSongPlayed } from '@/features/library/songPlayed';
import { failureCopy } from '@/lib/errorCopy';
import { useOnline } from '@/lib/network';
import { songPlayPath, songSourcePath } from '@/lib/routes';
import { ADD_RECORDING_ATTRIBUTES } from './recordingFocus';
import { canOpenRecording } from './recordingGate';
import { RecordingsForm } from './RecordingsForm';
import { isRecordingSource, playAlongLabel, type SongLink } from './songLinks';
import { useSongLinks, useUsableLinks } from './useSongLinks';

/**
 * The song overview's ways of hearing the whole song (Unit 14), above its
 * loops. With no link saved the page is as it was, plus a quiet "Add a
 * recording" beside `actions` (New loop, Play whole song). With links, "Play
 * along" has one button per way the song has: "Tab" (the tab's own player),
 * then "Original" and "Drumless". A YouTube link opens the song's play screen
 * on that source; a Spotify or other link leaves the app, and its button says
 * where to. Other links are a quiet list under the buttons. `managing` swaps
 * the buttons for the form that adds, changes and removes links.
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
  /** The overview's own quiet actions, drawn in the row "Add a recording" joins. */
  actions: (playWholeSong: boolean) => ReactNode;
}) {
  const links = useSongLinks(song.id);
  const usable = useUsableLinks(links);
  const online = useOnline();
  const markPlayed = useMarkSongPlayed();

  const hasLinks = usable !== undefined && usable.length > 0;
  if (managing) {
    return (
      <>
        <RecordingsForm song={song} links={links} onClose={onDoneManaging} />
        {/* As it was before the form opened: with links, "Tab" stood in for "Play whole song". */}
        <ActionRow>{actions(!hasLinks)}</ActionRow>
      </>
    );
  }

  if (!hasLinks) {
    return (
      <>
        <ActionRow>
          {actions(true)}
          {/* Only once the links are read: until then it isn't known that there are none. */}
          {links.data !== undefined && (
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
        </ActionRow>
        {links.isLoadingError && (
          <LoadErrorAlert compact onRetry={() => void links.refetch()}>
            Couldn't load this song's recordings. {failureCopy(links.error)}
          </LoadErrorAlert>
        )}
      </>
    );
  }

  const single = usable.filter((link) => isRecordingSource(link.kind));
  const others = usable.filter((link) => link.kind === 'other');
  // A link out records that the song was played along to; a refused press (offline) does nothing.
  const onLinkOut = (event: MouseEvent) => {
    if (!canOpenRecording()) {
      event.preventDefault();
      return;
    }
    markPlayed(song.id);
  };
  const refuseOffline = (event: MouseEvent) => {
    if (!canOpenRecording()) event.preventDefault();
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
          {single.map((link) =>
            link.provider === 'youtube' && isRecordingSource(link.kind) ? (
              <Link
                key={link.id}
                to={songSourcePath(song.id, link.kind)}
                className={buttonClass}
                aria-disabled={!online || undefined}
                onClick={refuseOffline}
              >
                <Icon name="video" />
                {playAlongLabel(link)}
              </Link>
            ) : (
              <LinkOut
                key={link.id}
                link={link}
                className={`${buttonClass} max-w-full`}
                textClassName="wrap-anywhere"
                off={!online}
                onClick={onLinkOut}
              >
                {playAlongLabel(link)}
              </LinkOut>
            ),
          )}
        </div>
        {others.length > 0 && (
          <ul aria-label="Other links" className="flex flex-col">
            {others.map((link) => (
              <li key={link.id} className="min-w-0">
                <LinkOut
                  link={link}
                  className={`${lockableLinkClass} max-w-full gap-1.5 text-sm`}
                  // One line each: a long address is cut short (clamped, so it can still shrink the row), and whole in its title.
                  textClassName="line-clamp-1 wrap-anywhere"
                  title={link.url}
                  off={!online}
                  onClick={onLinkOut}
                >
                  {otherLinkText(link)}
                </LinkOut>
              </li>
            ))}
          </ul>
        )}
        {!online && (
          <OfflineNote>
            You're offline. Recordings need a connection; the tab and its loops play without one.
          </OfflineNote>
        )}
      </section>
      <ActionRow>{actions(false)}</ActionRow>
    </>
  );
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-x-2 gap-y-1">{children}</div>;
}

/** A link that leaves the app, in a new tab, with nothing of this page passed on. */
function LinkOut({
  link,
  className,
  textClassName,
  title,
  off,
  onClick,
  children,
}: {
  link: SongLink;
  className: string;
  textClassName: string;
  title?: string;
  off: boolean;
  onClick: (event: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title}
      aria-disabled={off || undefined}
      onClick={onClick}
    >
      <Icon name="external" className="size-4 shrink-0" />
      <span className={`min-w-0 ${textClassName}`}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </span>
    </a>
  );
}

/** An other link has no name of its own: its address, less the scheme, says which it is. */
function otherLinkText(link: SongLink): string {
  return link.url.replace(/^https:\/\/(www\.)?/, '');
}
