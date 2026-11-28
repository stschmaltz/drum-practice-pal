/**
 * Line-up saves of two links of one song in flight together (19 Review). One
 * link's saves, pressed twice, are SongPage.test.tsx's and LineUp.typed.test.tsx's.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { queryResult, resetFakeSupabase } from '@/test/fakeSupabase';
import { LINK_SONG_ID, linkTable, videoLink, type LinkTable } from '@/test/linkTable';
import { testQueryClient, wrapperFor } from '@/test/render';
import { songLinkKeys } from './songLinkKeys';
import { useLineUpFailure, useSaveBarOne } from './useSaveBarOne';
import { useSongLinks } from './useSongLinks';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const ORIGINAL = videoLink('link-original', { bar_one_seconds: 5 });
const DRUMLESS = videoLink('link-drumless', {
  kind: 'drumless',
  url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  bar_one_seconds: 9,
});

let links: LinkTable;

beforeEach(() => {
  resetFakeSupabase();
  links = linkTable([ORIGINAL, DRUMLESS]);
  queryResult.mockImplementation((call) => links.answer(call));
});

async function renderSaves() {
  const queryClient = testQueryClient();
  const view = renderHook(
    () => ({ links: useSongLinks(LINK_SONG_ID), save: useSaveBarOne(LINK_SONG_ID) }),
    { wrapper: wrapperFor(queryClient) },
  );
  await waitFor(() => expect(view.result.current.links.data).toHaveLength(2));
  const shown = () =>
    Object.fromEntries(
      (view.result.current.links.data ?? []).map((row) => [row.id, row.bar_one_seconds]),
    );
  const nudgeOriginal = (barOneSeconds: number) =>
    act(() => {
      view.result.current.save.mutate({ linkId: ORIGINAL.id, url: ORIGINAL.url, barOneSeconds });
    });
  return { view, shown, queryClient, nudgeOriginal };
}

describe('two links of one song lined up at once', () => {
  it('a save of one that fails goes back to what the server holds for it, though the other’s was on its way when it was pressed', async () => {
    const { view, shown } = await renderSaves();
    const releaseOriginal = links.holdNext('update');
    const releaseDrumless = links.holdNext('update');
    act(() => {
      view.result.current.save.mutate({
        linkId: ORIGINAL.id,
        url: ORIGINAL.url,
        barOneSeconds: 5.25,
      });
    });
    // Pressed while the first is still out: it waits its turn, and shows at once.
    act(() => {
      view.result.current.save.mutate({
        linkId: DRUMLESS.id,
        url: DRUMLESS.url,
        barOneSeconds: 9.25,
      });
    });
    await waitFor(() => expect(shown()).toEqual({ [ORIGINAL.id]: 5.25, [DRUMLESS.id]: 9.25 }));

    releaseOriginal();
    await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 5.25 }));
    // The read after the last save is held: what is asserted is the failure's own doing.
    links.holdNext('select');
    links.failNext('update');
    releaseDrumless();

    await waitFor(() => expect(shown()[DRUMLESS.id]).toBe(9));
    expect(shown()[ORIGINAL.id]).toBe(5.25);
    expect(links.rows()[1]).toMatchObject({ bar_one_seconds: 9 });
  });
});

describe('one link, several saves (Copilot review on #39)', () => {
  it('a failed save leaves a later save’s value alone, though it is the value the failed one sent', async () => {
    const { shown, nudgeOriginal } = await renderSaves();
    const releases = [links.holdNext('update'), links.holdNext('update'), links.holdNext('update')];
    // Later, Later, Earlier: the third is back on the first's value.
    nudgeOriginal(5.25);
    nudgeOriginal(5.5);
    nudgeOriginal(5.25);
    await waitFor(() => expect(shown()[ORIGINAL.id]).toBe(5.25));

    links.failNext('update');
    releases[0]?.();
    await waitFor(() => expect(links.sent('update')).toHaveLength(2));
    // The first has failed and the second is out: the third's value is still what is on its way.
    expect(shown()[ORIGINAL.id]).toBe(5.25);

    links.holdNext('select');
    releases[1]?.();
    releases[2]?.();
    await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 5.25 }));
    expect(shown()[ORIGINAL.id]).toBe(5.25);
  });

  it('an answer for a video the link no longer points at changes nothing on the link', async () => {
    const { shown, queryClient, nudgeOriginal } = await renderSaves();
    const release = links.holdNext('update');
    nudgeOriginal(5.25);
    await waitFor(() => expect(shown()[ORIGINAL.id]).toBe(5.25));

    // The link is pointed at another video while the answer is on its way (the recordings form).
    const repointed = {
      ...ORIGINAL,
      url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
      bar_one_seconds: null,
    };
    act(() => {
      queryClient.setQueryData(songLinkKeys.forSong('user-1', LINK_SONG_ID), [repointed, DRUMLESS]);
    });
    links.holdNext('select');
    release();
    await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 5.25 }));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(shown()[ORIGINAL.id]).toBeNull();
  });

  it('a failure is still said by a line-up mounted after it, until the link’s next save', async () => {
    const { queryClient, nudgeOriginal } = await renderSaves();
    links.holdNext('select');
    links.failNext('update');
    nudgeOriginal(5.25);
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));

    const failureOf = (linkId: string) =>
      renderHook(() => useLineUpFailure(LINK_SONG_ID, linkId), { wrapper: wrapperFor(queryClient) })
        .result.current;
    expect(failureOf(ORIGINAL.id)).toMatchObject({ code: '42501' });
    expect(failureOf(DRUMLESS.id)).toBeNull();

    nudgeOriginal(5.25);
    await waitFor(() => expect(links.rows()[0]).toMatchObject({ bar_one_seconds: 5.25 }));
    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
    expect(failureOf(ORIGINAL.id)).toBeNull();
  });
});
