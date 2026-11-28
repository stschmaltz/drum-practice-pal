/**
 * Line-up saves of two links of one song in flight together (19 Review). One
 * link's saves, pressed twice, are SongPage.test.tsx's and LineUp.typed.test.tsx's.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { queryResult, resetFakeSupabase } from '@/test/fakeSupabase';
import { LINK_SONG_ID, linkTable, videoLink, type LinkTable } from '@/test/linkTable';
import { testQueryClient, wrapperFor } from '@/test/render';
import { useSaveBarOne } from './useSaveBarOne';
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
  const view = renderHook(
    () => ({ links: useSongLinks(LINK_SONG_ID), save: useSaveBarOne(LINK_SONG_ID) }),
    { wrapper: wrapperFor(testQueryClient()) },
  );
  await waitFor(() => expect(view.result.current.links.data).toHaveLength(2));
  const shown = () =>
    Object.fromEntries(
      (view.result.current.links.data ?? []).map((row) => [row.id, row.bar_one_seconds]),
    );
  return { view, shown };
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
