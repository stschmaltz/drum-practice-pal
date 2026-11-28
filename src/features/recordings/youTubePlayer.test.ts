import type { RecordingPlayer, RecordingState } from './recordingPlayer';

/** YouTube's `YT.Player` for one frame: records what it is told, and fires its events on demand. */
class StubYtPlayer {
  static made: StubYtPlayer[] = [];
  time = 0;
  rate = 1;
  seekTo = vi.fn((seconds: number) => {
    this.time = seconds;
  });
  playVideo = vi.fn();
  pauseVideo = vi.fn();
  destroy = vi.fn();
  constructor(
    readonly frame: HTMLIFrameElement,
    readonly options: {
      events: {
        onReady: () => void;
        onStateChange: (event: { data: number }) => void;
        onPlaybackRateChange: (event: { data: number }) => void;
        onError: (event: { data: number }) => void;
      };
    },
  ) {
    StubYtPlayer.made.push(this);
  }
  getCurrentTime = () => this.time;
  getPlaybackRate = () => this.rate;
  ready() {
    this.options.events.onReady();
  }
  state(data: number) {
    this.options.events.onStateChange({ data });
  }
}

const PLAYING = 1;
const PAUSED = 2;
const BUFFERING = 3;

function frameOnPage(): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  return frame;
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Every player a test made: each listens to the document until it is disposed. */
let madePlayers: RecordingPlayer[] = [];

/** A fresh copy of the module each time: it remembers the API it loaded. */
async function loadModule() {
  vi.resetModules();
  const module = await import('./youTubePlayer');
  return {
    ...module,
    createYouTubePlayer: (frame: HTMLIFrameElement) => {
      const player = module.createYouTubePlayer(frame);
      madePlayers.push(player);
      return player;
    },
  };
}

/** The module with YouTube's API already on the page, a player made for a frame, and its events heard. */
async function setup() {
  window.YT = { Player: StubYtPlayer as never };
  const { createYouTubePlayer, CLOCK_POLL_MS } = await loadModule();
  const frame = frameOnPage();
  const player = createYouTubePlayer(frame);
  const heard: RecordingState[] = [];
  player.subscribe((state) => heard.push(state));
  // The API's promise resolves in a microtask; then the widget exists.
  await vi.advanceTimersByTimeAsync(0);
  const yt = StubYtPlayer.made.at(-1)!;
  return { createYouTubePlayer, CLOCK_POLL_MS, frame, player, heard, yt };
}

beforeEach(() => {
  vi.useFakeTimers();
  StubYtPlayer.made = [];
  document.head.querySelectorAll('script').forEach((script) => script.remove());
  setVisibility('visible');
});

afterEach(() => {
  for (const player of madePlayers) player.dispose();
  madePlayers = [];
  vi.useRealTimers();
  document.body.replaceChildren();
  delete window.YT;
  delete window.onYouTubeIframeAPIReady;
});

describe('loading YouTube’s API', () => {
  it('asks for nothing until a frame is handed over, then for the one script', async () => {
    const { createYouTubePlayer } = await loadModule();
    expect(document.head.querySelector('script')).toBeNull();

    createYouTubePlayer(frameOnPage());
    const scripts = [...document.head.querySelectorAll('script')];
    expect(scripts.map((script) => script.src)).toEqual(['https://www.youtube.com/iframe_api']);
  });

  it('asks once however many frames want it, and wraps each when it arrives', async () => {
    const { createYouTubePlayer } = await loadModule();
    const first = frameOnPage();
    const second = frameOnPage();
    createYouTubePlayer(first);
    createYouTubePlayer(second);
    expect(document.head.querySelectorAll('script')).toHaveLength(1);

    window.YT = { Player: StubYtPlayer as never };
    window.onYouTubeIframeAPIReady?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(StubYtPlayer.made.map((yt) => yt.frame)).toEqual([first, second]);
  });

  it('says it is unavailable when the script can’t load, and asks again for the next frame', async () => {
    const { createYouTubePlayer } = await loadModule();
    const player = createYouTubePlayer(frameOnPage());
    const heard: RecordingState[] = [];
    player.subscribe((state) => heard.push(state));

    document.head.querySelector('script')!.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(0);
    expect(heard.at(-1)).toMatchObject({ status: 'unavailable', playing: false });
    expect(document.head.querySelector('script')).toBeNull();

    createYouTubePlayer(frameOnPage());
    expect(document.head.querySelectorAll('script')).toHaveLength(1);
  });

  it('wraps nothing for a frame that left the page while the script loaded', async () => {
    const { createYouTubePlayer } = await loadModule();
    const frame = frameOnPage();
    const player = createYouTubePlayer(frame);
    player.dispose();
    frame.remove();

    window.YT = { Player: StubYtPlayer as never };
    window.onYouTubeIframeAPIReady?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(StubYtPlayer.made).toEqual([]);
  });

  it('keeps a callback another script had set for the API’s arrival', async () => {
    const theirs = vi.fn();
    window.onYouTubeIframeAPIReady = theirs;
    const { createYouTubePlayer } = await loadModule();
    createYouTubePlayer(frameOnPage());
    window.YT = { Player: StubYtPlayer as never };
    window.onYouTubeIframeAPIReady?.();
    expect(theirs).toHaveBeenCalledOnce();
  });
});

describe('the player’s state', () => {
  it('is loading until the player answers, then ready with its clock', async () => {
    const { player, heard, yt } = await setup();
    expect(player.getState()).toMatchObject({ status: 'loading', started: false, playing: false });

    yt.time = 12;
    yt.ready();
    expect(heard.at(-1)).toEqual({
      status: 'ready',
      started: false,
      playing: false,
      seconds: 12,
      rate: 1,
    });
  });

  it('follows play, buffering, pause and the end, and remembers the video has started', async () => {
    const { heard, yt } = await setup();
    yt.ready();
    yt.time = 3;
    yt.state(PLAYING);
    expect(heard.at(-1)).toMatchObject({ playing: true, started: true, seconds: 3 });

    yt.time = 40;
    yt.state(BUFFERING);
    expect(heard.at(-1)).toMatchObject({ playing: false, started: true, seconds: 40 });
    yt.state(PLAYING);
    expect(heard.at(-1)).toMatchObject({ playing: true, seconds: 40 });

    yt.state(PAUSED);
    expect(heard.at(-1)).toMatchObject({ playing: false, started: true });
    yt.state(0);
    expect(heard.at(-1)).toMatchObject({ playing: false, started: true });
  });

  it.each([
    ['unstarted', -1],
    ['cued', 5],
  ])('a video that is %s has not started: its clock says nothing yet', async (_name, data) => {
    const { heard, yt } = await setup();
    yt.ready();
    yt.state(data);
    expect(heard.at(-1)).toMatchObject({ playing: false, started: false });
  });

  it('reads the new rate when YouTube’s speed is changed', async () => {
    const { heard, yt } = await setup();
    yt.ready();
    yt.rate = 0.5;
    yt.options.events.onPlaybackRateChange({ data: 0.5 });
    expect(heard.at(-1)).toMatchObject({ rate: 0.5 });
  });

  it('is unavailable after an error from the player (embedding refused, not found)', async () => {
    const { heard, yt, player } = await setup();
    yt.ready();
    yt.options.events.onError({ data: 150 });
    expect(heard.at(-1)).toMatchObject({ status: 'unavailable', playing: false });
    // And takes no orders.
    player.play();
    player.seekTo(10);
    expect(yt.playVideo).not.toHaveBeenCalled();
    expect(yt.seekTo).not.toHaveBeenCalled();
  });

  it('getState reads the clock at the call, not at the last poll', async () => {
    const { player, yt } = await setup();
    yt.ready();
    yt.state(PLAYING);
    yt.time = 7.432;
    expect(player.getState().seconds).toBe(7.432);
  });

  it('keeps the last reading when the player answers nonsense', async () => {
    const { player, yt } = await setup();
    yt.time = 5;
    yt.ready();
    yt.time = Number.NaN;
    yt.rate = 0;
    expect(player.getState()).toMatchObject({ seconds: 5, rate: 1 });
  });
});

describe('the poll', () => {
  it('reads the clock a few times a second while the video plays, and stops when it pauses', async () => {
    const { heard, yt, CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.state(PLAYING);
    const before = heard.length;
    yt.time = 1;
    vi.advanceTimersByTime(CLOCK_POLL_MS);
    yt.time = 1.25;
    vi.advanceTimersByTime(CLOCK_POLL_MS);
    expect(heard.slice(before).map((state) => state.seconds)).toEqual([1, 1.25]);

    yt.state(PAUSED);
    const paused = heard.length;
    vi.advanceTimersByTime(CLOCK_POLL_MS * 8);
    expect(heard).toHaveLength(paused);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never polls before the video plays', async () => {
    const { yt } = await setup();
    yt.ready();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops while the page is hidden, and says where the video is when it is back', async () => {
    const { heard, yt, CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.state(PLAYING);
    setVisibility('hidden');
    const hidden = heard.length;
    yt.time = 30;
    vi.advanceTimersByTime(CLOCK_POLL_MS * 8);
    expect(heard).toHaveLength(hidden);
    expect(vi.getTimerCount()).toBe(0);

    setVisibility('visible');
    expect(heard.at(-1)).toMatchObject({ seconds: 30, playing: true });
    yt.time = 31;
    vi.advanceTimersByTime(CLOCK_POLL_MS);
    expect(heard.at(-1)).toMatchObject({ seconds: 31 });
  });

  it('stops for good on dispose, with nothing heard afterwards', async () => {
    const { player, heard, yt, CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.state(PLAYING);
    player.dispose();
    const count = heard.length;

    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(CLOCK_POLL_MS * 8);
    // Events already on their way from the player.
    yt.state(PAUSED);
    yt.state(PLAYING);
    yt.options.events.onPlaybackRateChange({ data: 2 });
    yt.options.events.onError({ data: 150 });
    setVisibility('hidden');
    setVisibility('visible');
    expect(heard).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('driving the video', () => {
  it('seeks, and shows the new time at once: a paused video reports nothing for a seek', async () => {
    const { player, heard, yt } = await setup();
    yt.ready();
    yt.state(PLAYING);
    yt.state(PAUSED);
    player.seekTo(64);
    expect(yt.seekTo).toHaveBeenCalledWith(64, true);
    expect(heard.at(-1)).toMatchObject({ seconds: 64, playing: false });
  });

  it('a seek while buffering is still sent, and the clock’s next reading is believed', async () => {
    const { player, heard, yt } = await setup();
    yt.ready();
    yt.state(PLAYING);
    yt.state(BUFFERING);
    player.seekTo(20);
    expect(yt.seekTo).toHaveBeenCalledWith(20, true);
    // YouTube lands a little before the second asked for.
    yt.time = 19.8;
    yt.state(PLAYING);
    expect(heard.at(-1)).toMatchObject({ seconds: 19.8, playing: true });
  });

  it('never seeks before the video’s start', async () => {
    const { player, yt } = await setup();
    yt.ready();
    player.seekTo(-3);
    expect(yt.seekTo).toHaveBeenCalledWith(0, true);
  });

  it('plays and pauses', async () => {
    const { player, yt } = await setup();
    yt.ready();
    player.play();
    player.pause();
    expect(yt.playVideo).toHaveBeenCalledOnce();
    expect(yt.pauseVideo).toHaveBeenCalledOnce();
  });

  it('sends nothing before the player is ready, or after dispose', async () => {
    const { player, yt } = await setup();
    player.play();
    player.seekTo(5);
    yt.ready();
    player.dispose();
    player.play();
    player.pause();
    player.seekTo(5);
    expect(yt.playVideo).not.toHaveBeenCalled();
    expect(yt.pauseVideo).not.toHaveBeenCalled();
    expect(yt.seekTo).not.toHaveBeenCalled();
  });

  it('never removes the frame, which is the page’s own', async () => {
    const { player, frame, yt } = await setup();
    yt.ready();
    player.dispose();
    expect(yt.destroy).not.toHaveBeenCalled();
    expect(frame.isConnected).toBe(true);
  });
});

describe('a frame wrapped twice (StrictMode mounts, cleans up and mounts again)', () => {
  it('makes one YouTube player for the frame, and the second wrapper hears it', async () => {
    const { createYouTubePlayer, frame, player: first, heard: firstHeard, yt } = await setup();
    first.dispose();
    const second = createYouTubePlayer(frame);
    const heard: RecordingState[] = [];
    second.subscribe((state) => heard.push(state));
    await vi.advanceTimersByTimeAsync(0);

    expect(StubYtPlayer.made).toHaveLength(1);
    yt.ready();
    yt.time = 9;
    yt.state(PLAYING);
    expect(heard.at(-1)).toMatchObject({ status: 'ready', playing: true, seconds: 9 });
    expect(firstHeard).toEqual([]);
  });

  it('a wrapper made after the player answered starts ready', async () => {
    const { createYouTubePlayer, frame, player: first, yt } = await setup();
    yt.time = 4;
    yt.ready();
    first.dispose();
    const second = createYouTubePlayer(frame);
    expect(second.getState()).toMatchObject({ status: 'ready', seconds: 4 });
    second.play();
    expect(yt.playVideo).toHaveBeenCalledOnce();
  });

  it('the first wrapper’s late dispose doesn’t cut the second off', async () => {
    const { createYouTubePlayer, frame, player: first, yt } = await setup();
    const second = createYouTubePlayer(frame);
    const heard: RecordingState[] = [];
    second.subscribe((state) => heard.push(state));
    first.dispose();
    yt.ready();
    expect(heard.at(-1)).toMatchObject({ status: 'ready' });
  });
});
