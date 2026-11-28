import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { NOTHING_SAID, saying, type Announcement } from '@/lib/announcement';
import { isOnline, useOnline } from '@/lib/network';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import { LINE_UP_COPY, linedUpSaying, nudgedSaying } from './lineUpCopy';
import { findHandOver, type LineUpHandOver } from './lineUpFocus';
import {
  LineUpControls,
  LineUpLiveRegion,
  LineUpMessage,
  LineUpRows,
  TypedTimeForm,
  type FocusWatch,
} from './LineUpParts';
import { canLineUp, type RecordingPlayer } from './recordingPlayer';
import type { SongLink } from './songLinks';
import { useRecordingStatus } from './useRecordingPlayer';
import { useLineUpFailure, useLinkAtPress, useSaveBarOne } from './useSaveBarOne';
import { videoClockLabel } from './videoClock';
import {
  canNudge,
  lineUpSeconds,
  nudgedBarOne,
  typedBarOne,
  type NudgeDirection,
} from './videoSync';

/** The time being typed for bar 1, and what the field showed when it opened. */
interface TypedTime {
  text: string;
  openedOn: string;
}

/**
 * Lining the tab up with a video, under the video (Unit 19). The app can't
 * know where bar 1 falls in a recording, so the drummer says so once per
 * link: "Bar 1 starts now", pressed as the song comes in (or with the video
 * paused on the downbeat), saves the video's time at the press; "Type a
 * time" takes it from a field instead. From then on the same place holds the
 * nudges (a quarter of a second each, for a tab that drifts from the
 * recording), "Line up again", and the Follow toggle. Never required: a link
 * that isn't lined up plays exactly as before.
 *
 * This component holds the state and the presses; what each state draws is
 * in LineUpParts.tsx.
 *
 * Every save is online only, like the other edits of a link: the controls
 * are off offline with a note, and the handlers ask `isOnline()` themselves.
 * Each carries the address the link had at the press, so it can't land on a
 * link that was pointed at another video meanwhile (`saveBarOne`). A press
 * on "Bar 1 starts now" while it is off for a video nobody has played says
 * why.
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
  // From the shared cache: a save can fail after the line-up that sent it has left the page.
  const saveError = useLineUpFailure(songId, link.id);
  const linkAtPress = useLinkAtPress(songId);
  const focusWhenReady = useFocusWhenReady();
  // "Line up again" was pressed: the prompt is back, and the saved line-up stays until the next press.
  const [relining, setRelining] = useState(false);
  // "Type a time": null while no field is open; and whether what was last submitted wasn't a time.
  const [typed, setTyped] = useState<TypedTime | null>(null);
  const [typedInvalid, setTypedInvalid] = useState(false);
  // "Bar 1 starts now" was pressed on a video nobody has played yet.
  const [pressedEarly, setPressedEarly] = useState(false);

  const { barOneSeconds } = link;
  const lined = barOneSeconds !== null && !relining;
  const unavailable = status.status === 'unavailable';
  const needsFirstTap = firstTapAsks > 0 && !status.started;
  const { said, say } = useSayings({ unavailable, needsFirstTap, firstTapAsks });
  // "Line up again" has something to go back to only while a line-up is saved: one taken
  // away meanwhile (another device, the link pointed at another video) leaves the plain prompt.
  const canKeep = relining && barOneSeconds !== null;
  const watchFocus = useFocusKeptInLineUp(
    typed !== null ? 'typed' : lined ? 'lined' : canKeep ? 'relining' : 'prompt',
  );

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
    say(linedUpSaying(seconds));
    focusWhenReady(findHandOver('again'));
  };

  const nudge = (direction: NudgeDirection) => {
    if (!isOnline()) return;
    // What is there now, an earlier nudge still on its way included.
    const known = linkAtPress(link.id);
    if (!known || known.barOneSeconds === null || !canNudge(known.barOneSeconds, direction)) return;
    const next = nudgedBarOne(known.barOneSeconds, direction);
    save.mutate({ linkId: link.id, url: known.url, barOneSeconds: next });
    say(nudgedSaying(next));
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
    const time = typedBarOne(typed.text, typed.openedOn, barOneSeconds);
    if (time === null) {
      setTypedInvalid(true);
      return;
    }
    const known = linkAtPress(link.id);
    if (!known) return;
    if (time.changed) {
      save.mutate(
        { linkId: link.id, url: known.url, barOneSeconds: time.seconds },
        { onError: () => focusWhenReady(findHandOver(barOneSeconds === null ? 'now' : 'again')) },
      );
    }
    setTyped(null);
    setTypedInvalid(false);
    setRelining(false);
    say(linedUpSaying(time.seconds));
    focusWhenReady(findHandOver('again'));
  };

  return (
    <>
      {typed !== null ? (
        <TypedTimeForm
          text={typed.text}
          invalid={typedInvalid}
          online={online}
          onChange={(text) => {
            setTyped({ ...typed, text });
            setTypedInvalid(false);
          }}
          onSubmit={saveTyped}
          onCancel={closeTyping}
          watchFocus={watchFocus}
        />
      ) : (
        <LineUpRows watchFocus={watchFocus}>
          <LineUpMessage
            notice={{
              online,
              saveError,
              unavailable,
              needsFirstTap,
              pressedEarly: pressedEarly && !status.started,
              barOneSeconds: lined ? barOneSeconds : null,
            }}
          />
          <LineUpControls
            online={online}
            state={
              lined
                ? {
                    lined: true,
                    barOneSeconds,
                    follow,
                    onAgain: lineUpAgain,
                    onNudge: nudge,
                    onFollowChange,
                  }
                : {
                    lined: false,
                    canPressNow: online && canLineUp(status),
                    onNow: lineUpNow,
                    onType: openTyping,
                    onKeep: canKeep ? keepLineUp : null,
                  }
            }
          />
        </LineUpRows>
      )}
      {/* After the rows or the form, never inside either: the two are different elements, and
          a region inside them would be mounted anew, already holding its text, at each change
          between them, which a screen reader often doesn't read (19 Review). */}
      <LineUpLiveRegion said={said} />
    </>
  );
}

/** The sets of controls the line-up draws; each has one that stands in for the others'. */
type LineUpShape = 'prompt' | 'relining' | 'lined' | 'typed';

const STANDS_IN: Record<LineUpShape, LineUpHandOver> = {
  prompt: 'now',
  relining: 'now',
  lined: 'again',
  typed: 'typed',
};

/**
 * Keeps focus in the line-up when the control that has it is replaced by
 * something other than a press here: the read after a save that found the
 * link pointed at another video, a line-up made or taken away on another
 * device (19 QA after fix round 1, issue 4). A press hands focus on itself
 * (`useFocusWhenReady`); this is for the changes no press scheduled. As
 * `useFocusKeptInBar` does for the controls bar: the last control focused
 * here is remembered, and when a change of shape has taken it off the page
 * and left focus on `<body>`, the control that stands in for it gets it.
 * Focus that the user moved elsewhere is forgotten, never pulled back.
 */
function useFocusKeptInLineUp(shape: LineUpShape): FocusWatch {
  const lastFocused = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const last = lastFocused.current;
    if (!last || last.isConnected) return;
    lastFocused.current = null;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    findHandOver(STANDS_IN[shape])()?.focus();
  }, [shape]);
  return {
    onFocus: (event) => {
      if (event.target instanceof HTMLElement) lastFocused.current = event.target;
    },
    // Gone to another element: the user's own move. A blur to nothing (the control taken
    // off the page, the window left) keeps what was focused.
    onBlur: (event) => {
      if (event.relatedTarget !== null) lastFocused.current = null;
    },
  };
}

/**
 * What the line-up says in its live region: `say` for a press here, and by
 * itself what the page shows without one (19 QA issue 11): the note a key or
 * a tap on a bar asked for, at each ask, and a player that gives up. Those
 * are set while rendering, from what changed, rather than in an effect a
 * render late.
 */
function useSayings({
  unavailable,
  needsFirstTap,
  firstTapAsks,
}: {
  unavailable: boolean;
  needsFirstTap: boolean;
  firstTapAsks: number;
}): { said: Announcement; say: (text: string) => void } {
  const [said, setSaid] = useState(NOTHING_SAID);
  const say = (text: string) => setSaid((last) => saying(last, text));
  const noticeKey = `${unavailable}:${firstTapAsks}`;
  const [noticeSaid, setNoticeSaid] = useState(`${false}:${0}`);
  if (noticeSaid !== noticeKey) {
    setNoticeSaid(noticeKey);
    if (unavailable) say(LINE_UP_COPY.unavailable);
    else if (needsFirstTap) say(LINE_UP_COPY.firstTap);
  }
  return { said, say };
}
