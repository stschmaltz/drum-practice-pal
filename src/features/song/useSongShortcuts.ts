import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Announcement } from '@/lib/announcement';
import { loopsInPanelOrder, type Loop } from '@/features/loops/loopForm';
import type { LoopPractice } from '@/features/loops/useLoopPractice';
import { readCharacterKeysOn } from '@/features/shortcuts/characterKeysPreference';
import {
  canChangeOptions,
  canPlay,
  canUseDrumToggles,
  type PlayGate,
  type SpeedGate,
} from '@/features/player/controlGates';
import {
  isRunning,
  type PlayerService,
  type PlayerSnapshot,
} from '@/features/player/PlayerService';
import { nudgeSpeedRatio, SPEED_STEP_PERCENT } from '@/features/player/speed';
import {
  focusKindOf,
  neighbourLoop,
  nextCountInBars,
  resolveShortcut,
  shortcutAnnouncement,
  steppedBar,
  type Direction,
  type ShortcutAction,
} from '@/features/shortcuts/shortcuts';

interface SongShortcutInputs {
  player: PlayerService | null;
  practice: LoopPractice;
  loops: readonly Loop[] | undefined;
  /** Space's gate, the same one the screen's Play/Pause button takes (`canPlay` unless given). */
  playGate?: PlayGate;
  /** The speed keys' gate, the same one the screen's speed control takes (`canChangeOptions` unless given). */
  speedGate?: SpeedGate;
  /**
   * True while the screen offers none of what the keys work (the play screen
   * on a recording, Unit 14): every key is left to the browser, so Space
   * can't start the tab under a video and a pedal can't switch a loop nobody
   * can see. YouTube's own keys work while its frame has focus.
   */
  off?: boolean;
  /**
   * Space on a recording (Unit 19), the one key that still acts while `off`:
   * it plays and pauses the video. Returns false to leave the key to the
   * browser (the video's player hasn't answered yet). Asked with the same
   * input guard as every shortcut, so Space typed into a field is a space.
   */
  recordingSpace?: (() => boolean) | null;
}

/**
 * The song page's keyboard shortcuts and pedal keys (`shortcuts.ts` has the
 * keys and the input guard). One `keydown` listener on the window for as long
 * as the page is mounted. Each action asks the same gate as the control it
 * stands for (`controlGates.ts`), of the player's snapshot at the press, not
 * the last render's: two presses before React has drawn the first still add up.
 * Everything runs inside the key press, so Space can start audio on iOS.
 */
export function useSongShortcuts({
  player,
  practice,
  loops,
  playGate = canPlay,
  speedGate = canChangeOptions,
  off = false,
  recordingSpace = null,
}: SongShortcutInputs) {
  const [helpOpen, setHelpOpen] = useState(false);
  // What the last key changed, for a live region: the control it changed may be folded
  // away or out of sight, and focus is elsewhere. `count` tells two equal sayings apart.
  const [announcement, setAnnouncement] = useState<Announcement>({ text: '', count: 0 });
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // Read by the listener at each press, so it is installed once and never sees an old render.
  const latest = useRef({
    player,
    practice,
    loops,
    playGate,
    speedGate,
    helpOpen,
    off,
    recordingSpace,
  });
  useLayoutEffect(() => {
    latest.current = {
      player,
      practice,
      loops,
      playGate,
      speedGate,
      helpOpen,
      off,
      recordingSpace,
    };
  });

  useEffect(() => {
    // Space's keyup on a button presses it in some browsers even when its keydown was taken.
    let swallowSpaceKeyup = false;

    const onKeyDown = (event: KeyboardEvent) => {
      // Only for the press whose keydown this is: a keyup lost to another window must not
      // cancel a later Space the page leaves alone (the shortcut list's Close).
      if (event.key === ' ') swallowSpaceKeyup = false;
      const { off, recordingSpace } = latest.current;
      if (off && !recordingSpace) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const resolved = resolveShortcut(event, {
        focus: focusKindOf(
          target && {
            tagName: target.tagName,
            type: target instanceof HTMLInputElement ? target.type : undefined,
            isContentEditable: target.isContentEditable,
            role: target.getAttribute('role'),
          },
        ),
        helpOpen: latest.current.helpOpen,
        // Read at the press, so turning it off in Settings or another tab needs no reload.
        characterKeys: readCharacterKeysOn(),
      });
      if (!resolved) return;
      if (off) {
        // Only Space, and only when the video's player took it: every other key is the browser's.
        if (resolved.action !== 'togglePlay') return;
        if (resolved.run && !recordingSpace?.()) return;
        event.preventDefault();
        swallowSpaceKeyup = true;
        return;
      }
      // The key is ours even when this press does nothing: no page scroll or button press under it.
      event.preventDefault();
      if (event.key === ' ') swallowSpaceKeyup = true;
      if (!resolved.run) return;
      if (resolved.action === 'closeHelp') {
        setHelpOpen(false);
        return;
      }
      if (resolved.action === 'help') {
        setHelpOpen((open) => !open);
        return;
      }
      const { player } = latest.current;
      const before = player?.getSnapshot();
      const moved = runShortcut(resolved.action, latest.current);
      if (player && before) {
        const said = shortcutAnnouncement(before, player.getSnapshot(), moved);
        if (said !== null) setAnnouncement((last) => ({ text: said, count: last.count + 1 }));
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ' || !swallowSpaceKeyup) return;
      swallowSpaceKeyup = false;
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return { helpOpen, openHelp, closeHelp, announcement };
}

/** Runs the action; returns where a loop key moved to, for the announcement. */
function runShortcut(
  action: Exclude<ShortcutAction, 'help'>,
  { player, practice, loops, playGate = canPlay, speedGate = canChangeOptions }: SongShortcutInputs,
): string | null {
  if (!player) return null;
  const snapshot = player.getSnapshot();
  switch (action) {
    case 'togglePlay':
      if (playGate(player, snapshot)) player.togglePlay();
      return null;
    case 'speedUp':
    case 'speedDown':
      if (!speedGate(player, snapshot)) return null;
      player.setSpeed(
        nudgeSpeedRatio(
          snapshot.speedRatio,
          action === 'speedUp' ? SPEED_STEP_PERCENT : -SPEED_STEP_PERCENT,
        ),
      );
      return null;
    case 'previousLoop':
    case 'nextLoop':
      return stepLoopOrBar(
        player,
        snapshot,
        { practice, loops },
        action === 'nextLoop' ? 'next' : 'previous',
      );
    case 'metronome':
      if (canChangeOptions(player, snapshot)) player.setMetronomeOn(!snapshot.metronomeOn);
      return null;
    case 'drumsMuted':
      if (canUseDrumToggles(player, snapshot)) player.setDrumsMuted(!snapshot.drumsMuted);
      return null;
    case 'drumsOnly':
      if (canUseDrumToggles(player, snapshot)) player.setDrumsOnly(!snapshot.drumsOnly);
      return null;
    case 'countIn':
      if (canChangeOptions(player, snapshot)) {
        player.setCountInBars(nextCountInBars(snapshot.countInBars));
      }
      return null;
  }
}

/**
 * The previous or next loop in the panel's order. While playing, the loop
 * plays (`playLoop`, as "Play loop" does, so playback carries on with a
 * count-in if one is set); while paused it is only set up with its saved
 * speed (`openLoop`), as a link to it would: a key that switches never starts
 * sound on its own. A song with no loops steps a bar instead. Nothing while
 * the loop form is open (the score's taps are picking its bars then), or
 * before the song's loops have been read. Returns what it moved to, to be
 * said ("Loop Verse", "Bar 5"), or null when it didn't move.
 */
function stepLoopOrBar(
  player: PlayerService,
  snapshot: PlayerSnapshot,
  { practice, loops }: Pick<SongShortcutInputs, 'practice' | 'loops'>,
  direction: Direction,
): string | null {
  if (!canPlay(player, snapshot) || practice.editor !== null) return null;
  // Not read yet (or the read failed): whether these keys mean loops or bars isn't known.
  if (!loops) return null;

  const order = loopsInPanelOrder(loops);
  if (order.length === 0) return stepBar(player, snapshot, direction);
  const loop = neighbourLoop(order, practice.activeLoop?.id ?? null, direction);
  if (!loop) return null;
  if (isRunning(snapshot.status)) practice.playLoop(loop);
  else practice.openLoop(loop);
  return `Loop ${loop.name}`;
}

/** A bar back or on, in a song with no loops. */
function stepBar(
  player: PlayerService,
  snapshot: PlayerSnapshot,
  direction: Direction,
): string | null {
  if (snapshot.barCount === null) return null;
  const bar = steppedBar(snapshot.barNumber ?? 1, snapshot.barCount, direction);
  if (bar === null || !player.seekToBar(bar)) return null;
  // A key isn't a tap on the score: the bar may be off screen (a no-op while playing).
  player.showBar(bar);
  return `Bar ${bar}`;
}
