import { useState, type FormEvent, type ReactNode } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import {
  buttonClass,
  inputClass,
  pressedButtonClass,
  primaryButtonClass,
  quietButtonClass,
} from '@/components/styles';
import { ToggleMark } from '@/components/ToggleMark';
import { announcementText, NOTHING_SAID, saying } from '@/lib/announcement';
import { failureCopy } from '@/lib/errorCopy';
import { isOnline, useOnline } from '@/lib/network';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import { barOneLabel, LINE_UP_COPY } from './lineUpCopy';
import { canLineUp, type RecordingPlayer } from './recordingPlayer';
import type { SongLink } from './songLinks';
import { useRecordingStatus } from './useRecordingPlayer';
import { useBarOneAtPress, useSaveBarOne } from './useSaveBarOne';
import {
  canNudge,
  lineUpSeconds,
  nudgedBarOne,
  parseVideoClock,
  videoClockLabel,
  type NudgeDirection,
} from './videoSync';

/** The two rows' heights are fixed, so nothing on the page moves when their content changes. */
const blockClass = 'flex w-full flex-col lg:w-[26rem] lg:max-w-full';
const rowClass = 'flex h-11 items-center gap-2';
/** The words' row: a failure's three lines on a narrow phone may make it taller; nothing else does. */
const messageRowClass = 'flex min-h-11 items-center gap-2';
/** Three share a phone's row: narrower padding than a button's own, and no wrapping. */
const rowButtonSize = 'min-w-0 px-2 text-sm whitespace-nowrap';

/** The buttons that stand in for one another: focus goes from one to the other. */
type HandOver = 'now' | 'again' | 'typed';
const handOverAttributes = (control: HandOver) => ({ 'data-line-up': control });
const findHandOver = (control: HandOver) => () =>
  document.querySelector<HTMLElement>(`[data-line-up="${control}"]`);

/**
 * The room the line-up takes, drawn empty while the song's links are still
 * read: the score under the video doesn't move when they arrive.
 */
export function LineUpSpace() {
  return (
    <div className={blockClass} aria-hidden="true">
      <div className={rowClass} />
      <div className={rowClass} />
    </div>
  );
}

/**
 * Lining the tab up with a video, under the video (Unit 19). The app can't
 * know where bar 1 falls in a recording, so the drummer says so once per
 * link: "Bar 1 starts now", pressed as the song comes in, saves the video's
 * time at the press. From then on the same place holds the nudges (a quarter
 * of a second each, for a tab that drifts from the recording), "Line up
 * again", and the Follow toggle. Never required: a link that isn't lined up
 * plays exactly as before.
 *
 * Every save is online only, like the other edits of a link: the controls
 * are off offline with a note, and the handlers ask `isOnline()` themselves.
 * The controls are locked with `aria-disabled`, not `disabled`: focus is
 * handed between them, and a disabled button can't take it.
 */
export function LineUp({
  songId,
  link,
  player,
  follow,
  onFollowChange,
  needsFirstTap,
}: {
  songId: string;
  link: Pick<SongLink, 'id' | 'barOneSeconds'>;
  /** Null while no frame is on the page (offline). */
  player: RecordingPlayer | null;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  /** A key or a tap tried to work a video that hasn't been started by a tap on it. */
  needsFirstTap: boolean;
}) {
  const online = useOnline();
  const status = useRecordingStatus(player);
  const save = useSaveBarOne(songId);
  const barOneAtPress = useBarOneAtPress(songId);
  const focusWhenReady = useFocusWhenReady();
  // "Line up again" was pressed: the prompt is back, and the saved line-up stays until the next press.
  const [relining, setRelining] = useState(false);
  // The time being typed for bar 1 ("Type a time"), or null while no field is open, and
  // whether what was last submitted wasn't a time.
  const [typed, setTyped] = useState<string | null>(null);
  const [typedInvalid, setTypedInvalid] = useState(false);
  const [said, setSaid] = useState(NOTHING_SAID);
  const say = (text: string) => setSaid((last) => saying(last, text));

  const { barOneSeconds } = link;
  const lined = barOneSeconds !== null && !relining;
  const canPressNow = online && canLineUp(status);

  const lineUpNow = () => {
    // The video's clock at the press, read before anything else is done.
    const state = player?.getState();
    if (!state || !canLineUp(state) || !isOnline()) return;
    const seconds = lineUpSeconds(state.seconds);
    if (seconds === null) return;
    save.mutate(
      { linkId: link.id, barOneSeconds: seconds },
      // A first line-up that is refused brings the prompt back: focus goes with it.
      { onError: () => focusWhenReady(findHandOver('now')) },
    );
    setRelining(false);
    say(`Lined up. ${barOneLabel(seconds)}.`);
    focusWhenReady(findHandOver('again'));
  };

  const nudge = (direction: NudgeDirection) => {
    if (!isOnline()) return;
    // What is there now, an earlier nudge still on its way included.
    const current = barOneAtPress(link.id);
    if (current === null || current === undefined || !canNudge(current, direction)) return;
    const next = nudgedBarOne(current, direction);
    save.mutate({ linkId: link.id, barOneSeconds: next });
    say(`${barOneLabel(next)}.`);
  };

  const lineUpAgain = () => {
    if (!isOnline()) return;
    setRelining(true);
    focusWhenReady(findHandOver('now'));
  };

  const keepLineUp = () => {
    setRelining(false);
    focusWhenReady(findHandOver('again'));
  };

  // Typing the time: for someone who knows where the song comes in, or reads it off the
  // video's own clock. Needs no playing video, only a connection for the save.
  const openTyping = () => {
    if (!isOnline()) return;
    setTyped(barOneSeconds === null ? '' : videoClockLabel(barOneSeconds));
    setTypedInvalid(false);
    focusWhenReady(findHandOver('typed'));
  };

  const closeTyping = () => {
    setTyped(null);
    setTypedInvalid(false);
    focusWhenReady(findHandOver(lined ? 'again' : 'now'));
  };

  const saveTyped = (event: FormEvent) => {
    event.preventDefault();
    if (typed === null || !isOnline()) return;
    const seconds = parseVideoClock(typed);
    if (seconds === null) {
      setTypedInvalid(true);
      return;
    }
    // The time already saved, typed back unchanged, sends nothing.
    if (seconds !== barOneSeconds) {
      save.mutate(
        { linkId: link.id, barOneSeconds: seconds },
        { onError: () => focusWhenReady(findHandOver(barOneSeconds === null ? 'now' : 'again')) },
      );
    }
    setTyped(null);
    setTypedInvalid(false);
    setRelining(false);
    say(`Lined up. ${barOneLabel(seconds)}.`);
    focusWhenReady(findHandOver('again'));
  };

  let message: ReactNode;
  if (!online) message = <OfflineNote>{LINE_UP_COPY.offline}</OfflineNote>;
  else if (save.error) {
    message = (
      <ErrorAlert>
        {LINE_UP_COPY.saveFailed} {failureCopy(save.error)}
      </ErrorAlert>
    );
  } else if (status.status === 'unavailable') message = LINE_UP_COPY.unavailable;
  else if (needsFirstTap && !status.started) message = LINE_UP_COPY.firstTap;
  else if (lined) message = `${barOneLabel(barOneSeconds)}. ${LINE_UP_COPY.drifting}`;
  else message = LINE_UP_COPY.prompt;

  if (typed !== null) {
    return (
      <form data-testid="line-up" className={blockClass} noValidate onSubmit={saveTyped}>
        <label className={`${messageRowClass} text-xs/4 text-ink-soft`}>
          {/* The label gives way to what is wrong, in the same place and the same room. */}
          {typedInvalid ? (
            <span role="alert" className="w-24 shrink-0 text-danger">
              {LINE_UP_COPY.typedInvalid}
            </span>
          ) : (
            <span className="shrink-0">{LINE_UP_COPY.typedLabel}</span>
          )}
          <input
            className={`${inputClass} h-11 min-w-0 flex-1`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-label={LINE_UP_COPY.typedLabel}
            aria-invalid={typedInvalid || undefined}
            placeholder={LINE_UP_COPY.typedPlaceholder}
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setTypedInvalid(false);
            }}
            // Escape leaves the field as Cancel does; cancelled so it reaches nothing else.
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.preventDefault();
              closeTyping();
            }}
            {...handOverAttributes('typed')}
          />
        </label>
        <div className={rowClass}>
          <button
            type="submit"
            className={`${primaryButtonClass} flex-1 whitespace-nowrap`}
            aria-disabled={!online || undefined}
          >
            {LINE_UP_COPY.typedSave}
          </button>
          <button type="button" className={quietButtonClass} onClick={closeTyping}>
            {LINE_UP_COPY.cancel}
          </button>
        </div>
        <p role="status" className="sr-only" data-testid="line-up-announcement">
          {announcementText(said)}
        </p>
      </form>
    );
  }

  return (
    <div data-testid="line-up" className={blockClass}>
      <div className={messageRowClass}>
        <div
          data-testid="line-up-message"
          className="min-w-0 flex-1 text-xs/4 text-ink-soft [&>p]:text-xs/4"
        >
          {message}
        </div>
        {lined && (
          <button
            type="button"
            className={`${quietButtonClass} shrink-0 whitespace-nowrap`}
            aria-disabled={!online || undefined}
            onClick={lineUpAgain}
            {...handOverAttributes('again')}
          >
            {LINE_UP_COPY.again}
          </button>
        )}
      </div>
      <div className={rowClass}>
        {lined ? (
          <>
            {(['earlier', 'later'] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                className={`${buttonClass} ${rowButtonSize} flex-1`}
                aria-disabled={!online || !canNudge(barOneSeconds, direction) || undefined}
                onClick={() => nudge(direction)}
              >
                {LINE_UP_COPY[direction]}
              </button>
            ))}
            <button
              type="button"
              className={`${follow ? pressedButtonClass : buttonClass} ${rowButtonSize} flex-1`}
              aria-pressed={follow}
              onClick={() => onFollowChange(!follow)}
            >
              {LINE_UP_COPY.follow}
              <ToggleMark on={follow} inline />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={`${primaryButtonClass} flex-1 whitespace-nowrap`}
              aria-disabled={!canPressNow || undefined}
              onClick={lineUpNow}
              {...handOverAttributes('now')}
            >
              {LINE_UP_COPY.now}
            </button>
            <button
              type="button"
              className={`${quietButtonClass} shrink-0 whitespace-nowrap`}
              aria-disabled={!online || undefined}
              onClick={openTyping}
            >
              {LINE_UP_COPY.type}
            </button>
            {relining && (
              <button type="button" className={quietButtonClass} onClick={keepLineUp}>
                {LINE_UP_COPY.cancel}
              </button>
            )}
          </>
        )}
      </div>
      {/* On the page from the start, empty: a live region added with its text is often not read. */}
      <p role="status" className="sr-only" data-testid="line-up-announcement">
        {announcementText(said)}
      </p>
    </div>
  );
}
