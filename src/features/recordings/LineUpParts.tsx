import type { FocusEvent, FormEvent, ReactNode } from 'react';
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
import { announcementText, type Announcement } from '@/lib/announcement';
import { failureCopy } from '@/lib/errorCopy';
import { barOneLabel, LINE_UP_COPY } from './lineUpCopy';
import { handOverAttributes } from './lineUpFocus';
import { canNudge, type NudgeDirection } from './videoSync';

/**
 * What the line-up under a video is drawn from (Unit 19): its grid, its
 * message, its buttons for each state and the typed time's form. `LineUp.tsx` holds the state and the presses;
 * nothing here saves or reads a player.
 *
 * The grid's rows have fixed heights, so nothing on the page moves when
 * their content changes, whatever state the line-up is in. Two rows of three
 * columns under the video; in a phone on its side, where it sits beside the
 * video in some 200 px, three rows of two, so every control has a cell of its
 * own and none runs under the video (19 QA issue 2).
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
 * video), never out of the button. The padding is marked important: the
 * button classes carry a wider one of their own, which otherwise wins and
 * leaves "Bar 1 starts now" three lines in a 320 px phone's third of a row
 * (19 QA after fix round 1).
 */
const cellButton = 'h-11 w-full min-w-0 px-2! py-0! text-center text-sm leading-tight';
/**
 * The words' cell. A message is at most three lines here; a failure can be
 * more on a narrow phone, and then it grows upward out of its row (into the
 * spare room of the link above) and moves nothing (19 QA issue 10).
 */
const messageCell = 'flex min-w-0 flex-col text-xs/4 text-ink-soft [&>p]:text-xs/3.5';

/**
 * The room the line-up takes, drawn empty while the song's links are still
 * read: the score under the video doesn't move when they arrive.
 */
export function LineUpSpace() {
  return <div className={blockClass} aria-hidden="true" data-testid="line-up-space" />;
}

/**
 * Focus coming into and leaving the line-up, heard on its root in either
 * state, for `LineUp` to keep focus when a control is replaced under it.
 */
export interface FocusWatch {
  onFocus: (event: FocusEvent<HTMLElement>) => void;
  onBlur: (event: FocusEvent<HTMLElement>) => void;
}

/** The line-up's grid with its message and controls: every state but the typed time's form. */
export function LineUpRows({
  children,
  watchFocus,
}: {
  children: ReactNode;
  watchFocus: FocusWatch;
}) {
  return (
    <div data-testid="line-up" className={blockClass} {...watchFocus}>
      {children}
    </div>
  );
}

/**
 * On the page from the start, empty: a live region added with its text is
 * often not read. `LineUp` draws it after the rows or the form, as their
 * sibling, so it is one element through every state.
 */
export function LineUpLiveRegion({ said }: { said: Announcement }) {
  return (
    <p role="status" className="sr-only" data-testid="line-up-announcement">
      {announcementText(said)}
    </p>
  );
}

/** What the line-up has to say, most pressing first; `barOneSeconds` null while the prompt is on show. */
export interface LineUpNotice {
  online: boolean;
  saveError: unknown;
  /** The video's player will never answer. */
  unavailable: boolean;
  /** A key or a tap on a bar asked for a video nobody has started. */
  needsFirstTap: boolean;
  /** "Bar 1 starts now" was pressed on a video nobody has started. */
  pressedEarly: boolean;
  barOneSeconds: number | null;
}

/** The words' cell: beside "Line up again" once lined up, across the block until then. */
export function LineUpMessage({ notice }: { notice: LineUpNotice }) {
  const lined = notice.barOneSeconds !== null;
  const failed = notice.online && Boolean(notice.saveError);
  return (
    <div
      data-testid="line-up-message"
      className={`${messageCell} ${lined ? `${wideCell} sideways:col-span-2` : wholeRow} ${
        failed ? 'justify-end' : 'justify-center'
      }`}
    >
      {noticeContent(notice)}
    </div>
  );
}

function noticeContent(notice: LineUpNotice): ReactNode {
  if (!notice.online) return <OfflineNote>{LINE_UP_COPY.offline}</OfflineNote>;
  if (notice.saveError) {
    return (
      <ErrorAlert>
        {LINE_UP_COPY.saveFailed} {failureCopy(notice.saveError)}
      </ErrorAlert>
    );
  }
  if (notice.unavailable) return LINE_UP_COPY.unavailable;
  if (notice.needsFirstTap) return LINE_UP_COPY.firstTap;
  if (notice.pressedEarly) return LINE_UP_COPY.playFirst;
  if (notice.barOneSeconds !== null) {
    return `${barOneLabel(notice.barOneSeconds)}. ${LINE_UP_COPY.drifting}`;
  }
  return LINE_UP_COPY.prompt;
}

/** A link that isn't lined up, or "Line up again" pressed on one that is. */
export interface PromptState {
  lined: false;
  /** Off, "Bar 1 starts now" still takes the press: it says why it is off. */
  canPressNow: boolean;
  onNow: () => void;
  onType: () => void;
  /** Cancel, drawn only while a saved line-up is being replaced; null otherwise. */
  onKeep: (() => void) | null;
}

/** A lined-up link. */
export interface LinedUpState {
  lined: true;
  barOneSeconds: number;
  follow: boolean;
  onAgain: () => void;
  onNudge: (direction: NudgeDirection) => void;
  onFollowChange: (follow: boolean) => void;
}

/**
 * The line-up's buttons, for either state. One component on purpose, with a
 * fragment of buttons per state: the buttons that stand in for one another
 * ("Bar 1 starts now" and "Line up again", first in each) are then the same
 * element before and after a press, so focus on the pressed one is never
 * dropped while the hand-over waits. Two components would be two sets of
 * elements.
 */
export function LineUpControls({
  state,
  online,
}: {
  state: PromptState | LinedUpState;
  online: boolean;
}) {
  return state.lined ? linedUpButtons(state, online) : promptButtons(state, online);
}

/** "Bar 1 starts now", "Type a time" and, while lining up again, Cancel, which keeps the saved line-up. */
function promptButtons({ canPressNow, onNow, onType, onKeep }: PromptState, online: boolean) {
  const relining = onKeep !== null;
  return (
    <>
      <button
        type="button"
        className={`${primaryButtonClass} ${cellButton} ${relining ? '' : wideCell} sideways:col-span-2`}
        aria-disabled={!canPressNow || undefined}
        onClick={onNow}
        {...handOverAttributes('now')}
      >
        {LINE_UP_COPY.now}
      </button>
      <button
        type="button"
        className={`${quietButtonClass} ${cellButton} ${relining ? '' : ownRowBeside}`}
        aria-disabled={!online || undefined}
        onClick={onType}
      >
        {LINE_UP_COPY.type}
      </button>
      {onKeep && (
        <button type="button" className={`${quietButtonClass} ${cellButton}`} onClick={onKeep}>
          {LINE_UP_COPY.cancel}
        </button>
      )}
    </>
  );
}

const NUDGE_DIRECTIONS = ['earlier', 'later'] as const satisfies readonly NudgeDirection[];

/** "Line up again", the two nudges and the Follow toggle. */
function linedUpButtons(
  { barOneSeconds, follow, onAgain, onNudge, onFollowChange }: LinedUpState,
  online: boolean,
) {
  return (
    <>
      <button
        type="button"
        // Last beside the video, where the nudges have the row above to themselves.
        className={`${quietButtonClass} ${cellButton} sideways:order-last`}
        aria-disabled={!online || undefined}
        onClick={onAgain}
        {...handOverAttributes('again')}
      >
        {LINE_UP_COPY.again}
      </button>
      {NUDGE_DIRECTIONS.map((direction) => (
        <button
          key={direction}
          type="button"
          className={`${buttonClass} ${cellButton}`}
          aria-disabled={!online || !canNudge(barOneSeconds, direction) || undefined}
          onClick={() => onNudge(direction)}
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
  );
}

/**
 * "Type a time": a field in the place of the line-up's rows, on the same
 * grid, so the score under the video doesn't move when it opens.
 */
export function TypedTimeForm({
  text,
  invalid,
  online,
  onChange,
  onSubmit,
  onCancel,
  watchFocus,
}: {
  text: string;
  /** What was last submitted wasn't a time. */
  invalid: boolean;
  online: boolean;
  onChange: (text: string) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  watchFocus: FocusWatch;
}) {
  return (
    <form
      data-testid="line-up"
      className={blockClass}
      noValidate
      onSubmit={onSubmit}
      {...watchFocus}
    >
      <label className={`${wholeRow} flex h-11 min-w-0 items-center gap-2 text-xs/4 text-ink-soft`}>
        {/* The label gives way to what is wrong, in the same place and the same room. */}
        {invalid ? (
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
          aria-invalid={invalid || undefined}
          placeholder={LINE_UP_COPY.typedPlaceholder}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          // Escape leaves the field as Cancel does; cancelled so it reaches nothing else.
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            onCancel();
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
      <button type="button" className={`${quietButtonClass} ${cellButton}`} onClick={onCancel}>
        {LINE_UP_COPY.cancel}
      </button>
    </form>
  );
}
