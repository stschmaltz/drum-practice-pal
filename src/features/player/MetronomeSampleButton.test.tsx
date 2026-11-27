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
let gains: { gain: { value: number } }[] = [];
let resumed = 0;
let refuseResume = false;

class FakeAudioContext {
  state = 'suspended';
  sampleRate = 48000;
  destination = {};
  resume() {
    resumed++;
    if (refuseResume) return Promise.reject(new DOMException('Not allowed', 'NotAllowedError'));
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
    const gain = { gain: { value: 1 } };
    gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = new FakeSource();
    sources.push(source);
    return source;
  }
}

beforeEach(() => {
  sources = [];
  gains = [];
  resumed = 0;
  refuseResume = false;
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
    rerender: (next: MetronomeVoice, volume = 0.5) =>
      view.rerender(<MetronomeSampleButton voice={next} volume={volume} render={fake.render} />),
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

  it('plays at the slider’s volume and follows the slider while it plays', async () => {
    const user = userEvent.setup();
    const { calls, rerender } = setup();
    await user.click(screen.getByRole('button', { name: 'Play sample' }));
    await screen.findByRole('button', { name: 'Stop sample' });
    expect(gains[0]?.gain.value).toBe(0.5);
    rerender(DEFAULT_METRONOME_VOICE, 0.2);
    expect(gains[0]?.gain.value).toBe(0.2);
    // The level changed; the sample didn't start again.
    expect(calls).toHaveLength(1);
    expect(sources).toHaveLength(1);
  });

  it('takes a volume moved while the sample loads', async () => {
    const user = userEvent.setup();
    let finish: (samples: Float32Array) => void = () => {};
    const view = render(
      <MetronomeSampleButton
        voice={DEFAULT_METRONOME_VOICE}
        volume={0.5}
        render={() => new Promise((resolve) => (finish = resolve))}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Play sample' }));
    view.rerender(
      <MetronomeSampleButton
        voice={DEFAULT_METRONOME_VOICE}
        volume={0}
        render={() => new Promise((resolve) => (finish = resolve))}
      />,
    );
    await act(async () => finish(new Float32Array(8)));
    expect(gains[0]?.gain.value).toBe(0);
  });

  it('asks iOS for the playback audio session in the tap, so the ringer switch can’t mute it', async () => {
    const user = userEvent.setup();
    const audioSession = { type: 'auto' };
    vi.stubGlobal('navigator', { ...navigator, audioSession });
    setup();
    await user.click(screen.getByRole('button', { name: 'Play sample' }));
    expect(audioSession.type).toBe('playback');
  });

  it('says it could not play when the browser refuses to start audio, and plays nothing', async () => {
    const user = userEvent.setup();
    refuseResume = true;
    setup();
    await user.click(screen.getByRole('button', { name: 'Play sample' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Couldn't play the sample\./);
    expect(sources).toEqual([]);
    expect(screen.getByRole('button', { name: 'Play sample' })).toBeInTheDocument();
  });
});
