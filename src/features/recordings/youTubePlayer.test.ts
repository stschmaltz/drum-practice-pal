import type { RecordingPlayer, RecordingState } from './recordingPlayer';

/** YouTube's `YT.Player` for one frame: records what it is told, and fires its events on demand. */
class StubYtPlayer {
  static made: StubYtPlayer[] = [];
  time = 0;
  rate = 1;
  /** `YT.PlayerState` as the player would answer it now: -1 until the video has been started. */
  playerState = -1;
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
  getPlayerState = () => this.playerState;
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
  const { createYouTubePlayer, CLOCK_POLL_MS, PAUSED_CLOCK_POLL_MS } = await loadModule();
  const frame = frameOnPage();
  const player = createYouTubePlayer(frame);
  const heard: RecordingState[] = [];
  player.subscribe((state) => heard.push(state));
  // The API's promise resolves in a microtask; then the widget exists.
  await vi.advanceTimersByTimeAsync(0);
  const yt = StubYtPlayer.made.at(-1)!;
  return { createYouTubePlayer, CLOCK_POLL_MS, PAUSED_CLOCK_POLL_MS, frame, player, heard, yt };
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

  // 19 Review: the page's global is the app's only while a load is on its way.
  it('gives the page’s callback back once the API has arrived: theirs if there was one, none if not', async () => {
    const theirs = vi.fn();
    window.onYouTubeIframeAPIReady = theirs;
    const first = await loadModule();
    first.createYouTubePlayer(frameOnPage());
    expect(window.onYouTubeIframeAPIReady).not.toBe(theirs);
    window.YT = { Player: StubYtPlayer as never };
    window.onYouTubeIframeAPIReady?.();
    expect(window.onYouTubeIframeAPIReady).toBe(theirs);

    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
    const second = await loadModule();
    second.createYouTubePlayer(frameOnPage());
    // Read through a function: the compiler takes the `delete` above as the last word.
    const callback = () => window.onYouTubeIframeAPIReady;
    expect(callback()).toBeTypeOf('function');
    window.YT = { Player: StubYtPlayer as never };
    callback()?.();
    expect(callback()).toBeUndefined();
  });

  it('gives it back when the script fails too, so a script that keeps failing leaves no chain of callbacks', async () => {
    const { createYouTubePlayer } = await loadModule();
    for (let attempt = 0; attempt < 3; attempt++) {
      createYouTubePlayer(frameOnPage());
      expect(window.onYouTubeIframeAPIReady).toBeTypeOf('function');
      document.head.querySelector('script')!.dispatchEvent(new Event('error'));
      await vi.advanceTimersByTimeAsync(0);
      expect(window.onYouTubeIframeAPIReady).toBeUndefined();
    }
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
  it('reads the clock a few times a second while the video plays, and says nothing more once it pauses and stands still', async () => {
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
    // The one timer left is the slow look at a paused video's clock (below).
    expect(vi.getTimerCount()).toBe(1);
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

  // 19 Review: the one door to the player's `seekTo` takes a time and nothing else.
  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'sends no seek for %s, and shows nothing of it',
    async (seconds) => {
      const { player, heard, yt } = await setup();
      yt.ready();
      yt.time = 4;
      yt.state(PLAYING);
      yt.state(PAUSED);
      const count = heard.length;
      player.seekTo(seconds);
      expect(yt.seekTo).not.toHaveBeenCalled();
      expect(heard).toHaveLength(count);
      expect(player.getState().seconds).toBe(4);
    },
  );

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

// 19 Test: the windows Build's list names, each with the input that arrives in it.
describe('the poll, through every way a video stops and goes on (19 Test)', () => {
  const ENDED = 0;

  it.each([
    ['a pause', PAUSED],
    ['buffering', BUFFERING],
    ['the end', ENDED],
  ])(
    'slows down for %s and speeds up again when the video plays on, one timer at a time',
    async (_name, stop) => {
      const { heard, yt, CLOCK_POLL_MS, PAUSED_CLOCK_POLL_MS } = await setup();
      yt.ready();
      yt.state(PLAYING);
      expect(vi.getTimerCount()).toBe(1);

      yt.state(stop);
      expect(vi.getTimerCount()).toBe(1);
      const stopped = heard.length;
      yt.time = 50;
      // Not at the playing video's pace.
      vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS - CLOCK_POLL_MS);
      expect(heard).toHaveLength(stopped);

      // Playing again, said twice as YouTube sometimes does: still one poll.
      yt.state(PLAYING);
      yt.state(PLAYING);
      expect(vi.getTimerCount()).toBe(1);
      const resumed = heard.length;
      yt.time = 51;
      vi.advanceTimersByTime(CLOCK_POLL_MS);
      expect(heard).toHaveLength(resumed + 1);
      expect(heard.at(-1)).toMatchObject({ seconds: 51, playing: true });
    },
  );

  it('a video that starts playing while the page is hidden isn’t polled until the page is back', async () => {
    const { heard, yt, CLOCK_POLL_MS } = await setup();
    yt.ready();
    setVisibility('hidden');
    yt.state(PLAYING);
    // The change of state itself is heard; the clock isn't read on a timer.
    expect(heard.at(-1)).toMatchObject({ playing: true, started: true });
    expect(vi.getTimerCount()).toBe(0);

    yt.time = 12;
    setVisibility('visible');
    expect(heard.at(-1)).toMatchObject({ seconds: 12 });
    expect(vi.getTimerCount()).toBe(1);
    yt.time = 12.25;
    vi.advanceTimersByTime(CLOCK_POLL_MS);
    expect(heard.at(-1)).toMatchObject({ seconds: 12.25 });
  });

  it('a page that comes back to a paused video says where it is once, and nothing more while it stands still', async () => {
    const { heard, yt, PAUSED_CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.state(PLAYING);
    yt.state(PAUSED);
    setVisibility('hidden');
    expect(vi.getTimerCount()).toBe(0);
    // Scrubbed in another window's picture-in-picture, say.
    yt.time = 77;
    const hidden = heard.length;
    vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS * 5);
    expect(heard).toHaveLength(hidden);
    setVisibility('visible');
    expect(heard).toHaveLength(hidden + 1);
    expect(heard.at(-1)).toMatchObject({ seconds: 77, playing: false });
    vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS * 4);
    expect(heard).toHaveLength(hidden + 1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('a page hidden and shown before the player has answered says nothing: there is no clock to read', async () => {
    const { heard } = await setup();
    setVisibility('hidden');
    setVisibility('visible');
    expect(heard).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops when the player gives up while playing (an error mid-video)', async () => {
    const { heard, yt, CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.state(PLAYING);
    yt.options.events.onError({ data: 5 });
    expect(heard.at(-1)).toMatchObject({ status: 'unavailable', playing: false });
    expect(vi.getTimerCount()).toBe(0);
    const count = heard.length;
    vi.advanceTimersByTime(CLOCK_POLL_MS * 4);
    expect(heard).toHaveLength(count);
    // A "playing" still on its way from the frame doesn't set the clock going again: the
    // screen has been told this video can't be followed.
    yt.state(PLAYING);
    expect(heard.at(-1)).toMatchObject({ status: 'unavailable', playing: false });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('tells each listener, and one that stops listening hears no more while the others do', async () => {
    const { player, heard, yt, CLOCK_POLL_MS } = await setup();
    const others: number[] = [];
    const stop = player.subscribe((state) => {
      others.push(state.seconds);
      // Taking itself off while being told must not skip the listener after it.
      if (state.seconds === 2) stop();
    });
    const last: number[] = [];
    player.subscribe((state) => last.push(state.seconds));
    yt.ready();
    yt.state(PLAYING);
    yt.time = 2;
    vi.advanceTimersByTime(CLOCK_POLL_MS);
    yt.time = 3;
    vi.advanceTimersByTime(CLOCK_POLL_MS);
    expect(others.at(-1)).toBe(2);
    expect(last.at(-1)).toBe(3);
    expect(heard.at(-1)).toMatchObject({ seconds: 3 });
  });
});

describe('events that arrive late (19 Test)', () => {
  it('a player let go of before it answered stays as it was when the answer comes', async () => {
    const { player, heard, yt, CLOCK_POLL_MS } = await setup();
    player.dispose();
    yt.time = 9;
    yt.ready();
    yt.state(PLAYING);
    vi.advanceTimersByTime(CLOCK_POLL_MS * 4);
    expect(heard).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    // What it knew when it was let go of: nothing is read from the player for it any more.
    expect(player.getState()).toMatchObject({ status: 'loading', started: false, seconds: 0 });
  });

  it('a listener added after dispose hears nothing, and its unsubscribe is safe to call', async () => {
    const { player, yt } = await setup();
    yt.ready();
    player.dispose();
    const late = vi.fn();
    const stop = player.subscribe(late);
    yt.state(PLAYING);
    expect(late).not.toHaveBeenCalled();
    expect(() => stop()).not.toThrow();
    // Disposing twice is one dispose.
    expect(() => player.dispose()).not.toThrow();
  });

  it('a seek sent while the video buffers shows at once, and a clock reading from before it is put right by the next', async () => {
    const { player, heard, yt, CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.time = 5;
    yt.state(PLAYING);
    yt.state(BUFFERING);
    player.seekTo(40);
    expect(heard.at(-1)).toMatchObject({ seconds: 40, playing: false });
    // No poll while it buffers: nothing moves the time shown off the target.
    vi.advanceTimersByTime(CLOCK_POLL_MS * 4);
    expect(heard.at(-1)).toMatchObject({ seconds: 40 });
    // It plays on from where YouTube really landed.
    yt.time = 39.7;
    yt.state(PLAYING);
    expect(heard.at(-1)).toMatchObject({ seconds: 39.7, playing: true });
  });

  it('two seeks, one straight after the other, end on the second', async () => {
    const { player, heard, yt } = await setup();
    yt.ready();
    yt.state(PLAYING);
    yt.state(PAUSED);
    player.seekTo(10);
    player.seekTo(30);
    expect(yt.seekTo.mock.calls.map(([seconds]) => seconds)).toEqual([10, 30]);
    expect(heard.at(-1)).toMatchObject({ seconds: 30 });
    expect(player.getState().seconds).toBe(30);
  });
});

describe('one video after another (19 Test)', () => {
  it('a second frame is a second player: the script isn’t asked for again, and neither hears the other', async () => {
    const { createYouTubePlayer } = await loadModule();
    const firstFrame = frameOnPage();
    const first = createYouTubePlayer(firstFrame);
    const firstHeard: RecordingState[] = [];
    first.subscribe((state) => firstHeard.push(state));
    window.YT = { Player: StubYtPlayer as never };
    window.onYouTubeIframeAPIReady?.();
    await vi.advanceTimersByTimeAsync(0);
    const firstYt = StubYtPlayer.made[0]!;
    firstYt.ready();
    firstYt.time = 100;
    firstYt.state(PLAYING);
    expect(firstHeard.at(-1)).toMatchObject({ started: true, playing: true, seconds: 100 });

    // The source is switched while the first is being polled: its frame goes, another comes.
    first.dispose();
    firstFrame.remove();
    expect(vi.getTimerCount()).toBe(0);
    const secondFrame = frameOnPage();
    const second = createYouTubePlayer(secondFrame);
    const secondHeard: RecordingState[] = [];
    second.subscribe((state) => secondHeard.push(state));
    await vi.advanceTimersByTimeAsync(0);

    expect(document.head.querySelectorAll('script')).toHaveLength(1);
    expect(StubYtPlayer.made.map((yt) => yt.frame)).toEqual([firstFrame, secondFrame]);
    // The new video hasn't been tapped: nothing of the first's is carried over.
    expect(second.getState()).toMatchObject({ status: 'loading', started: false, seconds: 0 });

    // The first video's events, still on their way, reach neither.
    const before = firstHeard.length;
    firstYt.time = 101;
    firstYt.state(PAUSED);
    firstYt.state(PLAYING);
    expect(firstHeard).toHaveLength(before);
    expect(secondHeard).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);

    const secondYt = StubYtPlayer.made[1]!;
    secondYt.time = 3;
    secondYt.ready();
    expect(secondHeard.at(-1)).toMatchObject({ status: 'ready', started: false, seconds: 3 });
    // And orders go to the video on the page, never to the one that left.
    second.seekTo(8);
    first.seekTo(8);
    expect(secondYt.seekTo).toHaveBeenCalledTimes(1);
    expect(firstYt.seekTo).not.toHaveBeenCalled();
  });

  it('the frame replaced while the script loads: only the one on the page is wrapped, and it works', async () => {
    const { createYouTubePlayer } = await loadModule();
    const gone = frameOnPage();
    const first = createYouTubePlayer(gone);
    const firstHeard = vi.fn();
    first.subscribe(firstHeard);
    first.dispose();
    gone.remove();
    const here = frameOnPage();
    const second = createYouTubePlayer(here);
    const heard: RecordingState[] = [];
    second.subscribe((state) => heard.push(state));
    expect(document.head.querySelectorAll('script')).toHaveLength(1);

    window.YT = { Player: StubYtPlayer as never };
    window.onYouTubeIframeAPIReady?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(StubYtPlayer.made.map((yt) => yt.frame)).toEqual([here]);
    StubYtPlayer.made[0]!.ready();
    StubYtPlayer.made[0]!.state(PLAYING);
    expect(heard.at(-1)).toMatchObject({ status: 'ready', playing: true });
    expect(firstHeard).not.toHaveBeenCalled();
  });
});

describe('the script failing (19 Test)', () => {
  it('every frame that was waiting is told, and none is polled or driven', async () => {
    const { createYouTubePlayer } = await loadModule();
    const players = [createYouTubePlayer(frameOnPage()), createYouTubePlayer(frameOnPage())];
    const heard = players.map((player) => {
      const states: RecordingState[] = [];
      player.subscribe((state) => states.push(state));
      return states;
    });
    document.head.querySelector('script')!.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(0);
    for (const states of heard) {
      expect(states.at(-1)).toMatchObject({ status: 'unavailable', playing: false });
    }
    for (const player of players) {
      expect(() => {
        player.play();
        player.pause();
        player.seekTo(4);
      }).not.toThrow();
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a frame made after the failure asks again, and works when the script then loads', async () => {
    const { createYouTubePlayer } = await loadModule();
    createYouTubePlayer(frameOnPage());
    document.head.querySelector('script')!.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(0);

    const frame = frameOnPage();
    const player = createYouTubePlayer(frame);
    const heard: RecordingState[] = [];
    player.subscribe((state) => heard.push(state));
    expect(player.getState().status).toBe('loading');
    window.YT = { Player: StubYtPlayer as never };
    window.onYouTubeIframeAPIReady?.();
    await vi.advanceTimersByTimeAsync(0);
    // Only the frame that asked the second time: the first was told it would never answer.
    expect(StubYtPlayer.made.map((yt) => yt.frame)).toEqual([frame]);
    StubYtPlayer.made[0]!.ready();
    expect(heard.at(-1)).toMatchObject({ status: 'ready' });
  });

  it('a script that arrives without a player in it is the same as none', async () => {
    const { createYouTubePlayer } = await loadModule();
    const player = createYouTubePlayer(frameOnPage());
    const heard: RecordingState[] = [];
    player.subscribe((state) => heard.push(state));
    window.YT = {};
    window.onYouTubeIframeAPIReady?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(heard.at(-1)).toMatchObject({ status: 'unavailable' });
  });

  it('a player that can’t be made for the frame is unavailable, and the page carries on', async () => {
    class Throws {
      constructor() {
        throw new Error('not this frame');
      }
    }
    window.YT = { Player: Throws as never };
    const { createYouTubePlayer } = await loadModule();
    const player = createYouTubePlayer(frameOnPage());
    const heard: RecordingState[] = [];
    player.subscribe((state) => heard.push(state));
    await vi.advanceTimersByTimeAsync(0);
    expect(heard.at(-1)).toMatchObject({ status: 'unavailable' });
    // A wrapper made for the same frame afterwards (StrictMode's second mount) knows already.
    expect(createYouTubePlayer(document.querySelector('iframe')!).getState().status).toBe(
      'unavailable',
    );
  });

  it('a script that fails after its frame has gone tells nobody, and nothing throws', async () => {
    const { createYouTubePlayer } = await loadModule();
    const frame = frameOnPage();
    const player = createYouTubePlayer(frame);
    const heard = vi.fn();
    player.subscribe(heard);
    player.dispose();
    frame.remove();
    document.head.querySelector('script')!.dispatchEvent(new Event('error'));
    await vi.advanceTimersByTimeAsync(0);
    expect(heard).not.toHaveBeenCalled();
  });
});

describe('a video already going when its player first answers (19 QA issue 3)', () => {
  it('the script arrives late, the video already playing: it is playing, started and polled from the answer on', async () => {
    const { createYouTubePlayer, CLOCK_POLL_MS } = await loadModule();
    const player = createYouTubePlayer(frameOnPage());
    const heard: RecordingState[] = [];
    player.subscribe((state) => heard.push(state));
    expect(player.getState()).toMatchObject({ status: 'loading', started: false });

    // A slow connection: the user tapped Play on the video long before the script landed.
    window.YT = { Player: StubYtPlayer as never };
    window.onYouTubeIframeAPIReady?.();
    await vi.advanceTimersByTimeAsync(0);
    const yt = StubYtPlayer.made.at(-1)!;
    yt.time = 9;
    yt.rate = 1.5;
    yt.playerState = PLAYING;
    yt.ready();
    expect(heard.at(-1)).toEqual({
      status: 'ready',
      started: true,
      playing: true,
      seconds: 9,
      rate: 1.5,
    });

    // No state change ever comes for a video that was playing all along: the poll runs anyway.
    yt.time = 9.4;
    await vi.advanceTimersByTimeAsync(CLOCK_POLL_MS);
    expect(heard.at(-1)).toMatchObject({ playing: true, seconds: 9.4 });
    player.pause();
    expect(yt.pauseVideo).toHaveBeenCalledOnce();
  });

  it.each([
    ['paused', PAUSED, { started: true, playing: false }],
    ['buffering', BUFFERING, { started: true, playing: false }],
    ['ended', 0, { started: true, playing: false }],
    ['not started', -1, { started: false, playing: false }],
    ['cued', 5, { started: false, playing: false }],
  ])(
    'a video that is %s when the player answers is read as that, and nothing more is said while its clock stands still',
    async (_name, playerState, expected) => {
      const { player, heard, yt, CLOCK_POLL_MS } = await setup();
      yt.time = 31;
      yt.playerState = playerState;
      yt.ready();
      expect(player.getState()).toMatchObject({ status: 'ready', seconds: 31, ...expected });
      const count = heard.length;
      await vi.advanceTimersByTimeAsync(CLOCK_POLL_MS * 4);
      expect(heard).toHaveLength(count);
    },
  );

  it('a wrapper made on a frame whose video is already playing starts playing, and polls', async () => {
    const { createYouTubePlayer, frame, player: first, yt, CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.playerState = PLAYING;
    yt.state(PLAYING);
    first.dispose();

    yt.time = 12;
    const second = createYouTubePlayer(frame);
    expect(second.getState()).toMatchObject({ status: 'ready', started: true, playing: true });
    const heard: RecordingState[] = [];
    second.subscribe((state) => heard.push(state));
    yt.time = 12.3;
    await vi.advanceTimersByTimeAsync(CLOCK_POLL_MS);
    expect(heard.at(-1)).toMatchObject({ seconds: 12.3 });
  });

  it.each([
    [
      'throws',
      () => {
        throw new Error('gone');
      },
    ],
    ['answers nonsense', () => undefined as unknown as number],
  ])(
    'a player whose state %s is ready and not started, as before',
    async (_name, getPlayerState) => {
      const { player, yt } = await setup();
      yt.getPlayerState = getPlayerState;
      yt.ready();
      expect(player.getState()).toMatchObject({ status: 'ready', started: false, playing: false });
    },
  );

  it('a player with no way to ask its state (an API of another shape) is ready and not started', async () => {
    const { player, yt } = await setup();
    (yt as { getPlayerState?: unknown }).getPlayerState = undefined;
    yt.ready();
    expect(player.getState()).toMatchObject({ status: 'ready', started: false, playing: false });
  });
});

// 19 QA (after fix round 1), issue 2. YouTube fires no state change for a seek made on its own
// bar while the video is paused, and there is no time event: the mark stayed on the old bar
// until Play. So a started video that isn't playing is still looked at, about once a second.
describe('a paused video scrubbed in YouTube’s own bar', () => {
  it('is heard at the next slow look, once, with the video still paused', async () => {
    const { heard, yt, PAUSED_CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.time = 3;
    yt.state(PLAYING);
    yt.state(PAUSED);
    const paused = heard.length;

    // A click on YouTube's progress bar: the clock moves, and no event says so.
    yt.time = 24.86;
    vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS);
    expect(heard).toHaveLength(paused + 1);
    expect(heard.at(-1)).toMatchObject({ seconds: 24.86, playing: false, started: true });

    // Standing still again: looked at, nothing said.
    vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS * 5);
    expect(heard).toHaveLength(paused + 1);
    expect(yt.playVideo).not.toHaveBeenCalled();
    expect(yt.seekTo).not.toHaveBeenCalled();
  });

  it('a change of state reads the clock at once, without waiting for the look', async () => {
    const { heard, yt } = await setup();
    yt.ready();
    yt.state(PLAYING);
    yt.state(PAUSED);
    // Some seeks do come with a buffering and a paused: the clock is read at each.
    yt.time = 61;
    yt.state(BUFFERING);
    expect(heard.at(-1)).toMatchObject({ seconds: 61, playing: false });
    yt.time = 61.2;
    yt.state(PAUSED);
    expect(heard.at(-1)).toMatchObject({ seconds: 61.2, playing: false });
  });

  it('is looked at slower than a playing one, and the pace follows play and pause with one timer', async () => {
    const { heard, yt, CLOCK_POLL_MS, PAUSED_CLOCK_POLL_MS } = await setup();
    expect(PAUSED_CLOCK_POLL_MS).toBeGreaterThanOrEqual(CLOCK_POLL_MS * 2);
    yt.ready();
    yt.state(PLAYING);
    yt.state(PAUSED);
    expect(vi.getTimerCount()).toBe(1);

    yt.state(PLAYING);
    expect(vi.getTimerCount()).toBe(1);
    const playing = heard.length;
    yt.time = 9;
    vi.advanceTimersByTime(CLOCK_POLL_MS);
    expect(heard).toHaveLength(playing + 1);

    yt.state(PAUSED);
    expect(vi.getTimerCount()).toBe(1);
    const paused = heard.length;
    yt.time = 40;
    vi.advanceTimersByTime(CLOCK_POLL_MS * 2);
    expect(heard).toHaveLength(paused);
    vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS);
    expect(heard.at(-1)).toMatchObject({ seconds: 40 });
  });

  it('is not looked at while the page is hidden, and is from the moment it is back', async () => {
    const { heard, yt, PAUSED_CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.state(PLAYING);
    yt.state(PAUSED);
    setVisibility('hidden');
    expect(vi.getTimerCount()).toBe(0);
    const hidden = heard.length;
    yt.time = 15;
    vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS * 10);
    expect(heard).toHaveLength(hidden);

    setVisibility('visible');
    expect(heard.at(-1)).toMatchObject({ seconds: 15 });
    expect(vi.getTimerCount()).toBe(1);
    yt.time = 16;
    vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS);
    expect(heard.at(-1)).toMatchObject({ seconds: 16 });
  });

  it.each([
    ['not started', -1],
    ['cued', 5],
  ])(
    'a video that is %s is never looked at: its clock isn’t the song’s yet',
    async (_name, state) => {
      const { heard, yt, PAUSED_CLOCK_POLL_MS } = await setup();
      yt.ready();
      yt.state(state);
      expect(vi.getTimerCount()).toBe(0);
      const count = heard.length;
      yt.time = 5;
      vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS * 3);
      expect(heard).toHaveLength(count);
    },
  );

  it('stops for good on dispose, and when the player gives up', async () => {
    const { player, heard, yt, PAUSED_CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.state(PLAYING);
    yt.state(PAUSED);
    yt.options.events.onError({ data: 5 });
    expect(vi.getTimerCount()).toBe(0);
    const count = heard.length;
    yt.time = 90;
    vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS * 3);
    expect(heard).toHaveLength(count);

    const second = await setup();
    second.yt.ready();
    second.yt.state(PLAYING);
    second.yt.state(PAUSED);
    expect(vi.getTimerCount()).toBe(1);
    second.player.dispose();
    expect(vi.getTimerCount()).toBe(0);
    second.yt.time = 90;
    vi.advanceTimersByTime(second.PAUSED_CLOCK_POLL_MS * 3);
    expect(second.heard.at(-1)).not.toMatchObject({ seconds: 90 });
    player.dispose();
  });

  it('a wrapper made on a frame whose video is paused part-way looks at it too', async () => {
    const { createYouTubePlayer, frame, player: first, yt, PAUSED_CLOCK_POLL_MS } = await setup();
    yt.ready();
    yt.state(PLAYING);
    yt.playerState = PAUSED;
    yt.state(PAUSED);
    first.dispose();
    expect(vi.getTimerCount()).toBe(0);

    const second = createYouTubePlayer(frame);
    const heard: RecordingState[] = [];
    second.subscribe((state) => heard.push(state));
    expect(vi.getTimerCount()).toBe(1);
    yt.time = 33;
    vi.advanceTimersByTime(PAUSED_CLOCK_POLL_MS);
    expect(heard.at(-1)).toMatchObject({ seconds: 33, started: true, playing: false });
  });
});
