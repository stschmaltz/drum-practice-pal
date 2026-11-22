import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { clampSpeedRatio } from './barRange';
import { SPIKE_FIXTURES } from './fixtures';
import { layoutForWidth, type LayoutChoice } from './layout';
import { DEFAULT_SOUND_FONT_URL, isLocalSoundFontPath, SOUND_FONTS } from './soundfonts';
import {
  SpikePlayer,
  type CountInExperiment,
  type SpikeLogEntry,
  type SpikeOptions,
} from './spikePlayer';

type LayoutSetting = 'auto' | LayoutChoice;

const noopSubscribe = () => () => {};
const EMPTY_LOG: readonly SpikeLogEntry[] = [];

function useViewportWidth(): number {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return width;
}

export function SpikePage() {
  const scoreRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [player, setPlayer] = useState<SpikePlayer | null>(null);
  const width = useViewportWidth();

  const [fixtureUrl, setFixtureUrl] = useState<string>(SPIKE_FIXTURES[0].url);
  const [soundFontUrl, setSoundFontUrl] = useState(DEFAULT_SOUND_FONT_URL);
  const [customSoundFont, setCustomSoundFont] = useState('');
  const [layoutSetting, setLayoutSetting] = useState<LayoutSetting>('auto');
  const [audioSessionPlayback, setAudioSessionPlayback] = useState(false);
  const [options, setOptions] = useState<Omit<SpikeOptions, 'layout'>>({
    renderAllTracks: false,
    loop: false,
    startBarNumber: 5,
    endBarNumber: 8,
    speedRatio: 1,
    metronomeOn: false,
    metronomeVolume: 1,
    drumsMuted: false,
    builtInCountIn: false,
    countInExperiment: 'off',
    countInBars: 1,
  });
  const layout: LayoutChoice = layoutSetting === 'auto' ? layoutForWidth(width) : layoutSetting;
  const fullOptions: SpikeOptions = { ...options, layout };
  const optionsRef = useRef(fullOptions);
  optionsRef.current = fullOptions;

  useEffect(() => {
    if (!scoreRef.current || !scrollRef.current) return;
    const created = new SpikePlayer(scoreRef.current, scrollRef.current, optionsRef.current);
    setPlayer(created);
    void created.loadSoundFont(DEFAULT_SOUND_FONT_URL);
    return () => {
      created.dispose();
      setPlayer(null);
    };
  }, []);

  useEffect(() => {
    if (player) void player.loadScore(fixtureUrl);
  }, [player, fixtureUrl]);

  useEffect(() => {
    player?.setOptions(fullOptions);
    // fullOptions is rebuilt every render; its parts are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, options, layout]);

  const snapshot = useSyncExternalStore(
    player ? (cb) => player.subscribe(cb) : noopSubscribe,
    () => player?.getSnapshot() ?? null,
  );
  const log = useSyncExternalStore(
    player ? (cb) => player.subscribe(cb) : noopSubscribe,
    () => player?.getLog() ?? EMPTY_LOG,
  );

  const set = <K extends keyof typeof options>(key: K, value: (typeof options)[K]) =>
    setOptions((prev) => ({ ...prev, [key]: value }));

  const onPlay = () => {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (audioSessionPlayback && session) session.type = 'playback';
    player?.playPause();
  };

  const onFile = async (file: File | undefined) => {
    if (file && player) await player.loadScore(await file.arrayBuffer());
  };

  const loadSoundFont = (url: string) => {
    if (!isLocalSoundFontPath(url)) return;
    setSoundFontUrl(url);
    void player?.loadSoundFont(url);
  };

  const barCount = snapshot?.barCount ?? 0;
  const bpm =
    snapshot?.currentTempo == null ? null : Math.round(snapshot.currentTempo * options.speedRatio);
  const heapMb = player?.readMainHeapMb() ?? null;
  const hasAudioSession = 'audioSession' in navigator;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">alphaTab spike</h1>
        <p className="text-sm text-neutral-400" data-testid="now-playing">
          {snapshot?.scoreTitle ?? 'Loading…'} · bar {snapshot?.currentBarNumber ?? '-'} of{' '}
          {barCount} · {Math.round(options.speedRatio * 100)}% · {bpm ?? '-'} BPM
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Controls">
        <Group title="Song">
          <select
            aria-label="Fixture"
            className={inputClass}
            value={fixtureUrl}
            onChange={(e) => setFixtureUrl(e.target.value)}
          >
            {SPIKE_FIXTURES.map((f) => (
              <option key={f.url} value={f.url}>
                {f.label}
              </option>
            ))}
          </select>
          <label className="text-sm">
            Or a local Guitar Pro file{' '}
            <input
              type="file"
              accept=".gp,.gpx,.gp3,.gp4,.gp5"
              className="block w-full text-sm"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </label>
        </Group>

        <Group title="Transport">
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={onPlay}
              disabled={!snapshot?.ready}
            >
              {snapshot?.countingIn ? 'Cancel count-in' : snapshot?.playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className={buttonClass} onClick={() => player?.stop()}>
              Stop
            </button>
          </div>
          <label className="flex items-center gap-2 text-sm">
            Speed {Math.round(options.speedRatio * 100)}%
            <input
              aria-label="Speed"
              type="range"
              min={25}
              max={200}
              step={5}
              value={Math.round(options.speedRatio * 100)}
              onChange={(e) => set('speedRatio', clampSpeedRatio(Number(e.target.value) / 100))}
              className="flex-1"
            />
          </label>
        </Group>

        <Group title="Loop">
          <Check label="Loop bars" checked={options.loop} onChange={(v) => set('loop', v)} />
          <div className="flex items-center gap-2 text-sm">
            <NumberInput
              label="Start bar"
              value={options.startBarNumber}
              min={1}
              max={Math.max(1, barCount)}
              // Push the end bar along so the range never reverses (a reversed range disables the loop).
              onChange={(v) =>
                setOptions((prev) => ({
                  ...prev,
                  startBarNumber: v,
                  endBarNumber: Math.max(prev.endBarNumber, v),
                }))
              }
            />
            to
            <NumberInput
              label="End bar"
              value={options.endBarNumber}
              min={options.startBarNumber}
              max={Math.max(1, barCount)}
              onChange={(v) => set('endBarNumber', v)}
            />
          </div>
        </Group>

        <Group title="Mix">
          <Check
            label="Metronome"
            checked={options.metronomeOn}
            onChange={(v) => set('metronomeOn', v)}
          />
          <label className="flex items-center gap-2 text-sm">
            Volume
            <input
              aria-label="Metronome volume"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={options.metronomeVolume}
              onChange={(e) => set('metronomeVolume', Number(e.target.value))}
              className="flex-1"
            />
          </label>
          <Check
            label={`Mute drums${snapshot?.drumTrackIndex === null ? ' (no drum track)' : ''}`}
            checked={options.drumsMuted}
            onChange={(v) => set('drumsMuted', v)}
          />
        </Group>

        <Group title="Count-in experiments">
          <Check
            label="alphaTab built-in count-in (start only)"
            checked={options.builtInCountIn}
            onChange={(v) => set('builtInCountIn', v)}
          />
          <select
            aria-label="Count-in before every repeat"
            className={inputClass}
            value={options.countInExperiment}
            onChange={(e) => set('countInExperiment', e.target.value as CountInExperiment)}
          >
            <option value="off">Every repeat: off</option>
            <option value="pause-on-wrap">Every repeat: pause on wrap</option>
            <option value="stop-on-finish">Every repeat: stop on finish</option>
          </select>
          <NumberInput
            label="Count-in bars"
            value={options.countInBars}
            min={1}
            max={2}
            onChange={(v) => set('countInBars', v)}
          />
        </Group>

        <Group title="Display and audio">
          <select
            aria-label="Layout"
            className={inputClass}
            value={layoutSetting}
            onChange={(e) => setLayoutSetting(e.target.value as LayoutSetting)}
          >
            <option value="auto">
              Layout: auto ({layoutForWidth(width)} at {width}px)
            </option>
            <option value="page">Layout: page</option>
            <option value="horizontal">Layout: horizontal</option>
          </select>
          <Check
            label="Render all tracks"
            checked={options.renderAllTracks}
            onChange={(v) => set('renderAllTracks', v)}
          />
          <select
            aria-label="Soundfont"
            className={inputClass}
            value={soundFontUrl}
            onChange={(e) => loadSoundFont(e.target.value)}
          >
            {SOUND_FONTS.map((sf) => (
              <option key={sf.url} value={sf.url}>
                {sf.label}
                {sf.shipped ? '' : ' (add file first)'}
              </option>
            ))}
            {!SOUND_FONTS.some((sf) => sf.url === soundFontUrl) && (
              <option value={soundFontUrl}>{soundFontUrl}</option>
            )}
          </select>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              loadSoundFont(customSoundFont.trim());
            }}
          >
            <input
              aria-label="Soundfont path"
              className={inputClass}
              placeholder="/sf-candidates/name.sf2"
              value={customSoundFont}
              onChange={(e) => setCustomSoundFont(e.target.value)}
            />
            <button
              type="submit"
              className={buttonClass}
              disabled={!isLocalSoundFontPath(customSoundFont.trim())}
            >
              Load
            </button>
          </form>
          <Check
            label={`iOS: audioSession "playback"${hasAudioSession ? '' : ' (unsupported here)'}`}
            checked={audioSessionPlayback}
            onChange={setAudioSessionPlayback}
          />
        </Group>
      </section>

      {snapshot?.countingIn && (
        <p className="text-center text-4xl font-bold" role="status">
          Counting in…
        </p>
      )}

      <div
        ref={scrollRef}
        data-testid="score-viewport"
        className={`relative max-h-[70dvh] rounded border border-neutral-700 bg-white ${
          layout === 'horizontal' ? 'overflow-x-auto overflow-y-hidden' : 'overflow-auto'
        }`}
      >
        <div ref={scoreRef} />
      </div>

      <section aria-label="Diagnostics" className="grid gap-3 text-sm lg:grid-cols-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded border border-neutral-700 p-3">
          <Stat name="Tracks" value={snapshot?.trackNames.join(', ') || '-'} />
          <Stat
            name="Metronome beat"
            value={`${snapshot?.currentBeat ?? '-'} (${snapshot?.metronomeEvents ?? 0} events)`}
          />
          <Stat name="Drum track index" value={String(snapshot?.drumTrackIndex ?? 'none')} />
          <Stat
            name="Score file"
            value={
              snapshot?.lastLoad
                ? `${kb(snapshot.lastLoad.bytes)}, parsed in ${snapshot.lastLoad.parseMs.toFixed(0)} ms`
                : '-'
            }
          />
          <Stat
            name="Render"
            value={snapshot?.lastRender ? `${snapshot.lastRender.ms.toFixed(0)} ms` : '-'}
          />
          <Stat
            name="Soundfont"
            value={
              snapshot?.soundFont
                ? `${snapshot.soundFont.url}: ${kb(snapshot.soundFont.bytes)}, fetch ${snapshot.soundFont.fetchMs.toFixed(0)} ms, load ${snapshot.soundFont.decodeMs === null ? '…' : `${snapshot.soundFont.decodeMs.toFixed(0)} ms`}`
                : '-'
            }
          />
          <Stat
            name="Audio context"
            value={
              snapshot?.audio
                ? `${snapshot.audio.state}, ${snapshot.audio.sampleRate} Hz, base ${ms(snapshot.audio.baseLatency)}, output ${ms(snapshot.audio.outputLatency)}`
                : '-'
            }
          />
          <Stat
            name="Start latency"
            value={
              snapshot?.lastStartLatency
                ? `state ${msVal(snapshot.lastStartLatency.stateMs)}, first position ${msVal(snapshot.lastStartLatency.positionMs)}`
                : '-'
            }
          />
          <Stat
            name="Loop wraps"
            value={
              snapshot?.wrapIntervals.length
                ? `${snapshot.wrapIntervals.map((v) => v.toFixed(0)).join(', ')} ms (expected ${msVal(snapshot.expectedLoopMs)})`
                : snapshot?.expectedLoopMs
                  ? `expected ${msVal(snapshot.expectedLoopMs)}`
                  : '-'
            }
          />
          <Stat
            name="Main JS heap"
            value={heapMb === null ? 'n/a in this browser' : `${heapMb.toFixed(1)} MB`}
          />
          <Stat name="User agent" value={navigator.userAgent} />
        </dl>
        <ol
          aria-label="Event log"
          className="max-h-72 overflow-auto rounded border border-neutral-700 p-3 font-mono text-xs"
        >
          {[...log].reverse().map((entry, i) => (
            <li key={`${entry.at}-${i}`}>
              {(entry.at / 1000).toFixed(2)}s {entry.message}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

const inputClass = 'w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-2 text-sm';
const buttonClass =
  'min-h-11 rounded bg-neutral-100 px-4 font-medium text-neutral-900 disabled:opacity-40';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2 rounded border border-neutral-700 p-3">
      <legend className="px-1 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-5"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function NumberInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      {label}
      <input
        type="number"
        className={`${inputClass} w-20`}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const next = Math.round(Number(e.target.value));
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </label>
  );
}

function Stat({ name, value }: { name: string; value: string }) {
  return (
    <>
      <dt className="text-neutral-400">{name}</dt>
      <dd className="break-all">{value}</dd>
    </>
  );
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

function ms(seconds: number | null): string {
  return seconds === null ? 'n/a' : `${(seconds * 1000).toFixed(1)} ms`;
}

function msVal(value: number | null): string {
  return value === null ? '…' : `${value.toFixed(0)} ms`;
}
