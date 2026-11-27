import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MetronomeSampleButton } from './MetronomeSampleButton';
import { DEFAULT_METRONOME_VOICE, type MetronomeVoice } from './metronomeSounds';
import type { SampleRenderer } from './useMetronomeSample';

/** Just enough Web Audio to see what was started and stopped, and to end it. */
class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  connect() {
    return { connect: () => {} };
  }
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
  disconnect() {}
  end() {
    this.onended?.();
  }
}

let sources: FakeSource[] = [];
let resumed = 0;

class FakeAudioContext {
  state = 'suspended';
  sampleRate = 48000;
  destination = {};
  resume() {
    resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
  createBuffer(channels: number, frames: number) {
    const data = Array.from({ length: channels }, () => new Float32Array(frames));
    return { getChannelData: (channel: number) => data[channel] };
  }
  createGain() {
    return { gain: { value: 1 } };
  }
  createBufferSource() {
    const source = new FakeSource();
    sources.push(source);
    return source;
  }
}

beforeEach(() => {
  sources = [];
  resumed = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderer() {
  const calls: MetronomeVoice[] = [];
  let fail: unknown = null;
  const render: SampleRenderer = (voice) => {
    calls.push(voice);
    return fail ? Promise.reject(fail) : Promise.resolve(new Float32Array(8));
  };
  return {
    render,
    calls,
    failWith(error: unknown) {
      fail = error;
    },
  };
}

function setup(voice: MetronomeVoice = DEFAULT_METRONOME_VOICE) {
  const fake = renderer();
  const view = render(<MetronomeSampleButton voice={voice} volume={0.5} render={fake.render} />);
  return {
    ...fake,
    rerender: (next: MetronomeVoice) =>
      view.rerender(<MetronomeSampleButton voice={next} volume={0.5} render={fake.render} />),
  };
}

describe('MetronomeSampleButton', () => {
  it('plays the chosen voice from the tap, and says Stop while it plays', async () => {
    const user = userEvent.setup();
    const { calls } = setup({ ...DEFAULT_METRONOME_VOICE, sound: 'cowbell' });
    await user.click(screen.getByRole('button', { name: 'Play sample' }));
    expect(resumed).toBe(1);
    expect(await screen.findByRole('button', { name: 'Stop sample' })).toBeInTheDocument();
    expect(calls).toEqual([{ ...DEFAULT_METRONOME_VOICE, sound: 'cowbell' }]);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.started).toBe(true);
  });

  it('stops on Stop sample, and goes back to Play sample when the sample ends', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button', { name: 'Play sample' }));
    await user.click(await screen.findByRole('button', { name: 'Stop sample' }));
    expect(sources[0]?.stopped).toBe(true);
    expect(screen.getByRole('button', { name: 'Play sample' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Play sample' }));
    await screen.findByRole('button', { name: 'Stop sample' });
    act(() => sources[1]?.end());
    expect(await screen.findByRole('button', { name: 'Play sample' })).toBeInTheDocument();
  });

  it('plays the new sound in place of the old when another is chosen while it plays', async () => {
    const user = userEvent.setup();
    const { calls, rerender } = setup();
    await user.click(screen.getByRole('button', { name: 'Play sample' }));
    await screen.findByRole('button', { name: 'Stop sample' });
    rerender({ ...DEFAULT_METRONOME_VOICE, sound: 'claves' });
    await vi.waitFor(() => expect(sources).toHaveLength(2));
    expect(sources[0]?.stopped).toBe(true);
    expect(calls.at(-1)?.sound).toBe('claves');
  });

  it('plays nothing when another sound is chosen while it is quiet', async () => {
    const { calls, rerender } = setup();
    rerender({ ...DEFAULT_METRONOME_VOICE, sound: 'claves' });
    await act(async () => {});
    expect(calls).toEqual([]);
    expect(sources).toEqual([]);
  });

  it('says it could not play in fixed copy, never the error’s own words', async () => {
    const user = userEvent.setup();
    const { failWith } = setup();
    failWith(new Error('Soundfont not found at /soundfont/sonivox.sf2 (404)'));
    await user.click(screen.getByRole('button', { name: 'Play sample' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/^Couldn't play the sample\./);
    expect(alert).not.toHaveTextContent('sonivox');
    expect(screen.getByRole('button', { name: 'Play sample' })).toBeInTheDocument();
  });
});
