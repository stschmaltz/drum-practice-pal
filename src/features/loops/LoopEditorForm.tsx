import { useId, useState, type FormEvent } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { buttonClass, inputClass, primaryButtonClass } from '@/components/styles';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import { percentToRatio } from '@/features/player/speed';
import { randomUuid } from '@/lib/randomUuid';
import {
  changedLoopFields,
  EMPTY_LOOP_FORM,
  formBarRange,
  loopFormValues,
  parseLoopForm,
  type Loop,
  type LoopBarFields,
  type LoopFormErrors,
  type LoopFormValues,
} from './loopForm';
import { speedLabel } from './loopLabels';
import { selectionHint } from './rangeSelection';
import { useCreateLoop, useUpdateLoop } from './useLoops';
import { editorBarFields, type LoopEditor } from './useLoopPractice';

type DetailFields = Pick<LoopFormValues, 'name' | 'targetPercent'>;

/**
 * The form for a new loop, or for editing `loop`. The bars come from the
 * score (tap the first bar then the last, or drag with a mouse) or from the
 * two number fields; the page holds them in `editor` so the score can
 * highlight them. A new loop saves at the speed playing now.
 */
export function LoopEditorForm({
  songId,
  barCount,
  loop,
  editor,
  player,
  snapshot,
  onBarsChange,
  onSaved,
  onCancel,
}: {
  songId: string;
  barCount: number;
  /** The loop being edited; null for a new one. */
  loop: Loop | null;
  editor: LoopEditor;
  player: PlayerService | null;
  snapshot: PlayerSnapshot;
  onBarsChange: (bars: Partial<LoopBarFields>) => void;
  onSaved: (saved: Loop) => void;
  onCancel: () => void;
}) {
  const create = useCreateLoop(songId);
  const update = useUpdateLoop(songId);
  const mutation = loop ? update : create;
  // Only touched fields, so the others keep showing the latest saved values.
  const [draft, setDraft] = useState<Partial<DetailFields>>({});
  const [errors, setErrors] = useState<LoopFormErrors>({});
  const saved = loop ? loopFormValues(loop) : EMPTY_LOOP_FORM;
  const values: LoopFormValues = { ...saved, ...draft, ...editorBarFields(editor, loop) };
  // Locked while saving: an edit would reset() the mutation, so the form would
  // stop showing its progress or error and allow a second save alongside it.
  const saving = mutation.isPending;

  const range = formBarRange(values, barCount);
  const hint = selectionHint(
    range ? { ...range, awaitingEnd: editor.awaitingEnd } : null,
    hasFinePointer(),
  );
  // The tempo the loop's BPM is worked out from: the file's tempo at its first bar.
  const tempo = range ? (player?.tempoAtBar(range.startBar) ?? null) : null;

  const touched = () => {
    setErrors({});
    mutation.reset();
  };

  const edit = (changes: Partial<DetailFields>) => {
    if (saving) return;
    setDraft({ ...draft, ...changes });
    touched();
  };

  const editBars = (bars: Partial<LoopBarFields>) => {
    if (saving) return;
    onBarsChange(bars);
    touched();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const parsed = parseLoopForm(values, barCount);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;

    if (!loop) {
      create.mutate(
        { id: randomUuid(), ...parsed.details, speed_ratio: snapshot.speedRatio },
        { onSuccess: onSaved },
      );
      return;
    }
    const changes = changedLoopFields(loop, parsed.details);
    if (Object.keys(changes).length === 0) {
      onSaved(loop);
      return;
    }
    update.mutate({ loopId: loop.id, changes }, { onSuccess: onSaved });
  };

  return (
    <form
      aria-label={loop ? `Edit ${loop.name}` : 'New loop'}
      className="flex flex-col gap-3"
      onSubmit={onSubmit}
      noValidate
    >
      <p className="text-sm text-neutral-300" aria-live="polite" data-testid="loop-bars-hint">
        {hint}
      </p>
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <Field
            label="First bar"
            value={values.startBar}
            invalid={errors.bars !== undefined}
            readOnly={saving}
            inputMode="numeric"
            className="w-24"
            onChange={(startBar) => editBars({ startBar })}
          />
          <Field
            label="Last bar"
            value={values.endBar}
            invalid={errors.bars !== undefined}
            readOnly={saving}
            inputMode="numeric"
            className="w-24"
            onChange={(endBar) => editBars({ endBar })}
          />
        </div>
        {errors.bars && <span className="text-sm text-red-300">{errors.bars}</span>}
      </div>
      <Field
        label="Name"
        value={values.name}
        error={errors.name}
        readOnly={saving}
        placeholder="Chorus fill"
        onChange={(name) => edit({ name })}
      />
      <Field
        label="Target speed % (optional)"
        value={values.targetPercent}
        error={errors.targetPercent}
        readOnly={saving}
        inputMode="numeric"
        className="w-24"
        note={targetNote(values.targetPercent, tempo)}
        onChange={(targetPercent) => edit({ targetPercent })}
      />
      {!loop && (
        <p className="text-sm text-neutral-400" data-testid="loop-new-speed">
          Saves at the speed playing now: {speedLabel(snapshot.speedRatio, tempo)}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={saving}>
          {saving ? 'Saving…' : 'Save loop'}
        </button>
        <button type="button" className={buttonClass} disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {mutation.isError && (
        <ErrorAlert>Couldn't save the loop: {mutation.error.message}</ErrorAlert>
      )}
    </form>
  );
}

/** The BPM a typed whole-percent target gives, once there is a tempo to work it out from. */
function targetNote(targetPercent: string, tempo: number | null): string | undefined {
  const percent = Number(targetPercent.trim().replace(/%$/, ''));
  if (tempo === null || !Number.isInteger(percent) || percent <= 0) return undefined;
  return speedLabel(percentToRatio(percent), tempo);
}

/** Whether there is a mouse to drag with; the hint only offers a drag where it works. */
function hasFinePointer(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

function Field({
  label,
  value,
  error,
  invalid = error !== undefined,
  readOnly,
  inputMode,
  placeholder,
  className = '',
  note,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  /** For a field whose error is shown elsewhere (the two bar fields share one). */
  invalid?: boolean;
  /** Read-only rather than disabled, so focus stays put while saving. */
  readOnly: boolean;
  inputMode?: 'numeric';
  placeholder?: string;
  className?: string;
  /** Shown beside the field: what the value works out to. */
  note?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-neutral-300">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          className={`${inputClass} ${className || 'w-full'}`}
          value={value}
          readOnly={readOnly}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete="off"
          aria-invalid={invalid ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {note && <span className="text-sm text-neutral-400">{note}</span>}
      </div>
      {error && <span className="text-sm text-red-300">{error}</span>}
    </div>
  );
}
