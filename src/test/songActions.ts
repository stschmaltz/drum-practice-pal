import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/**
 * A song row's "More" button (14 QA issue 3: Edit and Delete live in its
 * menu). Focus hand-overs to the row's Edit or Delete land on it.
 */
export const moreButton = (title: string) =>
  screen.getByRole('button', { name: `More actions for ${title}` });

/** Opens a song row's "More" menu and chooses Edit or Delete. */
export async function chooseSongAction(
  user: UserEvent,
  title: string,
  action: 'Edit' | 'Delete',
): Promise<void> {
  await user.click(moreButton(title));
  await user.click(screen.getByRole('menuitem', { name: action }));
}
