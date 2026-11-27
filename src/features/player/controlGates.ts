/**
 * When each player control can act, shared by the buttons that trigger an
 * action, the action itself where it can refuse, and the keyboard shortcuts
 * (Unit 10). A control and its key must never disagree about whether a press
 * would do anything.
 */
import {
  isLoaded,
  isRunning,
  showsScoreBars,
  type PlayerService,
  type PlayerSnapshot,
} from './PlayerService';

/**
 * Whether playback can start: the song is loaded (or already running). Not
 * the bar count alone: the score loads before the MIDI and the soundfont, and
 * until those are in `play()` does nothing. Play/Pause, Back to start, "Play
 * loop" and every key that starts or moves playback go by this.
 */
export function canPlay(player: PlayerService | null, snapshot: PlayerSnapshot): boolean {
  return player !== null && isLoaded(snapshot.status);
}

/**
 * Play/Pause on a loop's practice screen (its button and Space). The sounds
 * can be in before the loop is open (a cached list, the fresh read not back),
 * and a Play then would play the whole song with no range (16 Test bug 1), so
 * starting also waits for the loop. Pausing never does.
 */
export function canPlayLoopPractice(
  player: PlayerService | null,
  snapshot: PlayerSnapshot,
  loopOpen: boolean,
): boolean {
  return canPlay(player, snapshot) && (loopOpen || isRunning(snapshot.status));
}

/** How a screen decides whether its Play/Pause can be pressed: `canPlay`, or a stricter one. */
export type PlayGate = (player: PlayerService | null, snapshot: PlayerSnapshot) => boolean;

/**
 * Speed, metronome and count-in work before the song is ready; they only need
 * the player. Not after it has failed: nothing will play, and a control that
 * still moves reads as a player that still works.
 */
export function canChangeOptions(
  player: PlayerService | null,
  snapshot: PlayerSnapshot,
): player is PlayerService {
  return player !== null && snapshot.status !== 'error';
}

/** Mute drums and Drums only, which need a drum track to act on. */
export function canUseDrumToggles(player: PlayerService | null, snapshot: PlayerSnapshot): boolean {
  return canChangeOptions(player, snapshot) && snapshot.hasDrumTrack;
}

/**
 * Opening the loop form and picking its bars on the score: "New loop", each
 * loop's "Edit", a drag across bars, and the form itself. They need the
 * score's bars, not its sounds, so they work while the soundfont loads.
 */
export function canPickBars(snapshot: PlayerSnapshot): boolean {
  return showsScoreBars(snapshot);
}

/**
 * The metronome's sounds and subdivision: an option like the others, but only
 * while nothing plays or counts in, since applying one rebuilds the song's
 * MIDI (PlayerService.setMetronomeVoice).
 */
export function canChangeMetronomeVoice(
  player: PlayerService | null,
  snapshot: PlayerSnapshot,
): player is PlayerService {
  return canChangeOptions(player, snapshot) && !isRunning(snapshot.status);
}
