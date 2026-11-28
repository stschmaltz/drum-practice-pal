/**
 * The words of the line-up under a video (Unit 19). In a module of its own,
 * with no component, so tests and the component share them.
 */
import { videoClockLabel } from './videoSync';

/** The words of the line under the video, in one place. */
export const LINE_UP_COPY = {
  prompt: 'Line the tab up: when bar 1 starts, press',
  now: 'Bar 1 starts now',
  again: 'Line up again',
  cancel: 'Cancel',
  type: 'Type a time',
  typedLabel: 'Bar 1 starts at',
  typedPlaceholder: '0:07.25',
  typedSave: 'Save',
  typedInvalid: 'A time in the video, like 0:07 or 1:23.5',
  earlier: 'Tab earlier',
  later: 'Tab later',
  follow: 'Follow',
  drifting: 'Drifting? Nudge the tab.',
  firstTap: 'Press Play on the video once. After that, Space and a tap on a bar work it.',
  unavailable: 'The tab can’t follow this video: its player isn’t answering here.',
  offline: 'You’re offline. Lining the tab up needs a connection.',
  saveFailed: 'Couldn’t save where bar 1 starts.',
} as const;

/** Where bar 1 is, for the line and for the live region. */
export const barOneLabel = (barOneSeconds: number) => `Bar 1 at ${videoClockLabel(barOneSeconds)}`;
