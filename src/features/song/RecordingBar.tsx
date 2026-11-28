import { LineUp } from '@/features/recordings/LineUp';
import { LineUpSpace } from '@/features/recordings/LineUpParts';
import { RecordingBox } from '@/features/recordings/RecordingBox';
import { RECORDING_NOTE, type VideoSource } from '@/features/recordings/songLinks';
import { fullBleedBarClass } from './playerScreen';
import type { RecordingPageState } from './useRecordingSession';

/**
 * One row from 1024 px, and in a phone on its side, where the video's 200 px
 * are already half the window: the way out and the line-up go beside the
 * video, not under it. From 1024 px the note is there too; in a phone on its
 * side the room beside the video is the line-up's, and the note stays under
 * the bar (19 QA issue 2).
 */
const recordingBarClass = `sticky top-0 ${fullBleedBarClass} flex flex-col gap-1 pb-1 pt-[max(0.5rem,env(safe-area-inset-top))] lg:flex-row-reverse lg:items-start lg:justify-between lg:gap-6 lg:pb-3 sideways:flex-row-reverse sideways:items-start sideways:justify-between sideways:gap-4 sideways:pt-[max(0.25rem,env(safe-area-inset-top))]`;

/**
 * The recording the play screen is on: its video in a bar that sticks like
 * the jam bar it stands in for, so it stays on screen over the score, and the
 * note that says why the tab's controls aren't there. `video` null while the
 * links are still read for the source the screen was opened on. Under the
 * video (or beside it), the line-up: how the tab is told where bar 1 falls in
 * it (Unit 19).
 */
export function RecordingBar({
  songId,
  songTitle,
  video,
  recording,
}: {
  songId: string;
  songTitle: string;
  video: VideoSource | null;
  recording: RecordingPageState;
}) {
  return (
    <>
      <div ref={recording.barRef} data-testid="recording-bar" className={recordingBarClass}>
        <RecordingBox songTitle={songTitle} video={video} frameRef={recording.frameRef}>
          {video ? (
            <LineUp
              // Another link is another line-up: "Line up again" half-way doesn't carry over.
              key={video.link.id}
              songId={songId}
              link={video.link}
              player={recording.player}
              follow={recording.follow}
              onFollowChange={recording.setFollow}
              firstTapAsks={recording.firstTapAsks}
            />
          ) : (
            // The same room while the links are read, so the score doesn't move when they arrive.
            <LineUpSpace />
          )}
        </RecordingBox>
      </div>
      {/* From 1024 px the same words sit in the bar, beside the video (RecordingBox). */}
      <p className="text-sm text-ink-muted lg:hidden" data-testid="recording-note">
        {RECORDING_NOTE}
      </p>
    </>
  );
}
