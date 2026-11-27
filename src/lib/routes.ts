/**
 * Builders for in-app paths. The route table is in src/App.tsx. Three levels
 * (Unit 14): Songs (`/`), a song's overview, then practising one loop or
 * playing the whole song.
 */
import { isUuid } from './randomUuid';

export const SONGS_PATH = '/';
export const STATS_PATH = '/stats';

/** A song's overview: its loops and how far each has come. Loads no player. */
export const songPath = (songId: string) => `/songs/${songId}`;

/** Jam mode: the whole song in the player. */
export const songPlayPath = (songId: string) => `${songPath(songId)}/play`;

/** The query parameters the jam page reads to open the loop form for a new loop or an edit. */
export const NEW_LOOP_PARAM = 'new';
export const EDIT_LOOP_PARAM = 'edit';

/** Jam mode with the loop form open for a new loop; the save goes on to its practice screen. */
export const newLoopPath = (songId: string) => `${songPlayPath(songId)}?${NEW_LOOP_PARAM}=1`;

/** Jam mode with the loop form open on one loop; the save goes back to the song. */
export const editLoopPath = (songId: string, loopId: string) =>
  `${songPlayPath(songId)}?${EDIT_LOOP_PARAM}=${loopId}`;

/** The practice screen: one loop, at its saved speed, ready for Play. */
export const loopPracticePath = (songId: string, loopId: string) =>
  `${songPath(songId)}/loops/${loopId}`;

/** The query parameter earlier builds used to open a song on a loop (`/songs/:id?loop=<id>`). */
export const LEGACY_LOOP_PARAM = 'loop';

/**
 * Where a link from an earlier build goes: `/songs/:id?loop=<id>` is now the
 * loop's practice screen. Null when the parameter is missing or isn't an id.
 */
export function legacyLoopRedirect(songId: string, params: URLSearchParams): string | null {
  const loopId = params.get(LEGACY_LOOP_PARAM);
  return loopId !== null && isUuid(loopId) && isUuid(songId)
    ? loopPracticePath(songId, loopId)
    : null;
}

/** `/library` from earlier builds: the songs list, with its search and sort kept. */
export const libraryRedirect = (search: string) => `${SONGS_PATH}${search}`;
