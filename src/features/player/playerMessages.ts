/** Fixed copy for player failures; alphaTab's own messages mean nothing to a drummer. */
import type { PlayerError } from './PlayerService';

export const PLAYER_ERROR_MESSAGES: Record<PlayerError, string> = {
  score: "This song couldn't be shown or played. Try reloading, or upload the file again.",
  engine: "The player couldn't start. Check your connection and reload the page.",
  soundFont:
    "The drum sounds couldn't be loaded. They load by themselves when you're back online, or reload the page.",
};
