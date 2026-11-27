/**
 * A metronome voice change while playing (createMetronomeTrack): alphaTab stops
 * to rebuild the MIDI, and the engine starts it again from the right tick,
 * hiding that stop and start from the service but never a "playing" the
 * service is still waiting for. alphaTab is a stub that records play and seek;
 * the real synth is alphaTabEngine.metronome.test.ts.
 */
import { DEFAULT_METRONOME_VOICE, type MetronomeVoice } from './metronomeSounds';
import type { PlayerEngine } from './playerEngine';

const PLAYING = 1;
const PAUSED = 0;

interface StubApi {
  playerState: number;
  tickPosition: number;
  play: ReturnType<typeof vi.fn>;
  midiLoad: { fire(arg: unknown): void };
  midiLoaded: { fire(arg?: unknown): void };
  playerStateChanged: { fire(arg: unknown): void };
  playerPositionChanged: { fire(arg: unknown): void };
  loadMidiForScore: ReturnType<typeof vi.fn>;
}

const stub = vi.hoisted(() => ({ apis: [] as StubApi[] }));

vi.mock('@coderline/alphatab', () => {
  class Event {
    private handlers: ((arg: unknown) => void)[] = [];
    on(handler: (arg: unknown) => void) {
      this.handlers.push(handler);
    }
    fire(arg?: unknown) {
      for (const handler of this.handlers) handler(arg);
    }
  }
  class MidiEvent {
    constructor(
      public track: number,
      public tick: number,
      public channel: number,
    ) {}
  }
  class AlphaTabMetronomeEvent {}
  const api = class AlphaTabApi {
    boundsLookup = null;
    postRenderFinished = new Event();
    renderer = { partialRenderFinished: new Event() };
    midiLoad = new Event();
    midiLoaded = new Event();
    playerReady = new Event();
    playerStateChanged = new Event();
    playerPositionChanged = new Event();
    score = {};
    player = { setChannelVolume: vi.fn() };
    metronomeVolume = 0;
    playerState = PAUSED;
    tickPosition = 0;
    play = vi.fn(() => true);
    pause = vi.fn();
    stop = vi.fn();
    // alphaTab stops for a new MIDI: "paused" and the range's start reported.
    loadMidiForScore = vi.fn(() => {
      this.playerState = PAUSED;
      this.playerStateChanged.fire({ state: PAUSED });
      this.playerPositionChanged.fire({ currentTick: 0 });
    });
    destroy = vi.fn();
    constructor() {
      stub.apis.push(this as unknown as StubApi);
    }
  };
  return {
    AlphaTabApi: api,
    PlayerMode: { EnabledSynthesizer: 1 },
    ScrollMode: { Continuous: 1 },
    LayoutMode: { Page: 0, Horizontal: 1 },
    synth: { PlayerState: { Playing: PLAYING } },
    midi: {
      AlphaTabMetronomeEvent,
      NoteOnEvent: MidiEvent,
      NoteOffEvent: MidiEvent,
      ProgramChangeEvent: MidiEvent,
      ControlChangeEvent: MidiEvent,
      ControllerType: { BankSelectCoarse: 0, BankSelectFine: 32 },
    },
  };
});
vi.mock('@/features/library/parseScore', () => ({ loadGuitarPro: vi.fn() }));

const { createAlphaTabEngine } = await import('./alphaTabEngine');

const COWBELL: MetronomeVoice = { ...DEFAULT_METRONOME_VOICE, sound: 'cowbell' };

function setup() {
  stub.apis.length = 0;
  const scrollElement = document.createElement('div');
  const element = document.createElement('div');
  scrollElement.appendChild(element);
  const engine: PlayerEngine = createAlphaTabEngine({ element, scrollElement, layout: 'page' });
  const api = stub.apis[0]!;
  // A first MIDI, so the metronome has its channel.
  const track = { events: [] as unknown[], addEvent: (e: unknown) => track.events.push(e) };
  api.midiLoad.fire({ tracks: [track] });
  api.midiLoaded.fire();

  const states: boolean[] = [];
  const ticks: number[] = [];
  engine.on('stateChanged', ({ playing }) => states.push(playing));
  engine.on('position', ({ tick }) => ticks.push(tick));

  const alphaTabPlays = () => {
    api.playerState = PLAYING;
    api.playerStateChanged.fire({ state: PLAYING });
  };
  return { engine, api, states, ticks, alphaTabPlays };
}

describe('a metronome voice change while playing', () => {
  it('plays again from the same tick, hiding the stop and the start', () => {
    const { engine, api, states, ticks, alphaTabPlays } = setup();
    engine.play();
    alphaTabPlays();
    api.tickPosition = 4800;
    states.length = 0;
    api.play.mockClear();

    engine.setMetronomeVoice(COWBELL);
    api.midiLoaded.fire();
    expect(api.play).toHaveBeenCalledTimes(1);
    expect(api.tickPosition).toBe(4800);
    alphaTabPlays();

    expect(states).toEqual([]);
    expect(ticks).not.toContain(0);
  });

  it('forwards the restart\'s "playing" when the service never heard the first', () => {
    const { engine, api, states, alphaTabPlays } = setup();
    // A count-in's downbeat: play asked, alphaTab not playing yet.
    engine.play();
    engine.setMetronomeVoice(COWBELL);
    api.midiLoaded.fire();
    alphaTabPlays();

    expect(states).toEqual([true]);
  });

  it('restarts from a seek made while the MIDI was being rebuilt', () => {
    const { engine, api, alphaTabPlays } = setup();
    engine.play();
    alphaTabPlays();
    api.tickPosition = 4800;

    engine.setMetronomeVoice(COWBELL);
    engine.seek(9600);
    api.midiLoaded.fire();

    expect(api.tickPosition).toBe(9600);
  });

  it('starts nothing again after a pause during the rebuild', () => {
    const { engine, api, alphaTabPlays } = setup();
    engine.play();
    alphaTabPlays();
    api.play.mockClear();

    engine.setMetronomeVoice(COWBELL);
    engine.pause();
    api.midiLoaded.fire();

    expect(api.play).not.toHaveBeenCalled();
  });
});
