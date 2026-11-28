import { Icon } from '@/components/icons';
import { OfflineNote } from '@/components/OfflineNote';
import { LoadingLine } from '@/components/StatusMessages';
import { linkClass } from '@/components/styles';
import { useOnline } from '@/lib/network';
import { RECORDING_NOTE, SONG_LINK_KIND_LABELS, type VideoSource } from './songLinks';

/** The frame's permissions: what YouTube's player uses, and no more (no autoplay, no clipboard). */
const FRAME_ALLOW = 'accelerometer; encrypted-media; picture-in-picture; fullscreen';

const frameShapeClass =
  // 16:9; on a phone at most a third of the window's height, from 1024 px a fixed 356 px. Never under
  // 200 px tall: YouTube's terms want a player of at least 200 by 200 px.
  'mx-auto aspect-video w-full max-w-[calc(max(33dvh,200px)*16/9)] overflow-hidden rounded-card border border-line bg-surface lg:mx-0 lg:w-[356px] lg:max-w-none lg:shrink-0';

/**
 * A song's recording on its play screen: YouTube's own player in a frame,
 * with YouTube's controls (play, seek, speed), and "Open in YouTube" always
 * beside it, since a video that refuses to be embedded only says so inside
 * the frame, where the app can't see it. Nothing of YouTube's loads until
 * this is drawn, and nothing at all while offline, when the frame would hold
 * the browser's error page.
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
      <div className={`${frameShapeClass} grid place-items-center`}>
        <LoadingLine small>Loading the recording…</LoadingLine>
      </div>
    );
  }
  const label = SONG_LINK_KIND_LABELS[video.source];
  return (
    <>
      <div className={`${frameShapeClass} ${online ? '' : 'grid place-items-center p-3'}`}>
        {online ? (
          <iframe
            // A new frame per video: switching from Original to Drumless must stop the first.
            key={video.embedUrl}
            data-testid="recording-frame"
            className="size-full"
            src={video.embedUrl}
            title={`${label} recording of ${songTitle} (YouTube video player)`}
            allow={FRAME_ALLOW}
            allowFullScreen
            // YouTube refuses to play (error 153) when the frame sends no referrer at all.
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <OfflineNote>You're offline. The video needs a connection.</OfflineNote>
        )}
      </div>
      <div className="flex min-w-0 flex-col items-center lg:items-start">
        {/* Beside the video where there is room; under the bar, off it, on a narrower window. */}
        <p className="text-sm text-ink-muted max-lg:hidden">{RECORDING_NOTE}</p>
        <a
          href={video.link.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${linkClass} text-sm`}
        >
          <Icon name="external" className="mr-1.5 size-4" />
          Open in YouTube<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </>
  );
}
