import { METRONOME_SOUNDS } from '@/lib/schema';
import {
  ACCENT_VELOCITY,
  BEAT_VELOCITY,
  DEFAULT_METRONOME_VOICE,
  freeChannel,
  isSameVoice,
  METRONOME_MAX_GAIN,
  METRONOME_SOUND_KEYS,
  metronomeChannelGain,
  METRONOME_SOUND_LABELS,
  metronomeKeys,
  metronomeNotes,
  metronomeVoiceSummary,
  PERCUSSION_CHANNEL,
  SUBDIVISION_VELOCITY,
  type MetronomeBeat,
  type MetronomeVoice,
} from './metronomeSounds';

const QUARTER = 960;

/** One 4/4 bar's beats as alphaTab generates them, from `startTick`. */
function bar44(startTick = 0): MetronomeBeat[] {
  return [0, 1, 2, 3].map((counter) => ({
    tick: startTick + counter * QUARTER,
    counter,
    durationInTicks: QUARTER,
  }));
}

const voice = (overrides: Partial<MetronomeVoice> = {}): MetronomeVoice => ({
  ...DEFAULT_METRONOME_VOICE,
  ...overrides,
});

describe('metronome sounds', () => {
  it('has a key and a label for every sound the database allows', () => {
    for (const sound of METRONOME_SOUNDS) {
      expect(METRONOME_SOUND_KEYS[sound]).toBeGreaterThan(0);
      expect(METRONOME_SOUND_LABELS[sound]).toBeTruthy();
    }
  });

  it('keeps alphaTab’s own click (key 33) as the default sound', () => {
    expect(METRONOME_SOUND_KEYS[DEFAULT_METRONOME_VOICE.sound]).toBe(33);
  });
});

describe('metronomeNotes', () => {
  it('plays beat one louder in the accent sound, the other beats in the beat sound', () => {
    const notes = metronomeNotes(bar44(), voice({ sound: 'side_stick', accentSound: 'cowbell' }));
    expect(notes.map(({ tick, key, velocity }) => ({ tick, key, velocity }))).toEqual([
      { tick: 0, key: METRONOME_SOUND_KEYS.cowbell, velocity: ACCENT_VELOCITY },
      { tick: 960, key: METRONOME_SOUND_KEYS.side_stick, velocity: BEAT_VELOCITY },
      { tick: 1920, key: METRONOME_SOUND_KEYS.side_stick, velocity: BEAT_VELOCITY },
      { tick: 2880, key: METRONOME_SOUND_KEYS.side_stick, velocity: BEAT_VELOCITY },
    ]);
  });

  it('plays every beat alike with the accent off', () => {
    const notes = metronomeNotes(bar44(), voice({ accent: false, accentSound: 'cowbell' }));
    expect(new Set(notes.map((note) => note.key))).toEqual(new Set([METRONOME_SOUND_KEYS.click]));
    expect(new Set(notes.map((note) => note.velocity))).toEqual(new Set([BEAT_VELOCITY]));
  });

  it('splits each beat into evenly spaced, quieter clicks', () => {
    const notes = metronomeNotes(bar44().slice(0, 2), voice({ subdivision: 4 }));
    expect(notes.map((note) => note.tick)).toEqual([0, 240, 480, 720, 960, 1200, 1440, 1680]);
    expect(notes.map((note) => note.velocity)).toEqual([
      ACCENT_VELOCITY,
      SUBDIVISION_VELOCITY,
      SUBDIVISION_VELOCITY,
      SUBDIVISION_VELOCITY,
      BEAT_VELOCITY,
      SUBDIVISION_VELOCITY,
      SUBDIVISION_VELOCITY,
      SUBDIVISION_VELOCITY,
    ]);
  });

  it('accents the first beat of every bar, whatever the meter', () => {
    // 3/4 then 6/8 (alphaTab ticks each eighth of a 6/8 bar).
    const waltz = [0, 1, 2].map((counter) => ({
      tick: counter * QUARTER,
      counter,
      durationInTicks: QUARTER,
    }));
    const sixEight = [0, 1, 2, 3, 4, 5].map((counter) => ({
      tick: 3 * QUARTER + counter * 480,
      counter,
      durationInTicks: 480,
    }));
    const accented = metronomeNotes([...waltz, ...sixEight], voice())
      .filter((note) => note.velocity === ACCENT_VELOCITY)
      .map((note) => note.tick);
    expect(accented).toEqual([0, 2880]);
  });

  it('ends every note before the next click starts', () => {
    for (const subdivision of [1, 2, 4] as const) {
      const notes = metronomeNotes([...bar44(), ...bar44(4 * QUARTER)], voice({ subdivision }));
      for (const [index, note] of notes.entries()) {
        expect(note.offTick).toBeGreaterThan(note.tick);
        const next = notes[index + 1];
        if (next) expect(note.offTick).toBeLessThan(next.tick);
      }
    }
  });

  it('starts a bar with a pickup on the beat alphaTab gives', () => {
    // A 4/4 pickup bar of one beat: alphaTab's only click there is counter 3.
    const notes = metronomeNotes([{ tick: 0, counter: 3, durationInTicks: QUARTER }], voice());
    expect(notes).toEqual([
      expect.objectContaining({
        tick: 0,
        velocity: BEAT_VELOCITY,
        key: METRONOME_SOUND_KEYS.click,
      }),
    ]);
  });
});

describe('metronomeKeys', () => {
  it('lists each key once, and the accent’s only while it is on', () => {
    expect(metronomeKeys(voice({ sound: 'claves', accentSound: 'claves' }))).toEqual([75]);
    expect(metronomeKeys(voice({ sound: 'claves', accentSound: 'cowbell' }))).toEqual([75, 56]);
    expect(
      metronomeKeys(voice({ sound: 'claves', accent: false, accentSound: 'cowbell' })),
    ).toEqual([75]);
  });
});

describe('freeChannel', () => {
  it.each([
    [[], 0],
    [[0, 1], 2],
    [[0, 1, 4, 5], 6],
    [[2, 9], 10],
  ])('after %j is %i', (used, expected) => {
    expect(freeChannel(used)).toBe(expected);
  });

  it('skips the drum channel', () => {
    expect(freeChannel([0, 8])).toBe(PERCUSSION_CHANNEL + 1);
  });
});

describe('metronomeVoiceSummary', () => {
  it.each([
    [voice(), 'Click'],
    [voice({ accent: false, accentSound: 'cowbell' }), 'Click'],
    [voice({ accentSound: 'cowbell' }), 'Click, beat one Cowbell'],
    [voice({ sound: 'hi_hat', accentSound: 'hi_hat', subdivision: 2 }), 'Hi-hat, 2 per beat'],
  ])('%j reads %s', (input, expected) => {
    expect(metronomeVoiceSummary(input)).toBe(expected);
  });
});

describe('isSameVoice', () => {
  it('compares every field', () => {
    expect(isSameVoice(voice(), voice())).toBe(true);
    expect(isSameVoice(voice(), voice({ sound: 'hi_hat' }))).toBe(false);
    expect(isSameVoice(voice(), voice({ accent: false }))).toBe(false);
    expect(isSameVoice(voice(), voice({ accentSound: 'hi_hat' }))).toBe(false);
    expect(isSameVoice(voice(), voice({ subdivision: 2 }))).toBe(false);
  });
});

describe('metronomeChannelGain', () => {
  it("goes from silent to METRONOME_MAX_GAIN, louder than alphaTab's 1 at the top", () => {
    expect(metronomeChannelGain(0)).toBe(0);
    expect(metronomeChannelGain(1)).toBe(METRONOME_MAX_GAIN);
    expect(METRONOME_MAX_GAIN).toBeGreaterThan(1);
  });

  it('rises faster at the top than the bottom, and stays in range', () => {
    expect(metronomeChannelGain(0.5)).toBeCloseTo(METRONOME_MAX_GAIN / 4);
    expect(metronomeChannelGain(1.5)).toBe(METRONOME_MAX_GAIN);
    expect(metronomeChannelGain(-1)).toBe(0);
  });
});
