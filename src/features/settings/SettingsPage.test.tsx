import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { opArgs, queryResult, resetFakeSupabase } from '@/test/fakeSupabase';
import { renderRoutes } from '@/test/render';
import type { Settings } from './settingsForm';
import { SettingsPage } from './SettingsPage';
import { settingsKeys } from './useSettings';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const saved: Settings = {
  metronome_on: true,
  metronome_volume: 0.8,
  count_in_bars: 0,
  count_in_mode: 'start',
  drums_muted_default: false,
};

/** Reads return `row`; writes return `row` merged with the update payload. */
function serveSettings(row: Settings) {
  let current = row;
  queryResult.mockImplementation(async (call) => {
    const changes = opArgs(call, 'update')?.[0] as Partial<Settings> | undefined;
    if (changes) current = { ...current, ...changes };
    return { data: current, error: null };
  });
}

function writes() {
  return queryResult.mock.calls
    .map(([call]) => opArgs(call, 'update')?.[0])
    .filter((payload) => payload !== undefined);
}

function renderSettings() {
  const view = renderRoutes(<Route path="/settings" element={<SettingsPage />} />, {
    path: '/settings',
  });
  return { ...view, user: userEvent.setup() };
}

const saveButton = () => screen.getByRole('button', { name: 'Save settings' });
const volume = () => screen.getByRole('slider', { name: 'Metronome volume' });

beforeEach(resetFakeSupabase);

describe('SettingsPage', () => {
  it('shows a loading message, then the saved values', async () => {
    serveSettings(saved);
    renderSettings();
    expect(screen.getByText('Loading settings…')).toBeInTheDocument();

    expect(
      await screen.findByRole('checkbox', { name: 'Metronome on when playback starts' }),
    ).toBeChecked();
    expect(volume()).toHaveValue('80');
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Off' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'At the start only' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Mute the drum track/ })).not.toBeChecked();
    expect(saveButton()).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Discard changes' })).not.toBeInTheDocument();
  });

  it('offers a retry when settings fail to load', async () => {
    queryResult.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } });
    const { user } = renderSettings();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't load your settings: Failed to fetch",
    );

    serveSettings(saved);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('radio', { name: 'Off' })).toBeChecked();
  });

  it('only lets you pick when the count-in plays once it is on', async () => {
    serveSettings(saved);
    const { user } = renderSettings();
    const everyRepeat = await screen.findByRole('radio', { name: 'Before every loop repeat' });
    expect(everyRepeat).toBeDisabled();

    await user.click(screen.getByRole('radio', { name: '1 bar' }));
    expect(everyRepeat).toBeEnabled();
    await user.click(screen.getByRole('radio', { name: 'Off' }));
    expect(everyRepeat).toBeDisabled();
  });

  it('enables Save only while something differs from what is saved', async () => {
    serveSettings(saved);
    const { user } = renderSettings();
    const drums = await screen.findByRole('checkbox', { name: /Mute the drum track/ });
    await user.click(drums);
    expect(saveButton()).toBeEnabled();
    await user.click(drums);
    expect(saveButton()).toBeDisabled();
  });

  it('saves only the fields you changed and says so', async () => {
    serveSettings(saved);
    const { user } = renderSettings();
    await user.click(await screen.findByRole('radio', { name: '2 bars' }));
    await user.click(screen.getByRole('radio', { name: 'Before every loop repeat' }));
    fireEvent.change(volume(), { target: { value: '35' } });
    expect(screen.getByText('35%')).toBeInTheDocument();
    await user.click(saveButton());

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(writes()).toEqual([
      { metronome_volume: 0.35, count_in_bars: 2, count_in_mode: 'every_repeat' },
    ]);
    expect(saveButton()).toBeDisabled();
    expect(screen.getByRole('radio', { name: '2 bars' })).toBeChecked();
    expect(volume()).toHaveValue('35');
  });

  it('keeps your edits and shows the error when the save fails', async () => {
    serveSettings(saved);
    const { user } = renderSettings();
    await user.click(await screen.findByRole('radio', { name: '1 bar' }));

    queryResult.mockImplementation(async (call) =>
      opArgs(call, 'update')
        ? { data: null, error: { message: 'Failed to fetch' } }
        : { data: saved, error: null },
    );
    await user.click(saveButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save your settings: Failed to fetch",
    );
    expect(screen.getByRole('radio', { name: '1 bar' })).toBeChecked();
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('discards edits back to the saved values', async () => {
    serveSettings(saved);
    const { user } = renderSettings();
    await user.click(
      await screen.findByRole('checkbox', { name: 'Metronome on when playback starts' }),
    );
    fireEvent.change(volume(), { target: { value: '10' } });

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(
      screen.getByRole('checkbox', { name: 'Metronome on when playback starts' }),
    ).toBeChecked();
    expect(volume()).toHaveValue('80');
    expect(saveButton()).toBeDisabled();
    expect(writes()).toEqual([]);
  });

  it('shows values changed on another device when you have not edited', async () => {
    serveSettings(saved);
    const { queryClient } = renderSettings();
    await screen.findByRole('radio', { name: 'Off' });

    act(() => {
      queryClient.setQueryData(settingsKeys.forUser('user-1'), { ...saved, count_in_bars: 2 });
    });
    await waitFor(() => expect(screen.getByRole('radio', { name: '2 bars' })).toBeChecked());
  });

  it("doesn't overwrite your edits with values refetched from another device", async () => {
    serveSettings(saved);
    const { user, queryClient } = renderSettings();
    await user.click(await screen.findByRole('radio', { name: '1 bar' }));

    act(() => {
      queryClient.setQueryData(settingsKeys.forUser('user-1'), {
        ...saved,
        drums_muted_default: true,
      });
    });
    // The untouched field shows the other device's value; your edit stays.
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: /Mute the drum track/ })).toBeChecked(),
    );
    expect(screen.getByRole('radio', { name: '1 bar' })).toBeChecked();

    // Saving sends only your change, so the other device's drums setting survives.
    await user.click(saveButton());
    await waitFor(() => expect(writes()).toEqual([{ count_in_bars: 1 }]));
  });

  it('has a sign-out button', async () => {
    serveSettings(saved);
    renderSettings();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
