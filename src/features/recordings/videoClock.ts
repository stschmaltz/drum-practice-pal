/**
 * A time of a video as text (Unit 19): what its player's clock shows, and
 * what someone types for one. Pure: no React, no player.
 */
// Relative, not `@/`: videoSync.ts imports this, and tests/unit reads that under the node
// tsconfig, which has no alias.
import { BAR_ONE_SECONDS_MAX } from '../../lib/schema';

/** To the millisecond: finer than a press can be, and no float noise in the column. */
export const toMilliseconds = (seconds: number) => Math.round(seconds * 1000) / 1000;

/** "1:30", "1:02:03": whole seconds as a player's clock shows them. */
export function clockLabel(wholeSeconds: number): string {
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const secs = String(wholeSeconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

/** "0:07.25", "1:02:03.50": a second of the video as its player's clock shows it, to the hundredth. */
export function videoClockLabel(seconds: number): string {
  const hundredths = Math.round(Math.max(0, seconds) * 100);
  const fraction = String(hundredths % 100).padStart(2, '0');
  return `${clockLabel(Math.floor(hundredths / 100))}.${fraction}`;
}

/**
 * A time of the video as someone types it, in seconds to the millisecond, or
 * null for anything that isn't one the column takes: "7.25", "0:07.25",
 * "1:02:03.5" (minutes and seconds under 60 once there is a part before
 * them), and YouTube's own "1m30s" and "1h2m3s", by the same rule ("1m90s"
 * is refused). A comma is a decimal point. Never clamped: a time past the
 * limit is refused, not quietly moved.
 */
export function parseVideoClock(text: string): number | null {
  const typed = text.trim().replace(',', '.');
  const units = unitParts(typed);
  const seconds = units ? secondsOfUnits(units) : secondsOfColons(typed);
  if (seconds === null || !Number.isFinite(seconds)) return null;
  if (seconds < 0 || seconds > BAR_ONE_SECONDS_MAX) return null;
  return toMilliseconds(seconds);
}

/** Hours, minutes and seconds as written with their units, null for each left out. */
type UnitParts = readonly [hours: number | null, minutes: number | null, seconds: number | null];

/** The parts of "1h2m3.5s" (any of the three, in that order), or null for text not written that way. */
function unitParts(typed: string): UnitParts | null {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+(?:\.\d+)?)s)?$/.exec(typed);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  if (hours === undefined && minutes === undefined && seconds === undefined) return null;
  const numberOf = (part: string | undefined) => (part === undefined ? null : Number(part));
  return [numberOf(hours), numberOf(minutes), numberOf(seconds)];
}

function secondsOfUnits([hours, minutes, seconds]: UnitParts): number | null {
  // As with colons, a part after a larger one counts in sixties: "1m90s" isn't a time.
  if (hours !== null && minutes !== null && minutes >= 60) return null;
  if ((hours !== null || minutes !== null) && seconds !== null && seconds >= 60) return null;
  return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
}

/** "7.25", "0:07.25", "1:02:03.5": up to three parts, only the last with a fraction. */
function secondsOfColons(typed: string): number | null {
  const parts = typed.split(':');
  const last = parts[parts.length - 1] ?? '';
  const leading = parts.slice(0, -1);
  const wellFormed =
    parts.length <= 3 && /^\d+(\.\d+)?$/.test(last) && leading.every((part) => /^\d+$/.test(part));
  if (!wellFormed) return null;
  const numbers = [...leading.map(Number), Number(last)];
  // Everything after the first part counts in sixties.
  if (numbers.slice(1).some((part) => part >= 60)) return null;
  return numbers.reduce((total, part) => total * 60 + part, 0);
}
