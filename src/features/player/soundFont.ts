/**
 * The soundfonts every player loads, in order, each over the last. alphaTab
 * plays a note from the last loaded font that has its instrument.
 *
 * - Sonivox, as bundled with alphaTab (1.3 MB, Apache-2.0), for every
 *   instrument. The Vite plugin copies it to public/soundfont.
 * - MuseScore General's standard drum kit on its own (1.3 MB, MIT), built by
 *   `npm run drum-kit` into public/drumkit. Sonivox's kit is thin (its snare
 *   doesn't sound like a snare), and all of MuseScore General is 40 MB, too
 *   big to precache.
 */
export const PLAYER_SOUND_FONT_URLS: readonly string[] = [
  '/soundfont/sonivox.sf2',
  '/drumkit/drums.sf3',
];
