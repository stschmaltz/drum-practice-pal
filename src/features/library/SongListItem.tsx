import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import { failureCopy } from '@/lib/errorCopy';
import { isOnline, useOnline } from '@/lib/network';
import { Icon } from '@/components/icons';
import { ProgressRing } from '@/components/ProgressMarks';
import {
  buttonClass,
  dangerButtonClass,
  dangerPanelClass,
  focusRing,
  inputClass,
  labelClass,
  primaryButtonClass,
  quietButtonClass,
} from '@/components/styles';
import {
  findItemControl,
  itemAttributes,
  itemControlAttributes,
  type ItemControl,
} from '@/lib/itemFocus';
import { songPath } from '@/lib/routes';
import { useFocusWhenReady } from '@/lib/useFocusWhenReady';
import {
  changedSongFields,
  normaliseSongEdit,
  validateSongEdit,
  type LibrarySong,
  type SongEdit,
  type SongEditErrors,
} from './songForm';
import { masteryFraction, masteryLine, type Mastery } from '@/features/loops/mastery';
import { NO_DRUM_TRACK_NOTE } from './songMetadata';
import { useDeleteSong, useUpdateSong } from './useSongs';

type Mode = 'view' | 'edit' | 'confirm-delete';

export function SongListItem({
  song,
  mastery,
  onEditingChange,
  onEditClosed,
  onDeletePressed,
}: {
  song: LibrarySong;
  /** Its loops' mastery; null while the loops are still being read. */
  mastery: Mastery | null;
  /**
   * The edit form closed (saved or cancelled). A saved rename can take the song
   * out of the list's search, and its Edit button with it, so the list hands
   * focus on instead of the item. Without it the item focuses its own Edit.
   */
  onEditClosed?: (songId: string) => void;
  /**
   * "Delete song" was pressed: the item will leave the list once the server
   * confirms, and the list hands focus on (its own button goes with it).
   */
  onDeletePressed?: (songId: string) => void;
  /**
   * Told when the edit form opens and closes (or the item unmounts), so the
   * list can keep showing a song whose optimistic rename no longer matches
   * the search. Pass a stable function.
   */
  onEditingChange?: (songId: string, editing: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>('view');
  const focusWhenReady = useFocusWhenReady();
  /** Back to the buttons, focus on the one that stands for what was just left. */
  const backTo = (control: ItemControl) => {
    setMode('view');
    focusWhenReady(() => findItemControl(song.id, control));
  };
  const editing = mode === 'edit';

  useEffect(() => {
    if (!editing || !onEditingChange) return;
    onEditingChange(song.id, true);
    return () => onEditingChange(song.id, false);
  }, [editing, song.id, onEditingChange]);

  return (
    // A plain row between the list's dividers (Unit 14). relative: the title's link stretches
    // over the whole row (its ::after), and the row's buttons and its delete question sit above
    // that (relative z-10), so nothing is nested.
    <li
      className="relative flex flex-col gap-2 py-3 transition-colors duration-150 hover:bg-surface"
      {...itemAttributes(song.id)}
    >
      {editing ? (
        <EditSongForm
          song={song}
          onDone={() => {
            if (!onEditClosed) return backTo('edit');
            setMode('view');
            onEditClosed(song.id);
          }}
        />
      ) : (
        <SongSummary song={song} mastery={mastery} />
      )}
      {mode === 'view' && (
        <div className="relative z-10 -ml-3 flex flex-wrap gap-1 self-start pl-13">
          <button
            type="button"
            className={quietButtonClass}
            {...itemControlAttributes(song.id, 'edit')}
            onClick={() => setMode('edit')}
          >
            <Icon name="edit" className="size-4" />
            Edit<span className="sr-only"> {song.title}</span>
          </button>
          <button
            type="button"
            className={quietButtonClass}
            {...itemControlAttributes(song.id, 'delete')}
            onClick={() => setMode('confirm-delete')}
          >
            <Icon name="trash" className="size-4" />
            Delete<span className="sr-only"> {song.title}</span>
          </button>
        </div>
      )}
      {mode === 'confirm-delete' && (
        <ConfirmDelete
          song={song}
          onCancel={() => backTo('delete')}
          onDeletePressed={() => onDeletePressed?.(song.id)}
        />
      )}
    </li>
  );
}

function SongSummary({ song, mastery }: { song: LibrarySong; mastery: Mastery | null }) {
  const line = [song.artist, mastery ? masteryLine(mastery) : null].filter(Boolean).join(' · ');
  return (
    <div className="flex items-start gap-3">
      <ProgressRing
        fraction={mastery ? masteryFraction(mastery) : 0}
        empty={mastery === null || mastery.total === 0}
        className="mt-1.5 size-10"
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* The whole row opens the song: one link, its hit area stretched over the row
            by ::after (the item is `relative`), rather than a link wrapping the buttons. */}
        <Link
          to={songPath(song.id)}
          className={`inline-flex min-h-touch max-w-full items-center self-start rounded-sm text-lg font-semibold wrap-anywhere text-ink after:absolute after:inset-0 after:content-[''] hover:text-brand ${focusRing}`}
        >
          {song.title}
        </Link>
        {line && (
          <p className="-mt-1.5 text-sm wrap-anywhere text-ink-muted" data-testid="song-line">
            {line}
          </p>
        )}
        {song.drum_track_index === null && (
          <p className="mt-1 flex items-start gap-2 text-sm text-warning">
            <Icon name="alert" className="mt-0.5 size-4" />
            {NO_DRUM_TRACK_NOTE}
          </p>
        )}
      </div>
    </div>
  );
}

function EditSongForm({ song, onDone }: { song: LibrarySong; onDone: () => void }) {
  const update = useUpdateSong();
  // Only touched fields, so the other one keeps showing the latest saved value.
  const [draft, setDraft] = useState<Partial<SongEdit>>({});
  const [errors, setErrors] = useState<SongEditErrors>({});
  const saved: SongEdit = { title: song.title, artist: song.artist };
  const values: SongEdit = { ...saved, ...draft };
  // Locked while saving: an edit would reset() the mutation, so the form would
  // stop showing its progress or error and allow a second save alongside it.
  const saving = update.isPending;
  const online = useOnline();
  // In place of the Edit button that opened it. The form, not its first field: on a
  // phone a focused field brings up the keyboard.
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => formRef.current?.focus({ preventScroll: true }), []);

  const edit = (changes: Partial<SongEdit>) => {
    if (saving) return;
    setDraft({ ...draft, ...changes });
    setErrors({});
    update.reset();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (saving || !isOnline()) return;
    const normalised = normaliseSongEdit(values);
    const found = validateSongEdit(normalised);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    const changes = changedSongFields(saved, normalised);
    if (Object.keys(changes).length === 0) {
      onDone();
      return;
    }
    update.mutate({ songId: song.id, changes }, { onSuccess: onDone });
  };

  return (
    <form
      ref={formRef}
      tabIndex={-1}
      className="flex flex-col gap-3 focus:outline-none"
      onSubmit={onSubmit}
      noValidate
    >
      <TextField
        label="Title"
        value={values.title}
        error={errors.title}
        readOnly={saving}
        onChange={(title) => edit({ title })}
      />
      <TextField
        label="Artist"
        value={values.artist}
        error={errors.artist}
        readOnly={saving}
        onChange={(artist) => edit({ artist })}
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={saving || !online}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={buttonClass} disabled={saving} onClick={onDone}>
          Cancel
        </button>
      </div>
      {!online && (
        <OfflineNote>You're offline. Changes can be saved once you're back online.</OfflineNote>
      )}
      {update.isError && (
        <ErrorAlert>Couldn't save the song. {failureCopy(update.error)}</ErrorAlert>
      )}
    </form>
  );
}

function TextField({
  label,
  value,
  error,
  readOnly,
  onChange,
}: {
  label: string;
  value: string;
  error: string | undefined;
  /** Read-only rather than disabled, so focus stays put while saving. */
  readOnly: boolean;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        value={value}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && (
        <span id={errorId} className="text-sm text-danger">
          {error}
        </span>
      )}
    </div>
  );
}

function ConfirmDelete({
  song,
  onCancel,
  onDeletePressed,
}: {
  song: LibrarySong;
  onCancel: () => void;
  onDeletePressed: () => void;
}) {
  const remove = useDeleteSong();
  const online = useOnline();
  // In place of the Delete button that asked: the question is read out, and Tab reaches its buttons.
  const groupRef = useRef<HTMLDivElement>(null);
  useEffect(() => groupRef.current?.focus({ preventScroll: true }), []);

  return (
    <div
      ref={groupRef}
      tabIndex={-1}
      role="group"
      aria-label={`Delete ${song.title}`}
      // Above the title's stretched link, which would otherwise take its presses.
      className={`${dangerPanelClass} relative z-10 flex flex-col gap-2 focus:outline-none`}
    >
      <p className="text-ink">
        Delete “{song.title}”? Its loops and practice history are deleted too. This can't be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={dangerButtonClass}
          disabled={remove.isPending || !online}
          onClick={() => {
            if (!isOnline()) return;
            remove.mutate(song.id);
            onDeletePressed();
          }}
        >
          {remove.isPending ? 'Deleting…' : 'Delete song'}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={remove.isPending}
          onClick={onCancel}
        >
          Keep it
        </button>
      </div>
      {!online && (
        <OfflineNote>You're offline. Songs can be deleted once you're back online.</OfflineNote>
      )}
      {remove.isError && (
        <ErrorAlert>Couldn't delete the song. {failureCopy(remove.error)}</ErrorAlert>
      )}
    </div>
  );
}
