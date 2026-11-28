import { OfflineNote } from '@/components/OfflineNote';
import { LoadingLine } from '@/components/StatusMessages';
import { lockableLinkClass } from '@/components/styles';
import { useOnline } from '@/lib/network';
import { LinkOut } from './LinkOut';
import { refuseUnlessCanOpen } from './recordingGate';
import { RECORDING_NOTE, SONG_LINK_KIND_LABELS, type VideoSource } from './songLinks';

/** The frame's permissions: what YouTube's player uses, and no more (no autoplay, no clipboard). */
const FRAME_ALLOW = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';

/**
 * The box round the player, its border outside the frame. On a phone as wide
 * as the page, up to the width whose 16:9 frame is a third of the window's
 * height; a fixed width from 1024 px, and beside its note in a short window.
 * The 2 px are the border's, so the frame inside keeps the width meant for it.
 */
const frameBoxClass =
  'mx-auto w-full max-w-[calc(max(33dvh,200px)*16/9+2px)] shrink-0 overflow-hidden rounded-card border border-line bg-surface lg:mx-0 lg:w-[358px] lg:max-w-none sideways:mx-0';

/**
 * The player itself: 16:9 where the width allows, and never under 200 px
 * either way, which YouTube's terms ask of an embedded player. The minimum is
 * on the frame element, so on a phone narrower than 356 px the box is taller
 * than 16:9 rather than the player too small (14 QA issue 1).
 */
const frameShapeClass = 'block aspect-video min-h-[200px] w-full min-w-[200px]';

/**
 * A song's recording on its play screen: YouTube's own player in a frame,
 * with YouTube's controls (play, seek, speed), and "Open in YouTube" always
 * beside it, since a video that refuses to be embedded only says so inside
 * the frame, where the app can't see it. Nothing of YouTube's loads until
 * this is drawn, and nothing at all while offline, when the frame would hold
 * the browser's error page and the way out would open one.
 *
 * `video` null: the song's links are still being read for the source the
 * page was opened on.
 */
export function RecordingBox({
  songTitle,
  video,
}: {
  songTitle: string;
  video: VideoSource | null;
}) {
  const online = useOnline();
  if (!video) {
    return (
      <div className={frameBoxClass}>
        <div className={`${frameShapeClass} grid place-items-center`}>
          <LoadingLine small>Loading the recording…</LoadingLine>
        </div>
      </div>
    );
  }
  const label = SONG_LINK_KIND_LABELS[video.source];
  return (
    <>
      <div className={frameBoxClass}>
        {online ? (
          <iframe
            // A new frame per video: switching from Original to Drumless must stop the first.
            key={video.embedUrl}
            data-testid="recording-frame"
            className={frameShapeClass}
            src={video.embedUrl}
            title={`${label} recording of ${songTitle} (YouTube video player)`}
            allow={FRAME_ALLOW}
            allowFullScreen
            // YouTube refuses to play (error 153) when the frame sends no referrer at all.
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <div className={`${frameShapeClass} grid place-items-center p-3`}>
            <OfflineNote>You're offline. The video needs a connection.</OfflineNote>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col items-center lg:items-start sideways:items-start">
        {/* Beside the video where there is room; under the bar, off it, on a narrower window. */}
        <p className="hidden text-sm text-ink-muted lg:block sideways:block">{RECORDING_NOTE}</p>
        <LinkOut
          link={video.link}
          className={`${lockableLinkClass} gap-1.5 text-sm`}
          // Locked, not taken away, offline: the note in the box says why. The press is asked
          // of the gate too, like every way of opening a recording: it would open an error page.
          off={!online}
          onClick={refuseUnlessCanOpen}
        >
          Open in YouTube
        </LinkOut>
      </div>
    </>
  );
}
