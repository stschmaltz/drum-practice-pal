/**
 * Typing where bar 1 starts (Unit 19, from Shane trying the line-up: "let's
 * allow users to enter a timestamp directly"). The line-up alone, over the
 * fake video player and an in-memory links table; the press-as-it-plays path
 * and the following are SongPage.test.tsx's.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { queryResult, resetFakeSupabase } from '@/test/fakeSupabase';
import { FakeRecordingPlayer } from '@/test/fakeRecordingPlayer';
import { LINK_SONG_ID, linkTable, videoLink, type LinkTable } from '@/test/linkTable';
import { expectLocked } from '@/test/locked';
import { settle, testQueryClient, wrapperFor } from '@/test/render';
import { LineUp } from './LineUp';
import { useSongLinks } from './useSongLinks';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const LINK_ID = 'link-original';
let links: LinkTable;

beforeEach(() => {
  resetFakeSupabase();
});

/** The line-up as the play screen draws it: the link's saved time comes from the cached list. */
function Harness({ player }: { player: FakeRecordingPlayer }) {
  const saved = useSongLinks(LINK_SONG_ID).data?.find((row) => row.id === LINK_ID);
  if (!saved) return null;
  return (
    <LineUp
      songId={LINK_SONG_ID}
      link={{ id: saved.id, barOneSeconds: saved.bar_one_seconds ?? null }}
      player={player}
      follow
      onFollowChange={() => {}}
      needsFirstTap={false}
    />
  );
}

async function renderLineUp(barOneSeconds: number | null = null) {
  links = linkTable([videoLink(LINK_ID, { bar_one_seconds: barOneSeconds })]);
  queryResult.mockImplementation((call) => links.answer(call));
  const player = new FakeRecordingPlayer();
  const user = userEvent.setup();
  render(<Harness player={player} />, { wrapper: wrapperFor(testQueryClient()) });
  await screen.findByTestId('line-up');
  return { user, player };
}

const button = (name: string) => screen.getByRole('button', { name });
const field = () => screen.getByRole('textbox', { name: 'Bar 1 starts at' });
const message = () => screen.getByTestId('line-up-message');
const barOneSent = () =>
  links.sent('update').map((sent) => (sent as { bar_one_seconds: number }).bar_one_seconds);

describe('typing where bar 1 starts', () => {
  it('needs no playing video: a typed time is saved and the tab is lined up', async () => {
    const { user } = await renderLineUp();
    // The video has never been played: the press-as-it-plays button is off, typing is not.
    expectLocked(button('Bar 1 starts now'));
    await user.click(button('Type a time'));
    await waitFor(() => expect(field()).toHaveFocus());
    expect(field()).toHaveValue('');

    await user.type(field(), '0:07.25');
    await user.click(button('Save'));

    await waitFor(() => expect(barOneSent()).toEqual([7.25]));
    expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 7.25 });
    expect(message()).toHaveTextContent('Bar 1 at 0:07.25. Drifting? Nudge the tab.');
    expect(screen.getByTestId('line-up-announcement')).toHaveTextContent(
      'Lined up. Bar 1 at 0:07.25.',
    );
    // The field has gone: focus is on the control that stands in its place.
    await waitFor(() => expect(button('Line up again')).toHaveFocus());
  });

  it('Enter saves; seconds alone and a comma are read too', async () => {
    const { user } = await renderLineUp();
    await user.click(button('Type a time'));
    await user.type(field(), '83,5{Enter}');
    await waitFor(() => expect(barOneSent()).toEqual([83.5]));
    expect(message()).toHaveTextContent('Bar 1 at 1:23.50.');
  });

  it('a lined-up link opens the field on its time, by way of "Line up again"', async () => {
    const { user } = await renderLineUp(12.5);
    await user.click(button('Line up again'));
    await user.click(button('Type a time'));
    expect(field()).toHaveValue('0:12.50');

    await user.clear(field());
    await user.type(field(), '0:13');
    await user.click(button('Save'));
    await waitFor(() => expect(barOneSent()).toEqual([13]));
    expect(message()).toHaveTextContent('Bar 1 at 0:13.00.');
  });

  it('the saved time typed back unchanged sends nothing', async () => {
    const { user } = await renderLineUp(12.5);
    await user.click(button('Line up again'));
    await user.click(button('Type a time'));
    await user.click(button('Save'));
    expect(message()).toHaveTextContent('Bar 1 at 0:12.50.');
    await settle();
    expect(links.sent('update')).toEqual([]);
  });

  it('refuses what isn’t a time, says so in fixed copy, keeps what was typed and saves nothing', async () => {
    const { user } = await renderLineUp();
    await user.click(button('Type a time'));
    await user.type(field(), 'soon');
    await user.click(button('Save'));

    expect(screen.getByRole('alert')).toHaveTextContent('A time in the video, like 0:07 or 1:23.5');
    expect(field()).toHaveValue('soon');
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    await settle();
    expect(links.sent('update')).toEqual([]);

    // Typing again takes the complaint away.
    await user.type(field(), '!');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Cancel and Escape leave things as they were, with focus back on the way in', async () => {
    const { user } = await renderLineUp();
    await user.click(button('Type a time'));
    await user.type(field(), '0:07');
    await user.click(button('Cancel'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(message()).toHaveTextContent('Line the tab up: when bar 1 starts, press');
    await waitFor(() => expect(button('Bar 1 starts now')).toHaveFocus());

    await user.click(button('Type a time'));
    // Not what was typed before the cancel.
    expect(field()).toHaveValue('');
    await user.type(field(), '9{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await settle();
    expect(links.sent('update')).toEqual([]);
  });

  it('a save the server refuses puts the prompt back and says so', async () => {
    const { user } = await renderLineUp();
    links.failNext('update');
    await user.click(button('Type a time'));
    await user.type(field(), '0:07{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save where bar 1 starts.');
    expect(button('Bar 1 starts now')).toBeInTheDocument();
    expect(links.rows()[0]).toMatchObject({ bar_one_seconds: null });
  });

  it('offline, "Type a time" is off and a press opens nothing; an open field’s Save sends nothing', async () => {
    const { user } = await renderLineUp();
    await user.click(button('Type a time'));
    await user.type(field(), '0:07');
    act(() => onlineManager.setOnline(false));
    expectLocked(button('Save'));
    await user.click(button('Save'));
    await settle();
    expect(links.sent('update')).toEqual([]);

    await user.click(button('Cancel'));
    expectLocked(button('Type a time'));
    await user.click(button('Type a time'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(message()).toHaveTextContent('You’re offline. Lining the tab up needs a connection.');
  });
});
