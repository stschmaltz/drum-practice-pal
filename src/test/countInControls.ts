/**
 * The controls bar's count-in, two segmented controls (12 UX pass): what is
 * chosen in each, and choosing. Shared by the controls bar's and the song
 * page's tests, so neither spells out the radios.
 */
import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

export const countInGroup = () => screen.getByRole('radiogroup', { name: 'Count-in' });

/** Null while the count-in is off: the mode is only shown with a count-in to play. */
export const countInModeGroup = () =>
  screen.queryByRole('radiogroup', { name: 'When to count in' });

/** The words on the option a segmented control has on ("2 bars", "Every repeat"), or null. */
export function chosenIn(group: HTMLElement | null): string | null {
  if (!group) return null;
  const radio = within(group)
    .getAllByRole<HTMLInputElement>('radio')
    .find((each) => each.checked);
  return radio?.closest('label')?.textContent ?? null;
}

export const chosenCountIn = () => chosenIn(countInGroup());
export const chosenCountInMode = () => chosenIn(countInModeGroup());

export async function chooseIn(user: UserEvent, group: HTMLElement | null, label: string) {
  if (!group) throw new Error(`No group to choose "${label}" in`);
  await user.click(within(group).getByRole('radio', { name: label }));
}
