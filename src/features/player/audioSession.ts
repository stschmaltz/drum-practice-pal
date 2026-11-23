/**
 * iOS audio. alphaTab resumes its suspended AudioContext itself, on the first
 * tap anywhere and inside play(), which must therefore run synchronously in
 * the tap handler (see PlayerService.play). What it doesn't do: with the
 * ringer switch on silent, iOS mutes Web Audio unless the page's audio
 * session is "playback". Safari 17+ exposes that as navigator.audioSession.
 */

export interface AudioSessionNavigator {
  audioSession?: { type: string };
}

function browserNavigator(): AudioSessionNavigator | undefined {
  return typeof navigator === 'undefined' ? undefined : (navigator as AudioSessionNavigator);
}

/** Call from the play tap. A no-op where the API doesn't exist. */
export function preferPlaybackAudioSession(
  nav: AudioSessionNavigator | undefined = browserNavigator(),
): void {
  const session = nav?.audioSession;
  if (session && session.type !== 'playback') session.type = 'playback';
}
