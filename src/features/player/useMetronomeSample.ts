import { useCallback, useEffect, useRef, useState } from 'react';
import { preferPlaybackAudioSession } from './audioSession';
import type { MetronomeVoice } from './metronomeSounds';
import { PLAYER_SOUND_FONT_URLS } from './soundFont';

export type SampleState = 'idle' | 'loading' | 'playing' | 'failed';

/** Renders a voice to interleaved stereo samples; alphaTab's offline synth in the app, a fake in tests. */
export type SampleRenderer = (voice: MetronomeVoice, sampleRate: number) => Promise<Float32Array>;

/** The player's soundfonts, fetched once per page (the service worker has them offline). */
let soundFonts: Promise<Uint8Array[]> | null = null;

const renderWithAlphaTab: SampleRenderer = async (voice, sampleRate) => {
  // Loaded only when a sample is asked for, so alphaTab stays out of the Settings page's bundle.
  const engine = await import('./alphaTabEngine');
  soundFonts ??= engine
    .fetchSoundFonts(PLAYER_SOUND_FONT_URLS, new AbortController().signal)
    .catch((error: unknown) => {
      soundFonts = null;
      throw error;
    });
  return engine.renderMetronomeSample(voice, await soundFonts, sampleRate);
};

function createContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

/**
 * Plays a couple of bars of a metronome voice, for choosing one without
 * opening a song. `play` must be called from the tap: iOS only starts Web
 * Audio inside a gesture. A later `play` (another sound chosen) replaces the
 * one sounding; `setVolume` changes the level of the one loading or sounding.
 */
export function useMetronomeSample(render: SampleRenderer = renderWithAlphaTab) {
  const [state, setState] = useState<SampleState>('idle');
  const [error, setError] = useState<unknown>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  /** 0 to 1: the level the sample sounds at, now or once its render is in. */
  const volumeRef = useRef(1);
  /** Bumped by every play and stop, so a render that finishes late is dropped. */
  const runRef = useRef(0);

  const silence = useCallback(() => {
    const source = sourceRef.current;
    sourceRef.current = null;
    gainRef.current = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // Already ended.
    }
    source.disconnect();
  }, []);

  const stop = useCallback(() => {
    runRef.current++;
    silence();
    setState('idle');
  }, [silence]);

  const play = useCallback(
    (voice: MetronomeVoice, volume: number) => {
      const run = ++runRef.current;
      silence();
      volumeRef.current = volume;
      // Before the context starts: with the ringer on silent, iOS mutes any other session.
      preferPlaybackAudioSession();
      contextRef.current ??= createContext();
      const context = contextRef.current;
      if (!context) {
        setError(new Error('No Web Audio'));
        setState('failed');
        return;
      }
      // Asked for inside the tap, as iOS needs; awaited with the render, so a
      // refusal is reported rather than "playing" with no sound.
      const resumed = context.state === 'running' ? Promise.resolve() : context.resume();
      setError(null);
      setState('loading');
      Promise.all([render(voice, context.sampleRate), resumed]).then(
        ([stereo]) => {
          if (run !== runRef.current) return;
          const frames = Math.floor(stereo.length / 2);
          const buffer = context.createBuffer(2, Math.max(1, frames), context.sampleRate);
          const left = buffer.getChannelData(0);
          const right = buffer.getChannelData(1);
          for (let frame = 0; frame < frames; frame++) {
            left[frame] = stereo[frame * 2] ?? 0;
            right[frame] = stereo[frame * 2 + 1] ?? 0;
          }
          const source = context.createBufferSource();
          const gain = context.createGain();
          source.buffer = buffer;
          gain.gain.value = volumeRef.current;
          source.connect(gain).connect(context.destination);
          source.onended = () => {
            if (sourceRef.current !== source) return;
            sourceRef.current = null;
            setState('idle');
          };
          sourceRef.current = source;
          gainRef.current = gain;
          source.start();
          setState('playing');
        },
        (failure: unknown) => {
          if (run !== runRef.current) return;
          setError(failure);
          setState('failed');
        },
      );
    },
    [render, silence],
  );

  const setVolume = useCallback((volume: number) => {
    volumeRef.current = volume;
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, []);

  useEffect(
    () => () => {
      runRef.current++;
      silence();
      const context = contextRef.current;
      contextRef.current = null;
      if (context && context.state !== 'closed') context.close().catch(() => {});
    },
    [silence],
  );

  return { state, error, play, stop, setVolume };
}
