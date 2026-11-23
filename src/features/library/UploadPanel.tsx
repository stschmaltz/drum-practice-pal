import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Link } from 'react-router';
import { ErrorAlert } from '@/components/ErrorAlert';
import { buttonClass, primaryButtonClass } from '@/components/styles';
import { GUITAR_PRO_EXTENSIONS } from './songFile';
import { SongFileError, type UploadResult, type UploadStep } from './songsApi';
import { useUploadSong } from './useSongs';

const STEP_LABELS: Record<UploadStep, string> = {
  reading: 'Reading',
  checking: 'Checking',
  uploading: 'Uploading',
  saving: 'Saving',
};

export const NO_DRUM_TRACK_NOTE =
  'No drum track found in this file. It will play the other parts and the metronome, with nothing to mute or read along with.';

/**
 * Picker and drop zone for one Guitar Pro file at a time. The picker has no
 * `accept` filter: iOS greys out extensions it has no type for, such as .gp,
 * so the file's content is checked instead (songFile.ts). Leaving the page
 * doesn't cancel: the upload finishes and the song shows up in the list.
 */
export function UploadPanel() {
  const upload = useUploadSong();
  const [step, setStep] = useState<UploadStep>('reading');
  const [dragging, setDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  // A file dropped just outside the zone would otherwise replace the app with
  // the browser's view of that file.
  useEffect(() => {
    const ignore = (event: Event) => event.preventDefault();
    window.addEventListener('dragover', ignore);
    window.addEventListener('drop', ignore);
    return () => {
      window.removeEventListener('dragover', ignore);
      window.removeEventListener('drop', ignore);
    };
  }, []);

  const start = (file: File) => {
    setDropError(null);
    controller.current = new AbortController();
    setStep('reading');
    upload.mutate({ file, signal: controller.current.signal, onStep: setStep });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    if (upload.isPending) return;
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
    if (!upload.isPending) setDragging(true);
  };

  const fileName = upload.variables?.file.name;

  return (
    <section aria-labelledby="upload-heading" className="flex flex-col gap-3">
      <h2 id="upload-heading" className="sr-only">
        Add a song
      </h2>
      <div
        data-testid="drop-zone"
        onDragOver={onDragOver}
        onDragLeave={(event) => {
          // Moving over the button or text inside the zone also fires dragleave.
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
        className={`flex flex-col items-start gap-3 rounded-lg border-2 border-dashed p-4 sm:flex-row sm:items-center ${
          dragging ? 'border-sky-500 bg-sky-950' : 'border-neutral-700'
        }`}
      >
        <label
          // The real input is visually hidden, so the label shows its focus ring.
          className={`${primaryButtonClass} inline-flex shrink-0 cursor-pointer items-center has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-400`}
        >
          Upload a Guitar Pro file
          <input
            type="file"
            className="sr-only"
            disabled={upload.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so picking the same file again still fires a change.
              event.target.value = '';
              if (file) start(file);
            }}
          />
        </label>
        <p className="text-sm text-neutral-400">
          or drop one here. {GUITAR_PRO_EXTENSIONS.join(', ')} files, such as Songsterr's Guitar Pro
          export.
        </p>
      </div>

      <div aria-live="polite" className="flex flex-col gap-2">
        {upload.isPending && (
          <div className="flex flex-wrap items-center gap-3">
            <p role="status" className="text-neutral-300">
              {STEP_LABELS[step]} {fileName}…
            </p>
            {/* The insert can't be cancelled safely, so the button goes once it starts. */}
            {step !== 'saving' && (
              <button
                type="button"
                className={buttonClass}
                onClick={() => controller.current?.abort()}
              >
                Cancel
              </button>
            )}
          </div>
        )}
        {upload.isSuccess && <UploadOutcome result={upload.data} />}
        {upload.isError && <UploadFailure error={upload.error} fileName={fileName} />}
        {dropError && <ErrorAlert>{dropError}</ErrorAlert>}
      </div>
    </section>
  );
}

function UploadOutcome({ result }: { result: UploadResult }) {
  const { song } = result;
  if (result.kind === 'duplicate') {
    return (
      <div role="status" className="flex flex-col items-start gap-1">
        <p className="text-amber-300">
          You've already uploaded this file as “{song.title}”. Nothing new was added.
        </p>
        <Link to={`/songs/${song.id}`} className="text-sky-400 underline">
          Open “{song.title}”
        </Link>
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-col items-start gap-1">
      <p className="text-neutral-200">Added “{song.title}”.</p>
      {song.drum_track_index === null && <p className="text-amber-300">{NO_DRUM_TRACK_NOTE}</p>}
      <Link to={`/songs/${song.id}`} className="text-sky-400 underline">
        Open “{song.title}”
      </Link>
    </div>
  );
}

function UploadFailure({ error, fileName }: { error: Error; fileName: string | undefined }) {
  if (error.name === 'AbortError') {
    return (
      <p role="status" className="text-neutral-300">
        Upload cancelled. Nothing was saved.
      </p>
    );
  }
  const name = fileName ?? 'that file';
  return (
    <ErrorAlert>
      {error instanceof SongFileError
        ? `Couldn't add ${name}. ${error.message}`
        : `Couldn't upload ${name}: ${error.message}`}
    </ErrorAlert>
  );
}
