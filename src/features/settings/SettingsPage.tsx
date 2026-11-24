import { useId, useState, type FormEvent } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { buttonClass, primaryButtonClass } from '@/components/styles';
import { isOnline, useOnline, waitsForNetwork } from '@/lib/network';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { saveCharacterKeysOn } from '@/features/shortcuts/characterKeysPreference';
import { characterKeysLabel } from '@/features/shortcuts/shortcuts';
import { useCharacterKeysOn } from '@/features/shortcuts/useCharacterKeysOn';
import { COUNT_IN_BARS_LABELS, COUNT_IN_MODE_LABELS } from '@/features/player/countInLabels';
import { COUNT_IN_BAR_OPTIONS, type CountInMode } from '@/lib/schema';
import {
  changedSettings,
  percentToVolume,
  validateSettings,
  volumeToPercent,
  type Settings,
  type SettingsErrors,
} from './settingsForm';
import { useSettings, useUpdateSettings } from './useSettings';

export function SettingsPage() {
  const settings = useSettings();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      {waitsForNetwork(settings) ? (
        <p className="text-neutral-400">
          You're offline, and your settings haven't been opened on this device yet. They show once
          you're back online.
        </p>
      ) : settings.isPending ? (
        <p className="text-neutral-400">Loading settings…</p>
      ) : // Only a failed first load blocks the form. A failed background refetch
      // keeps the cached row, and unmounting the form would drop unsaved edits.
      settings.isLoadingError ? (
        <LoadErrorAlert onRetry={() => void settings.refetch()}>
          Couldn't load your settings: {settings.error.message}
        </LoadErrorAlert>
      ) : (
        <SettingsForm saved={settings.data} />
      )}
      <KeyboardSection />
      <section className="flex flex-col items-start gap-2 border-t border-neutral-800 pt-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <SignOutButton />
      </section>
    </div>
  );
}

/** What each fieldset needs: the values on screen, their errors, and a way to edit them. */
interface FieldsetProps {
  values: Settings;
  errors: SettingsErrors;
  edit: (changes: Partial<Settings>) => void;
}

function SettingsForm({ saved }: { saved: Settings }) {
  const update = useUpdateSettings();
  // Only the fields the user touched, so every other field keeps showing the
  // latest saved value, including one just refetched from another device.
  const [draft, setDraft] = useState<Partial<Settings> | null>(null);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const values: Settings = { ...saved, ...draft };
  const changes = changedSettings(saved, values);
  const dirty = Object.keys(changes).length > 0;
  // Locked while saving: an edit would reset() the mutation, so the form would
  // stop showing its progress or error and allow a second save alongside it.
  const saving = update.isPending;
  const online = useOnline();

  const edit = (edited: Partial<Settings>) => {
    if (saving) return;
    setDraft({ ...draft, ...edited });
    setErrors({});
    update.reset();
  };

  const discard = () => {
    setDraft(null);
    setErrors({});
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || saving || !isOnline()) return;
    const found = validateSettings(values);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // Edits that undo each other leave nothing to send.
    if (!dirty) {
      setDraft(null);
      return;
    }
    update.mutate(changes, { onSuccess: () => setDraft(null) });
  };

  const fieldsetProps: FieldsetProps = { values, errors, edit };

  return (
    <form
      className="flex max-w-xl flex-col gap-6"
      onSubmit={onSubmit}
      aria-busy={saving}
      noValidate
    >
      <MetronomeFieldset {...fieldsetProps} />
      <CountInFieldset {...fieldsetProps} />
      <DrumsFieldset {...fieldsetProps} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryButtonClass} disabled={!dirty || saving || !online}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {dirty && (
          <button type="button" className={buttonClass} disabled={saving} onClick={discard}>
            Discard changes
          </button>
        )}
        <p role="status" className="text-sm text-neutral-400">
          {update.isSuccess && !dirty ? 'Saved' : ''}
        </p>
      </div>
      {!online && (
        <OfflineNote>You're offline. Settings can be saved once you're back online.</OfflineNote>
      )}
      {update.isError && (
        <ErrorAlert>Couldn't save your settings: {update.error.message}</ErrorAlert>
      )}
    </form>
  );
}

function MetronomeFieldset({ values, errors, edit }: FieldsetProps) {
  const volumeId = useId();
  const volumePercent = volumeToPercent(values.metronome_volume);

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-lg font-semibold">Metronome</legend>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5 accent-sky-500"
          checked={values.metronome_on}
          onChange={(event) => edit({ metronome_on: event.target.checked })}
        />
        Metronome on when playback starts
      </label>
      <div className="flex flex-col gap-1">
        {/* The output sits outside the label, so the slider's name is just "Metronome volume". */}
        <div className="flex justify-between">
          <label htmlFor={volumeId}>Metronome volume</label>
          <output htmlFor={volumeId} className="tabular-nums text-neutral-300">
            {volumePercent}%
          </output>
        </div>
        <input
          id={volumeId}
          type="range"
          className="min-h-11 accent-sky-500"
          min={0}
          max={100}
          step={5}
          value={volumePercent}
          aria-valuetext={`${volumePercent}%`}
          aria-invalid={errors.metronome_volume ? true : undefined}
          onChange={(event) =>
            edit({ metronome_volume: percentToVolume(event.target.valueAsNumber) })
          }
        />
        {errors.metronome_volume && (
          <span className="text-sm text-red-300">{errors.metronome_volume}</span>
        )}
      </div>
    </fieldset>
  );
}

function CountInFieldset({ values, errors, edit }: FieldsetProps) {
  // The mode only matters when there's a count-in to play.
  const countInOff = values.count_in_bars === 0;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-lg font-semibold">Count-in</legend>
      <div role="radiogroup" aria-label="Count-in length" className="flex flex-wrap gap-2">
        {COUNT_IN_BAR_OPTIONS.map((bars) => (
          <label
            key={bars}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-neutral-700 px-4 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-950"
          >
            <input
              type="radio"
              name="count_in_bars"
              className="accent-sky-500"
              checked={values.count_in_bars === bars}
              onChange={() => edit({ count_in_bars: bars })}
            />
            {COUNT_IN_BARS_LABELS[bars]}
          </label>
        ))}
      </div>
      {errors.count_in_bars && <p className="text-sm text-red-300">{errors.count_in_bars}</p>}
      <div role="radiogroup" aria-label="When the count-in plays" className="flex flex-col gap-1">
        {(Object.keys(COUNT_IN_MODE_LABELS) as CountInMode[]).map((mode) => (
          <label
            key={mode}
            className={`flex min-h-11 items-center gap-3 ${countInOff ? 'text-neutral-500' : ''}`}
          >
            <input
              type="radio"
              name="count_in_mode"
              className="size-5 accent-sky-500"
              checked={values.count_in_mode === mode}
              disabled={countInOff}
              onChange={() => edit({ count_in_mode: mode })}
            />
            {COUNT_IN_MODE_LABELS[mode]}
          </label>
        ))}
      </div>
      {errors.count_in_mode && <p className="text-sm text-red-300">{errors.count_in_mode}</p>}
    </fieldset>
  );
}

function DrumsFieldset({ values, edit }: FieldsetProps) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-lg font-semibold">Drums</legend>
      <label className="flex min-h-11 items-center gap-3">
        <input
          type="checkbox"
          className="size-5 accent-sky-500"
          checked={values.drums_muted_default}
          onChange={(event) => edit({ drums_muted_default: event.target.checked })}
        />
        Mute the drum track by default (play along to the band)
      </label>
    </fieldset>
  );
}

/**
 * The single-letter shortcuts switch (WCAG 2.1.4). Kept on this device, not
 * in `user_settings`, and saved the moment it changes: it isn't part of the
 * account's form, its draft or its Save button, and it is there whether or
 * not the account's settings have loaded.
 */
function KeyboardSection() {
  const on = useCharacterKeysOn();
  // Storage refused the last save: it applies to this page only.
  const [notKept, setNotKept] = useState(false);
  const descriptionId = useId();

  return (
    <section className="flex max-w-xl flex-col gap-3 border-t border-neutral-800 pt-6">
      <h2 className="text-lg font-semibold">Keyboard on this device</h2>
      <div className="flex flex-col gap-1">
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            className="size-5 accent-sky-500"
            checked={on}
            aria-describedby={descriptionId}
            onChange={(event) => setNotKept(!saveCharacterKeysOn(event.target.checked))}
          />
          Single-letter shortcuts
        </label>
        <p id={descriptionId} className="text-sm text-neutral-400">
          {characterKeysLabel()} on the song page. For this device only, and saved as soon as you
          change it. Turn them off if speech input or a stray key press sets them off. Space, the
          arrow keys and Page Up / Page Down (pedals) keep working either way.
        </p>
      </div>
      <p role="status" className="text-sm text-amber-300">
        {notKept ? 'This browser won’t keep this after the app is closed.' : ''}
      </p>
    </section>
  );
}
