// @vitest-environment node
/**
 * The cymbals' own channel (liftCymbals) through alphaTab's synth and the
 * app's two soundfonts, rendered offline as alphaTabEngine.metronome.test.ts
 * does: nobody can hear a unit test, so this is what says a crash comes out
 * as loud as the snare, still rings like a crash, and that the rest of the
 * kit stays where it was. Run it after an alphaTab or drum kit change.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as alphaTab from '@coderline/alphatab';
import { CYMBAL_GAIN, CYMBAL_KEYS, liftCymbals } from './alphaTabEngine';
import { PERCUSSION_CHANNEL } from './metronomeSounds';
import { DRUM_TRACK_GAIN } from './PlayerService';
import { loadScoreFile } from '../../../tests/unit/score-helpers';

// Node, not jsdom, and 44.1 kHz: under jsdom alphaTab's exporter renders NaN.
const SAMPLE_RATE = 44100;
const read = (path: string) => new Uint8Array(readFileSync(join(process.cwd(), path)));
// The player's two fonts, in its order (PLAYER_SOUND_FONT_URLS).
const SOUND_FONTS = [
  read('node_modules/@coderline/alphatab/dist/soundfont/sonivox.sf2'),
  read('public/drumkit/drums.sf3'),
];
const SNARE = 38;
const CRASH = 57;
const SIDE_STICK = 37;

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

/** The groove fixture's MIDI (tempo, programs, end of track) with its notes swapped for one drum hit. */
function oneHit(key: number): alphaTab.midi.MidiFile {
  const { midi } = alphaTab;
  const score = loadScoreFile(join(process.cwd(), 'tests/fixtures/gp/groove-120.gp'));
  const file = new midi.MidiFile();
  new midi.MidiFileGenerator(
    score,
    new alphaTab.Settings(),
    new midi.AlphaSynthMidiFileHandler(file),
  ).generate();
  const track = file.tracks[0];
  if (!track) throw new Error('the fixture has no MIDI track');
  const kept = track.events.filter(
    (event) => !(event instanceof midi.NoteOnEvent) && !(event instanceof midi.NoteOffEvent),
  );
  track.events.splice(0, track.events.length, ...kept);
  track.addEvent(new midi.NoteOnEvent(0, 0, PERCUSSION_CHANNEL, key, 110));
  track.addEvent(new midi.NoteOffEvent(0, 960 * 4, PERCUSSION_CHANNEL, key, 0));
  return file;
}

/** Root mean square of a rendered hit over its first tenth of a second, and from 0.8 s to 1.5 s. */
function levels(file: alphaTab.midi.MidiFile, channelVolumes: Map<number, number>) {
  const options = new alphaTab.synth.AudioExportOptions();
  options.soundFonts = SOUND_FONTS;
  options.sampleRate = SAMPLE_RATE;
  options.metronomeVolume = 0;
  for (const [channel, volume] of channelVolumes) options.trackVolume.set(channel, volume);
  const exporter = exportingSynth().exportAudio(options, file, [], new Map());
  const mono: number[] = [];
  while (mono.length < 2 * SAMPLE_RATE) {
    const chunk = exporter.render(250);
    if (!chunk) break;
    for (let i = 0; i + 1 < chunk.samples.length; i += 2)
      mono.push(((chunk.samples[i] ?? 0) + (chunk.samples[i + 1] ?? 0)) / 2);
  }
  const rms = (fromSeconds: number, toSeconds: number) => {
    let sum = 0;
    let count = 0;
    const end = Math.min(mono.length, Math.round(toSeconds * SAMPLE_RATE));
    for (let i = Math.round(fromSeconds * SAMPLE_RATE); i < end; i++) {
      sum += (mono[i] ?? 0) ** 2;
      count++;
    }
    return count ? Math.sqrt(sum / count) : 0;
  };
  return { attack: rms(0, 0.1), tail: rms(0.8, 1.5) };
}

/** A hit as the player sounds it: the drum boost, and the cymbals' channel over it. */
function asPlayed(key: number, { lifted }: { lifted: boolean }) {
  const file = oneHit(key);
  const volumes = new Map([[PERCUSSION_CHANNEL, DRUM_TRACK_GAIN]]);
  if (lifted) {
    const channel = liftCymbals(file);
    if (channel !== null) volumes.set(channel, DRUM_TRACK_GAIN * CYMBAL_GAIN);
  }
  return levels(file, volumes);
}

describe('the cymbals through alphaTab’s synth and the app’s kit', () => {
  it('a crash on the drum channel alone is lost under the snare (why they are lifted)', () => {
    const crash = asPlayed(CRASH, { lifted: false });
    const snare = asPlayed(SNARE, { lifted: false });
    expect(crash.attack).toBeGreaterThan(0);
    expect(crash.attack).toBeLessThan(snare.attack / 4);
  });

  it('lifted, a crash hits about as hard as the snare and still rings on', () => {
    const crash = asPlayed(CRASH, { lifted: true });
    const snare = asPlayed(SNARE, { lifted: true });
    expect(crash.attack).toBeGreaterThan(snare.attack / 2);
    expect(crash.attack).toBeLessThan(snare.attack * 2);
    // A crash, not a click: a second on it is still sounding, where a side stick is long gone.
    expect(crash.tail).toBeGreaterThan(asPlayed(SIDE_STICK, { lifted: true }).tail * 20);
    expect(crash.tail).toBeGreaterThan(crash.attack / 20);
  });

  it('leaves the rest of the kit on the drum channel, at the level it had', () => {
    const file = oneHit(SNARE);
    expect(liftCymbals(file)).toBeNull();
    expect(asPlayed(SNARE, { lifted: true })).toEqual(asPlayed(SNARE, { lifted: false }));
  });

  it('moves every cymbal note, and only those, to a channel no track uses', () => {
    const { midi } = alphaTab;
    const file = oneHit(CRASH);
    const track = file.tracks[0];
    track?.addEvent(new midi.NoteOnEvent(0, 960, PERCUSSION_CHANNEL, SNARE, 100));
    const usedBefore = new Set(
      file.tracks.flatMap((each) =>
        each.events.flatMap((event) =>
          'channel' in event && typeof event.channel === 'number' ? [event.channel] : [],
        ),
      ),
    );
    const channel = liftCymbals(file);
    expect(channel).not.toBeNull();
    expect(usedBefore.has(channel ?? -1)).toBe(false);
    expect(channel).not.toBe(PERCUSSION_CHANNEL);

    const sounding = (file.tracks[0]?.events ?? []).filter(
      (event): event is alphaTab.midi.NoteOnEvent =>
        event instanceof midi.NoteOnEvent && event.noteVelocity > 0,
    );
    for (const note of sounding) {
      expect(note.channel).toBe(CYMBAL_KEYS.has(note.noteKey) ? channel : PERCUSSION_CHANNEL);
    }
    expect(sounding.map((note) => note.noteKey).sort()).toEqual([SNARE, CRASH]);
  });
});
