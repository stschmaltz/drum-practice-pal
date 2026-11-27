import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { Route } from 'react-router';
import { opArgs, queryResult, resetFakeSupabase, type FakeResult } from '@/test/fakeSupabase';
import {
  CHARACTER_KEYS_STORAGE_KEY,
  readCharacterKeysOn,
  saveCharacterKeysOn,
} from '@/features/shortcuts/characterKeysPreference';
import { renderRoutes, settle } from '@/test/render';
import type { Settings } from './settingsForm';
import { SettingsPage } from './SettingsPage';
import { settingsKeys } from './useSettings';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const saved: Settings = {
  metronome_on: true,
  metronome_volume: 0.8,
  count_in_bars: 0,
  count_in_mode: 'start',
  metronome_sound: 'click',
  metronome_accent: true,
  metronome_accent_sound: 'click',
  metronome_subdivision: 1,
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
      "Couldn't load your settings. Something went wrong. Try again.",
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

    // Off controls say why they are off.
    const modes = screen.getByRole('radiogroup', { name: 'When the count-in plays' });
    expect(modes).toHaveAccessibleDescription(
      'Choose 1 bar or 2 bars to say when the count-in plays.',
    );

    await user.click(screen.getByRole('radio', { name: '1 bar' }));
    expect(everyRepeat).toBeEnabled();
    expect(modes).not.toHaveAccessibleDescription();
    expect(screen.queryByText(/to say when the count-in plays/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Off' }));
    expect(everyRepeat).toBeDisabled();
  });

  it('says how each section saves: the account’s on Save, the keyboard’s on this device at once', async () => {
    serveSettings(saved);
    renderSettings();
    await screen.findByRole('button', { name: 'Save settings' });
    expect(
      screen.getByText('For your account, on every device. Saved when you press Save settings.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Saved on this device as soon as you change it.')).toBeInTheDocument();
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

  it('saves the metronome’s sounds and clicks, only those changed', async () => {
    serveSettings(saved);
    const { user } = renderSettings();
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Sound' }), 'Hi-hat');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Beat one' }), 'No accent');
    await user.click(screen.getByRole('radio', { name: '4 per beat' }));
    await user.click(saveButton());

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(writes()).toEqual([
      { metronome_sound: 'hi_hat', metronome_accent: false, metronome_subdivision: 4 },
    ]);
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
      "Couldn't save your settings. Something went wrong. Try again.",
    );
    expect(screen.getByRole('radio', { name: '1 bar' })).toBeChecked();
    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });

  it('ignores edits and submits while a save is pending, then shows how it went', async () => {
    serveSettings(saved);
    const { user } = renderSettings();
    await user.click(await screen.findByRole('radio', { name: '1 bar' }));

    let finishSave!: (result: FakeResult) => void;
    queryResult.mockImplementation((call) =>
      opArgs(call, 'update')
        ? new Promise<FakeResult>((resolve) => (finishSave = resolve))
        : Promise.resolve({ data: saved, error: null }),
    );
    await user.click(saveButton());
    const saving = await screen.findByRole('button', { name: 'Saving…' });
    await waitFor(() => expect(writes()).toHaveLength(1));

    await user.click(screen.getByRole('radio', { name: '2 bars' }));
    await user.click(screen.getByRole('checkbox', { name: /Mute the drum track/ }));
    fireEvent.submit(saving.closest('form')!);
    expect(screen.getByRole('radio', { name: '1 bar' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Mute the drum track/ })).not.toBeChecked();
    expect(saving).toBeDisabled();
    expect(writes()).toEqual([{ count_in_bars: 1 }]);

    await act(async () => finishSave({ data: null, error: { message: 'Failed to fetch' } }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save your settings. Something went wrong. Try again.",
    );
    // Unlocked again, with the edit still there to retry or change.
    expect(screen.getByRole('radio', { name: '1 bar' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: '2 bars' }));
    expect(screen.getByRole('radio', { name: '2 bars' })).toBeChecked();
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

  it('keeps the form and your edits when a background refetch fails', async () => {
    serveSettings(saved);
    const { user, queryClient } = renderSettings();
    await user.click(await screen.findByRole('radio', { name: '1 bar' }));

    queryResult.mockResolvedValue({ data: null, error: { message: 'Failed to fetch' } });
    const queryKey = settingsKeys.forUser('user-1');
    await act(() => queryClient.refetchQueries({ queryKey }));
    expect(queryClient.getQueryState(queryKey)?.status).toBe('error');
    // TanStack Query notifies observers on a timer, so let the page re-render.
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));

    expect(screen.queryByText(/Couldn't load your settings/)).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1 bar' })).toBeChecked();
    expect(saveButton()).toBeEnabled();
  });

  it('has a sign-out button', async () => {
    serveSettings(saved);
    renderSettings();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
  describe('single-letter shortcuts (this device only)', () => {
    const toggle = () => screen.getByRole('checkbox', { name: /Single-letter shortcuts/ });

    afterEach(() => {
      vi.restoreAllMocks();
      // A save that works clears what a failed one held in memory for this page.
      expect(saveCharacterKeysOn(true)).toBe(true);
    });

    it('is on by default, and saves to this device at once, not to your account', async () => {
      serveSettings(saved);
      const { user } = renderSettings();
      await screen.findByRole('button', { name: 'Save settings' });
      expect(toggle()).toBeChecked();
      // How it saves, said beside it: unlike the account's settings above, there is no Save.
      expect(toggle()).toHaveAccessibleDescription(
        /^Saved on this device as soon as you change it\./,
      );

      await user.click(toggle());
      expect(toggle()).not.toBeChecked();
      expect(readCharacterKeysOn()).toBe(false);
      // The account's form saw nothing: no draft to save, nothing sent.
      expect(saveButton()).toBeDisabled();
      await settle();
      expect(writes()).toEqual([]);

      await user.click(toggle());
      expect(toggle()).toBeChecked();
      expect(readCharacterKeysOn()).toBe(true);
      expect(writes()).toEqual([]);
    });

    it('is there while your account settings are loading or failed to load', async () => {
      queryResult.mockResolvedValue({ data: null, error: { message: 'down' } });
      renderSettings();
      await screen.findByRole('button', { name: 'Try again' });
      expect(toggle()).toBeChecked();
    });

    it('follows a change made in another tab', async () => {
      serveSettings(saved);
      renderSettings();
      expect(toggle()).toBeChecked();

      act(() => {
        localStorage.setItem(CHARACTER_KEYS_STORAGE_KEY, 'off');
        window.dispatchEvent(new StorageEvent('storage', { key: CHARACTER_KEYS_STORAGE_KEY }));
      });
      expect(toggle()).not.toBeChecked();
    });

    it('says when this browser won’t keep it, and still applies it for now', async () => {
      serveSettings(saved);
      const { user } = renderSettings();
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('Blocked', 'SecurityError');
      });

      await user.click(toggle());
      expect(toggle()).not.toBeChecked();
      expect(readCharacterKeysOn()).toBe(false);
      expect(screen.getByText(/won’t keep this after the app is closed/)).toBeInTheDocument();
    });
  });
});

// Unit 13 Test (04 QA issue 6): an inline error is read out with its field.
describe('SettingsPage field errors', () => {
  it('the volume error describes the volume slider, and nothing is sent', async () => {
    // Out of range only if the stored row is (another client, an older build): the slider clamps.
    serveSettings({ ...saved, metronome_volume: 1.5 });
    const { user } = renderSettings();
    const metronomeOn = await screen.findByRole('checkbox', {
      name: 'Metronome on when playback starts',
    });
    expect(volume()).not.toHaveAccessibleDescription();

    await user.click(metronomeOn);
    await user.click(saveButton());

    const message = await screen.findByText(/^Volume must be between/);
    expect(volume()).toHaveAttribute('aria-invalid', 'true');
    expect(volume()).toHaveAccessibleDescription(message.textContent ?? '');
    await settle();
    expect(writes()).toEqual([]);
  });
});

describe('SettingsPage offline', () => {
  it('keeps your edit but turns Save off with a reason, and saves it once back online', async () => {
    serveSettings(saved);
    const { user } = renderSettings();
    await user.click(await screen.findByRole('radio', { name: '2 bars' }));
    act(() => onlineManager.setOnline(false));
    expect(saveButton()).toBeDisabled();
    expect(
      screen.getByText("You're offline. Settings can be saved once you're back online."),
    ).toBeVisible();
    fireEvent.submit(saveButton().closest('form')!);
    await settle();
    expect(writes()).toEqual([]);
    expect(screen.getByRole('radio', { name: '2 bars' })).toBeChecked();

    act(() => onlineManager.setOnline(true));
    await user.click(saveButton());
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(writes()).toEqual([{ count_in_bars: 2 }]);
  });

  it('says why, rather than loading for ever, when the settings were never read on this device', async () => {
    serveSettings(saved);
    act(() => onlineManager.setOnline(false));
    renderSettings();
    expect(
      await screen.findByText(/settings haven't been opened on this device yet/),
    ).toBeVisible();
    expect(screen.queryByText('Loading settings…')).not.toBeInTheDocument();
    expect(queryResult).not.toHaveBeenCalled();

    act(() => onlineManager.setOnline(true));
    expect(await screen.findByRole('radio', { name: 'Off' })).toBeInTheDocument();
  });
});
