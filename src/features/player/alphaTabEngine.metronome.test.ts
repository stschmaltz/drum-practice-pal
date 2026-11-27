// @vitest-environment node
/**
 * The metronome's notes (writeMetronome) through alphaTab's own synth and the
 * app's soundfont, rendered offline with alphaTab's audio exporter: the same
 * MIDI sequencer and TinySoundFont the player's worker runs. Nobody can hear a
 * unit test, so this is what says the clicks sound, on the beat, in the
 * chosen sound, and that beat one is louder.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as alphaTab from '@coderline/alphatab';
import { writeMetronome } from './alphaTabEngine';
import {
  DEFAULT_METRONOME_VOICE,
  PERCUSSION_CHANNEL,
  type MetronomeVoice,
} from './metronomeSounds';
import { loadScoreFile } from '../../../tests/unit/score-helpers';

// Node, not jsdom, and 44.1 kHz: under jsdom alphaTab's exporter renders NaN.
const SAMPLE_RATE = 44100;
const SOUNDFONT = new Uint8Array(
  readFileSync(join(process.cwd(), 'node_modules/@coderline/alphatab/dist/soundfont/sonivox.sf2')),
);
/** groove-120.gp: 4/4 at 120 BPM, so a beat every half second. */
const BEAT_SECONDS = 0.5;
const SONG_CHANNELS = 16;

function songMidi(fixture: string): alphaTab.midi.MidiFile {
  const score = loadScoreFile(join(process.cwd(), 'tests/fixtures/gp', fixture));
  const file = new alphaTab.midi.MidiFile();
  const handler = new alphaTab.midi.AlphaSynthMidiFileHandler(file);
  new alphaTab.midi.MidiFileGenerator(score, new alphaTab.Settings(), handler).generate();
  return file;
}

/** A synth to export with; it never plays, so its output does nothing. */
function exportingSynth(): alphaTab.synth.AlphaSynth {
  const event = { on: () => {}, off: () => {} };
  const output = {
    sampleRate: SAMPLE_RATE,
    open: () => {},
    play: () => {},
    destroy: () => {},
    pause: () => {},
    addSamples: () => {},
    resetSamples: () => {},
    activate: () => {},
    ready: event,
    samplesPlayed: event,
    sampleRequest: event,
    enumerateOutputDevices: () => Promise.resolve([]),
    setOutputDevice: () => Promise.resolve(),
    getOutputDevice: () => Promise.resolve(null),
  } as unknown as alphaTab.synth.ISynthOutput;
  return new alphaTab.synth.AlphaSynth(output, 500);
}

/**
 * Mono samples of the first `seconds`, with every song channel silent: only
 * the metronome (`ownChannel`) or nothing is heard.
 */
function render(file: alphaTab.midi.MidiFile, seconds: number, ownChannel: number | null) {
  const options = new alphaTab.synth.AudioExportOptions();
  options.soundFonts = [SOUNDFONT];
  options.sampleRate = SAMPLE_RATE;
  // alphaTab's own tick stays off, as in the app.
  options.metronomeVolume = 0;
  for (let channel = 0; channel < SONG_CHANNELS; channel++) {
    options.trackVolume.set(channel, channel === ownChannel ? 1 : 0);
  }
  const exporter = exportingSynth().exportAudio(options, file, [], new Map());
  const stereo: number[] = [];
  while (stereo.length < seconds * SAMPLE_RATE * 2) {
    const chunk = exporter.render(250);
    if (!chunk) break;
    stereo.push(...chunk.samples);
  }
  const mono: number[] = [];
  for (let i = 0; i + 1 < stereo.length; i += 2)
    mono.push(((stereo[i] ?? 0) + (stereo[i + 1] ?? 0)) / 2);
  return mono;
}

/** Loudest sample between two times. */
function peak(samples: number[], fromSeconds: number, toSeconds: number): number {
  let max = 0;
  const end = Math.min(samples.length, Math.round(toSeconds * SAMPLE_RATE));
  for (let i = Math.max(0, Math.round(fromSeconds * SAMPLE_RATE)); i < end; i++) {
    max = Math.max(max, Math.abs(samples[i] ?? 0));
  }
  return max;
}

function metronomeAudio(voice: MetronomeVoice, seconds = 2) {
  const file = songMidi('groove-120.gp');
  const channel = writeMetronome(file, voice);
  expect(channel).not.toBeNull();
  return render(file, seconds, channel);
}

const ATTACK = 0.06;

describe('the metronome through alphaTab’s synth', () => {
  it('is silent with every song channel at zero and no notes of ours (the control)', () => {
    const silent = render(songMidi('groove-120.gp'), 2, null);
    expect(peak(silent, 0, 2)).toBeLessThan(1e-4);
  });

  it.each([
    'click',
    'side_stick',
    'hi_hat',
    'cowbell',
    'claves',
    'woodblock_high',
    'woodblock_low',
  ] as const)('sounds %s on every beat and is quiet just before each one', (sound) => {
    const audio = metronomeAudio({ ...DEFAULT_METRONOME_VOICE, sound, accentSound: sound });
    for (let beat = 0; beat < 4; beat++) {
      const onset = beat * BEAT_SECONDS;
      const hit = peak(audio, onset, onset + ATTACK);
      expect(hit, `beat ${beat + 1}`).toBeGreaterThan(0.01);
      if (beat > 0) {
        const before = peak(audio, onset - 0.05, onset - 0.005);
        expect(before, `just before beat ${beat + 1}`).toBeLessThan(hit / 3);
      }
    }
  });

  it('plays beat one louder with the accent on, and like the others with it off', () => {
    const accented = metronomeAudio({
      ...DEFAULT_METRONOME_VOICE,
      sound: 'claves',
      accentSound: 'claves',
    });
    const even = metronomeAudio({
      ...DEFAULT_METRONOME_VOICE,
      sound: 'claves',
      accent: false,
      accentSound: 'claves',
    });
    const beatOne = (audio: number[]) => peak(audio, 0, ATTACK);
    const beatTwo = (audio: number[]) => peak(audio, BEAT_SECONDS, BEAT_SECONDS + ATTACK);
    // Even unaccented, the first note of a render comes out a little louder (about 13%).
    const evenRatio = beatOne(even) / beatTwo(even);
    expect(evenRatio).toBeLessThan(1.2);
    expect(beatOne(accented) / beatTwo(accented)).toBeGreaterThan(evenRatio * 1.2);
  });

  it('plays different sounds for different choices', () => {
    const cowbell = metronomeAudio({ ...DEFAULT_METRONOME_VOICE, sound: 'cowbell' }, 1);
    const hiHat = metronomeAudio({ ...DEFAULT_METRONOME_VOICE, sound: 'hi_hat' }, 1);
    const at = (audio: number[]) =>
      audio.slice(
        Math.round(BEAT_SECONDS * SAMPLE_RATE),
        Math.round((BEAT_SECONDS + ATTACK) * SAMPLE_RATE),
      );
    expect(at(cowbell)).not.toEqual(at(hiHat));
  });

  it('adds the subdivisions between the beats', () => {
    const audio = metronomeAudio({
      ...DEFAULT_METRONOME_VOICE,
      sound: 'woodblock_high',
      subdivision: 2,
    });
    const offbeat = BEAT_SECONDS / 2;
    expect(peak(audio, offbeat, offbeat + ATTACK)).toBeGreaterThan(0.005);
    const beatsOnly = metronomeAudio({ ...DEFAULT_METRONOME_VOICE, sound: 'woodblock_high' });
    expect(peak(beatsOnly, offbeat, offbeat + ATTACK)).toBeLessThan(
      peak(audio, offbeat, offbeat + ATTACK) / 3,
    );
  });

  it('plays the drum kit on its own channel, as the drum channel would', () => {
    // A song with no drum track, so the drum channel carries nothing else.
    const ours = songMidi('no-drums.gp');
    const channel = writeMetronome(ours, { ...DEFAULT_METRONOME_VOICE, sound: 'cowbell' });
    const onDrumChannel = songMidi('no-drums.gp');
    const drumChannel = writeMetronome(onDrumChannel, {
      ...DEFAULT_METRONOME_VOICE,
      sound: 'cowbell',
    });
    for (const event of onDrumChannel.tracks.flatMap((track) => track.events)) {
      const note = event as { channel?: number };
      if (
        (event instanceof alphaTab.midi.NoteOnEvent ||
          event instanceof alphaTab.midi.NoteOffEvent) &&
        note.channel === drumChannel
      ) {
        note.channel = PERCUSSION_CHANNEL;
      }
    }
    // What a drum track would send first: the drum channel's kit.
    onDrumChannel.tracks[0]?.events.unshift(
      new alphaTab.midi.ProgramChangeEvent(0, 0, PERCUSSION_CHANNEL, 0),
    );
    const window = (audio: number[]) =>
      audio.slice(
        Math.round(BEAT_SECONDS * SAMPLE_RATE),
        Math.round((BEAT_SECONDS + ATTACK) * SAMPLE_RATE),
      );
    const a = window(render(ours, 1, channel));
    const b = window(render(onDrumChannel, 1, PERCUSSION_CHANNEL));
    expect(Math.max(...a.map(Math.abs))).toBeGreaterThan(0.01);
    const difference = Math.max(...a.map((sample, i) => Math.abs(sample - (b[i] ?? 0))));
    expect(difference).toBeLessThan(0.01);
  });

  it('is silent with its channel at volume 0, as the metronome off sets it', () => {
    const file = songMidi('groove-120.gp');
    writeMetronome(file, { ...DEFAULT_METRONOME_VOICE, sound: 'cowbell' });
    expect(peak(render(file, 2, null), 0, 2)).toBeLessThan(1e-4);
  });

  it('leaves no metronome event of alphaTab’s in the file', () => {
    const file = songMidi('groove-120.gp');
    writeMetronome(file, DEFAULT_METRONOME_VOICE);
    const events = file.tracks.flatMap((track) => track.events);
    expect(events.some((event) => event instanceof alphaTab.midi.AlphaTabMetronomeEvent)).toBe(
      false,
    );
  });
});
