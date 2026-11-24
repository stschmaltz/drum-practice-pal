import { useEffect, useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import { isOnline, useOnline } from '@/lib/network';
import { Icon } from '@/components/icons';
import {
  buttonClass,
  cardClass,
  dangerButtonClass,
  dangerPanelClass,
  focusRing,
  inputClass,
  labelClass,
  primaryButtonClass,
  quietButtonClass,
} from '@/components/styles';
import { songPath } from '@/lib/routes';
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
}: {
  song: LibrarySong;
  /**
   * Told when the edit form opens and closes (or the item unmounts), so the
   * list can keep showing a song whose optimistic rename no longer matches
   * the search. Pass a stable function.
   */
  onEditingChange?: (songId: string, editing: boolean) => void;
}) {
  const [mode, setMode] = useState<Mode>('view');
  const view = () => setMode('view');
  const editing = mode === 'edit';

  useEffect(() => {
    if (!editing || !onEditingChange) return;
    onEditingChange(song.id, true);
    return () => onEditingChange(song.id, false);
  }, [editing, song.id, onEditingChange]);

  return (
    <li className={`${cardClass} flex flex-col gap-3 p-4`}>
      {editing ? <EditSongForm song={song} onDone={view} /> : <SongSummary song={song} />}
      {mode === 'view' && (
        <div className="flex flex-wrap gap-1">
          <button type="button" className={quietButtonClass} onClick={() => setMode('edit')}>
            <Icon name="edit" className="size-4" />
            Edit<span className="sr-only"> {song.title}</span>
          </button>
          <button
            type="button"
            className={quietButtonClass}
            onClick={() => setMode('confirm-delete')}
          >
            <Icon name="trash" className="size-4" />
            Delete<span className="sr-only"> {song.title}</span>
          </button>
        </div>
      )}
      {mode === 'confirm-delete' && <ConfirmDelete song={song} onCancel={view} />}
    </li>
  );
}

function SongSummary({ song }: { song: LibrarySong }) {
  return (
    <div className="flex flex-col gap-1">
      <Link
        to={songPath(song.id)}
        className={`inline-flex min-h-touch max-w-full items-center self-start rounded-sm text-lg font-semibold wrap-anywhere text-ink hover:text-brand ${focusRing}`}
      >
        {song.title}
      </Link>
      {song.artist && <p className="break-words text-ink-soft">{song.artist}</p>}
      <p className="text-sm text-ink-muted">
        {song.bar_count} bars · {formatTempo(song.original_tempo)} BPM · added{' '}
        {formatDay(song.created_at)}
        {' · '}
        {song.last_practiced_at
          ? `practiced ${formatDay(song.last_practiced_at)}`
          : 'not practiced yet'}
      </p>
      {song.drum_track_index === null && (
        <p className="flex items-start gap-2 text-sm text-warning">
          <Icon name="alert" className="mt-0.5 size-4" />
          {NO_DRUM_TRACK_NOTE}
        </p>
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
    <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
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
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        value={value}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}

function ConfirmDelete({ song, onCancel }: { song: LibrarySong; onCancel: () => void }) {
  const remove = useDeleteSong();
  const online = useOnline();

  return (
    <div
      role="group"
      aria-label={`Delete ${song.title}`}
      className={`${dangerPanelClass} flex flex-col gap-2`}
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
            if (isOnline()) remove.mutate(song.id);
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
