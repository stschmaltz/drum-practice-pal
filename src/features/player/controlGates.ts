/**
 * When each player control can act, shared by the buttons that trigger an
 * action, the action itself where it can refuse, and the keyboard shortcuts
 * (Unit 10). A control and its key must never disagree about whether a press
 * would do anything.
 */
import { isLoaded, type PlayerService, type PlayerSnapshot } from './PlayerService';

/**
 * Whether playback can start: the song is loaded (or already running). Not
 * the bar count alone: the score loads before the MIDI and the soundfont, and
 * until those are in `play()` does nothing. Play/Pause, Back to start, "Play
 * loop" and every key that starts or moves playback go by this.
 */
export function canPlay(player: PlayerService | null, snapshot: PlayerSnapshot): boolean {
  return player !== null && isLoaded(snapshot.status);
}

/** Speed, metronome and count-in work before the song is ready; they only need the player. */
export function canChangeOptions(player: PlayerService | null): player is PlayerService {
  return player !== null;
}

/** Mute drums and Drums only, which need a drum track to act on. */
export function canUseDrumToggles(player: PlayerService | null, snapshot: PlayerSnapshot): boolean {
  return player !== null && snapshot.hasDrumTrack;
}
