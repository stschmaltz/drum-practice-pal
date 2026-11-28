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
import { useLinkAtPress, useSaveBarOne } from './useSaveBarOne';
import {
  canNudge,
  lineUpSeconds,
  nudgedBarOne,
  parseVideoClock,
  videoClockLabel,
  type NudgeDirection,
} from './videoSync';

/**
 * The line-up's room: a grid whose rows have fixed heights, so nothing on
 * the page moves when their content changes, whatever state it is in. Two
 * rows of three columns under the video; in a phone on its side, where it
 * sits beside the video in some 200 px, three rows of two, so every control
 * has a cell of its own and none runs under the video (19 QA issue 2).
 */
const blockClass =
  'grid w-full grid-cols-3 grid-rows-[repeat(2,2.75rem)] gap-1 lg:w-[26rem] lg:max-w-full sideways:grid-cols-2 sideways:grid-rows-[repeat(3,2.75rem)]';
/** A cell across the whole block, at either width. */
const wholeRow = 'col-span-3 sideways:col-span-2';
/** Two of a row's three columns under the video; a row of its own beside it. */
const wideCell = 'col-span-2';
/** One column under the video; a row of its own beside it. */
const ownRowBeside = 'sideways:col-span-2';
/**
 * A control in a cell: as tall as the row and no taller, its words on two
 * lines where one doesn't fit (a 320 px phone, the 100 px cells beside a
 * video), never out of the button.
 */
const cellButton = 'h-11 w-full min-w-0 px-2 py-0 text-center text-sm leading-tight';
/**
 * The words' cell. A message is at most three lines here; a failure can be
 * more on a narrow phone, and then it grows upward out of its row (into the
 * spare room of the link above) and moves nothing (19 QA issue 10).
 */
const messageCell = 'flex min-w-0 flex-col text-xs/4 text-ink-soft [&>p]:text-xs/3.5';

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
  return <div className={blockClass} aria-hidden="true" data-testid="line-up-space" />;
}

/** The time being typed for bar 1, and what the field showed when it opened. */
interface TypedTime {
  text: string;
  openedOn: string;
}

/**
 * Lining the tab up with a video, under the video (Unit 19). The app can't
 * know where bar 1 falls in a recording, so the drummer says so once per
 * link: "Bar 1 starts now", pressed as the song comes in (or with the video
 * paused on the downbeat), saves the video's time at the press. From then on
 * the same place holds the nudges (a quarter of a second each, for a tab
 * that drifts from the recording), "Line up again", and the Follow toggle.
 * Never required: a link that isn't lined up plays exactly as before.
 *
 * Every save is online only, like the other edits of a link: the controls
 * are off offline with a note, and the handlers ask `isOnline()` themselves.
 * Each carries the address the link had at the press, so it can't land on a
 * link that was pointed at another video meanwhile (`saveBarOne`). The
 * controls are locked with `aria-disabled`, not `disabled`: focus is handed
 * between them, and a disabled button can't take it; and a press on "Bar 1
 * starts now" while it is off for a video nobody has played says why.
 */
export function LineUp({
  songId,
  link,
  player,
  follow,
  onFollowChange,
  firstTapAsks,
}: {
  songId: string;
  link: Pick<SongLink, 'id' | 'barOneSeconds'>;
  /** Null while no frame is on the page (offline). */
  player: RecordingPlayer | null;
  follow: boolean;
  onFollowChange: (follow: boolean) => void;
  /**
   * How many times a key or a tap on a bar has tried to work this video
   * before it was started by a tap on it: the note is shown from the first,
   * and said again at each.
   */
  firstTapAsks: number;
}) {
  const online = useOnline();
  const status = useRecordingStatus(player);
  const save = useSaveBarOne(songId);
  const linkAtPress = useLinkAtPress(songId);
  const focusWhenReady = useFocusWhenReady();
  // "Line up again" was pressed: the prompt is back, and the saved line-up stays until the next press.
  const [relining, setRelining] = useState(false);
  // "Type a time": null while no field is open; and whether what was last submitted wasn't a time.
  const [typed, setTyped] = useState<TypedTime | null>(null);
  const [typedInvalid, setTypedInvalid] = useState(false);
  // "Bar 1 starts now" was pressed on a video nobody has played yet.
  const [pressedEarly, setPressedEarly] = useState(false);
  const [said, setSaid] = useState(NOTHING_SAID);
  const say = (text: string) => setSaid((last) => saying(last, text));

  const { barOneSeconds } = link;
  const lined = barOneSeconds !== null && !relining;
  const canPressNow = online && canLineUp(status);
  const unavailable = status.status === 'unavailable';
  const needsFirstTap = firstTapAsks > 0 && !status.started;

  // What the page shows without a press here is said too (19 QA issue 11): the note a key or
  // a tap on a bar asked for, at each ask, and a player that gives up. Set while rendering,
  // from what changed, rather than in an effect a render late.
  const noticeKey = `${unavailable}:${firstTapAsks}`;
  const [noticeSaid, setNoticeSaid] = useState(`${false}:${0}`);
  if (noticeSaid !== noticeKey) {
    setNoticeSaid(noticeKey);
    if (unavailable) say(LINE_UP_COPY.unavailable);
    else if (needsFirstTap) say(LINE_UP_COPY.firstTap);
  }

  const lineUpNow = () => {
    // The video's clock at the press, read before anything else is done.
    const state = player?.getState();
    if (!state || !isOnline()) return;
    if (!canLineUp(state)) {
      // Off, and why: the first Play is the video's own. A player that will never answer
      // has its own line already.
      if (state.status === 'unavailable') return;
      setPressedEarly(true);
      say(LINE_UP_COPY.playFirst);
      return;
    }
    const seconds = lineUpSeconds(state.seconds);
    const known = linkAtPress(link.id);
    if (seconds === null || !known) return;
    save.mutate(
      { linkId: link.id, url: known.url, barOneSeconds: seconds },
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
    const known = linkAtPress(link.id);
    if (!known || known.barOneSeconds === null || !canNudge(known.barOneSeconds, direction)) return;
    const next = nudgedBarOne(known.barOneSeconds, direction);
    save.mutate({ linkId: link.id, url: known.url, barOneSeconds: next });
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
    const shown = barOneSeconds === null ? '' : videoClockLabel(barOneSeconds);
    setTyped({ text: shown, openedOn: shown });
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
    const seconds = parseVideoClock(typed.text);
    if (seconds === null) {
      setTypedInvalid(true);
      return;
    }
    // The time the field opened on, saved back, sends nothing. Judged by what the field
    // shows, the hundredth: a time saved by a press is stored to the millisecond, and
    // writing its rounded label back would move a line-up nobody touched (19 QA issue 5).
    const kept =
      barOneSeconds !== null && videoClockLabel(seconds) === typed.openedOn ? barOneSeconds : null;
    const known = linkAtPress(link.id);
    if (!known) return;
    if (kept === null && seconds !== barOneSeconds) {
      save.mutate(
        { linkId: link.id, url: known.url, barOneSeconds: seconds },
        { onError: () => focusWhenReady(findHandOver(barOneSeconds === null ? 'now' : 'again')) },
      );
    }
    setTyped(null);
    setTypedInvalid(false);
    setRelining(false);
    say(`Lined up. ${barOneLabel(kept ?? seconds)}.`);
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
  } else if (unavailable) message = LINE_UP_COPY.unavailable;
  else if (needsFirstTap) message = LINE_UP_COPY.firstTap;
  else if (pressedEarly && !status.started) message = LINE_UP_COPY.playFirst;
  else if (lined) message = `${barOneLabel(barOneSeconds)}. ${LINE_UP_COPY.drifting}`;
  else message = LINE_UP_COPY.prompt;

  // On the page from the start, empty: a live region added with its text is often not read.
  const liveRegion = (
    <p role="status" className="sr-only" data-testid="line-up-announcement">
      {announcementText(said)}
    </p>
  );

  if (typed !== null) {
    return (
      <form data-testid="line-up" className={blockClass} noValidate onSubmit={saveTyped}>
        <label
          className={`${wholeRow} flex h-11 min-w-0 items-center gap-2 text-xs/4 text-ink-soft`}
        >
          {/* The label gives way to what is wrong, in the same place and the same room. */}
          {typedInvalid ? (
            // Three lines in this width: a tighter leading keeps them inside the row's 44 px,
            // so a refused time moves nothing under the video (19 QA).
            <span role="alert" className="w-24 shrink-0 leading-3.5 text-danger">
              {LINE_UP_COPY.typedInvalid}
            </span>
          ) : (
            <span className="shrink-0">{LINE_UP_COPY.typedLabel}</span>
          )}
          <input
            className={`${inputClass} h-11 min-w-0 flex-1`}
            type="text"
            // The whole keyboard: a phone's decimal keypad has no colon and no letters, and
            // the field shows "0:07.25" and takes "1m30s" (19 QA issue 4). None of its help.
            inputMode="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            autoComplete="off"
            aria-label={LINE_UP_COPY.typedLabel}
            aria-invalid={typedInvalid || undefined}
            placeholder={LINE_UP_COPY.typedPlaceholder}
            value={typed.text}
            onChange={(event) => {
              setTyped({ ...typed, text: event.target.value });
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
        <button
          type="submit"
          className={`${primaryButtonClass} ${cellButton} ${wideCell} sideways:col-span-1`}
          aria-disabled={!online || undefined}
        >
          {LINE_UP_COPY.typedSave}
        </button>
        <button type="button" className={`${quietButtonClass} ${cellButton}`} onClick={closeTyping}>
          {LINE_UP_COPY.cancel}
        </button>
        {liveRegion}
      </form>
    );
  }

  return (
    <div data-testid="line-up" className={blockClass}>
      <div
        data-testid="line-up-message"
        className={`${messageCell} ${lined ? `${wideCell} sideways:col-span-2` : wholeRow} ${
          online && save.error ? 'justify-end' : 'justify-center'
        }`}
      >
        {message}
      </div>
      {lined ? (
        <>
          <button
            type="button"
            // Last beside the video, where the nudges have the row above to themselves.
            className={`${quietButtonClass} ${cellButton} sideways:order-last`}
            aria-disabled={!online || undefined}
            onClick={lineUpAgain}
            {...handOverAttributes('again')}
          >
            {LINE_UP_COPY.again}
          </button>
          {(['earlier', 'later'] as const).map((direction) => (
            <button
              key={direction}
              type="button"
              className={`${buttonClass} ${cellButton}`}
              aria-disabled={!online || !canNudge(barOneSeconds, direction) || undefined}
              onClick={() => nudge(direction)}
            >
              {LINE_UP_COPY[direction]}
            </button>
          ))}
          <button
            type="button"
            className={`${follow ? pressedButtonClass : buttonClass} ${cellButton}`}
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
            className={`${primaryButtonClass} ${cellButton} ${relining ? '' : wideCell} sideways:col-span-2`}
            aria-disabled={!canPressNow || undefined}
            onClick={lineUpNow}
            {...handOverAttributes('now')}
          >
            {LINE_UP_COPY.now}
          </button>
          <button
            type="button"
            className={`${quietButtonClass} ${cellButton} ${relining ? '' : ownRowBeside}`}
            aria-disabled={!online || undefined}
            onClick={openTyping}
          >
            {LINE_UP_COPY.type}
          </button>
          {relining && (
            <button
              type="button"
              className={`${quietButtonClass} ${cellButton}`}
              onClick={keepLineUp}
            >
              {LINE_UP_COPY.cancel}
            </button>
          )}
        </>
      )}
      {liveRegion}
    </div>
  );
}
