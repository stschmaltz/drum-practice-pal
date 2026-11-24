import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import { isOnline, useOnline } from '@/lib/network';
import {
  buttonClass,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
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
import { NO_DRUM_TRACK_NOTE } from './songMetadata';
import { useDeleteSong, useUpdateSong } from './useSongs';

type Mode = 'view' | 'edit' | 'confirm-delete';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const formatDay = (timestamp: string) => dateFormat.format(new Date(timestamp));

export function SongListItem({
  song,
  onEditingChange,
  onDeletePressed,
}: {
  song: LibrarySong;
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
    <li
      className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-4"
      {...itemAttributes(song.id)}
    >
      {editing ? (
        <EditSongForm song={song} onDone={() => backTo('edit')} />
      ) : (
        <SongSummary song={song} />
      )}
      {mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={buttonClass}
            {...itemControlAttributes(song.id, 'edit')}
            onClick={() => setMode('edit')}
          >
            Edit<span className="sr-only"> {song.title}</span>
          </button>
          <button
            type="button"
            className={buttonClass}
            {...itemControlAttributes(song.id, 'delete')}
            onClick={() => setMode('confirm-delete')}
          >
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

function SongSummary({ song }: { song: LibrarySong }) {
  return (
    <div className="flex flex-col gap-1">
      <Link
        to={songPath(song.id)}
        className="text-lg font-semibold break-words text-neutral-100 hover:underline"
      >
        {song.title}
      </Link>
      {song.artist && <p className="break-words text-neutral-300">{song.artist}</p>}
      <p className="text-sm text-neutral-400">
        {song.bar_count} bars · {formatTempo(song.original_tempo)} BPM · added{' '}
        {formatDay(song.created_at)}
        {' · '}
        {song.last_practiced_at
          ? `practiced ${formatDay(song.last_practiced_at)}`
          : 'not practiced yet'}
      </p>
      {song.drum_track_index === null && (
        <p className="text-sm text-amber-300">{NO_DRUM_TRACK_NOTE}</p>
      )}
    </div>
  );
}

/** Whole BPM unless the file says otherwise, e.g. 92.5. */
function formatTempo(tempo: number): string {
  return Number.isInteger(tempo) ? String(tempo) : tempo.toFixed(1);
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
      {update.isError && <ErrorAlert>Couldn't save the song: {update.error.message}</ErrorAlert>}
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
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={inputClass}
        value={value}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="text-sm text-red-300">{error}</span>}
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
      className="flex flex-col gap-2 focus:outline-none"
    >
      <p className="text-neutral-200">
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
      {remove.isError && <ErrorAlert>Couldn't delete the song: {remove.error.message}</ErrorAlert>}
    </div>
  );
}
