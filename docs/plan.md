# Drum Practice App: Project Plan

Source doc: https://claude.ai/artifact/SAx3ua9hELu16AjJQcbPbo (Nov 22, 2026). This file is the in-repo copy agents read.

## Vision and MVP scope

A tab-first drum practice tool: upload a Songsterr Guitar Pro export once, then jump straight into saved loops at your saved speed, on phone, tablet or laptop. No original audio; playback is the file's synth tracks plus a metronome.

**In the MVP**

- Accounts and sync across phone, tablet and laptop
- Upload .gp files into a song library
- Jam mode: whole song, follow cursor, read-along while jamming
- Loop practice: saved bar ranges with a name, current speed and target speed
- Speed shown as both % and BPM, editable either way
- Session log per loop, so progress has a history
- Loop states: active and finished, reopenable, history kept either way
- Playback controls in both modes: metronome with volume, mute drums, drums only (mute every other track), count-in (off / 1 bar / 2 bars, at start only or before every repeat)
- Keyboard shortcuts, which also gives Bluetooth page-turner pedal support
- Installable PWA with offline playback of cached songs

**Out of the MVP**

- Original audio or audio sync
- Auto speed trainer
- Stats charts and streaks
- Setlists
- Editing tabs

## Key decisions

| Area          | Decision                                                                                                                             | Why                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Frontend      | Vite + React + TypeScript SPA, React Router, Tailwind                                                                                | No SSR needed; React has the deepest agent and library support          |
| Tab engine    | alphaTab (`@coderline/alphatab`) with its Vite plugin                                                                                | Parses .gp, renders drum notation, plays, loops, speed, mute, metronome |
| Server state  | TanStack Query                                                                                                                       | Caching, optimistic updates, retry for flaky Wi-Fi                      |
| Backend       | Supabase: Postgres, magic-link auth, Storage, RLS                                                                                    | Relational data fits; files and auth in one place; local CLI for tests  |
| Offline       | vite-plugin-pwa (Workbox) + Dexie over IndexedDB                                                                                     | Cached .gp files, offline playback, queued session writes               |
| Tests         | Vitest + Testing Library; Playwright with phone, tablet, desktop profiles                                                            | Unit, component and e2e across all three device sizes                   |
| Hosting       | Cloudflare Workers (static assets)                                                                                                   | Free, fast, static SPA                                                  |
| Speed model   | Store `speed_ratio`; derive BPM from the tempo at the loop's first bar                                                               | Songs can change tempo mid-song, so one BPM per song is wrong           |
| Loop states   | `active` or `finished`, reopenable, history always kept                                                                              | Shows what's on the go and what you've done                             |
| Layout        | alphaTab page layout at 768 px and up; horizontal scroll below                                                                       | A full page of drum notation doesn't fit a portrait phone               |
| Count-in      | Custom scheduler on top of alphaTab playback events                                                                                  | Built-in count-in doesn't cover "before every repeat"                   |
| Test fixtures | Synthetic files generated from alphaTex and exported to GP7 by alphaTab, committed; real Songsterr exports kept local and gitignored | Deterministic tests without committing copyrighted tabs                 |
| Input formats | Guitar Pro (.gp, .gpx, .gp3-5). Not MIDI                                                                                             | alphaTab imports GP, MusicXML and alphaTex; it only exports MIDI        |

## Data model

Four tables, all owned by `user_id` with row-level security. Files live in Storage at `gp-files/{user_id}/{song_id}.gp`.

**songs**

| Field                  | Type          | Notes                             |
| ---------------------- | ------------- | --------------------------------- |
| id                     | uuid          | PK                                |
| user_id                | uuid          | FK auth.users                     |
| title, artist          | text          | Read from the file, editable      |
| file_path              | text          | Storage path                      |
| file_hash              | text          | SHA-256, blocks duplicate uploads |
| original_tempo         | numeric       | BPM at bar 1                      |
| bar_count              | int           | From the score                    |
| drum_track_index       | int, nullable | Detected percussion track         |
| created_at, updated_at | timestamptz   |                                   |

**loops**

| Field                  | Type                       | Notes                                         |
| ---------------------- | -------------------------- | --------------------------------------------- |
| id                     | uuid                       | PK                                            |
| user_id, song_id       | uuid                       | FKs; delete song cascades                     |
| name                   | text                       | "Chorus fill"                                 |
| start_bar, end_bar     | int                        | 1-based, inclusive, start <= end <= bar_count |
| speed_ratio            | numeric                    | Current speed, 0.25 to 2.0, default 1.0       |
| target_ratio           | numeric, nullable          | Goal speed                                    |
| status                 | enum `active` / `finished` |                                               |
| finished_at            | timestamptz, nullable      | Set on finish, cleared on reopen              |
| last_practiced_at      | timestamptz, nullable      | Denormalized for the "on the go" list         |
| created_at, updated_at | timestamptz                |                                               |

**practice_sessions**

| Field            | Type        | Notes                                                      |
| ---------------- | ----------- | ---------------------------------------------------------- |
| id               | uuid        | PK, generated client-side so offline writes are idempotent |
| user_id, loop_id | uuid        | FKs; delete loop cascades                                  |
| started_at       | timestamptz |                                                            |
| duration_seconds | int         | Playback time only                                         |
| speed_ratio      | numeric     | Speed at the end of the session                            |
| repeats          | int         | Loop passes completed                                      |

**user_settings**

| Field                          | Type                          | Notes     |
| ------------------------------ | ----------------------------- | --------- |
| user_id                        | uuid                          | PK        |
| metronome_on, metronome_volume | bool, numeric                 |           |
| count_in_bars                  | int                           | 0, 1 or 2 |
| count_in_mode                  | enum `start` / `every_repeat` |           |
| drums_muted_default            | bool                          |           |

**Rules**

- Displayed BPM = `speed_ratio` x tempo at `start_bar` (jam mode uses the current bar). Editing BPM writes back a ratio.
- A session is logged when loop playback stops after at least 30 seconds of play time (tunable constant).
- Reaching `target_ratio` prompts "Mark finished?"; it never finishes a loop automatically.
- A song is "in progress" when any of its loops is active; this is derived, not stored.

## Agent workflow

Every unit runs through five agents in order, each starting cold and picking up from files in the repo, not chat history.

1. **Build**: implements the unit to its acceptance criteria.
2. **Test**: writes tests that prove each criterion.
3. **QA**: runs the app at phone, tablet and desktop sizes and tries to break it.
4. **Readability**: refactors for clarity with no behavior change.
5. **Review**: reviews the full branch diff at PR-reviewer level (ignored errors, pagination, partial failures, test teardown) and fixes what it confirms.

If QA finds a real bug, a Build agent fixes it from QA's notes, then Test and QA re-run on the affected area before Readability. Merge after Review with all checks green.

**Repo conventions**

- `AGENTS.md` at the root: stack, commands, folder structure, naming and patterns. Later units update it when a pattern is set.
- `docs/units/NN-name.md`: one handoff note per unit. Each agent appends its own section: what it did, decisions, open issues, how to verify.
- One branch and one PR per unit; one commit per stage.
- Every stage ends green: `npm run check`, and `npm run e2e` once e2e covers real flows.
- An open issue that a stage hands to a later unit gets a line in that unit's **Carried forward** list below, with the note it came from. Handoff notes are long; a later agent shouldn't have to find the issue by rereading all of them. The unit that picks an item up deletes its line.
- **Human check** items are for Shane on a real device (mostly iOS audio). Agents can't hear playback.

**Prompt templates** (swap in the unit number and name)

```text
BUILD: You are the Build agent for Unit NN: <name>. Read AGENTS.md, the Unit NN section of docs/plan.md, and earlier notes in docs/units/. Implement only this unit's scope and meet every acceptance criterion. Add unit tests for any pure logic you write. Finish with typecheck, lint and tests green. Create docs/units/NN-<name>.md with a Build section: summary, files touched, decisions, known gaps, manual verify steps. Don't start the next unit.
```

```text
TEST: You are the Test agent for Unit NN: <name>. Read the Unit NN section and docs/units/NN-<name>.md. Write tests that prove each acceptance criterion: Vitest for logic, Testing Library for components, Playwright across phone, tablet and desktop profiles for user flows. Test behavior, not implementation. Don't change app code except adding test ids. Fix a bug only if the fix is a few lines; log anything bigger under Bugs found. Append a Test section to the handoff note.
```

```text
QA: You are the QA agent for Unit NN: <name>. Run the app against local Supabase. Walk every acceptance criterion and the unit's QA focus at 390x844, 820x1180 and 1440x900, saving Playwright screenshots to docs/units/NN-shots/. Try edge cases, bad input, slow network and offline. Append a QA section: pass or fail per criterion, issues with repro steps, severity. Fix only cosmetic issues yourself.
```

```text
READABILITY: You are the Readability agent for Unit NN: <name>. Read AGENTS.md and the handoff note. Refactor this unit's code for clarity with zero behavior change: naming, file placement per AGENTS.md, small focused functions, shared helpers, dead code removed, comments only where the why isn't obvious, consistency with earlier units. All checks green before and after. Update AGENTS.md if you set a new pattern. Append a Readability section.
```

```text
REVIEW: You are the Review agent for Unit NN: <name>. Read AGENTS.md and the handoff note, then every line of git diff main...HEAD, tests and scripts included. Review as a strict PR reviewer: ignored errors, pagination, partial failures, test teardown, races, leaks, 1-based vs 0-based bars, anything that breaks AGENTS.md. Verify each finding before acting. Fix what is small and in scope; log the rest under Open issues, and add a Carried forward line to the unit of docs/plan.md that should own it. All checks green after. Append a Review section.
```

## Units of work

Fourteen units, run in order. Each is sized for one Build agent session. Unit 01 proves the audio stack on real devices before anything is built on it.

Handoff notes written before the Visual design unit was added call the release unit "Unit 12". It is Unit 13 now.

| #   | Unit                                       | Depends on |
| --- | ------------------------------------------ | ---------- |
| 00  | Scaffold, conventions, CI, preview deploys |            |
| 01  | Spike: alphaTab on real devices            | 00         |
| 02  | Supabase schema, auth, storage             | 00         |
| 03  | App shell and auth UI                      | 02         |
| 04  | Song library and upload                    | 03         |
| 05  | Player core                                | 01, 04     |
| 06  | Jam mode                                   | 05         |
| —   | Hosted setup (configuration, not a unit)   | 05         |
| 07  | Count-in                                   | 05, hosted |
| 08  | Loops                                      | 06, 07     |
| 09  | Practice sessions and progress             | 08         |
| 10  | Keyboard shortcuts and pedals              | 09         |
| 11  | PWA and offline                            | 09         |
| 12  | Visual design                              | 11         |
| 13  | Polish and release                         | all        |

### 00 Scaffold, conventions, CI, preview deploys

**Goal:** an empty app that builds, tests and deploys, with conventions every later agent follows.

- Vite + React + TS (strict), React Router, Tailwind, TanStack Query, ESLint, Prettier
- Vitest + Testing Library, Playwright with phone (390x844), tablet (820x1180) and desktop (1440x900) projects
- Folder structure per `AGENTS.md`
- Fixture script: alphaTex sources exported to GP7 via alphaTab: a 16-bar 4/4 groove at 120 BPM; a tempo change (120 to 90 at bar 9); multi-track (drums, bass, guitar); a 3/4 song
- `AGENTS.md`, `docs/plan.md`, `docs/units/`
- GitHub Actions: typecheck, lint, unit tests, e2e on PRs. Cloudflare Workers Builds preview deploy per PR (was Pages; see docs/units/00-scaffold.md)

**Acceptance:** fresh clone runs with `npm i && npm run dev`; all scripts pass; a PR gets a preview URL; fixtures regenerate with one command.

**Test focus:** a smoke test per tool. **QA focus:** preview URL loads at all three sizes.

### 01 Spike: alphaTab on real devices

**Goal:** prove the audio stack before building on it. Output is a findings note plus player code worth keeping.

- A `/spike` route: load a fixture, render drum notation, play, loop bars 5 to 8, speed 25% to 200%, mute the drum track, metronome on/off
- Try the default soundfont and at least one alternative with better drums; pick one
- Test page layout vs horizontal layout at each size
- Record: iOS audio unlock behavior, start latency, loop seam quality, memory with the multi-track fixture

**Acceptance:** findings note answers: which soundfont, which layout per breakpoint, iOS workarounds needed, whether count-in can hook playback events cleanly. Go/no-go on alphaTab.

**Test focus:** light. **QA focus:** all controls at all three sizes. **Human check:** play it on phone, tablet and laptop; listen to the loop seam and drum sound. Skip Readability; Unit 05 cleans up kept code.

### 02 Supabase schema, auth, storage

**Goal:** the backend from the Data model section, versioned and testable locally.

- Migrations for `songs`, `loops`, `practice_sessions`, `user_settings`, enums, cascades, check constraints (bar range, ratio bounds, count-in values)
- RLS: every table scoped to `auth.uid()`; Storage bucket `gp-files` with per-user path policies
- Magic-link auth; `user_settings` row created on signup (trigger)
- Generated TypeScript types committed; seed script with a demo user, songs and loops

**Acceptance:** `supabase start` + migrations + seed run clean; user A can't read or write user B's rows or files.

**Test focus:** RLS and constraint tests against local Supabase. **QA focus:** reset and reseed from scratch; inspect policies.

### 03 App shell and auth UI

**Goal:** a signed-in shell to hang features on.

- Routes: `/login`, `/` (On the go), `/library`, `/songs/:id`, `/settings`; SPA fallback already handled by `not_found_handling` in `wrangler.jsonc`
- Magic-link login, sign-out, auth guard, session refresh
- Responsive nav: bottom tabs on phone, sidebar on tablet and desktop
- Typed Supabase client and a query-hook pattern in `src/lib` that later units copy; documented in `AGENTS.md`
- Settings page reading and writing `user_settings`

**Acceptance:** change a setting on one device, see it on another after refresh; signed-out users land on `/login`.

**Test focus:** auth guard, settings round trip, hook pattern. **QA focus:** nav at all sizes, expired sessions.

### 04 Song library and upload

**Goal:** get files in and find them again.

- Upload .gp, .gp5, .gpx (and .gp3/.gp4) by picker and drag-and-drop; reject MIDI with a message pointing to Songsterr's Guitar Pro export
- Parse in-browser with alphaTab: title, artist, tempo at bar 1, bar count, percussion track index
- SHA-256 hash; duplicate upload warns and offers to open the existing song
- Upload to Storage, insert row; roll back the file if the insert fails
- Library: search title or artist, sort by recently practiced or added; edit title and artist; delete with confirm (removes file, loops, sessions)

**Acceptance:** a Songsterr GP export uploads with correct metadata; a non-GP or corrupt file shows a clear error and creates nothing; a file with no drum track uploads with `drum_track_index` null and a note in the UI.

**Test focus:** metadata per fixture, dedupe, rollback, delete cascade. **QA focus:** big files, slow network, cancel mid-upload, phone file picker.

### 05 Player core

**Goal:** one player module every screen uses.

- `PlayerService` wrapping alphaTab: load, render, play, pause, stop, seek to bar, set range, loop on/off, speed, metronome volume, track mute; typed events (position, bar changed, loop wrapped, finished)
- `usePlayer` hook; shared controls bar: play/pause, speed, metronome toggle and volume, drums mute
- Layout per breakpoint and the soundfont from Unit 01; iOS audio unlock on first tap
- Screen Wake Lock while playing
- Defaults from `user_settings`

**Acceptance:** speed, mute and metronome change live without restarting playback; the service disposes cleanly on route change.

**Test focus:** service state machine with alphaTab mocked; controls bar tests. **QA focus:** rapid toggling, switching songs mid-play, rotation. **Human check:** sound and responsiveness on each device.

### 06 Jam mode

**Goal:** read along with the whole song.

- Song page opens in jam mode: full score, follow cursor, auto-scroll
- Tap or click a bar to seek
- Header: song, current % and BPM (ratio x tempo at the current bar)
- Speed resets to 100% on open

**Acceptance:** cursor stays in view at every size and through tempo changes; seeking lands on the tapped bar.

**Test focus:** BPM-at-bar helper against the tempo-change fixture; seek. **QA focus:** long songs, scroll fighting the cursor, landscape phone.

### Hosted setup (before Unit 07)

**Goal:** the app runs on an HTTPS preview URL against a hosted Supabase project, so the iOS audio checks can happen before count-in is built on that audio. Moved here from the release unit. It is configuration, not a unit: no Build, Test, QA pipeline. Creating the project and entering its settings need Shane's Supabase and Cloudflare accounts; an agent can prepare the values and verify the result.

- Production Cloudflare Workers: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as Workers Builds variables. Until then every preview shows the "not connected" message. Decide whether previews share the production project
- Hosted Supabase project: apply the migrations, and settle how later migrations reach it (by hand with `supabase db push`, or from CI on merge)
- Hosted auth settings. `supabase/config.toml` only configures the local stack, so each of these is set again on the project: Site URL and redirect allow-list for the production and preview Workers hosts; the sign-in email template with the 6-digit code; a real SMTP sender (the built-in one is rate-limited and meant for testing)
- Close password sign-up, which is open and auto-confirmed with the local settings: turn on email confirmations, and consider turning sign-ups off once the account exists

**Acceptance:** a preview URL signs in with an emailed code on an iPhone and plays a song. Then the Unit 01 and Unit 05 rows of Open human checks are done.

### 07 Count-in

**Goal:** the count-in options from the MVP scope.

- Off, 1 bar, 2 bars; at start only, or before every loop repeat
- Clicks follow the meter and the tempo at the start bar x current speed; accented first beat
- Scheduled on the AudioContext clock; playback resumes on the downbeat
- Big visual beat counter, readable from the throne
- `user_settings` defaults, overridable from the controls bar
- Drums only: a toggle beside Mute drums that mutes every track except the drum track, to hear the part on its own. `PlayerService.setTrackMuted` already mutes any track, so this is a service method and a button. The two toggles exclude each other, it is off on open, it is disabled for a song with no drum track, and it changes live like the other options

**Acceptance:** count-in matches meter and speed, including 3/4 and after a tempo change; "every repeat" pauses at loop end, counts in, resumes on the downbeat. With Drums only on, the multi-track fixture plays the drum track alone, and turning it off restores the other tracks without restarting playback.

**Test focus:** pure scheduler function (tempo, meter, ratio, bars to click times), tested exhaustively. **QA focus:** toggling mid-loop, extreme speeds. **Human check:** by ear.

**Carried forward** (all from 01 Findings unless noted)

- Hosted setup and the Unit 01 and 05 rows of Open human checks come first. This unit builds on a provisional go.
- "Every repeat" plays the range with alphaTab's looping off and starts it again after the count-in ("stop on finish"). Pausing at the wrap drops 0.25 to 0.75 s of buffered audio and clips the last bar.
- In that mode alphaTab no longer wraps, so `PlayerService` has to emit `loopWrapped` itself. Unit 09 counts repeats from that event in both modes.
- Call `play()` early by a measured offset (it reports playing 3 to 16 ms later, plus output latency), and put the first click on the beat grid at the predicted end of the pass, not when `finished` arrives.
- Pick the clock and record it in `AGENTS.md`: alphaTab's own `AudioContext` (one clock, but only reachable through the private `api.player.output.context`) or a second context (public API, two clocks). A second context also needs unlocking inside the play tap on iOS.
- `midiEventsPlayed` with the metronome filter reports every beat, even at volume 0. It can drive the visual counter while the song plays.
- Pause, Back to start, seek and leaving the page during a count-in must cancel the clicks already scheduled.
- Count-in bars and mode join `PlayerOptions` and `playerOptionsFromSettings`. (05 Build)

### 08 Loops

**Goal:** save and play practice sections.

- Select a bar range: tap start bar, tap end bar (drag on desktop); highlight it
- Save with name, current speed, optional target speed
- Loop panel: bottom sheet on phone, side panel on tablet and desktop
- Play a loop: sets range, looping and saved speed
- Speed control shows % and BPM, editable either way, with nudge buttons; "Save speed" writes the new current speed
- Edit name, range, target; delete with confirm

**Acceptance:** a saved loop opens on another device at the same range and speed; BPM shown equals ratio x tempo at the loop's first bar.

**Test focus:** ratio and BPM helpers, range validation, loop hooks. **QA focus:** selecting on a phone, ranges across tempo changes, single-bar loops.

### 09 Practice sessions and progress

**Goal:** remember what you practiced and what's on the go.

- Session tracker: play time and loop passes; logs on stop after 30+ seconds or on leaving the page; updates `last_practiced_at`
- Loop history: date, duration, speed
- Hitting target speed prompts "Mark finished?"
- Finish and reopen loops; history kept
- Home (On the go): active loops by last practiced, with song, current and target speed, last date; one tap into practice. Finished tab beside it

**Acceptance:** a minute of practice creates one session with the right speed and duration; finish and reopen move the loop between tabs.

**Test focus:** tracker logic with fake timers; status transitions. **QA focus:** closing mid-session, speed changes mid-session, many loops.

### 10 Keyboard shortcuts and pedals

**Goal:** hands-free-ish control from a laptop or page-turner pedal.

- Space play/pause; up/down speed +/-5%; left/right and PageUp/PageDown previous/next loop; M metronome; D drums mute; S drums only; C cycle count-in; ? overlay
- Ignored while typing in inputs

**Acceptance:** every shortcut works in jam and loop modes; a pedal sending PageUp/PageDown or arrows switches loops.

**Test focus:** key mapping and input guard. **QA focus:** focus traps, open modals. **Human check:** a real pedal.

### 11 PWA and offline

**Goal:** works at the jam space with bad Wi-Fi.

- Manifest, icons, installable on iOS, Android, desktop
- Service worker caches app shell, alphaTab worker files, soundfont
- Opened songs cached in IndexedDB; library and loops readable offline via persisted query cache
- Session logs and speed or status changes queue offline, flush on reconnect, idempotent by client ids
- Offline banner; uploads disabled offline

**Acceptance:** offline, a previously opened song plays its loops and the session syncs after reconnect with no duplicates.

**Test focus:** queue and flush; Playwright offline mode. **QA focus:** dropping offline mid-session, two devices editing one loop. **Human check:** practice in airplane mode on your phone.

**Carried forward**

None left: each item was dealt with in 11 Build or handed to Unit 13 (see docs/units/11-pwa-offline.md, Decisions).

### 12 Visual design

**Goal:** make it look and feel like a finished app. Until here every unit has used plain neutral styling; this unit changes how things look and nothing about what they do.

- Design tokens in the Tailwind theme (colour, type scale, spacing, radius, shadow), replacing the ad hoc classes in `src/components/styles.ts` and the pages
- Identity: name treatment, app icon and theme colour, shared with the PWA manifest from Unit 11
- Every screen redrawn on the tokens: login, On the go, library, song page (jam header, controls bar, loop panel, count-in counter), settings, the shortcut overlay
- Controls bar: icons with labels, and a layout that fits a phone without four rows
- The score: alphaTab's colours, cursor and bar highlight matched to the theme, and a notation size readable from the throne
- Empty, loading and error states designed, not just present; motion kept small and off under `prefers-reduced-motion`
- Kept from earlier units: WCAG AA contrast, 44 px touch targets, visible focus rings

**Acceptance:** every screen and state at all three sizes uses the tokens, with no one-off colours; e2e passes with no change to behaviour; Shane signs off on the screenshots.

**Test focus:** e2e stays green; contrast checks on the token pairs. **QA focus:** before and after screenshots of every screen and state at all three sizes. **Human check:** look and feel on the phone at the kit, in a dim room and a bright one.

**Carried forward**

None left: each item was dealt with in 12 Build or moved to Unit 13 (see docs/units/12-visual-design.md, Carried forward).

### 13 Polish and release

**Goal:** ship it to yourself.

- Check that no screen lacks an empty, loading or error state, and that touch targets are 44 px+ (designed in Unit 12)
- Full e2e journey on all three profiles: sign in, upload, jam, save loop, practice, hit target, finish
- Production release on the hosted project from the Hosted setup step; re-check its auth settings against `supabase/config.toml`
- README

**Acceptance:** the journey passes in CI; a real-device pass finds nothing blocking.

**Test focus:** the e2e journey. **QA focus:** first-run experience. **Human check:** a week of real practice.

**Carried forward**

- From 11: a 401 on a query still isn't treated as signed out (03 QA issue 3). Offline the token question is settled: supabase-js 2.119 never signs out for a refresh that only lacked a network, and an offline start opens on the stored session (`startingAuth`, `readStoredSession`).
- From 11: lost responses on flaky Wi-Fi for uploads (online only): an insert that commits but whose response is lost has its file removed, leaving a listed song with no file; an upload whose response is lost leaves an orphan file. Look the row up by id before rolling back. (04 Review open issues 1 and 2)
- From 11: a loop create is online only and not queued, but a lost response still lets the user's second press of "Save loop" insert a second loop (`LoopEditorForm` makes a new id per press), and a resend of the same id gets an unhandled 23505. Keep one id for the form's lifetime and treat 23505 on that id as saved. (08 Build, 08 Review)
- From 11: `useUpdateSong`'s `onSuccess` merges the whole server row; still unreachable (song edits are online only, one locked form per song). Do as `useUpdateLoop` does if song edits are ever queued. (08 Copilot review, comment 4)
- From 11: the component test for a failed background refetch of a song file (`isLoadingError`), once something refetches it; nothing does (`staleTime: Infinity`, and the file now comes from the device). (05 Review)
- From 11: a device whose clock is more than a day ahead has every session refused (23514), now also on replay from the outbox, which then drops it. Decide whether the client takes its time from the server. (09 Build)
- From 11: a sign-out the server forces (a refused refresh) empties the device, outbox included, so practice not yet sent is lost. One by the user is off while offline and while a queued write is unanswered (11 Review), so on a connection that never answers (a captive portal reporting online) the user can't sign out until the write gives up or lands; decide whether to offer "Sign out anyway" with a warning instead. Entries an earlier page left are covered only once the replay has read them, a fraction of a second after start. (09 Review, 11 Build, 11 QA issue 3, 11 Review)
- From 11: `?loop=<id>` on a connection that hangs without failing opens the loop only when the read gives up (two retries); decide whether to cap the wait. Offline it opens at once from the persisted list (the read is `paused`). (09 QA issue 1)
- From 11: song files kept on the device have no size cap or eviction, and a stored file alphaTab can't read stays stored. A replayed loop edit (an entry whose answer was lost) can overwrite a newer change made on another device. (11 Build)
- Retire the spike: the `/spike` route, `src/features/spike/`, `scripts/spike-measure.ts`, `tests/e2e/spike.spec.ts` and `public/sf-candidates/`. Its fixtures ship in `dist` today. (05 Build)
- Final soundfont, after the Unit 01 listen. A bigger one is precached by the service worker (`soundfont/sonivox.sf2` in `vite.config.ts`'s `globPatterns`; `maximumFileSizeToCacheInBytes` is 4 MB), so budget its size in the first install. (01 Findings, 11 Build)
- Fixed copy for network failures instead of "Failed to fetch". (04 QA issue 2)
- Link inline form errors to their inputs with `aria-describedby`. (04 QA issue 6)
- The score's bar cursor and loop highlight are drawn with `color-mix()` (`index.css`), which Safari before 16.2 drops, leaving both invisible there; decide the oldest iOS to support. Under "reduce motion" the beat cursor still glides (it keeps time); decide whether it should instead sit on each beat's notes (`player.enableAnimatedBeatCursor: false`). (12 Review)
- Speed, metronome and mute stay enabled after a player error. (05 QA issue 3)
- Files in Storage with no songs row are possible (failed rollbacks, deleted users). Add a sweep script, or accept it. (02 QA, 04 Review)
- A bar with a tempo change part-way through shows its starting tempo for the whole bar. No fixture has one. (06 Build)
- If "before every repeat" can't count in for a bar (no usable tempo or meter), the service plays on at once and the engine's stop between passes reads to the session tracker as a stop, so a session would be logged at every pass of 30 seconds or more. No fixture has such a bar; give the tracker a way to tell a pass ending from a pause (`haltRequested`), or prove the case can't arise. (09 Build)
- Loops in a song with a repeat: a loop that starts on the repeat's last bar and runs past it plays the bar before it too (bars 4 to 5 of `repeats.gp` play 4, 3, 4, 5, and the status line says "Bar 3"). Keep it, or start such a loop from the last playthrough of its first bar; `tests/unit/loop-fixtures.test.ts` pins today's behaviour. (08 Test bug 1, 08 QA issue 3)
- Loop failures show the server's own message ("Couldn't save the speed: …"), and with no connection the loop list says "Loading loops…" for about 24 s before its error. Every feature shows `error.message` this way (settings, library, sign-in), and React renders it as text, so do them together with the network copy above. A tap on a bar outside the playing loop does nothing and says nothing (`seekToBar` returns false there since 08 Review; a hint, or leaving the loop, is the open choice). (08 QA issues 9 and 12, 08 Review)
- Before the loops migration (`20261123000000_loops_grants.sql`) is pushed to the hosted project, check for rows its new checks refuse: `select id from songs where title !~ '\S'` and the same for `loops.name`. One blank title makes the migration fail. (08 Review)
- Before the session migration (`20261123010000_session_sanity.sql`) is pushed to the hosted project, check for rows its new check refuses: `select id from practice_sessions where duration_seconds > 86400`. One such row makes the migration fail. (09 Build)
- Time with the page hidden isn't practice time: on a laptop, switching tabs or minimising while a loop plays ends the session there (logged if it has 30 seconds) and a new one starts on return. Right for a phone in a pocket; decide after the week of real practice whether it is right on a laptop. A stop logs a session each time, so one sitting with pauses is several rows in the history; decide whether the history should group them by day. (09 Build)
- "One tap into practice" from the home page is one tap to the song with the loop set up, then Play: the file has to download and audio has to start inside a tap on that page. If that feels like one tap too many, the home page would need the player. (09 Build)
- Finish and reopen failures show the server's own message ("Couldn't change the loop: …"), like the other loop writes; do them with the network copy above. (09 Build)
- Switching loops with a key (or "Play loop") ends the session of the loop left: logged if it has 30 seconds, dropped if not, so a pedal that flips between two loops every few bars logs nothing for either. Decide after the week of practice whether short stretches of several loops should add up. (09 Build, 10 Build)
- A refused "Mark finished" or "Reopen" moves the loop back after focus has followed it to its new place, and focus falls to `<body>`. Shortcut changes (M, D, S, C, the speed keys) aren't announced to a screen reader when focus is elsewhere; a polite live region would do it. (10 Build)
- Two tabs share one outbox: a tab opened while another still has a loop edit queued replays that entry too (`takeLeftoverOutboxEntries` only knows its own page's ids), and the older value can land last. Needs entries claimed across tabs (an owner id per page with Web Locks, replaying only entries whose page's lock is free) without a reload's new page skipping its predecessor's entries while the old document's lock is still held. Sign-out now waits for any tab's outbox entries. (bug hunt D2, docs/units/bug-hunt-2026-11.md)
- A queued write sent with no session at all (supabase-js's refresh failed for the network, so `getSession()` gives null while a session is still stored) goes out as `anon`, is refused with 42501 and is dropped like a real refusal. The 401s for an expired or unreadable token are now retried; telling this case from a missing grant needs the write to check for a session before it sends (fake client support for `auth.getSession` too). Queries sent that way come back empty under RLS. (bug hunt D4)
- Deleting the last song of the library sends focus to `<body>`: the list (which hands focus on) goes with it, for the "No songs yet" note. Hand it to the upload control. (bug hunt S4)
- A "playing" from alphaTab for a play the service called off is ignored only while the new count-in still clicks (`playCalledOff`); one that arrives after the new count-in's downbeat (a worker more than a bar late) is taken as the new play's, and its "paused" after it then reads as a pause. (bug hunt P1)
- A loop deleted on another device: "Save speed" on it here drops it from the list with no message, and its open edit form says "This loop has been deleted" only after a refetch. A session logged for it is dropped quietly (`loopGone`), which is right, but the list isn't read again, so the page goes on saying "Looping …" over a loop that is gone; invalidate `loopKeys.forUser` on `loopGone`. (08 Build, 08 QA, 09 QA issue 7)
- From 12 Build (visual items it left, since they change behaviour or layout decisions rather than looks): on a phone the score opens scrolled 47 px sideways, clipping the clef (06 QA). (A tablet in portrait now has the bottom sheet, not a column beside a 230 px score: 12 Build, tablet loop sheet.)
- From 12 Build, what is left of 08 QA issue 2 (a loop chosen while paused, and every count-in, now scroll to their first bar): bars typed into the loop form are highlighted but not scrolled to, and after a rotation or a resize across 768 px the picked bars or the paused loop can be outside the score box. The score box only scrolls when a loop's range is applied while not playing (`player.showBar`) and at the start of a count-in. In QA alphaTab's own re-layout brought a paused loop back into the box after every rotation tried; the one miss was "Play loop" pressed within about 150 ms of crossing from page to horizontal layout, which counts in with the first bar 214 px off the left edge. (08 Build, QA fix round 1; 08 QA fix round 1, N5)
- From 12 Build: on a phone "Play loop" closes the loop sheet so the score and the count-in number show, and focus is left on the hidden button. The loop's speed now lives in its own item (12 UX pass), reached from the controls bar's "Loop speed" (in the folded strip too), which opens the sheet and focuses it; the sheet opened by its header still keeps the scroll position it was closed at, so in a long list the playing item may need scrolling to. (08 Build, QA fix round 1; 08 Test, QA fix round 1, bug 1; 08 QA fix round 1, N4; 12 UX pass)
- From 12 Test (after QA fix round 2): a phone rotated to landscape during a count-in leaves the count-in number below the window (the score box at 284 to 518 px in a 390 px window, the window not scrolled): the score is brought on screen only once per start (`useScoreOnScreen` in `useJamMode.ts`), and the rotation's re-layout moves it after that. Bring the box on screen again after a width change while running, if it doesn't fight a user's own scroll. (docs/units/12-visual-design.md, Test (after QA fix round 2), bug 1)
- From 12 Test (after QA fix round 2): "Practice logged" appears above the score about 100 ms after the Pause that logs a session, and pushes the score down 32 px at every size, so a bar tapped just after that Pause can be the bar below the finger. Chromium's scroll anchoring made up for it when the window was scrolled, until `useStaysOnScreen` turned anchoring off; Safari never did. Keep the notice's line reserved under the status line, or have the page keep the score in place when the notice comes and goes. (bug 2 there)
- From 12 Build: on a phone the count-in number is still behind the loop sheet when playback starts with the sheet open by any press other than "Play loop": Play in the sticky bar straight after saving a new loop (the sheet stays open), Play after reopening the sheet for the speed, and every repeat's count-in while the sheet is open. Close the sheet whenever a count-in starts on a phone (not only in `LoopPanel`'s `onPlayLoop`), or draw the counter in the part of the score the sheet leaves. A few lines; do it if Shane finds it at the kit. (08 QA fix round 1, N1)
- From 12 Build: a count-in leaves its bar where it is when the bar is already on show (`scrollToShow`), and alphaTab then slides it to the start of the box over about 300 ms on the downbeat: up to 453 px on a tablet, 244 px on a laptop, 100 px on a phone. A count-in could always put its bar at the start of the box; a tap must keep leaving the score alone. In page layout, a loop in the last lines of the song can't reach the top of the box and sits under the count-in number, where it can't be read. (08 QA fix round 1, N2 and N3)
- From 12 Build: the "Mark finished?" prompt sits in the playing loop's item, which on a phone is inside the sheet that "Play loop" closes: after "Save speed" the sheet is open, so it is seen, but a prompt for a loop opened already at its target is behind the closed sheet. The home page shows speeds as a percent only (BPM needs the song's file). A loop's history opens inline and makes a long item longer. (09 Build)
- From 12 Build, from 09 QA: a refused "Mark finished" pressed in the prompt shows its error twice, in the prompt and under the loop's item (issue 3). "Practice logged: 6 s at 60%." stays above the score, without the loop's name, after that loop is deleted (issue 4). The home page is one column with no grouping or paging: 560 loops are a page 115,000 px tall (it loads and switches tabs in under 300 ms), and the panel lists every loop of the song the same way (issue 6). From 09 Review: a refused "Mark finished" or "Reopen" keeps its error under the loop, on the song page and the home page, until the loop's next status write or until the mutation is collected five minutes later (`useSetLoopStatus` reads the loop's latest status write from the mutation cache); give it a way to be dismissed, or drop it on leaving the page.
- From 12 Build: notation is at alphaTab's default size. At `display.scale` 1.15 taps in the phone's horizontal layout missed their bar, because the engine's hit-test (`barIndexAtPoint` via `watchScorePointer`), highlight (`highlightRects`) and scroll (`barBounds`) read `boundsLookup` as page pixels. Make them divide by the scale, then raise `NOTATION_SCALE` in `scoreTheme.ts` if the notation is too small at the kit.
- From 12 Build, from 08 QA: on a phone with the sheet open and nothing playing, about 85 px of the score shows (issue 6). A phone in landscape with the panel open leaves a 284 x 234 px score.

## Open human checks

The handoff notes record none of these as done; delete a row once it is. Everything audible so far is unverified, and Unit 01's go on alphaTab is provisional until its list passes. Do that list before Unit 07.

| From | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01   | At `/spike` on phone, tablet and laptop: drum sound (Sonivox sf2 against sf3 and MuseScore General); the loop seam at 50%, 100% and 200%; whether "stop on finish" lands on the downbeat; start latency; memory and battery on a long loop                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 01   | iOS: the first tap makes sound; the ringer switch on silent; lock and app switch mid-play; page against horizontal layout in portrait and landscape                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 04   | iPhone and Android on the LAN dev server: `.gp` isn't greyed out in the picker, and an upload works (this runs the non-secure-context hash and id fallbacks). A real `.gp5` or `.gpx` if one is on hand                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 05   | iPhone and iPad on a preview URL: sound on the first Play tap, and with the ringer on silent; the screen stays on while playing. Needs HTTPS for the wake lock, so Hosted setup comes first                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 06   | Phone and tablet: a tap on a bar seeks there and a swipe never does; auto-scroll feels smooth on iOS; in an installed PWA the sticky bar sits below the status bar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 05   | Every device: speed, metronome and mute changes mid-play with no click, gap or restart; sound stops at once on leaving the page; rotating mid-play; 20 fast Play/Pause taps                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 08   | iPhone and iPad: "Play loop" makes sound on its first tap, with the count-in off and on; a saved loop's seam and its speed by ear at 50%, a typed BPM and 200%; switching loops mid-play has no gap or restart                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 08   | Phone at the kit: picking a loop's two bars by tap with the sheet open (thumb reach, the sheet in the way, the keyboard over the form). Laptop with a mouse or trackpad: dragging across bars, across a line end too                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 08   | Phone: "Play loop" with a 1-bar and a 2-bar count-in (is the number readable now the sheet closes, and does each repeat still land on the downbeat by ear); Play with the sheet open hides the number (N1); changing speed is two taps. Tablet and laptop: the score sliding on the downbeat (N2). `repeats.gp` bars 4 to 5 by ear. Safari and Firefox: everything ran on Chromium only                                                                                                                                                                                                                                                                       |
| 09   | Phone at the kit: practise a loop for a minute, pause, and check "Practice logged" and the loop's History (duration, speed, passes). Then mid-practice: lock the phone, switch apps, close the tab; each should leave one session, with no hours of pocket time in it. iOS Safari and an installed PWA especially (`pagehide` and `keepalive` were only run on Chromium; the keepalive request is cross-origin with an `Authorization` header, so it needs a CORS preflight that must also outlive the page). Two devices: save a loop on the laptop, then press its "Practice" on a phone that had the song open a minute before; it should open on the loop |
| 09   | Home page on the phone: the order after practising two loops, "Practice" into a loop (is song-then-Play quick enough), Mark finished and Reopen between the two tabs. With "before every repeat" on: one session for the sitting, its play time without the count-ins                                                                                                                                                                                                                                                                                                                                                                                         |
| 10   | A real page-turner pedal on a laptop and on an iPad (Page Up / Page Down or the arrows): it switches loops while playing with no gap, and Space or the pedal never restarts a loop by accident. Safari: Space on a focused button plays or pauses and doesn't also press it; a Bluetooth keyboard's Space starts sound on iOS                                                                                                                                                                                                                                                                                                                                 |
| 11   | iPhone: Add to Home Screen, open from the icon, sign in with the 6-digit code (links open in Safari), open a song, then airplane mode: it plays, a loop's practice and a saved speed reach the server once after reconnecting, also after closing the app offline. Android Chrome: the install prompt and the maskable icon. A deploy while the installed app is open shows "Reload to update"                                                                                                                                                                                                                                                                |
| 12   | Sign off on the screenshots in `docs/units/12-shots/` at all three sizes. Phone at the kit in a dim room and a bright one: the score paper and notation readable from the throne, the orange not too loud, the count-in number. Installed PWA on iPhone and Android: the new icon, the maskable crop, the status bar colour                                                                                                                                                                                                                                                                                                                                   |

## Risks and mitigations

| Risk                                                               | Mitigation                                                             |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| iOS Safari Web Audio quirks (unlock, backgrounding, ringer switch) | Real-device spike in 01; tap-to-start; ringer hint in UI               |
| Thin default drum soundfont, or a large better one                 | Pick in 01; service worker caches it                                   |
| alphaTab loop seam artifacts                                       | Listen in 01; report upstream if drums are affected                    |
| Count-in drift                                                     | AudioContext scheduling; pure scheduler tests; human check             |
| Songsterr export variation                                         | Test real exports locally in 04; null drum track handled               |
| Agent drift from earlier patterns                                  | `AGENTS.md`, handoff notes, one PR per unit, Readability every unit    |
| Two devices edit one loop offline                                  | Last write wins on `updated_at`; sessions append-only                  |
| Copyrighted tabs committed                                         | Synthetic fixtures in git; real exports gitignored                     |
| Repeats in a file (a bar plays more than once)                     | Repeat fixture (`repeats.gp`, 08); ranges and current bar tested on it |
| Count-in needs alphaTab's private AudioContext                     | Decide in 07; pin the alphaTab version if the private field is used    |
| Open issues lost between units                                     | Carried forward lists per unit, kept by Review                         |
| Hosted auth differs from the local stack                           | Settings listed in Hosted setup; a real sign-in on a preview URL       |

## Post-MVP backlog

- Auto speed trainer
- Practice routines (sequence of loops)
- Stats: speed over time, weekly practice time, streaks
- Setlists built on jam mode
- Full track mixer
- Remember jam speed per song
- Notes per loop
- Custom shortcut and pedal mapping
- MIDI import (quantize drum MIDI into an alphaTab score), only if GP exports turn out to be a hassle
- E-kit input over Web MIDI to score timing (desktop and Android only)
