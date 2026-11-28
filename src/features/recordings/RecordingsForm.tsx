import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { ErrorAlert } from '@/components/ErrorAlert';
import { Icon } from '@/components/icons';
import { OfflineNote } from '@/components/OfflineNote';
import { LoadingLine } from '@/components/StatusMessages';
import {
  buttonClass,
  cardClass,
  ghostButtonClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  quietButtonClass,
  sectionHeadingClass,
} from '@/components/styles';
import type { Song } from '@/features/library/songForm';
import { failureCopy } from '@/lib/errorCopy';
import { isOnline, useOnline } from '@/lib/network';
import { pointerIsFine } from '@/lib/pointer';
import { randomUuid } from '@/lib/randomUuid';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import { linkInputId } from './recordingFocus';
import {
  EMPTY_LINK_DRAFT,
  fieldReading,
  isEmptyPlan,
  linkFields,
  planLinkSave,
  type LinkDraft,
  type LinkField,
  type LinkSlot,
  type SongLinkRow,
} from './songLinkForm';
import {
  keptLinkText,
  LINK_REFUSAL_COPY,
  recognisedAs,
  SONG_LINK_KIND_LABELS,
  type LinkRefusal,
} from './songLinks';
import { useSaveSongLinks, useSongLinkSaves } from './useSongLinks';

const FIELD_HINTS: Record<'original' | 'drumless', string> = {
  original: 'The song as it was recorded.',
  drumless: 'A version without the drums, to be the drummer.',
};

/**
 * "Manage recordings": a link field for the song's Original and Drumless, one
 * per other link, and "Add another link". Nothing is saved or removed until
 * Save: Remove only empties a field, and Cancel leaves everything as it was.
 * Online only (AGENTS.md): Save is off offline and says why, the handler
 * refuses, and the write fails rather than waits.
 *
 * While a save is on its way every field and the form's own ways out are
 * locked. The page's other links aren't (the nav and the browser's Back can't
 * be), so how the save is going is read from the mutation cache
 * (`useSongLinkSaves`): a form opened again meanwhile is locked on the save
 * still on its way, and a failure is shown here or, with the form gone, on
 * the overview. Cancel is the user's "I've read it": the failure goes with it.
 *
 * Opening it puts focus in the first empty link field where there is a mouse
 * or trackpad, and on the form itself on a touch screen, where a focused
 * field would bring the keyboard up over the page before anything is tapped.
 */
export function RecordingsForm({
  song,
  links,
  onClose,
}: {
  song: Song;
  links: Pick<UseQueryResult<SongLinkRow[]>, 'data' | 'isLoadingError'>;
  onClose: () => void;
}) {
  const save = useSaveSongLinks(song.id);
  const saves = useSongLinkSaves(song.id);
  const online = useOnline();
  const formId = useId();
  const focusWhenReady = useFocusWhenReady();
  // Made once per form, so Save pressed again after a lost answer writes the same rows.
  const [newIds] = useState(() => ({ original: randomUuid(), drumless: randomUuid() }));
  const [draft, setDraft] = useState<LinkDraft>(EMPTY_LINK_DRAFT);
  const [errors, setErrors] = useState<Partial<Record<LinkSlot, LinkRefusal>>>({});
  // In place of the control that opened it: the form's name is read out, and no keyboard
  // comes up on a phone until a field is tapped.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => formRef.current?.focus({ preventScroll: true }), []);

  const saving = saves.saving;
  const fields = links.data ? linkFields(links.data, draft, newIds) : null;
  // With a mouse or trackpad the first empty field takes focus, ready for the paste, once the
  // fields are there. Only from the form itself, where opening put it: someone who has
  // tabbed on while the links loaded keeps their place.
  const fieldsShown = fields !== null;
  useEffect(() => {
    const form = formRef.current;
    if (!fieldsShown || !form || !pointerIsFine() || document.activeElement !== form) return;
    firstEmptyLinkInput(form)?.focus();
  }, [fieldsShown]);

  const setText = (slot: LinkSlot, text: string) => {
    if (saving) return;
    // A paste with words round its link ("Song title https://…") shows as the link it holds.
    const kept = keptLinkText(text);
    setDraft((current) => ({ ...current, texts: { ...current.texts, [slot]: kept } }));
    setErrors((current) => without(current, slot));
  };
  const addOther = () => {
    if (saving) return;
    const id = randomUuid();
    setDraft((current) => ({ ...current, added: [...current.added, id] }));
    focusWhenReady(() => document.getElementById(linkInputId(formId, `other:${id}`)));
  };
  const remove = (field: LinkField) => {
    if (saving) return;
    if (field.saved) {
      setText(field.slot, '');
      return;
    }
    // An added row that was never saved goes altogether, and focus to the button that adds one.
    setDraft((current) => {
      const texts = without(current.texts, field.slot);
      return { texts, added: current.added.filter((id) => id !== field.id) };
    });
    focusWhenReady(() => document.getElementById(`${formId}-add`));
  };
  /** Closed by the user's own hand: a failure shown here has been read, and isn't said again. */
  const close = () => {
    saves.forgetFailure();
    onClose();
  };
  const cancel = () => {
    if (!saving) close();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    // Asked of the cache at the press: a save an earlier opening of the form sent counts too.
    if (!fields || saving || saves.isSaving() || !isOnline()) return;
    const check = planLinkSave(fields);
    if (!check.ok) {
      setErrors(check.errors);
      const first = fields.find((field) => check.errors[field.slot] !== undefined);
      if (first) document.getElementById(linkInputId(formId, first.slot))?.focus();
      return;
    }
    if (isEmptyPlan(check.plan)) {
      close();
      return;
    }
    save.mutate(check.plan, { onSuccess: onClose });
  };

  return (
    <form
      ref={formRef}
      tabIndex={-1}
      aria-labelledby={`${formId}-heading`}
      noValidate
      className={`${cardClass} flex max-w-2xl flex-col gap-4 p-4 focus:outline-none`}
      onSubmit={submit}
    >
      <h2 id={`${formId}-heading`} className={sectionHeadingClass}>
        Recordings
      </h2>
      <p className="text-sm text-ink-soft">
        Paste a link from YouTube or Spotify. A YouTube video plays here with the tab under it, and
        can be slowed down with its own controls. A Spotify link opens Spotify, which can't slow a
        song down: for that, add a YouTube link.
      </p>
      {fields === null ? (
        links.isLoadingError ? (
          <ErrorAlert>Couldn't load this song's recordings. Close this and try again.</ErrorAlert>
        ) : (
          <LoadingLine small>Loading recordings…</LoadingLine>
        )
      ) : (
        <>
          {fields.map((field, index) => (
            <LinkFieldRow
              key={field.slot}
              field={field}
              inputId={linkInputId(formId, field.slot)}
              label={
                field.kind === 'other'
                  ? `Other link ${index - 1}`
                  : SONG_LINK_KIND_LABELS[field.kind]
              }
              hint={field.kind === 'other' ? null : FIELD_HINTS[field.kind]}
              error={errors[field.slot]}
              locked={saving}
              onChange={(text) => setText(field.slot, text)}
              onRemove={() => remove(field)}
            />
          ))}
          <button
            type="button"
            id={`${formId}-add`}
            className={`${ghostButtonClass} -ml-4 self-start`}
            aria-disabled={saving || undefined}
            onClick={addOther}
          >
            <Icon name="plus" />
            Add another link
          </button>
        </>
      )}
      {saves.error && (
        <ErrorAlert>
          Couldn't save the recordings. {failureCopy(saves.error)} Some changes may have been saved:
          the fields show what is saved now.
        </ErrorAlert>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className={primaryButtonClass}
          disabled={fields === null || !online}
          // Locked, not disabled, while saving: focus is on it, and a disabled button drops it.
          aria-disabled={saving || undefined}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          className={buttonClass}
          // Locked, not disabled: focus may be on it, and a disabled button would drop it.
          aria-disabled={saving || undefined}
          onClick={cancel}
        >
          Cancel
        </button>
      </div>
      {!online && (
        <OfflineNote>
          You're offline. Recordings can be changed once you're back online.
        </OfflineNote>
      )}
    </form>
  );
}

/** The first link field with nothing in it: where a paste would go. */
function firstEmptyLinkInput(form: HTMLFormElement): HTMLInputElement | null {
  const inputs = form.querySelectorAll<HTMLInputElement>('input[data-link-field]');
  return [...inputs].find((input) => input.value.trim() === '' && !input.readOnly) ?? null;
}

/** A copy of a by-slot record with one slot taken out. */
function without<T>(
  record: Partial<Record<LinkSlot, T>>,
  slot: LinkSlot,
): Partial<Record<LinkSlot, T>> {
  const copy = { ...record };
  delete copy[slot];
  return copy;
}

function LinkFieldRow({
  field,
  inputId,
  label,
  hint,
  error,
  locked,
  onChange,
  onRemove,
}: {
  field: LinkField;
  inputId: string;
  label: string;
  hint: string | null;
  error: LinkRefusal | undefined;
  locked: boolean;
  onChange: (text: string) => void;
  onRemove: () => void;
}) {
  const reading = fieldReading(field);
  const empty = field.text.trim() === '';
  // A new Original or Drumless field has nothing saved to remove: it is emptied by hand.
  const removable = field.kind === 'other' || field.saved !== null;
  const nothingToRemove = field.saved !== null && empty;
  const noteId = `${inputId}-note`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className={labelClass}>
        {label}
        {hint && <span className="font-normal text-ink-muted"> · {hint}</span>}
      </label>
      {/* One row at every width: Remove never drops between the field and the line about it. */}
      <div className="flex items-center gap-2">
        <input
          id={inputId}
          data-link-field
          // Not type="url": the browser's own check would refuse "youtu.be/…" pasted without
          // its scheme, which the parser takes, and its message isn't ours.
          type="text"
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="https://"
          className={`${inputClass} min-w-0 flex-1`}
          value={field.text}
          // Read-only, not disabled, while saving: focus may be here (Enter saves), and stays.
          readOnly={locked}
          aria-invalid={error !== undefined || undefined}
          aria-describedby={noteId}
          onChange={(event) => onChange(event.target.value)}
        />
        {removable && (
          <button
            type="button"
            className={`${quietButtonClass} min-w-touch shrink-0`}
            // Locked, not disabled, once the saved link's field is empty: focus is on it then.
            aria-disabled={locked || nothingToRemove || undefined}
            onClick={() => {
              if (!locked && !nothingToRemove) onRemove();
            }}
          >
            <Icon name="trash" className="size-4" />
            {/* A phone has no room for the word beside the field: the icon, and the name unchanged. */}
            <span className="max-md:sr-only">Remove</span>
            <span className="sr-only"> {label}</span>
          </button>
        )}
      </div>
      <p
        id={noteId}
        role={error !== undefined ? 'alert' : undefined}
        className={`min-h-5 text-sm wrap-anywhere ${error !== undefined ? 'text-danger' : 'text-ink-muted'}`}
      >
        {error !== undefined
          ? LINK_REFUSAL_COPY[error]
          : nothingToRemove
            ? 'This link is removed when you save.'
            : reading?.ok
              ? recognisedAs(reading.link, field.kind)
              : null}
      </p>
    </div>
  );
}
