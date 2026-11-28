/**
 * Typing where bar 1 starts (Unit 19, from Shane trying the line-up: "let's
 * allow users to enter a timestamp directly"). The line-up alone, over the
 * fake video player and an in-memory links table; the press-as-it-plays path
 * and the following are SongPage.test.tsx's.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { opArgs, queryResult, resetFakeSupabase } from '@/test/fakeSupabase';
import { FakeRecordingPlayer } from '@/test/fakeRecordingPlayer';
import { LINK_SONG_ID, linkTable, videoLink, type LinkTable } from '@/test/linkTable';
import { expectLocked, expectUnlocked } from '@/test/locked';
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
function Harness({
  player,
  firstTapAsks = 0,
}: {
  player: FakeRecordingPlayer;
  firstTapAsks?: number;
}) {
  const saved = useSongLinks(LINK_SONG_ID).data?.find((row) => row.id === LINK_ID);
  if (!saved) return null;
  return (
    <LineUp
      songId={LINK_SONG_ID}
      link={{ id: saved.id, barOneSeconds: saved.bar_one_seconds ?? null }}
      player={player}
      follow
      onFollowChange={() => {}}
      firstTapAsks={firstTapAsks}
    />
  );
}

async function renderLineUp(barOneSeconds: number | null = null) {
  const link = videoLink(LINK_ID, { bar_one_seconds: barOneSeconds });
  links = linkTable([link]);
  queryResult.mockImplementation((call) => links.answer(call));
  const player = new FakeRecordingPlayer();
  const user = userEvent.setup();
  const queryClient = testQueryClient();
  const view = render(<Harness player={player} />, { wrapper: wrapperFor(queryClient) });
  await screen.findByTestId('line-up');
  return {
    user,
    player,
    link,
    queryClient,
    /** Space or a tap on a bar asked for the video's first tap, `asks` times so far. */
    askForFirstTap: (asks: number) =>
      view.rerender(<Harness player={player} firstTapAsks={asks} />),
    /** Opens the field as the user does: "Type a time", by way of "Line up again" once lined up. */
    openField: async () => {
      const again = screen.queryByRole('button', { name: 'Line up again' });
      if (again) await user.click(again);
      await user.click(button('Type a time'));
    },
    /** Types `text` over what the field holds; `{Enter}` at its end saves. */
    retype: async (text: string) => {
      await user.clear(field());
      await user.type(field(), text);
    },
  };
}

const button = (name: string) => screen.getByRole('button', { name });
const field = () => screen.getByRole('textbox', { name: 'Bar 1 starts at' });
const message = () => screen.getByTestId('line-up-message');
const said = () => screen.getByTestId('line-up-announcement');
const barOneSent = () =>
  links.sent('update').map((sent) => (sent as { bar_one_seconds: number }).bar_one_seconds);
/** The address each line-up save was made for: the `url` its update was filtered on. */
const savedFor = () =>
  queryResult.mock.calls
    .map(([call]) => call)
    .filter((call) => call.table === 'song_links' && opArgs(call, 'update'))
    .map((call) => call.ops.find((op) => op.method === 'eq' && op.args[0] === 'url')?.args[1]);

describe('typing where bar 1 starts', () => {
  it('needs no playing video: a typed time is saved and the tab is lined up', async () => {
    const { user, openField } = await renderLineUp();
    // The video has never been played: the press-as-it-plays button is off, typing is not.
    expectLocked(button('Bar 1 starts now'));
    await openField();
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
    const { user, openField } = await renderLineUp();
    await openField();
    await user.type(field(), '83,5{Enter}');
    await waitFor(() => expect(barOneSent()).toEqual([83.5]));
    expect(message()).toHaveTextContent('Bar 1 at 1:23.50.');
  });

  it('a lined-up link opens the field on its time, by way of "Line up again"', async () => {
    const { user, openField, retype } = await renderLineUp(12.5);
    await openField();
    expect(field()).toHaveValue('0:12.50');

    await retype('0:13');
    await user.click(button('Save'));
    await waitFor(() => expect(barOneSent()).toEqual([13]));
    expect(message()).toHaveTextContent('Bar 1 at 0:13.00.');
  });

  it('the saved time typed back unchanged sends nothing', async () => {
    const { user, openField } = await renderLineUp(12.5);
    await openField();
    await user.click(button('Save'));
    expect(message()).toHaveTextContent('Bar 1 at 0:12.50.');
    await settle();
    expect(links.sent('update')).toEqual([]);
  });

  it('refuses what isn’t a time, says so in fixed copy, keeps what was typed and saves nothing', async () => {
    const { user, openField } = await renderLineUp();
    await openField();
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
    const { user, openField } = await renderLineUp();
    await openField();
    await user.type(field(), '0:07');
    await user.click(button('Cancel'));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(message()).toHaveTextContent('Line the tab up: when bar 1 starts, press');
    await waitFor(() => expect(button('Bar 1 starts now')).toHaveFocus());

    await openField();
    // Not what was typed before the cancel.
    expect(field()).toHaveValue('');
    await user.type(field(), '9{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await settle();
    expect(links.sent('update')).toEqual([]);
  });

  it('a save the server refuses puts the prompt back and says so', async () => {
    const { user, openField } = await renderLineUp();
    links.failNext('update');
    await openField();
    await user.type(field(), '0:07{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t save the line-up.');
    expect(button('Bar 1 starts now')).toBeInTheDocument();
    expect(links.rows()[0]).toMatchObject({ bar_one_seconds: null });
  });

  it('offline, "Type a time" is off and a press opens nothing; an open field’s Save sends nothing', async () => {
    const { user, openField } = await renderLineUp();
    await openField();
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

describe('typing where bar 1 starts, after QA (19 QA fix round 1)', () => {
  it('asks a phone for the keyboard that has a colon and letters, and for none of its help', async () => {
    const { openField } = await renderLineUp();
    await openField();
    // The decimal keypad can't type "0:07.25" or "1m30s", the forms the field suggests.
    expect(field()).toHaveAttribute('inputmode', 'text');
    expect(field()).toHaveAttribute('autocapitalize', 'off');
    expect(field()).toHaveAttribute('autocorrect', 'off');
    expect(field()).toHaveAttribute('spellcheck', 'false');
    expect(field()).toHaveAttribute('enterkeyhint', 'done');
  });

  it('a time saved by a press, to the millisecond, sends nothing when the field is saved as it opened', async () => {
    const { user, openField } = await renderLineUp(2.018);
    await openField();
    // Shown to the hundredth: saving it back would move the line-up by 2 ms.
    expect(field()).toHaveValue('0:02.02');
    await user.type(field(), '{Enter}');

    expect(message()).toHaveTextContent('Bar 1 at 0:02.02.');
    await waitFor(() => expect(button('Line up again')).toHaveFocus());
    await settle();
    expect(links.sent('update')).toEqual([]);
    expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 2.018 });
  });

  it.each([['2.02'], ['0:02.020'], [' 0:02.02 '], ['2,02s']])(
    'the same time written another way (%j) is still the time it opened on: nothing is sent',
    async (text) => {
      const { openField, retype } = await renderLineUp(2.018);
      await openField();
      await retype(`${text}{Enter}`);
      await waitFor(() => expect(button('Line up again')).toHaveFocus());
      await settle();
      expect(links.sent('update')).toEqual([]);
    },
  );

  it('a time a hundredth away from the one it opened on is saved', async () => {
    const { openField, retype } = await renderLineUp(2.018);
    await openField();
    await retype('0:02.03{Enter}');
    await waitFor(() => expect(barOneSent()).toEqual([2.03]));
  });
});

describe('“Bar 1 starts now” on a video that isn’t playing (19 QA issue 9)', () => {
  it('takes the clock of a video that has been started and is paused', async () => {
    const { user, player } = await renderLineUp();
    act(() => player.playAt(3));
    act(() => player.pauseAt(7.26));
    expectUnlocked(button('Bar 1 starts now'));
    await user.click(button('Bar 1 starts now'));
    await waitFor(() => expect(barOneSent()).toEqual([7.26]));
    expect(message()).toHaveTextContent('Bar 1 at 0:07.26.');
  });

  it('is off before the video has ever been played, and a press on it says why, each time', async () => {
    const { user, player } = await renderLineUp();
    act(() => player.becomeReady());
    expectLocked(button('Bar 1 starts now'));
    expect(said()).toHaveTextContent('');

    await user.click(button('Bar 1 starts now'));
    expect(message()).toHaveTextContent('Press Play on the video first.');
    expect(said()).toHaveTextContent('Press Play on the video first.');
    const first = said().textContent;
    // Pressed again: the same words, and still a change for a screen reader to read.
    await user.click(button('Bar 1 starts now'));
    expect(said()).toHaveTextContent('Press Play on the video first.');
    expect(said().textContent).not.toBe(first);
    await settle();
    expect(links.sent('update')).toEqual([]);

    // Played: the reason has gone with what it was about.
    act(() => player.playAt(1));
    expect(message()).toHaveTextContent('Line the tab up: when bar 1 starts, press');
    expectUnlocked(button('Bar 1 starts now'));
  });

  it('says the same while the video’s player hasn’t answered yet: a fresh page, tapped at once', async () => {
    const { user } = await renderLineUp();
    expectLocked(button('Bar 1 starts now'));
    await user.click(button('Bar 1 starts now'));
    expect(message()).toHaveTextContent('Press Play on the video first.');
    expect(said()).toHaveTextContent('Press Play on the video first.');
    await settle();
    expect(links.sent('update')).toEqual([]);
  });

  it('says nothing of the kind offline, or when the player can’t be reached: each has its own line', async () => {
    const { user, player } = await renderLineUp();
    act(() => player.set({ status: 'unavailable' }));
    await user.click(button('Bar 1 starts now'));
    expect(message()).toHaveTextContent('its player isn’t answering here');
    expect(said()).not.toHaveTextContent('Press Play');

    act(() => onlineManager.setOnline(false));
    await user.click(button('Bar 1 starts now'));
    expect(message()).toHaveTextContent('You’re offline.');
    expect(said()).not.toHaveTextContent('Press Play');
  });
});

describe('what the line-up says to a screen reader (19 QA issue 11)', () => {
  it('the note about the video’s first tap is said when it is asked for, and again at each ask', async () => {
    const { player, askForFirstTap } = await renderLineUp();
    act(() => player.becomeReady());
    expect(said()).toHaveTextContent('');

    askForFirstTap(1);
    expect(message()).toHaveTextContent('Press Play on the video once.');
    expect(said()).toHaveTextContent(
      'Press Play on the video once. After that, Space and a tap on a bar work it.',
    );
    const first = said().textContent;
    askForFirstTap(2);
    expect(said()).toHaveTextContent('Press Play on the video once.');
    expect(said().textContent).not.toBe(first);
  });

  it('a player that will never answer is said once, when it gives up', async () => {
    const { player } = await renderLineUp();
    expect(said()).toHaveTextContent('');
    act(() => player.set({ status: 'unavailable' }));
    expect(said()).toHaveTextContent(
      'The tab can’t follow this video: its player isn’t answering here.',
    );
    const first = said().textContent;
    // Nothing new to say when something else re-renders the line-up.
    act(() => player.set({ seconds: 3 }));
    expect(said().textContent).toBe(first);
  });
});

describe('a line-up is saved for the video it was made on (19 QA issue 6)', () => {
  const OTHER_VIDEO = 'https://www.youtube.com/watch?v=aqz-KE-bpKQ';

  it('every save carries the address the page knows, and the server matches on it', async () => {
    const { user, player, link, openField, retype } = await renderLineUp(4);
    await user.click(button('Tab later'));
    act(() => player.playAt(9));
    await user.click(button('Line up again'));
    await user.click(button('Bar 1 starts now'));
    await openField();
    await retype('12{Enter}');
    await waitFor(() => expect(barOneSent()).toEqual([4.25, 9, 12]));
    expect(savedFor()).toEqual([link.url, link.url, link.url]);
  });

  it('a nudge from a page that hasn’t heard the link was pointed at another video writes nothing onto it, and says so', async () => {
    const { user, link } = await renderLineUp(5.58);
    // Another device points Original at another video: the database clears its line-up.
    links.setRows([{ ...link, url: OTHER_VIDEO, bar_one_seconds: null }]);
    // The save matches nothing, then looks the link up; the read that follows the failure is
    // held, so what is asserted next is the save's own doing.
    const lookUp = links.holdNext('select');
    await user.click(button('Tab later'));
    await waitFor(() => expect(savedFor()).toHaveLength(1));
    const release = links.holdNext('select');
    lookUp();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t save the line-up. This recording was changed somewhere else.',
    );
    expect(savedFor()).toEqual([link.url]);
    expect(links.rows()[0]).toMatchObject({ url: OTHER_VIDEO, bar_one_seconds: null });
    // The guess is taken back: the line-up this page last knew of.
    expect(message()).not.toHaveTextContent('0:05.83');
    release();
    // And the read shows the new video, not lined up.
    await waitFor(() => expect(button('Bar 1 starts now')).toBeInTheDocument());
    expect(links.rows()[0]).toMatchObject({ url: OTHER_VIDEO, bar_one_seconds: null });
  });

  it('a link removed on another device is said to be gone, not changed', async () => {
    const { user } = await renderLineUp(5.58);
    links.setRows([]);
    // The look-up that tells "removed" from "changed", then the read after the failure, which
    // is held: it would take the link, and this line-up with it, off the page.
    const lookUp = links.holdNext('select');
    await user.click(button('Tab later'));
    await waitFor(() => expect(savedFor()).toHaveLength(1));
    links.holdNext('select');
    lookUp();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t save the line-up. It has been deleted, on this device or another.',
    );
  });

  it('a look-up that fails after a save that matched nothing is a failure, not a guess', async () => {
    const { user, link } = await renderLineUp(5.58);
    links.setRows([{ ...link, url: OTHER_VIDEO, bar_one_seconds: null }]);
    links.failNext('select', { message: 'TypeError: Failed to fetch', code: '' });
    await user.click(button('Tab later'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn’t save the line-up. The server couldn't be reached.",
    );
    expect(links.rows()[0]).toMatchObject({ bar_one_seconds: null });
  });

  it('the form’s Enter is the same save: nothing is sent for a press the form refuses', async () => {
    const { openField } = await renderLineUp();
    await openField();
    fireEvent.submit(field().closest('form')!);
    await settle();
    expect(links.sent('update')).toEqual([]);
    expect(savedFor()).toEqual([]);
  });
});

describe('the buttons that stand in for one another (19 Readability)', () => {
  it('“Line up again” and “Bar 1 starts now” are one element, so focus on the pressed one is never dropped', async () => {
    const { user, player } = await renderLineUp(4);
    act(() => player.playAt(9));
    const again = button('Line up again');
    await user.click(again);
    // The same button, renamed: nothing was taken off the page under the press.
    expect(button('Bar 1 starts now')).toBe(again);
    expect(again).toHaveFocus();

    await user.click(again);
    await waitFor(() => expect(barOneSent()).toEqual([9]));
    expect(button('Line up again')).toBe(again);
    expect(again).toHaveFocus();
  });
});
