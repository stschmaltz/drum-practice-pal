/**
 * RecordingPlayer over YouTube's IFrame Player API (Unit 19). The only module
 * that talks to it, and the only place the app asks YouTube for a script.
 *
 * What it relies on, from the API's reference (checked in 19 Build, see
 * docs/units/19-follow-video.md):
 * - The script is `https://www.youtube.com/iframe_api`; it calls
 *   `window.onYouTubeIframeAPIReady` once `YT.Player` exists.
 * - `new YT.Player(iframe, { events })` takes over a frame the page already
 *   has, whose address carries `enablejsapi=1` and `origin` (built in
 *   songLinks.ts, the page's own origin).
 * - There is no time event: `getCurrentTime()` is polled. `onStateChange`
 *   gives -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued;
 *   `onPlaybackRateChange` the new rate; `onError` a code (100, 101, 150, 153…).
 * - `destroy()` removes the frame, which is React's: it is never called.
 *
 * Nothing is loaded until a frame is handed over, which is when the play
 * screen opens a recording with a connection: no other screen imports a
 * caller of `createYouTubePlayer` that runs.
 */
import { RECORDING_NOT_READY, type RecordingPlayer, type RecordingState } from './recordingPlayer';

const API_URL = 'https://www.youtube.com/iframe_api';

/** How often the clock is read while the video plays with the page on show: "a few times a second". */
export const CLOCK_POLL_MS = 250;

/** `YT.PlayerState`, written out: the API's object isn't there until its script is. */
const YT_PLAYING = 1;

interface YtPlayer {
  getCurrentTime(): number;
  getPlaybackRate(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
}

interface YtEvents {
  onReady: () => void;
  onStateChange: (event: { data: number }) => void;
  onPlaybackRateChange: (event: { data: number }) => void;
  onError: (event: { data: number }) => void;
}

interface YtApi {
  Player: new (frame: HTMLIFrameElement, options: { events: YtEvents }) => YtPlayer;
}

declare global {
  interface Window {
    YT?: Partial<YtApi>;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoading: Promise<YtApi> | null = null;

/**
 * YouTube's API, asked for once however many frames want it. A load that
 * failed (blocked, offline) is forgotten, so the next frame asks again.
 */
function loadYouTubeApi(): Promise<YtApi> {
  const loaded = window.YT;
  if (loaded?.Player) return Promise.resolve(loaded as YtApi);
  apiLoading ??= new Promise<YtApi>((resolve, reject) => {
    const fail = () => {
      apiLoading = null;
      script.remove();
      reject(new Error('The YouTube player API did not load'));
    };
    const earlier = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      earlier?.();
      const api = window.YT;
      if (api?.Player) resolve(api as YtApi);
      else fail();
    };
    const script = document.createElement('script');
    script.src = API_URL;
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  });
  return apiLoading;
}

type WidgetEvent =
  { type: 'ready' } | { type: 'state'; data: number } | { type: 'rate' } | { type: 'unavailable' };

/**
 * YouTube's player object for one frame. One per frame element, however many
 * times the app wraps it: StrictMode mounts, cleans up and mounts again on
 * the same element, and a second `new YT.Player` on a frame it already knows
 * hands back the first with the new listeners unheard. Its events go to
 * whichever wrapper is current (`sink`).
 */
interface FrameWidget {
  yt: YtPlayer | null;
  ready: boolean;
  unavailable: boolean;
  sink: ((event: WidgetEvent) => void) | null;
}

const widgets = new WeakMap<HTMLIFrameElement, FrameWidget>();

function widgetFor(frame: HTMLIFrameElement): FrameWidget {
  const known = widgets.get(frame);
  if (known) return known;
  const widget: FrameWidget = { yt: null, ready: false, unavailable: false, sink: null };
  widgets.set(frame, widget);
  const gaveUp = () => {
    widget.unavailable = true;
    widget.sink?.({ type: 'unavailable' });
  };
  const wrap = (api: YtApi) => {
    // The frame left the page while the script loaded: nothing to drive.
    if (!frame.isConnected) return;
    widget.yt = new api.Player(frame, {
      events: {
        onReady: () => {
          widget.ready = true;
          widget.sink?.({ type: 'ready' });
        },
        onStateChange: ({ data }) => widget.sink?.({ type: 'state', data }),
        onPlaybackRateChange: () => widget.sink?.({ type: 'rate' }),
        // Not found, private, or its owner refuses embedding: the frame says so itself.
        onError: gaveUp,
      },
    });
  };
  // A constructor that throws (an API of another shape) is the same to the screen as no API.
  loadYouTubeApi().then(wrap).catch(gaveUp);
  return widget;
}

export function createYouTubePlayer(frame: HTMLIFrameElement): RecordingPlayer {
  const widget = widgetFor(frame);
  const listeners = new Set<(state: RecordingState) => void>();
  let state: RecordingState = { ...RECORDING_NOT_READY };
  let disposed = false;
  let poll: ReturnType<typeof setInterval> | null = null;

  /** The player's own clock and rate, read now. Left as they were when it can't say. */
  const readClock = () => {
    const yt = widget.yt;
    if (!yt || !widget.ready) return;
    try {
      const seconds = yt.getCurrentTime();
      const rate = yt.getPlaybackRate();
      state = {
        ...state,
        seconds: Number.isFinite(seconds) ? seconds : state.seconds,
        rate: Number.isFinite(rate) && rate > 0 ? rate : state.rate,
      };
    } catch {
      // A player torn down under us answers nothing; the last reading stands.
    }
  };

  const emit = () => {
    for (const listener of [...listeners]) listener({ ...state });
  };

  /** Polls only while there is something to follow and someone to see it. */
  const keepPollInStep = () => {
    const wanted = !disposed && state.playing && document.visibilityState === 'visible';
    if (wanted && poll === null) {
      poll = setInterval(() => {
        if (disposed) return;
        readClock();
        emit();
      }, CLOCK_POLL_MS);
    } else if (!wanted && poll !== null) {
      clearInterval(poll);
      poll = null;
    }
  };

  const handle = (event: WidgetEvent) => {
    // The player's events can still be on their way after the screen has let go of it.
    if (disposed) return;
    if (event.type === 'unavailable') {
      state = { ...state, status: 'unavailable', playing: false };
    } else if (state.status === 'unavailable') {
      // Said to be out of reach for good: a "playing" that follows an error must not set
      // the clock's poll going under a video the screen has stopped following (19 Test).
      return;
    } else if (event.type === 'ready') {
      state = { ...state, status: 'ready' };
      readClock();
    } else if (event.type === 'state') {
      // Buffering, paused, ended, cued, unstarted: the clock stands still in all of them.
      const playing = event.data === YT_PLAYING;
      state = { ...state, playing, started: state.started || playing };
      readClock();
    } else {
      readClock();
    }
    keepPollInStep();
    emit();
  };

  const onVisibility = () => {
    if (disposed) return;
    keepPollInStep();
    // Back on show: the video played on meanwhile, so say where it is now.
    if (document.visibilityState === 'visible' && state.status === 'ready') {
      readClock();
      emit();
    }
  };

  widget.sink = handle;
  document.addEventListener('visibilitychange', onVisibility);
  // A frame whose player answered before this wrapper was made (a remount on the same element).
  if (widget.unavailable) state = { ...state, status: 'unavailable' };
  else if (widget.ready) {
    state = { ...state, status: 'ready' };
    readClock();
  }

  const ifReady = (act: (yt: YtPlayer) => void) => {
    const yt = widget.yt;
    if (disposed || !yt || state.status !== 'ready') return;
    try {
      act(yt);
    } catch {
      // As readClock: a player that has gone takes no orders.
    }
  };

  return {
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState() {
      if (!disposed) readClock();
      return { ...state };
    },
    seekTo(seconds) {
      ifReady((yt) => {
        const target = Math.max(0, seconds);
        yt.seekTo(target, true);
        // Shown at once, as a seek on the tab is: a paused video reports no change of state
        // for a seek, and the next reading of its clock puts right whatever this guessed.
        state = { ...state, seconds: target };
        emit();
      });
    },
    play() {
      ifReady((yt) => yt.playVideo());
    },
    pause() {
      ifReady((yt) => yt.pauseVideo());
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (poll !== null) clearInterval(poll);
      poll = null;
      document.removeEventListener('visibilitychange', onVisibility);
      // Only if a later wrapper of the same frame hasn't taken over.
      if (widget.sink === handle) widget.sink = null;
      listeners.clear();
    },
  };
}
