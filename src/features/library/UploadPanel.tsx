import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ErrorAlert } from '@/components/ErrorAlert';
import { OfflineNote } from '@/components/OfflineNote';
import { Icon } from '@/components/icons';
import {
  buttonClass,
  ghostButtonClass,
  focusRing,
  linkClass,
  primaryButtonClass,
  primaryLabelOffClass,
} from '@/components/styles';
import { failureCopy } from '@/lib/errorCopy';
import { isOnline, useOnline } from '@/lib/network';
import { songPath } from '@/lib/routes';
import { GUITAR_PRO_EXTENSIONS } from './songFile';
import { NO_DRUM_TRACK_NOTE } from './songMetadata';
import { SongFileError, type UploadResult, type UploadStep } from './songsApi';
import { UPLOAD_PICKER_ATTRIBUTES, UPLOAD_SECTION_ATTRIBUTES } from './uploadPicker';
import { useUploadSong } from './useSongs';

const STEP_LABELS: Record<UploadStep, string> = {
  reading: 'Reading',
  checking: 'Checking',
  uploading: 'Uploading',
  saving: 'Saving',
};

/**
 * Picker and drop zone for one Guitar Pro file at a time. The picker has no
 * `accept` filter: iOS greys out extensions it has no type for, such as .gp,
 * so the file's content is checked instead (songFile.ts). Leaving the page
 * doesn't cancel: the upload finishes and the song shows up in the list.
 * Offline both are off: an upload can't wait for the connection (the file
 * would have to be held, and the duplicate check needs the server).
 *
 * `compact` once the library has songs (12 UX pass): the big drop box gives
 * way to an "Upload" button, and a file can be dropped anywhere over the
 * library (`children`, the list), which outlines itself while a file is
 * dragged over it. The upload is the same either way.
 */
export function UploadPanel({
  compact = false,
  children,
}: {
  compact?: boolean;
  /** What the panel wraps: in compact mode the whole of it takes a dropped file. */
  children?: ReactNode;
}) {
  const upload = useUploadSong();
  const online = useOnline();
  const blocked = upload.isPending || !online;
  const [step, setStep] = useState<UploadStep>('reading');
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useIgnoreStrayFileDrops();

  const start = (file: File) => {
    if (!isOnline()) return;
    setDropError(null);
    controller.current = new AbortController();
    setStep('reading');
    upload.mutate({ file, signal: controller.current.signal, onStep: setStep });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (upload.isPending || !isOnline()) return;
    const files = event.dataTransfer.files;
    const [file] = files;
    if (!file) return;
    if (files.length > 1) {
      upload.reset();
      setDropError('Drop one file at a time.');
      return;
    }
    start(file);
  };

  const onDragOver = (event: DragEvent) => {
    // Without preventDefault the browser opens the dropped file instead.
    event.preventDefault();
    // Only for a file: a song card's link or selected text dragged across the list is no upload.
    if (!blocked && carriesFiles(event)) setDragging(true);
  };

  const fileName = upload.variables?.file.name;
  const dropHandlers = {
    onDragOver,
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      // Moving over the button or text inside the zone also fires dragleave.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop,
  };
  const picker = <FilePicker compact={compact} disabled={blocked} onPick={start} />;

  return (
    <div
      className="relative flex flex-col gap-6"
      {...(compact && { 'data-testid': 'drop-zone', ...dropHandlers })}
    >
      <section
        aria-labelledby="upload-heading"
        {...UPLOAD_SECTION_ATTRIBUTES}
        className={`flex flex-col gap-3 rounded-card ${focusRing}`}
      >
        <h2 id="upload-heading" className="sr-only">
          Add a song
        </h2>
        {compact ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {picker}
            <p className="text-sm text-ink-muted">or drop a Guitar Pro file anywhere here.</p>
          </div>
        ) : (
          <div
            data-testid="drop-zone"
            {...dropHandlers}
            className={`flex flex-col items-start gap-3 rounded-card border-2 border-dashed p-5 transition-colors duration-150 sm:flex-row sm:items-center ${
              dragging ? 'border-brand bg-brand-soft' : 'border-line-strong bg-surface'
            }`}
          >
            {picker}
            <p className="text-sm text-ink-muted">
              or drop one here. {GUITAR_PRO_EXTENSIONS.join(', ')} files, such as Songsterr's Guitar
              Pro export.
            </p>
          </div>
        )}

        {!online && (
          <OfflineNote>You're offline. Songs can be uploaded once you're back online.</OfflineNote>
        )}
        <div aria-live="polite" className="flex flex-col gap-2">
          {upload.isPending && (
            <UploadProgress
              step={step}
              fileName={fileName}
              onCancel={() => controller.current?.abort()}
            />
          )}
          {upload.isSuccess && <UploadOutcome result={upload.data} />}
          {upload.isError && <UploadFailure error={upload.error} fileName={fileName} />}
          {dropError && <ErrorAlert>{dropError}</ErrorAlert>}
        </div>
      </section>
      {children}
      {compact && dragging && (
        // Over the whole library while a file is dragged across it; never in the drop's way.
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-2 flex items-start justify-center rounded-card border-2 border-dashed border-brand bg-canvas/85 pt-24 text-lg font-semibold text-ink"
        >
          <span className="flex items-center gap-2">
            <Icon name="upload" />
            Drop the file to upload it
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The file picker: a label styled as the primary button over a visually
 * hidden file input (the label shows the input's focus ring). Its name is
 * "Upload a Guitar Pro file" either way; compact, it reads "Upload".
 */
function FilePicker({
  compact,
  disabled,
  onPick,
}: {
  compact: boolean;
  disabled: boolean;
  onPick: (file: File) => void;
}) {
  return (
    <label
      // Compact once there are songs (Unit 14): a quiet action, the songs being what the page is for.
      className={`${compact ? `${ghostButtonClass} -ml-4 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50` : `${primaryButtonClass} ${primaryLabelOffClass}`} shrink-0 cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus`}
    >
      <Icon name="upload" />
      {compact ? (
        <>
          Upload<span className="sr-only"> a Guitar Pro file</span>
        </>
      ) : (
        'Upload a Guitar Pro file'
      )}
      <input
        type="file"
        {...UPLOAD_PICKER_ATTRIBUTES}
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so picking the same file again still fires a change.
          event.target.value = '';
          if (file) onPick(file);
        }}
      />
    </label>
  );
}

/**
 * A file dropped just outside the zone would otherwise replace the app with
 * the browser's view of that file.
 */
/** Whether a drag holds files. The files themselves can only be read on the drop. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function useIgnoreStrayFileDrops() {
  useEffect(() => {
    const ignore = (event: Event) => event.preventDefault();
    window.addEventListener('dragover', ignore);
    window.addEventListener('drop', ignore);
    return () => {
      window.removeEventListener('dragover', ignore);
      window.removeEventListener('drop', ignore);
    };
  }, []);
}

function UploadProgress({
  step,
  fileName,
  onCancel,
}: {
  step: UploadStep;
  fileName: string | undefined;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p role="status" className="text-ink-soft">
        {STEP_LABELS[step]} {fileName}…
      </p>
      {/* The insert can't be cancelled safely, so the button goes once it starts. */}
      {step !== 'saving' && (
        <button type="button" className={buttonClass} onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}

function UploadOutcome({ result }: { result: UploadResult }) {
  const { song } = result;
  if (result.kind === 'duplicate') {
    return (
      <div role="status" className="flex flex-col items-start gap-1">
        <p className="text-warning">
          You've already uploaded this file as “{song.title}”. Nothing new was added.
        </p>
        <Link to={songPath(song.id)} className={linkClass}>
          Open “{song.title}”
        </Link>
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-col items-start gap-1">
      <p className="text-ink">Added “{song.title}”.</p>
      {song.drum_track_index === null && <p className="text-warning">{NO_DRUM_TRACK_NOTE}</p>}
      <Link to={songPath(song.id)} className={linkClass}>
        Open “{song.title}”
      </Link>
    </div>
  );
}

function UploadFailure({ error, fileName }: { error: Error; fileName: string | undefined }) {
  if (error.name === 'AbortError') {
    return (
      <p role="status" className="text-ink-soft">
        Upload cancelled. Nothing was saved.
      </p>
    );
  }
  const name = fileName ?? 'that file';
  return (
    <ErrorAlert>
      {error instanceof SongFileError
        ? `Couldn't add ${name}. ${error.message}`
        : `Couldn't upload ${name}. ${failureCopy(error)}`}
    </ErrorAlert>
  );
}
