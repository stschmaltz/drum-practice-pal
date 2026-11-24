import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { PlayerService, PlayerSnapshot } from '@/features/player/PlayerService';
import { useAuth, useSignedInUser } from '@/lib/auth';
import { removeOutboxEntry } from '@/features/offline/outbox';
import { isOnline } from '@/lib/network';
import { randomUuid } from '@/lib/randomUuid';
import { sessionMinPlaySeconds } from './debugPractice';
import { logSessionOnExit } from './sessionsApi';
import {
  countRepeat,
  observe,
  trackerPhase,
  type SessionRecord,
  type TrackerState,
} from './sessionTracker';
import { logSessionUnobserved, queueSession, sessionLogged, useLogSession } from './useSessions';

/**
 * How a session that ended gets sent. `mutation`: the hook's mutation, for a
 * screen that is staying. `unobserved`: the same mutation without the hook,
 * for a screen that is unmounting inside a living app. `keepalive`: a request
 * the browser finishes by itself, for a page that is hidden or going away.
 */
type SendVia = 'mutation' | 'unobserved' | 'keepalive';

interface Departure {
  /** The page is going away or the screen is unmounting: whatever is open ends here. */
  leaving: boolean;
  via: SendVia;
}

const STAYING: Departure = { leaving: false, via: 'mutation' };

/**
 * Logs loop practice for the song page: feeds the player's status, the loop
 * being practiced and the speed to the session tracker (sessionTracker.ts has
 * the rules), and sends each session that ends.
 *
 * - While the page is on show a session goes through the usual mutation.
 * - From a hidden page or `pagehide` it goes with `keepalive`, which the
 *   browser finishes after the page has gone. iOS often hides a page without
 *   ever firing `pagehide`, so both are listened to; whichever comes first
 *   ends the session and the other finds nothing left to send.
 * - Every session is put in the device's outbox before it is sent, so one
 *   that never got an answer (offline, a page closed mid-send) is sent again
 *   at the next start (useOutboxReplay). Offline the mutation waits for the
 *   connection (`waiting`) rather than failing, and a keepalive isn't tried.
 * - A send the server refused is kept (`unsaved`) for `retryUnsaved`. Sending
 *   a session again is safe: its id is the row's.
 */
export function usePracticeTracker(
  player: PlayerService | null,
  snapshot: Pick<PlayerSnapshot, 'status' | 'speedRatio'>,
  activeLoopId: string | null,
) {
  const auth = useAuth();
  const user = useSignedInUser();
  const queryClient = useQueryClient();
  const { mutateAsync: logSession } = useLogSession();

  const tracker = useRef<TrackerState>(null);
  const [lastLogged, setLastLogged] = useState<SessionRecord | null>(null);
  const [unsaved, setUnsaved] = useState<SessionRecord[]>([]);
  // Sent through the mutation and not answered yet: offline, these are waiting for the connection.
  const [waiting, setWaiting] = useState<SessionRecord[]>([]);

  const { status, speedRatio } = snapshot;
  const userId = user.id;
  // What the page-level listeners read: they outlive the render that set them up.
  const latest = useRef({ loopId: activeLoopId, status, speedRatio });
  // Held here because `pagehide` can't wait for anything, the session included.
  const accessToken = useRef(auth.session?.access_token ?? null);
  useEffect(() => {
    accessToken.current = auth.session?.access_token ?? null;
  }, [auth.session]);
  // A keepalive's answer can arrive after the screen has gone (hidden, back, then another route).
  const screenGone = useRef(false);

  /** Through the mutation, for a page that is staying. */
  const sendNow = useCallback(
    (record: SessionRecord) => {
      setWaiting((records) => withRecord(records, record));
      // The promise, not mutate()'s callbacks: those only run for the latest call,
      // and two sessions can be on their way at once (a retry of several, say).
      logSession(record).then(
        (result) => {
          setWaiting((records) => withoutRecord(records, record));
          setUnsaved((records) => withoutRecord(records, record));
          if (result === 'logged') setLastLogged(record);
        },
        () => {
          setWaiting((records) => withoutRecord(records, record));
          setUnsaved((records) => withRecord(records, record));
        },
      );
    },
    [logSession],
  );

  /** With `keepalive`, for a page that is hidden or going away. */
  const sendOnExit = useCallback(
    (record: SessionRecord, token: string) => {
      void logSessionOnExit(token, userId, record).then((result) => {
        // Only reached when the page lived on: a hidden tab that came back.
        // `loopGone` needs nothing: the loop's history went with it.
        if (result === 'failed') {
          // The hook's own mutation observer went with the screen; see `unobserved`.
          if (screenGone.current) void logSessionUnobserved(queryClient, userId, record);
          else sendNow(record);
          return;
        }
        void removeOutboxEntry(record.id);
        if (result === 'logged') {
          sessionLogged(queryClient, userId, record);
          setLastLogged(record);
        }
      });
    },
    [queryClient, sendNow, userId],
  );

  const send = useCallback(
    (record: SessionRecord, via: SendVia) => {
      // Kept on the device first, started here in the same task: a page going away may
      // run nothing after this handler, and the next start sends what it finds.
      void queueSession(userId, record);
      const token = accessToken.current;
      if (via === 'unobserved') {
        void logSessionUnobserved(queryClient, userId, record);
      } else if (via === 'keepalive' && token !== null && isOnline()) {
        sendOnExit(record, token);
      } else {
        // Also with no token to build a keepalive request with, and offline, where a
        // keepalive can only fail: the mutation waits for the connection instead.
        sendNow(record);
      }
    },
    [queryClient, sendNow, sendOnExit, userId],
  );

  /** Shows the tracker where things stand now, and sends the session that ended, if one did. */
  const sync = useCallback(
    ({ leaving, via }: Departure) => {
      const hidden = document.visibilityState === 'hidden';
      const step = observe(
        tracker.current,
        {
          now: Date.now(),
          loopId: leaving ? null : latest.current.loopId,
          phase: trackerPhase(latest.current.status, hidden),
          speedRatio: latest.current.speedRatio,
        },
        { newId: randomUuid, minPlaySeconds: sessionMinPlaySeconds() },
      );
      tracker.current = step.state;
      // A hidden page may never run another line, so nothing sent from it can wait for an answer.
      if (step.ended) send(step.ended, hidden ? 'keepalive' : via);
    },
    [send],
  );

  // Every change the tracker cares about. The loop and the speed arrive in one
  // render when "Play loop" switches loops, so the tracker sees them together.
  useEffect(() => {
    latest.current = { loopId: activeLoopId, status, speedRatio };
    sync(STAYING);
  }, [activeLoopId, status, speedRatio, sync]);

  useEffect(() => {
    if (!player) return;
    return player.on('loopWrapped', () => {
      // Like its time, a pass played to a hidden page isn't practice: on a laptop the
      // loop plays on in a background tab, under a session still too short to have ended.
      if (document.visibilityState === 'hidden') return;
      tracker.current = countRepeat(tracker.current);
    });
  }, [player]);

  // Through a ref, so the listeners below are set up once: their cleanup ends
  // the open session, which must only happen when the screen really goes.
  const latestSync = useRef(sync);
  useEffect(() => {
    latestSync.current = sync;
  }, [sync]);

  useEffect(() => {
    const onVisibilityChange = () => latestSync.current(STAYING);
    const onPageHide = () => latestSync.current({ leaving: true, via: 'keepalive' });
    // Back from the back/forward cache, the player still there: carry on as a new session.
    const onPageShow = () => latestSync.current(STAYING);
    screenGone.current = false;
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      // The screen is unmounting (another route, or another song): the app
      // lives on, but this hook's mutation observer is going with the screen.
      latestSync.current({ leaving: true, via: 'unobserved' });
      screenGone.current = true;
    };
  }, []);

  const retryUnsaved = useCallback(() => {
    for (const record of unsaved) sendNow(record);
  }, [sendNow, unsaved]);

  return { lastLogged, unsaved, waiting, retryUnsaved };
}

function withRecord(records: SessionRecord[], record: SessionRecord): SessionRecord[] {
  return records.some((kept) => kept.id === record.id) ? records : [...records, record];
}

function withoutRecord(records: SessionRecord[], record: SessionRecord): SessionRecord[] {
  return records.some((kept) => kept.id === record.id)
    ? records.filter((kept) => kept.id !== record.id)
    : records;
}

export type PracticeTracker = ReturnType<typeof usePracticeTracker>;
