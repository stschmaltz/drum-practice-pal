import { useId, useState, type FormEvent } from 'react';
import { buttonClass, primaryButtonClass } from '@/components/styles';
import { PageHeader } from '@/components/PageHeader';
import { SignOutButton } from '@/features/auth/SignOutButton';
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

const COUNT_IN_LABELS: Record<number, string> = { 0: 'Off', 1: '1 bar', 2: '2 bars' };
const COUNT_IN_MODE_LABELS: Record<CountInMode, string> = {
  start: 'At the start only',
  every_repeat: 'Before every loop repeat',
};

export function SettingsPage() {
  const settings = useSettings();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" />
      {settings.isPending ? (
        <p className="text-neutral-400">Loading settings…</p>
      ) : settings.isError ? (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-red-300">Couldn't load your settings: {settings.error.message}</p>
          <button type="button" className={buttonClass} onClick={() => void settings.refetch()}>
            Try again
          </button>
        </div>
      ) : (
        <SettingsForm saved={settings.data} />
      )}
      <section className="flex flex-col items-start gap-2 border-t border-neutral-800 pt-6">
        <h2 className="text-lg font-semibold">Account</h2>
        <SignOutButton />
      </section>
    </div>
  );
}

function SettingsForm({ saved }: { saved: Settings }) {
  const update = useUpdateSettings();
  const volumeId = useId();
  // null until the user edits, so refetched values (from another device) show through.
  const [draft, setDraft] = useState<Settings | null>(null);
  const [errors, setErrors] = useState<SettingsErrors>({});
  const values = draft ?? saved;
  const dirty = draft !== null && Object.keys(changedSettings(saved, draft)).length > 0;

  const edit = (changes: Partial<Settings>) => {
    setDraft({ ...values, ...changes });
    setErrors({});
    update.reset();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    const found = validateSettings(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const changes = changedSettings(saved, draft);
    if (Object.keys(changes).length === 0) {
      setDraft(null);
      return;
    }
    update.mutate(changes, { onSuccess: () => setDraft(null) });
  };

  return (
    <form className="flex max-w-xl flex-col gap-6" onSubmit={onSubmit} noValidate>
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
              {volumeToPercent(values.metronome_volume)}%
            </output>
          </div>
          <input
            id={volumeId}
            type="range"
            className="min-h-11 accent-sky-500"
            min={0}
            max={100}
            step={5}
            value={volumeToPercent(values.metronome_volume)}
            aria-valuetext={`${volumeToPercent(values.metronome_volume)}%`}
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
              {COUNT_IN_LABELS[bars]}
            </label>
          ))}
        </div>
        {errors.count_in_bars && <p className="text-sm text-red-300">{errors.count_in_bars}</p>}
        <div role="radiogroup" aria-label="When the count-in plays" className="flex flex-col gap-1">
          {(Object.keys(COUNT_IN_MODE_LABELS) as CountInMode[]).map((mode) => (
            <label
              key={mode}
              className={`flex min-h-11 items-center gap-3 ${values.count_in_bars === 0 ? 'text-neutral-500' : ''}`}
            >
              <input
                type="radio"
                name="count_in_mode"
                className="size-5 accent-sky-500"
                checked={values.count_in_mode === mode}
                disabled={values.count_in_bars === 0}
                onChange={() => edit({ count_in_mode: mode })}
              />
              {COUNT_IN_MODE_LABELS[mode]}
            </label>
          ))}
        </div>
        {errors.count_in_mode && <p className="text-sm text-red-300">{errors.count_in_mode}</p>}
      </fieldset>

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

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={primaryButtonClass} disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save settings'}
        </button>
        {dirty && (
          <button
            type="button"
            className={buttonClass}
            disabled={update.isPending}
            onClick={() => {
              setDraft(null);
              setErrors({});
            }}
          >
            Discard changes
          </button>
        )}
        <p role="status" className="text-sm text-neutral-400">
          {update.isSuccess && !dirty ? 'Saved' : ''}
        </p>
      </div>
      {update.isError && (
        <p role="alert" className="text-sm text-red-300">
          Couldn't save your settings: {update.error.message}
        </p>
      )}
    </form>
  );
}
