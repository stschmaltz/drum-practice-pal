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
