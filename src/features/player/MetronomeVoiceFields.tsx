import { useId } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { inputClass } from '@/components/styles';
import { isMetronomeSound, METRONOME_SOUNDS, METRONOME_SUBDIVISIONS } from '@/lib/schema';
import {
  METRONOME_SOUND_LABELS,
  METRONOME_SUBDIVISION_LABELS,
  type MetronomeVoice,
} from './metronomeSounds';

/** The "Beat one" choice that turns the accent off. */
const NO_ACCENT = 'none';

/**
 * What the metronome plays: the sound for the beats, beat one's (or no
 * accent), and how many clicks per beat. The Settings page shows it for the
 * account's defaults, the controls bar for the song open now.
 */
export function MetronomeVoiceFields({
  voice,
  disabled = false,
  describedBy,
  soundLabel = 'Sound',
  onChange,
}: {
  voice: MetronomeVoice;
  disabled?: boolean;
  describedBy?: string;
  /** The beats' select is named on its own; "Metronome sound" where nothing around says "metronome". */
  soundLabel?: string;
  onChange: (voice: MetronomeVoice) => void;
}) {
  const soundId = useId();
  const accentId = useId();
  const clicksId = useId();

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor={soundId}>{soundLabel}</label>
        <select
          id={soundId}
          className={inputClass}
          value={voice.sound}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event) => {
            const sound = event.target.value;
            if (isMetronomeSound(sound)) onChange({ ...voice, sound });
          }}
        >
          {METRONOME_SOUNDS.map((sound) => (
            <option key={sound} value={sound}>
              {METRONOME_SOUND_LABELS[sound]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-40 flex-1 flex-col gap-1">
        <label htmlFor={accentId}>Beat one</label>
        <select
          id={accentId}
          className={inputClass}
          // The accent's sound is kept while the accent is off, so turning it back on restores it.
          value={voice.accent ? voice.accentSound : NO_ACCENT}
          disabled={disabled}
          aria-describedby={describedBy}
          onChange={(event) => {
            const choice = event.target.value;
            if (choice === NO_ACCENT) onChange({ ...voice, accent: false });
            else if (isMetronomeSound(choice)) {
              onChange({ ...voice, accent: true, accentSound: choice });
            }
          }}
        >
          <option value={NO_ACCENT}>No accent</option>
          {METRONOME_SOUNDS.map((sound) => (
            <option key={sound} value={sound}>
              {METRONOME_SOUND_LABELS[sound]}, louder
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-60 flex-1 flex-col gap-1">
        <span id={clicksId}>Clicks</span>
        <SegmentedControl
          labelledBy={clicksId}
          describedBy={describedBy}
          options={METRONOME_SUBDIVISIONS.map((subdivision) => ({
            value: subdivision,
            label: METRONOME_SUBDIVISION_LABELS[subdivision],
          }))}
          value={voice.subdivision}
          disabled={disabled}
          onChange={(subdivision) => onChange({ ...voice, subdivision })}
        />
      </div>
    </div>
  );
}
