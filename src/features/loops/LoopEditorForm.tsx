import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import { buttonClass, inputClass, labelClass, primaryButtonClass } from '@/components/styles';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import { percentToRatio } from '@/features/player/speed';
import { isOnline, useOnline } from '@/lib/network';
import { randomUuid } from '@/lib/randomUuid';
import {
  changedLoopDetails,
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
import { failureCopy } from '@/lib/errorCopy';

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
  onSavingChange,
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
  /** The save started or settled. While it is pending the page lets the score pick no bars. */
  onSavingChange: (saving: boolean) => void;
  onSaved: (saved: Loop) => void;
  onCancel: () => void;
}) {
  const create = useCreateLoop(songId);
  const update = useUpdateLoop(songId);
  const mutation = loop ? update : create;
  // Only touched fields, so the others keep showing the latest saved values.
  const [draft, setDraft] = useState<Partial<DetailFields>>({});
  const [errors, setErrors] = useState<LoopFormErrors>({});
  const barsErrorId = useId();
  // One id for the form's lifetime: a press after a lost answer sends the same
  // loop again, which the server already has, rather than a second loop.
  const [newLoopId] = useState(randomUuid);
  const saved = loop ? loopFormValues(loop) : EMPTY_LOOP_FORM;
  const values: LoopFormValues = { ...saved, ...draft, ...editorBarFields(editor, loop) };
  // Locked while saving: an edit would reset() the mutation, so the form would
  // stop showing its progress or error and allow a second save alongside it.
  const saving = mutation.isPending;
  // A new loop or an edit of one waits for the connection: offline the form would sit on
  // "Saving…" until it came back. A loop's speed and status are what queue offline.
  const online = useOnline();
  // The bars are the page's state, and the score changes them without passing through this form.
  useEffect(() => onSavingChange(saving), [saving, onSavingChange]);

  // The button that opened the form has gone with the list, so focus comes here rather
  // than falling to <body>. The form, not its first field: on a phone a focused field
  // brings up the keyboard over the score the bars are picked on. No scroll: the page
  // has just brought the score on screen for the picking.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => formRef.current?.focus({ preventScroll: true }), []);

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
    if (saving || !isOnline()) return;
    const parsed = parseLoopForm(values, barCount);
    setErrors(parsed.ok ? {} : parsed.errors);
    if (!parsed.ok) return;

    if (!loop) {
      create.mutate(
        { id: newLoopId, ...parsed.details, speed_ratio: snapshot.speedRatio },
        { onSuccess: onSaved },
      );
      return;
    }
    const changes = changedLoopDetails(loop, parsed.details);
    if (Object.keys(changes).length === 0) {
      onSaved(loop);
      return;
    }
    update.mutate({ loopId: loop.id, changes }, { onSuccess: onSaved });
  };

  return (
    <form
      ref={formRef}
      tabIndex={-1}
      aria-label={loop ? `Edit ${loop.name}` : 'New loop'}
      className="flex flex-col gap-3 focus:outline-none"
      onSubmit={onSubmit}
      noValidate
    >
      <p className="text-sm text-ink-soft" aria-live="polite" data-testid="loop-bars-hint">
        {hint}
      </p>
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <Field
            label="First bar"
            value={values.startBar}
            invalid={errors.bars !== undefined}
            describedBy={errors.bars !== undefined ? barsErrorId : undefined}
            readOnly={saving}
            inputMode="numeric"
            className="w-24"
            onChange={(startBar) => editBars({ startBar })}
          />
          <Field
            label="Last bar"
            value={values.endBar}
            invalid={errors.bars !== undefined}
            describedBy={errors.bars !== undefined ? barsErrorId : undefined}
            readOnly={saving}
            inputMode="numeric"
            className="w-24"
            onChange={(endBar) => editBars({ endBar })}
          />
        </div>
        {errors.bars && (
          <span id={barsErrorId} className="text-sm text-danger">
            {errors.bars}
          </span>
        )}
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
        <p className="text-sm text-ink-muted" data-testid="loop-new-speed">
          Saves at the speed playing now: {speedLabel(snapshot.speedRatio, tempo)}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={saving || !online}>
          {saving ? 'Saving…' : 'Save loop'}
        </button>
        <button type="button" className={buttonClass} disabled={saving} onClick={onCancel}>
          Cancel
        </button>
      </div>
      {!online && (
        <OfflineNote>You're offline. Loops can be saved once you're back online.</OfflineNote>
      )}
      {mutation.isError && (
        <ErrorAlert>Couldn't save the loop. {failureCopy(mutation.error)}</ErrorAlert>
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
  describedBy,
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
  /** The id of that error, read out with the field. */
  describedBy?: string;
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
  const errorId = `${id}-error`;
  const noteId = `${id}-note`;
  const descriptions = [error ? errorId : describedBy, note ? noteId : undefined].filter(Boolean);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
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
          aria-describedby={descriptions.length > 0 ? descriptions.join(' ') : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {note && (
          <span id={noteId} className="text-sm text-ink-muted">
            {note}
          </span>
        )}
      </div>
      {error && (
        <span id={errorId} className="text-sm text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
