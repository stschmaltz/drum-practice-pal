# Unit 20: Loose ends

## Batch 2

### Build

Items 13.23 and 14.6 of `docs/loose-ends.md`: "Queued practice is never dropped".

**Summary**

- **13.23.** `sendRefreshingToken` (every queued write goes through it: session logs, loop edits, a song's played time) now asks `supabase.auth.getSession()` before it sends. With no session in memory while one is still in storage (supabase-js's refresh of an expired token failed for the connection) it sends nothing and throws `SessionNotLoadedError`, which `isNetworkFailure` counts as the connection's failure. So the write's retries wait, the optimistic value stays, the outbox entry stays, and nothing goes out signed as `anon`. Each retry asks `getSession()` again, which is also what makes supabase-js try its refresh again, so a retry changes what was wrong. With no session stored either (signed out) the write goes to the server as before and its refusal is final. A real refusal (a missing grant, a check) is untouched: it still fails and rolls back.
- **14.6.** `removeOutboxEntry` deletes the row first and forgets the id after, so a replay whose read found the row before the delete landed still sees the id as this page's and leaves it. Two cases the plain reorder would have got wrong are handled: a row that could not be deleted keeps its id claimed (this page never replays an answered write; the next page sends it once more, harmless as before), and an id queued again while its last removal is still deleting is not forgotten by that removal (each claim has a number; the removal forgets only the claim it saw).

**Walk-through** (`docs/product.md`)

- Day one with a song: signed in with a session in memory, the only change is one awaited `getSession()` (answered from memory) before a write. Nothing new on screen, no new step.
- Missing a piece (no tab, no loops): the only queued write such a song has is its played time (`songPlayed.ts`), which takes the same path and is held back the same way.
- Offline at the jam space: the write is paused by TanStack Query as before and `sendRefreshingToken` isn't reached. On reconnect with an expired token, `getSession()` refreshes it before the send; if that refresh fails for the connection (a captive portal, one bar of signal) the write waits for its next retry rather than being dropped, which is the bug.

No forced order, no chore, nothing a user does differently.

**Files touched**

- `src/lib/network.ts`: `SessionNotLoadedError`; `isNetworkFailure` takes it
- `src/lib/tokenRefresh.ts`: the session check before the first send
- `src/features/offline/outbox.ts`: claims by number; removal forgets after the delete
- `src/test/fakeSupabase.ts`: `auth.getSession` (a signed-in session unless scripted), reset in `resetFakeSupabase`
- Tests: `src/lib/tokenRefresh.test.ts`, `src/features/offline/queuedWrites.test.tsx`, `src/features/offline/offlineStore.test.ts`
- `AGENTS.md`: two sentences in the "Queued" bullet of PWA and offline

**Decisions**

- The held-back write is a class of its own in `network.ts`, recognised by `isNetworkFailure`, not a `TypeError` in disguise: `failureCopy` then says "connection" for it with no extra case, and `retryNetworkFailures` needs no change.
- Storage is read after `getSession()` answers, not before. A refresh the server refused removes the stored session while `getSession()` is answering; read first, that would hold back for ever a write that should be refused.
- `getSession()` throwing is treated like "no session": held back while one is stored, sent otherwise. A throw must not turn into a dropped write.
- Only the first send is checked. The second send follows a `refreshSession()` that succeeded, so a session is in memory.
- The keepalive session log (`keepaliveInsert`) is not changed: it carries the token it was handed from `useAuth().session` and never goes through supabase-js, so it can't go out as `anon`.

**Async windows and inputs**

- _`getSession()` pending before a send_ (new; instant with a session in memory, up to supabase-js's own refresh retries with an expired token and a bad connection).
  - Another queued write of the same loop: waits behind this one (loop edits share a `scope`); session logs each ask for themselves.
  - Sign-out pressed: off, as the mutation is pending (`useHasUnsentWrites`), unchanged.
  - A sign-out forced by the server (refresh refused): storage is emptied, so the check finds no stored session, the write is sent and refused, and the device is being emptied anyway.
  - Going offline: `getSession()` fails for the connection, the write is held back and its retry pauses until online.
  - The page hidden or closed: the outbox entry was put in `onMutate` before any of this, so the next start replays it.
  - The screen unmounting: nothing here is tied to a component.
- _Between `getSession()` answering "session" and the request leaving_: supabase-js asks for the session again itself when it builds the request. A refresh failing for the connection inside that gap needs the token to expire in the same instant; the request then goes as `anon` as before. Not closed (see Known gaps).
- _The outbox row's delete pending in `removeOutboxEntry`_ (was there, now the id is held across it).
  - A replay's read that started before the removal, or after it: gets nothing (two tests).
  - The same id queued again: stays claimed, the row is there after both settle (test).
  - The delete failing: the id stays claimed (test).
  - Sign-out's `clearOfflineData`: removes the row either way; the id left in the map is of no consequence, as ids are never reused across users.

**Known gaps**

- The gap between the check and supabase-js's own read of the session, above. Closing it means signing the request with the token in hand instead of letting supabase-js fetch it, which is a change to every queued write's API function and not in this batch.
- Queries sent with no session in memory still go as `anon` and come back empty under RLS (the second half of bug hunt D4). Not in 13.23's fix.
- A held-back write retries at 1, 2, 4, … 30 s for as long as the session can't be refreshed. That is the same as a dropped request today, and sign-out stays off meanwhile (the open "Sign out anyway" question in the plan).
- Not run: any real device, Safari or Firefox. The e2e run was `offline.spec.ts` on phone and desktop only (12 passed); no e2e case makes supabase-js lose its session mid-run.

**How to verify**

- `npm run check` (green: 5618 tests).
- `npx vitest run src/lib/tokenRefresh.test.ts src/features/offline/offlineStore.test.ts src/features/offline/queuedWrites.test.tsx`. Each new test was seen failing before its fix, except "queued again while its last removal is on its way", which passes on the old code and guards the reorder.
- `E2E_PORT=4383 npx playwright test tests/e2e/offline.spec.ts --project=phone --project=desktop`.
- By hand (not run by Build), on the dev server: sign in, open a loop, set the stored session's `expires_at` in localStorage to the past and reload with the auth endpoint blocked (DevTools request blocking on `/auth/v1/token`) but REST allowed; change the loop's speed. Before: a 401/42501 on the PATCH and the speed snaps back. Now: no PATCH leaves, the speed stays, and it lands once the block is lifted.

### Test

Tests for 13.23 and 14.6 through the real hooks, the replay and one e2e case. No app code changed. No bugs found.

**Per acceptance line**

- _A session log or loop edit queued while the token could not be refreshed is still in the outbox and lands once after the connection is back, with nothing sent as `anon`._
  - `usePracticeTracker.test.tsx`, "with no session in memory, one still stored": a stop (nothing sent, not in `unsaved`, in `waiting`, in the outbox, then logged once); a hidden page (the keepalive with the stale token gets a 401, its fallback is held back, logged once when the page is back); a session that ends as the screen unmounts (`logSessionUnobserved`).
  - `LoopSpeedControl.test.tsx` (the control over `useSaveLoopSpeed`): a nudge sends nothing, shows no "Couldn't save the speed" alert, keeps 85% on show and in the cache, and is saved once; two nudges while the first is held back go in order, the last kept.
  - `songPlayed.test.tsx`: the played time stays on show and in the outbox, and is sent once.
  - `queuedWrites.test.tsx`, "window by window": a second edit waits behind a held-back one (it asks for no session of its own); going offline while held back pauses the retries, and it lands once; "replayed from an earlier page": a session, a loop edit and a played time written straight to `offlineDb.outbox`, replayed under StrictMode with the session missing, all stay in the outbox with nothing sent and land once each.
  - `tokenRefresh.test.ts`: a token refusal whose refresh found no connection, then no session at the next try, sends nothing more until the session is back; a stored value that isn't a session holds nothing back.
  - e2e, `offline.spec.ts`, "with the access token expired and its refresh failing" (phone and desktop): the real supabase-js with the stored token expired and `/auth/v1/token` aborted. A loop speed typed meanwhile sends no PATCH for the 25 s supabase-js spends retrying and after it gives up; no alert, 80% on show, one outbox entry, the database still at 100%. With the refresh let through there is exactly one PATCH, signed as `authenticated`, and the outbox empties. Without the session check this test fails on a PATCH whose bearer is the publishable key, which is the bug.
- _A write the server truly refuses (a missing grant) still fails and rolls back._ A 42501 with a session in memory (and one stored): the tracker keeps it for "Try again", sent once, out of the outbox; the speed control shows its alert and the cached speed goes back while the playing speed stays; `useUpdateLoop` and `useLogSession` fail after one send; a replayed edit rolls back and leaves the outbox.
- _A server-forced sign-out during the `getSession()` wait._ `tokenRefresh.test.ts` and `queuedWrites.test.tsx` hold `getSession`, empty storage, then answer "no session": the write is sent, refused and rolled back, not held.
- _Sign-out stays off while a write is held back._ `SignOutButton.test.tsx` with a real `useLogSession` write held back: disabled with its note between tries, a press refused, enabled and working once the write has landed. `useHasUnsentWrites` / `hasUnsentWrites` are also asserted in the tracker, loop edit, played and replay tests.
- _An outbox removal can't be replayed._ `queuedWrites.test.tsx`, "while an answered write is being taken out": a replay mounted under StrictMode while the answered row's delete is held sends nothing again; a row whose delete failed is not sent again by a replay on this page. `usePracticeTracker.test.tsx`, "queued again while its last outbox removal is on its way": a keepalive refused, its fallback refused, "Try again" refused with its removal held after the delete, "Try again" once more; the entry stays this page's, a replay mounted then sends nothing, and the last retry logs it.

**Checked by breaking the code** (each restored)

| Break                                                    | Tests that failed                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| No session check in `sendRefreshingToken`                | 22 across the six unit files, and the e2e case (an anon PATCH)      |
| Storage read before `getSession()`                       | the two forced sign-out tests                                       |
| `isNetworkFailure` without `SessionNotLoadedError`       | 16: every "held back" test                                          |
| "No session" whenever one is stored (holds everything)   | 15, the 42501 tests among them                                      |
| `removeOutboxEntry` forgets the id first (the old order) | the StrictMode replay test, the failed-delete test, and Build's two |
| Forgets after the delete whatever the claim              | the tracker's "queued again" test and Build's                       |
| A failed delete forgets the id                           | the failed-delete test and Build's                                  |

A test of a loop edit answered while a replay reads passed with the old order too (the replay drops an entry this page has edited since, `editsMadeSince`), so it was removed.

**Seen while testing** (none is a regression)

- A held-back write on a hidden page is not retried until the page is shown: TanStack Query waits for focus between retries. The same holds for a dropped request. The outbox still has it for the next start.
- With the real client a held-back write's try takes about 25 s (auth-js retries its refresh inside `getSession()`), then the 1, 2, 4 s back-off. After the connection returned the e2e write landed within about 15 s.
- A row whose delete failed keeps `useHasUnsentWrites` true on that page, so Sign out stays off until the next start, which replays it. It was the same before this batch (the row was left then too).

**Not covered**

- The gap Build names between the check and supabase-js's own read of the session.
- Safari, Firefox, a real device. The e2e ran on Chromium, phone and desktop projects.

**How to verify**

- `npm run check`.
- `E2E_PORT=4383 npx playwright test tests/e2e/offline.spec.ts --project=phone --project=desktop` (14 passed; the new case takes about 100 s).
