import { useCallback, useId, useState } from 'react';
import { useSearchParams } from 'react-router';
import { LoadErrorAlert } from '@/components/LoadErrorAlert';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, LoadingLine } from '@/components/StatusMessages';
import { inputClass, labelClass, sectionHeadingClass } from '@/components/styles';
import { waitsForNetwork } from '@/lib/network';
import type { LibrarySong } from './songForm';
import { isLibrarySort, searchSongs, sortSongs, type LibrarySort } from './songList';
import { SongListItem } from './SongListItem';
import { UploadPanel } from './UploadPanel';
import { useSongs } from './useSongs';

const SORT_LABELS: Record<LibrarySort, string> = {
  practiced: 'Recently practiced',
  added: 'Recently added',
};

/** Used when the URL names no sort; picking it drops the param. */
const DEFAULT_SORT: LibrarySort = 'practiced';

export function LibraryPage() {
  const songs = useSongs();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Library" />
      <UploadPanel />
      {waitsForNetwork(songs) ? (
        <EmptyState icon="offline">
          You're offline, and your library hasn't been opened on this device yet. It shows once
          you're back online.
        </EmptyState>
      ) : songs.isPending ? (
        <LoadingLine>Loading your songs…</LoadingLine>
      ) : songs.isLoadingError ? (
        <LoadErrorAlert onRetry={() => void songs.refetch()}>
          Couldn't load your songs: {songs.error.message}
        </LoadErrorAlert>
      ) : songs.data.length === 0 ? (
        <EmptyState icon="library">
          No songs yet. Upload a Guitar Pro file to start your library.
        </EmptyState>
      ) : (
        <SongList songs={songs.data} />
      )}
    </div>
  );
}

/** Search and sort live in the URL, so coming back from a song keeps them. */
function useLibraryView() {
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const sortParam = params.get('sort');
  const sort: LibrarySort = isLibrarySort(sortParam) ? sortParam : DEFAULT_SORT;

  const set = (key: 'q' | 'sort', value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  return {
    query,
    sort,
    setQuery: (value: string) => set('q', value),
    setSort: (value: LibrarySort) => set('sort', value === DEFAULT_SORT ? '' : value),
  };
}

/**
 * Songs with their edit form open. The search keeps them, so an optimistic
 * rename that no longer matches doesn't unmount the form (and lose its draft
 * or error) before the save settles; it drops out once the form closes.
 */
function useEditingIds() {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const onEditingChange = useCallback((songId: string, editing: boolean) => {
    setIds((current) => {
      if (current.has(songId) === editing) return current;
      const next = new Set(current);
      if (editing) next.add(songId);
      else next.delete(songId);
      return next;
    });
  }, []);
  return [ids, onEditingChange] as const;
}

function SongList({ songs }: { songs: LibrarySong[] }) {
  const { query, sort, setQuery, setSort } = useLibraryView();
  const searchId = useId();
  const sortId = useId();
  const [editingIds, onEditingChange] = useEditingIds();
  const shown = sortSongs(searchSongs(songs, query, editingIds), sort);

  return (
    <section aria-labelledby="songs-heading" className="flex flex-col gap-4">
      <h2 id="songs-heading" className={sectionHeadingClass}>
        Your songs <span className="text-ink-muted">({songs.length})</span>
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={searchId} className={labelClass}>
            Search title or artist
          </label>
          <input
            id={searchId}
            type="search"
            className={inputClass}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={sortId} className={labelClass}>
            Sort by
          </label>
          <select
            id={sortId}
            className={inputClass}
            value={sort}
            onChange={(event) => {
              if (isLibrarySort(event.target.value)) setSort(event.target.value);
            }}
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {shown.length === 0 ? (
        // Not the query itself: it comes from the URL.
        <p className="text-ink-muted">No songs match your search.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shown.map((song) => (
            <SongListItem key={song.id} song={song} onEditingChange={onEditingChange} />
          ))}
        </ul>
      )}
    </section>
  );
}
