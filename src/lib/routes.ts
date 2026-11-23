/** Builders for in-app paths that take a parameter. The route table is in src/App.tsx. */

export const songPath = (songId: string) => `/songs/${songId}`;

/** The song page's query parameter that names the loop to open on. */
export const LOOP_PARAM = 'loop';

/** A song's page opened on one of its loops, ready to play: where the home page's lists link to. */
export const loopPracticePath = (songId: string, loopId: string) =>
  `${songPath(songId)}?${LOOP_PARAM}=${loopId}`;
