import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ErrorAlert } from '@/components/ErrorAlert';
import {
  buttonClass,
  dangerButtonClass,
  inputClass,
  primaryButtonClass,
} from '@/components/styles';
import {
  changedSongFields,
  normaliseSongEdit,
  validateSongEdit,
  type LibrarySong,
  type SongEdit,
  type SongEditErrors,
} from './songForm';
import { NO_DRUM_TRACK_NOTE } from './UploadPanel';
import { useDeleteSong, useUpdateSong } from './useSongs';

type Mode = 'view' | 'edit' | 'confirm-delete';

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const formatDay = (timestamp: string) => dateFormat.format(new Date(timestamp));

export function SongListItem({ song }: { song: LibrarySong }) {
  const [mode, setMode] = useState<Mode>('view');
  const view = () => setMode('view');

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-4">
      {mode === 'edit' ? <EditSongForm song={song} onDone={view} /> : <SongSummary song={song} />}
      {mode === 'view' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => setMode('edit')}>
            Edit<span className="sr-only"> {song.title}</span>
          </button>
          <button type="button" className={buttonClass} onClick={() => setMode('confirm-delete')}>
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
        to={`/songs/${song.id}`}
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
  const titleId = useId();
  const artistId = useId();
  // Only touched fields, so the other one keeps showing the latest saved value.
  const [draft, setDraft] = useState<Partial<SongEdit>>({});
  const [errors, setErrors] = useState<SongEditErrors>({});
  const saved: SongEdit = { title: song.title, artist: song.artist };
  const values: SongEdit = { ...saved, ...draft };

  const edit = (changes: Partial<SongEdit>) => {
    setDraft({ ...draft, ...changes });
    setErrors({});
    update.reset();
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
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
      <div className="flex flex-col gap-1">
        <label htmlFor={titleId}>Title</label>
        <input
          id={titleId}
          className={inputClass}
          value={values.title}
          aria-invalid={errors.title ? true : undefined}
          onChange={(event) => edit({ title: event.target.value })}
        />
        {errors.title && <span className="text-sm text-red-300">{errors.title}</span>}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={artistId}>Artist</label>
        <input
          id={artistId}
          className={inputClass}
          value={values.artist}
          aria-invalid={errors.artist ? true : undefined}
          onChange={(event) => edit({ artist: event.target.value })}
        />
        {errors.artist && <span className="text-sm text-red-300">{errors.artist}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className={buttonClass} disabled={update.isPending} onClick={onDone}>
          Cancel
        </button>
      </div>
      {update.isError && <ErrorAlert>Couldn't save the song: {update.error.message}</ErrorAlert>}
    </form>
  );
}

function ConfirmDelete({ song, onCancel }: { song: LibrarySong; onCancel: () => void }) {
  const remove = useDeleteSong();

  return (
    <div role="group" aria-label={`Delete ${song.title}`} className="flex flex-col gap-2">
      <p className="text-neutral-200">
        Delete “{song.title}”? Its loops and practice history are deleted too. This can't be undone.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={dangerButtonClass}
          disabled={remove.isPending}
          onClick={() => remove.mutate(song.id)}
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
      {remove.isError && <ErrorAlert>Couldn't delete the song: {remove.error.message}</ErrorAlert>}
    </div>
  );
}
