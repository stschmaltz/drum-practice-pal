import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { loopsInPanelOrder, type Loop } from '@/features/loops/loopForm';
import type { LoopPractice } from '@/features/loops/useLoopPractice';
import { readCharacterKeysOn } from '@/features/shortcuts/characterKeysPreference';
import { canChangeOptions, canPlay, canUseDrumToggles } from '@/features/player/controlGates';
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
  steppedBar,
  type Direction,
  type ShortcutAction,
} from '@/features/shortcuts/shortcuts';

interface SongShortcutInputs {
  player: PlayerService | null;
  practice: LoopPractice;
  loops: readonly Loop[] | undefined;
}

/**
 * The song page's keyboard shortcuts and pedal keys (`shortcuts.ts` has the
 * keys and the input guard). One `keydown` listener on the window for as long
 * as the page is mounted. Each action asks the same gate as the control it
 * stands for (`controlGates.ts`), of the player's snapshot at the press, not
 * the last render's: two presses before React has drawn the first still add up.
 * Everything runs inside the key press, so Space can start audio on iOS.
 */
export function useSongShortcuts({ player, practice, loops }: SongShortcutInputs) {
  const [helpOpen, setHelpOpen] = useState(false);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);

  // Read by the listener at each press, so it is installed once and never sees an old render.
  const latest = useRef({ player, practice, loops, helpOpen });
  useLayoutEffect(() => {
    latest.current = { player, practice, loops, helpOpen };
  });

  useEffect(() => {
    // Space's keyup on a button presses it in some browsers even when its keydown was taken.
    let swallowSpaceKeyup = false;

    const onKeyDown = (event: KeyboardEvent) => {
      // Only for the press whose keydown this is: a keyup lost to another window must not
      // cancel a later Space the page leaves alone (the shortcut list's Close).
      if (event.key === ' ') swallowSpaceKeyup = false;
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
      runShortcut(resolved.action, latest.current);
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

  return { helpOpen, openHelp, closeHelp };
}

function runShortcut(
  action: Exclude<ShortcutAction, 'help'>,
  { player, practice, loops }: SongShortcutInputs,
): void {
  if (!player) return;
  const snapshot = player.getSnapshot();
  switch (action) {
    case 'togglePlay':
      if (canPlay(player, snapshot)) player.togglePlay();
      return;
    case 'speedUp':
    case 'speedDown':
      if (!canChangeOptions(player)) return;
      player.setSpeed(
        nudgeSpeedRatio(
          snapshot.speedRatio,
          action === 'speedUp' ? SPEED_STEP_PERCENT : -SPEED_STEP_PERCENT,
        ),
      );
      return;
    case 'previousLoop':
    case 'nextLoop':
      stepLoopOrBar(
        player,
        snapshot,
        { practice, loops },
        action === 'nextLoop' ? 'next' : 'previous',
      );
      return;
    case 'metronome':
      if (canChangeOptions(player)) player.setMetronomeOn(!snapshot.metronomeOn);
      return;
    case 'drumsMuted':
      if (canUseDrumToggles(player, snapshot)) player.setDrumsMuted(!snapshot.drumsMuted);
      return;
    case 'drumsOnly':
      if (canUseDrumToggles(player, snapshot)) player.setDrumsOnly(!snapshot.drumsOnly);
      return;
    case 'countIn':
      if (canChangeOptions(player)) player.setCountInBars(nextCountInBars(snapshot.countInBars));
      return;
  }
}

/**
 * The previous or next loop in the panel's order. While playing, the loop
 * plays (`playLoop`, as "Play loop" does, so playback carries on with a
 * count-in if one is set); while paused it is only set up with its saved
 * speed (`openLoop`), as a link to it would: a key that switches never starts
 * sound on its own. A song with no loops steps a bar instead. Nothing while
 * the loop form is open (the score's taps are picking its bars then), or
 * before the song's loops have been read.
 */
function stepLoopOrBar(
  player: PlayerService,
  snapshot: PlayerSnapshot,
  { practice, loops }: Pick<SongShortcutInputs, 'practice' | 'loops'>,
  direction: Direction,
): void {
  if (!canPlay(player, snapshot) || practice.editor !== null) return;
  // Not read yet (or the read failed): whether these keys mean loops or bars isn't known.
  if (!loops) return;

  const order = loopsInPanelOrder(loops);
  if (order.length === 0) {
    stepBar(player, snapshot, direction);
    return;
  }
  const loop = neighbourLoop(order, practice.activeLoop?.id ?? null, direction);
  if (!loop) return;
  if (isRunning(snapshot.status)) practice.playLoop(loop);
  else practice.openLoop(loop);
}

/** A bar back or on, in a song with no loops. */
function stepBar(player: PlayerService, snapshot: PlayerSnapshot, direction: Direction): void {
  if (snapshot.barCount === null) return;
  const bar = steppedBar(snapshot.barNumber ?? 1, snapshot.barCount, direction);
  if (bar === null || !player.seekToBar(bar)) return;
  // A key isn't a tap on the score: the bar may be off screen (a no-op while playing).
  player.showBar(bar);
}
