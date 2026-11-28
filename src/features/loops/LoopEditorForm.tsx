import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import { buttonClass, inputClass, labelClass, primaryButtonClass } from '@/components/styles';
import {
  isLoaded,
  isRunning,
  type PlayerService,
  type PlayerSnapshot,
} from '@/features/player/PlayerService';
import { failureCopy } from '@/lib/errorCopy';
import { isOnline, useOnline } from '@/lib/network';
import { pointerIsFine } from '@/lib/pointer';
import { randomUuid } from '@/lib/randomUuid';
import {
  barCountLabel,
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

type DetailFields = Pick<LoopFormValues, 'name'>;

/**
 * The form for a new loop, or for editing `loop`. The bars come from the
 * score (tap the first bar then the last, or drag with a mouse) or from the
 * two number fields; the page holds them in `editor` so the score can
 * highlight them. A new loop saves at the speed playing now.
 *
 * `layout`: `panel` in the loop panel; `bar` for the practice screen's "Save
 * as loop" sheet, where the fields share a row and the button says what it
 * does there.
 *
 * Where more loops can follow a save, its caller shows `LoopSavedChoice` in
 * the form's place and keys the form, so the one that comes back is new.
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
  layout = 'panel',
  cancelLabel = 'Cancel',
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
  layout?: 'panel' | 'bar';
  /** The second button's words: "Done" once a loop has been saved and the form stayed. */
  cancelLabel?: string;
}) {
  const inBar = layout === 'bar';
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
    pointerIsFine(),
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

  // Typed bars may be anywhere in the song, so their first bar is brought on screen
  // once they make a range (what the score then highlights). Only here: bars picked
  // on the score come through the page, and a tapped bar must not move under the
  // finger. Not while the song runs: the score is then where the music is.
  //
  // Typed before the sounds are in (the form opens from the score's load on), the bar
  // is kept here and not handed to `showBar`, which would scroll to it whenever the
  // sounds came, however much later, with the form holding other bars by then or gone.
  const typedBeforeSounds = useRef<{ startBar: number; endBar: number } | null>(null);
  const showTypedBars = (bars: Partial<LoopBarFields>) => {
    if (!player) return;
    const { status } = player.getSnapshot();
    if (isRunning(status)) return;
    const typed = formBarRange({ ...values, ...bars }, barCount);
    typedBeforeSounds.current = isLoaded(status) ? null : typed;
    if (typed && isLoaded(status)) player.showBar(typed.startBar);
  };
  const soundsIn = isLoaded(snapshot.status);
  useEffect(() => {
    const typed = typedBeforeSounds.current;
    typedBeforeSounds.current = null;
    // Only the bars the form still holds: a tap on the score or a cleared field since
    // has made them another range, or none.
    const stillHeld = typed?.startBar === range?.startBar && typed?.endBar === range?.endBar;
    if (soundsIn && typed && stillHeld) showTypedBars({});
    // Only the sounds coming in: every other change is a keystroke, shown as it is typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soundsIn]);

  const editBars = (bars: Partial<LoopBarFields>) => {
    if (saving) return;
    onBarsChange(bars);
    showTypedBars(bars);
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
      {/* In the bar the bars and the name share a row, wrapping on a phone. */}
      <div className={inBar ? 'flex flex-wrap items-start gap-x-3 gap-y-2' : 'contents'}>
        <div className="flex flex-col gap-1">
          <div className="flex gap-2">
            <Field
              label="First bar"
              value={values.startBar}
              invalid={errors.bars !== undefined}
              describedBy={errors.bars !== undefined ? barsErrorId : undefined}
              readOnly={saving}
              inputMode="numeric"
              className={inBar ? 'w-20' : 'w-24'}
              onChange={(startBar) => editBars({ startBar })}
            />
            <Field
              label="Last bar"
              value={values.endBar}
              invalid={errors.bars !== undefined}
              describedBy={errors.bars !== undefined ? barsErrorId : undefined}
              readOnly={saving}
              inputMode="numeric"
              className={inBar ? 'w-20' : 'w-24'}
              onChange={(endBar) => editBars({ endBar })}
            />
          </div>
          {/* Live as the fields change or bars are picked; nothing while they make no range. */}
          <p className="min-h-5 text-sm text-ink-muted" data-testid="loop-bar-count">
            {barCountLabel(range)}
          </p>
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
          rootClassName={inBar ? 'min-w-40 flex-1' : undefined}
          onChange={(name) => edit({ name })}
        />
      </div>
      {!loop && (
        <p className="text-sm text-ink-muted" data-testid="loop-new-speed">
          Saves at the speed playing now: {speedLabel(snapshot.speedRatio, tempo)}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={saving || !online}>
          {saving ? 'Saving…' : inBar ? 'Save as loop' : 'Save loop'}
        </button>
        <button type="button" className={buttonClass} disabled={saving} onClick={onCancel}>
          {cancelLabel}
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
  rootClassName,
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
  /** For the field's box with its label, where it shares a row. */
  rootClassName?: string;
  /** Shown beside the field: what the value works out to. */
  note?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const noteId = `${id}-note`;
  const descriptions = [error ? errorId : describedBy, note ? noteId : undefined].filter(Boolean);
  return (
    <div className={`flex flex-col gap-1 ${rootClassName ?? ''}`}>
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
