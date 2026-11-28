# Drum Practice App: Project Plan

Source doc: https://claude.ai/artifact/SAx3ua9hELu16AjJQcbPbo (Nov 22, 2026). This file is the in-repo copy agents read.

## Vision and MVP scope

A tab-first drum practice tool: upload a Songsterr Guitar Pro export once, then jump straight into saved loops at your saved speed, on phone, tablet or laptop. No original audio; playback is the file's synth tracks plus a metronome.

**In the MVP**

- Accounts and sync across phone, tablet and laptop
- Upload .gp files into a song library
- Jam mode: whole song, follow cursor, read-along while jamming
- Loop practice: saved bar ranges with a name and current speed; the target is always full speed (100%)
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
| Layout        | alphaTab page layout at 768 px and up; horizontal scroll below. The score takes the page's whole width; loops are a sheet over it    | A full page of drum notation doesn't fit a portrait phone               |
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
| status                 | enum `active` / `finished` |                                               |
| finished_at            | timestamptz, nullable      | Set on finish, cleared on reopen              |
| last_practiced_at      | timestamptz, nullable      | Denormalized for the "on the go" list         |
| created_at, updated_at | timestamptz                |                                               |

**practice_sessions**

| Field            | Type        | Notes                                                            |
| ---------------- | ----------- | ---------------------------------------------------------------- |
| id               | uuid        | PK, generated client-side so offline writes are idempotent       |
| user_id, loop_id | uuid        | FKs; delete loop cascades                                        |
| started_at       | timestamptz |                                                                  |
| duration_seconds | int         | Playback time only                                               |
| speed_ratio      | numeric     | The speed most of the session was played at (the later on a tie) |
| repeats          | int         | Loop passes completed                                            |

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
- A session is logged when loop playback stops after at least 30 seconds of play time (tunable constant), at the speed most of it was played at (the later on a tie), not the speed it ended on.
- Reaching 100% prompts "Mark finished?"; it never finishes a loop automatically. A loop's speed is saved as it is played (no "Save speed").
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
- Carried forward lists are kept short (AGENTS.md, Stage workflow): a question for Shane is asked in the unit's report with a recommendation, never parked as a line; nothing is carried a third time (the next Review fixes it, moves it to the Accepted section with its reason, moves it to Open human checks, or deletes it); a unit that changes a screen rewrites the lines about that screen.
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

Units run in order. Each is sized for one Build agent session. Unit 01 proves the audio stack on real devices before anything is built on it.

Handoff notes written before the Visual design unit was added call the release unit "Unit 12". It is Unit 13 now.

| #   | Unit                                        | Depends on |
| --- | ------------------------------------------- | ---------- |
| 00  | Scaffold, conventions, CI, preview deploys  |            |
| 01  | Spike: alphaTab on real devices             | 00         |
| 02  | Supabase schema, auth, storage              | 00         |
| 03  | App shell and auth UI                       | 02         |
| 04  | Song library and upload                     | 03         |
| 05  | Player core                                 | 01, 04     |
| 06  | Jam mode                                    | 05         |
| —   | Hosted setup (configuration, not a unit)    | 05         |
| 07  | Count-in                                    | 05, hosted |
| 08  | Loops                                       | 06, 07     |
| 09  | Practice sessions and progress              | 08         |
| 10  | Keyboard shortcuts and pedals               | 09         |
| 11  | PWA and offline                             | 09         |
| 12  | Visual design                               | 11         |
| 13  | Polish and release                          | all        |
| 14  | Songs with recordings                       | 13         |
| 15  | Play-along player, markers, recording loops | 14         |
| 18  | Songs from a link alone                     | 14         |
| 19  | The tab follows the video                   | 14         |
| 16  | Songs first and practice progress           | 13         |
| 17  | Stats that say something                    | 16         |
| 20  | Loose ends                                  | 14, 17     |

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

None left: every item was built in Unit 07 or is by ear, and those are rows of Open human checks (Unit 20 triage, `docs/loose-ends.md`, 07.1 to 07.8).

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
- Loop history: one row per day practised, with the day's play time, the speed most of it was played at, and its passes (a row per session until Unit 20, batch 5)
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

Every line here is closed by a batch of Unit 20, and carries its class, its id from the triage (`docs/loose-ends.md`, which has the evidence, the fix and the test) and that batch. A FIX line is a defect; a DECIDE line is a decision of Shane's whose recommendation builds something, built as the default (Unit 20, Decisions for Shane). Each goes as its batch lands. What was accepted is in the Accepted section near the end of this plan; decisions with nothing to build are in Unit 20 only.

- [FIX 13.01, batch 6] From 11: a 401 on a query still isn't treated as signed out (03 QA issue 3). Offline the token question is settled: supabase-js 2.119 never signs out for a refresh that only lacked a network, and an offline start opens on the stored session (`startingAuth`, `readStoredSession`).
- [DECIDE D2: 13.05a, 13.05b, batch 6] From 11: a sign-out the server forces (a refused refresh) empties the device, outbox included, so practice not yet sent is lost. One by the user is off while offline and while a queued write is unanswered (11 Review), so on a connection that never answers (a captive portal reporting online) the user can't sign out until the write gives up or lands. Default (D2, option B): the outbox is kept across a forced sign-out and replayed when the same user signs in again, built without waiting; "Sign out anyway" with a warning discards unsent practice, so Shane is asked before it is built. (09 Review, 11 Build, 11 QA issue 3, 11 Review)
- [FIX 13.10, batch 10] Files in Storage with no songs row are possible (failed rollbacks, deleted users, and since 13 Copilot review every upload whose insert answer was lost and whose look-up found no row: the file is kept, as the insert may still commit). Add a sweep script, or accept it. (02 QA, 04 Review, 13 Copilot review)
- [FIX 13.21, batch 8] A refused "Mark finished" or "Reopen" moves the loop back after focus has followed it to its new place, and focus falls to `<body>`. (10 Build; the shortcut announcements were done in 13 Build)
- [FIX 13.26, batch 3] On a phone the tab (`/songs/:id/play`) opens scrolled 47 px sideways, clipping the clef. (06 QA, 12 Build)
- [FIX 13.29, batch 3] From 12 Test (after QA fix round 2): a phone rotated to landscape during a count-in leaves the count-in number below the window (the score box at 284 to 518 px in a 390 px window, the window not scrolled): the score is brought on screen only once per start (`useScoreOnScreen` in `useJamMode.ts`), and the rotation's re-layout moves it after that. Bring the box on screen again after a width change while running, if it doesn't fight a user's own scroll. The same cause on a 320 px phone (640 x 320 landscape): turned to landscape, back, and to landscape again while playing, the window ends at the top with the beat cursor below it (box at 250 to 452 px). That rotation never crosses 768 px, so the fix watches the window's real width, not `useLayout`, which only changes at the breakpoint. (docs/units/12-visual-design.md, Test (after QA fix round 2), bug 1; QA (after QA fix round 2), issue 2)
- [FIX 13.30, batch 3] From 12 Test (after QA fix round 2), on the Tab page only now (the practice screen shows no such note): "Practice logged" appears above the score about 100 ms after the Pause that logs a session, and pushes the score down 32 px at every size, so a bar tapped just after that Pause can be the bar below the finger. Chromium's scroll anchoring made up for it when the window was scrolled, until `useStaysOnScreen` turned anchoring off; Safari never did. Keep the notice's line reserved under the status line, or have the page keep the score in place when the notice comes and goes. (bug 2 there)
- [FIX 13.31a, batch 3] From 12 Test (after QA fix round 3): a Pause pressed while Play's smooth scroll is still bringing the score box into view moves the score once more in the next frame (64 px on a laptop, 66 on a tablet, 3 on a phone): `useStaysOnScreen`'s instant `scrollBy` doesn't end Chromium's smooth scroll. End it at every fold (an instant `scrollTo` of the current position), then drop the `test.fixme` on "a Pause while Play is still bringing the score on screen…" in `tests/e2e/player.spec.ts`. QA rated it rare: the scroll lasts 105 to 290 ms. (docs/units/12-visual-design.md, Test (after QA fix round 3), bug 1)
- [FIX 20.4a, batch 3] On a phone (390 x 844), making a loop on the Tab page and playing it moves the score twice. "New loop" scrolls the page by itself so the score sits above the open sheet (window at 475, score box top at 118); save a loop of bars 1 to 2, then "Play loop", Play in the bar or Space with a 2-bar count-in. The sheet closes, the room it added at the page's end goes (the page is 844 px tall, from 1,319), the window is back at 0 and the score box's top is at 302 (184 px down); after Pause the controls unfold and it is at 514 (another 212). "Play loop" has always done it; since batch 4, Play and Space with a count-in close the sheet too and do the same. The room is `SongPage.tsx`'s padding and the fold is `useStaysOnScreen`'s: keep the score where it is when the sheet's room goes (hold the room until the next unfold, or scroll by what the page lost). `loop-scroll.spec.ts`, "the score when playback closes the open sheet…", prints the figures: make it assert them. (20 batch 4 Test bug 1, QA issue 1)
- [FIX 13.35c, batch 8] From 09 Review: a refused "Mark finished" or "Reopen" keeps its error under the loop, on the song's overview and in the Tab page's sheet, until the loop's next status write or until the mutation is collected five minutes later (`useSetLoopStatus` reads the loop's latest status write from the mutation cache); give it a way to be dismissed, or drop it on leaving the page.
- [FIX 13.37a, batch 8] From 12 Review (after UX pass): with focus on the controls bar's "When to count in" choice, C cycling the count-in to Off takes that group away and focus falls to `<body>` (`useFocusKeptInBar` in `PlayerControls.tsx` only looks at a fold change); hand it to the bars' checked option. (docs/units/12-visual-design.md, Review (after UX pass))
- [FIX 13.37b, batch 8] On a cold start the Songs list draws the big drop box while the songs load and then the compact Upload button (`compact` follows `songs.data`), so the page jumps under a pointer on its way to the box. (docs/units/12-visual-design.md, Review (after UX pass))

### After 13: practice feedback

Shane's first pass after the MVP (branch `practice-feedback`): the score takes the whole width with the loops as a sheet over it at every size; no per-loop target (100% always, column dropped; not additive, which was fine with no users yet); the loop's speed saves itself as it is played; MuseScore General's drum kit layered over Sonivox for a snare that sounds like one.

**Carried forward**

None left: how the kit sounds, and a drum track on another kit program falling back to Sonivox's kit, are in the "Drum sound" row of Open human checks (Unit 20 triage, A13.1).

### 14 Songs with recordings

Re-walked on 2026-11-27 against Unit 16's screens (Songs list at `/`, a song's overview at `/songs/:id` with no player, the whole song at `/songs/:id/play`, a loop's practice screen), with `/design`. Shane asked for it next: a YouTube player inside the app, Spotify links opening Spotify. The first draft of this unit also let a song be added from a link alone; that is now Unit 18, so this unit is worth using alone for the songs already in the app and touches no file column.

**Goal:** a song in the app can be played along to with the real recording, at any point in learning it, with its tab readable under the video. Written to `docs/product.md`.

**For whom and when** (jobs 1, 4 and 5 there; job 2 is Unit 15):

- A song being learned from its tab: between loops, hear the real thing, or a drumless version, and read the tab while it plays
- A song already down: two taps from the Songs list to playing along with the recording
- A sitting's first minutes: "what does this actually sound like" before any loop is made

Nothing here waits for loops to exist or be finished.

**What the services allow** (from memory unless marked; Build checks each before relying on it and writes what it found into its note)

- YouTube embeds play inside the app with YouTube's own controls: play, seek, and speed from 0.25x to 2x. `playsinline=1` keeps iOS out of fullscreen. The first Play has to be a tap on the video itself (YouTube's rule), so "taps to sound" always includes it
- Some videos refuse to be embedded, often a label's official upload (the player shows its own "Video unavailable" card; error codes 101 and 150 are only visible through the IFrame API, which this unit does not load). So the app always shows "Open in YouTube" beside the video, not only after a failure it cannot see
- Embeds can show ads, and on iOS they stop when the screen locks
- Spotify can't be slowed, and its embed plays full tracks only for a browser logged into Spotify. So a Spotify link always opens Spotify (the app, on a phone). The app says so where the link is added: for slowing a song down, add a YouTube link
- Neither works offline, and neither gives the app its audio, so drums out is a second link to a drumless version. The tab's synth already does drums out with Mute drums
- A pasted link's title is not fetched: the song already has its title and artist from the tab
- Checked in 14 Build against YouTube's and Spotify's own pages (docs/units/14-recordings.md, "What the services allow, checked"): an embedded player must be at least 200 by 200 px (the frame element itself, measured at every width from 320 px in `recordings.spec.ts` since 14 QA) and its frame must send a Referer (`referrerpolicy="strict-origin-when-cross-origin"`, or the player shows error 153); `rel=0` keeps the end screen's related videos to the same channel, it doesn't remove them; the speeds on offer are per video

**Scope**

- **Links on a song:** one Original, one Drumless, any number of Other (a lesson, a drum cover)
  - Accepted: YouTube (`watch?v=`, `youtu.be/`, `/shorts/`, `/live/`, `/embed/`, `music.youtube.com`, a `t=` or `start=` kept as the start time), Spotify (`open.spotify.com/track/…` with or without an `intl-xx` segment, `spotify:track:…`), and any other `https` URL as a plain link. Share-sheet tracking parameters (`si`, `feature`, `utm_*`, `pp`) are dropped. Anything else is refused with fixed copy, and so is a host that only looks like one (`youtube.com.evil.test`) and, with copy of its own, an address with a `user:password@` part
  - A paste with words round the link (a share sheet's "Song title https://youtu.be/…") is taken as its first address, less the punctuation a sentence puts after it, and the field shows what was kept. Words with no such address in them are refused as before. From 14 Review the same holds for a link pasted alone: brackets, angle brackets or quotes round it, and a full stop or comma after it, are never part of it (so `https://youtu.be/<id>.` is the video, not a link to a page YouTube doesn't have), a closing bracket is kept when its opening bracket is inside the address (`…/wiki/Rush_(band)`), and YouTube's or Spotify's own host typed without `https://` is found among words too ("Song title youtu.be/…"); any other site needs its scheme there, to be told from a word with a full stop in it
  - Parsing is a pure module (`src/features/recordings/songLinks.ts`): provider, video or track id, start seconds, canonical URL, the label of its host ("YouTube", "Spotify", or the host name)
  - Adding, changing and removing a link is online only (the four parts in AGENTS.md), on the song's overview
- **The song's overview (`/songs/:id`) gains "Play along"** above the loops, for every song: one button per way of hearing the song that it has, in this order: "Tab" (what "Play whole song" was, and there from the first render), "Original", "Drumless". With no links, a quiet "Add a recording" sits where the buttons would be; it never looks like something is missing. "New loop" is on its own row under the block. One layout with or without links, so nothing already drawn moves or changes when the links are read on a cold load (14 QA issue 7): what arrives joins the end of the buttons' row
  - Other links are a quiet list under the buttons: each named for what the app recognised ("YouTube video", "Spotify track"), otherwise its host and the start of its path, with a number when two share a name ("YouTube video 2"), never the raw address (which is in its title and accessible name), three of them and then "Show all n links"
  - "Original" / "Drumless" on a YouTube link opens the song's play screen on that source
  - On a Spotify or other link the button is a link out (`target="_blank"`, `rel="noopener noreferrer"`), named for where it goes ("Original on Spotify")
  - "Manage recordings" (in the header's More menu, and what "Add a recording" opens) is a small form in the page: a URL field per kind with what it was recognised as there (a YouTube video in an Other field "Opens in YouTube"; only an Original or Drumless plays in the app), the note about Spotify and speed, Save, and Remove per link, on its field's row at every width. Opening it puts focus in the first empty field with a mouse or trackpad, and on the form itself on a touch screen (no keyboard until a field is tapped)
  - A form opened again while its save is still on its way is locked and shows what is being saved, not the links as they were before
  - A save whose form was left before it answered (the page's own links stay live while it saves; the nav and the browser's Back can't be locked) still says its failure: on the overview, with Dismiss, to whoever is there when it lands or comes back to it
- **The play screen (`/songs/:id/play`) gets a source switch: Tab, Original, Drumless**, showing only the YouTube sources the song has (a `SegmentedControl`; none when the song has no YouTube link). `?source=original|drumless` picks one from a link; otherwise it opens on Tab. The source is in the URL (`replace`), so Back goes to the song, not through the sources
  - **On a recording source** the video sits in a box that stays on screen (sticky under the top bar; 16:9, full width on a phone up to a third of the window's height, a fixed 356 px wide frame from 1024 px; the frame itself never under 200 px wide or tall, which YouTube's terms require of an embedded player, so on a phone narrower than 356 px the box is taller than 16:9) with "Open in YouTube" under it, locked offline like every other way out. The score stays below, silent, scrolled by hand: the tab's player is paused and its Play, speed, metronome, count-in and loop panel are not shown as if they acted on the video. One line says so: "The video has its own controls. Switch to Tab for loops, speed and the metronome."
  - **Below 768 px the score under a recording is drawn in page layout** (lines wrapping down the page, scrolled with the window under the sticky video), not the one horizontal line the tab's player scrolls for itself: nothing moves that line along for someone with sticks in hand (14 QA issue 2). Switching back to Tab restores the layout for the width. It is a redraw through `PlayerService.setLayout`, never a restart; the paused player keeps its bar, and back on Tab that bar is scrolled back on show
  - **The tab's cursor isn't drawn under a recording** (the orange bar and beat line stood still and read as a playhead: QA after fix round 1, issue 1). It is hidden by a class on the score box, a drawing change only, and is back on its bar on Tab
  - **A phone on its side** (a short window, at least 512 px wide) puts the note and "Open in YouTube" beside the video, so the sticky bar is the 200 px frame, about half the window, and the score has the rest
  - Switching source stops whichever was sounding (the tab's player is paused; the video's iframe is unmounted)
  - The embed is `https://www.youtube-nocookie.com/embed/<id>?playsinline=1&rel=0` plus `start=` when the link had one. No YouTube script or frame loads until a recording source is opened, and none on any other screen
- **Recently played:** opening a recording (the play screen on a recording source, or a link out from the overview) sets `songs.last_played_at` to now, a queued write (the pattern in AGENTS.md, safe to send twice). The Songs list's "recently practised" order uses the later of a song's last practice and `last_played_at`. No session is logged and nothing asks what was played
- **Data:**
  - `song_links`: `id, user_id, song_id, kind ('original' | 'drumless' | 'other'), provider ('youtube' | 'spotify' | 'web'), url (https, at most 2048), created_at, updated_at`; a partial unique index on `(song_id, kind)` where `kind <> 'other'`; references `songs (id, user_id)`, cascades; RLS, revokes and column grants per AGENTS.md. Additive, so the live build keeps working
  - `songs.last_played_at timestamptz null`, client-writable only through a column grant
  - Types regenerated; `tests/db` covers RLS, the grants, the unique index, the https check and the cascade
- Offline: the links are in the persisted cache, so the buttons show; a recording button says it needs a connection (`OfflineNote`) and the tab works as before

**Walk-throughs** (taps from the app being open on Songs)

- _A song being learned, between loops:_ song (1), "Drumless" (2), Play on the video (3). The tab is under it. Back to a loop is three taps to sound: Back (1), the loop's play button (2), Play on its practice screen (3)
- _A song that is down, Spotify link:_ song (1), "Original on Spotify" (2): Spotify opens and plays
- _First link on a song:_ with a mouse or trackpad, song (1), "Add a recording" (2), which lands in the first field, paste, Save (3): the buttons appear. On a touch screen the field is a tap of its own (four and a paste), so the keyboard doesn't come up before it is wanted. The paste can be the share sheet's whole text, title and all
- _No links at all (every song today):_ "Play along" has "Tab", where "Play whole song" was, and one quiet "Add a recording" beside it
- _Offline at the jam space:_ the tab and its loops work; recording buttons, other links and "Open in YouTube" are off and say why
- _Reading along on a phone:_ on a recording the tab is a page under the video; a flick down every few lines, no sideways swipe
- _A video that refuses embedding:_ YouTube's own card says so inside the box, and "Open in YouTube" is right under it

**Acceptance:**

- Every accepted URL form saves a normalised link; a hostile or malformed one is refused with fixed copy and nothing is saved
- An embeddable YouTube link plays in the play screen at phone, tablet and desktop sizes with the tab readable under it, and "Open in YouTube" is always there
- A song's recordings start from its overview without visiting anything else first, and a Spotify link opens Spotify
- No YouTube request is made until a recording source is opened (e2e asserts it)
- A song with no links behaves exactly as before (its way into the whole song is named "Tab", under "Play along"), and nothing about recordings depends on a loop's status
- The YouTube frame measures at least 200 px wide and tall at 320, 360, 375, 390, 820 and 1440 px wide and on a phone on its side (e2e asserts it); below 768 px the score under it is a page that scrolls with the window

**Test focus:** URL parsing as a table (real shapes, share-sheet parameters, `javascript:`, `data:`, `http:`, look-alike hosts, a 3000-character URL); RLS, grants, the unique index and the cascade in `tests/db`; the source switch (what was sounding stops, `?source=` with a kind the song lacks falls back to Tab, Back); online-only gates on link edits; the queued `last_played_at` write. e2e can't play YouTube in CI: route the embed's host to a stub page and assert the frame's URL, that no request to it is made on other screens, and the way out. **QA focus:** a phone in portrait with the video box and the score together, and on its side; pasting from the YouTube and Spotify share sheets; an embed-blocked video; rotation with a video playing; twenty links of kind Other; a very long URL. **Human check:** at the kit, add a YouTube link to a song and play along with the tab under it on the tablet; a drumless link; a Spotify link opening the app on the phone and coming back.

**Not in this unit, and why**

- A song from a link alone, with no tab: Unit 18. It changes four `songs` columns to nullable and every screen that reads them; this unit is useful without it for every song already in the app
- No "Played it through" button and no run-through counts: the app can't see playback in Spotify, and a button that only tells the app what happened is a chore (`docs/product.md`)
- No prompt when a song's loops are finished: recordings are always two taps away, so there is nothing to unlock
- No app-drawn controls over the video (speed keys, pedal, Space), and no markers or loops on a recording: they need the IFrame Player API and are Unit 15
- No play buttons on the Songs list's rows: Shane called the earlier, busier rows too cluttered. See the first open question

**Open questions for Shane** (each with what was built as the default)

- _Is two taps to a recording quick enough,_ or should a Songs row carry one small play-along button for the source used last? Default: rows stay clean, the overview has the buttons
- _Should the video also be on a loop's practice screen,_ to hear the real passage before looping it? Default: no; the practice screen stays about the loop, and Unit 15's loops on a recording answer it properly
- _Where does the sound come from at the kit?_ Spotify plays in the background under the tab on the same phone; YouTube in the background does not. Default: build as above and see
- _Should the tab's cursor move along with the video?_ It needs the tab and the recording lined up (Unit 15's "Later"). Default: the score is scrolled by hand, and Mute all on the Tab source is the way to have a moving cursor over a recording playing elsewhere
- _On a phone in portrait, how should the tab under the video be laid out?_ As one horizontal line (what the tab's player uses on a phone) it showed a bar and a half and stood still (14 QA issue 2). Default, built in 14 QA fix round 1: page layout under a recording below 768 px, which at 390 px wide is one bar to a line, five lines on show under the video, scrolled with the window. The other ways: keep the one line and let a finger drag it, or smaller notation for two bars a line. Look at it at the kit
- _Is "Tab" the right name for what was "Play whole song" on a song with no recording?_ Default, built in 14 QA fix round 1: one "Play along" block for every song with "Tab" in it from the first render, so the page has one layout and nothing moves when the links are read. The other way keeps "Play whole song" until a song has a link, at the cost of the two layouts swapping on a cold load

**Carried forward**

- [DECIDE D8: 14.3, batch 7] From 14 Review: a video that is playing is taken away when the device reports no connection (`RecordingBox` draws no frame offline) and starts from the top when it is back, though YouTube's own player would have played on through a short drop from what it had buffered. Right for a frame that hasn't loaded (it would hold the browser's error page); for one that has, the default built (D8, option B) leaves it be and only refuses to make a new one. (docs/units/14-recordings.md, Review)
- [FIX 14.5, batch 10] From 14 Build: the seed (`scripts/seed.ts`) has no links, since the database in use couldn't be reseeded during the build. Add an Original and a Drumless to a demo song when it next can be.

Each line carries its class, its id from the Unit 20 triage (`docs/loose-ends.md`) and the batch that closes it. Moved to Open human checks, the "Recordings" row: trying `sandbox` on the YouTube frame with a real video (14.2, then batch 7), and page layout under a recording at one bar to a line on a phone (14.8c). The video beside the score on a phone on its side (14.1) is D7 in Unit 20, with nothing built until that row has been looked at. Accepted: 14.4a, 14.4c, 14.7, 14.8a, 14.8b and 14.8d, in the Accepted section.

### 15 Play-along player, markers and loops on a recording

**Goal:** find the hard parts while playing along, and work them, on the recording itself, so a song with no tab can be practised as fully as one with a tab. Planned in outline; to be detailed with `/design` after Unit 14 has been used at the kit.

**For whom and when** (jobs 2 and 3 in `docs/product.md`): playing the full song while still bad at it, noticing where it falls apart, and keeping that spot without putting the sticks down for long.

- The YouTube source is driven through the IFrame Player API (a `RecordingPlayer` behind an interface, as `PlayerEngine` is for alphaTab), so the app's own controls and keys act on it: Space, speed up and down, back 5 or 10 seconds, and a pedal
- **Mark this spot:** one big button, and one key, drops a marker at the current time while the song keeps playing. Markers list under the video; a tap jumps to a few seconds before one. A marker can be named later, never at the moment it is made
- **Loop a marker:** a loop on a recording is a start and end time on a link (seconds, in place of bars), made from a marker with handles to adjust. It has a saved speed, goes from active to finished, logs sessions, and is listed on its song's overview and counted on the Stats page like any loop (there is no home page since Unit 16); its practice screen is the place to copy (`LoopPracticePage`). With no tempo there is no count-in: a lead-in of a few seconds before the start instead
- On a song with a tab, a marker can become a bar loop instead: "Find it in the tab" opens the loop form with the score, and the marker is kept on the loop
- Time played along is logged from the player's own states (the `sessionTracker` rules), per song and source, replacing Unit 14's bare timestamp
- To check first: whether `setPlaybackRate` takes rates between the 0.25 steps (if not, a recording loop's speeds are 25, 50, 75, 100%, and the UI says so); how exact `seekTo` is at a loop's seam; whether any of it survives a locked iPhone

**Later, undesigned:** a rough offset between a tab and a recording (bar 1 at 0:07) so a bar loop can jump the video to about the right place and a marker can suggest its bars; a "Down" mark and repertoire view if the Songs tab gets long; adding a song by sharing from the YouTube or Spotify app (`share_target`, Android only).

**Carried forward**

None left: Unit 16's note is in the scope above (Unit 20 triage, 15.1).

### 19 The tab follows the video

Shane after Unit 14 (2026-11-28): "can we make the tabs follow along with the videos at all? maybe we need some sort of auto scrolling". Designed with him the same day: real following from the video's own clock, not a blind scroll at the tab's tempo (which falls out of step at the first pause, seek or speed change). It is the first slice of Unit 15: the player behind an interface starts here, and Unit 15's markers and loops build on it.

**Goal:** while a YouTube recording plays on the song's play screen, the tab shows where the song is: the current bar is marked and kept on screen, through pauses, seeks and YouTube's speed changes.

**For whom and when** (job 4 in `docs/product.md`, reading along, and job 2, finding the hard parts): a drummer playing along to the recording, sticks in hand, who can't scroll. On a phone in portrait the tab under the video is one bar to a line, and Unit 14's QA found it needs a flick every few seconds: this removes the flicks.

**What the service allows** (Build checks each from YouTube's IFrame Player API reference and writes what it found into its note; nothing here is relied on unchecked)

- With `enablejsapi=1` and an `origin` parameter the embedded player answers the IFrame Player API: the current time, the playback rate and its changes, the player's state (playing, paused, buffering, ended), `seekTo`, `playVideo`, `pauseVideo`. Whether it does so on `youtube-nocookie.com`, and whether the API script must be loaded from `youtube.com` or the frame can be driven by `postMessage` alone, is to be checked; the app keeps Unit 14's rule that nothing is requested from YouTube until a recording is opened
- The app can't start a video's sound before the user has tapped the video once (browsers' autoplay rules, YouTube's own); after that, play and pause from the app work
- Ads play in the same frame; the player's clock is the video's, so an ad shifts nothing, but the app should not mark bars while an ad plays if the API says so
- Spotify gives the app nothing: this unit is YouTube only, and says so nowhere a Spotify link shows (there is simply no following there)

**Scope**

- **A `RecordingPlayer` behind an interface** (`src/features/recordings/recordingPlayer.ts`, as `PlayerEngine` is for alphaTab): `subscribe` to `{ seconds, rate, playing }`, `seekTo(seconds)`, `play()`, `pause()`, `dispose()`. `youTubePlayer.ts` is the only module that talks to YouTube's API; a `FakeRecordingPlayer` in `src/test/` drives every test. The video box from Unit 14 mounts it; the frame's address stays built by the parser, with the API's parameters added in the same one place
- **Where the song is, from the video's time** is pure (`src/features/recordings/videoSync.ts`, tests first): the tab's bars in play order with the second each starts at (from the tempos, meters and repeats the player already has: `barStartTempos`, `barMeters`, the played-bars order), `barAtVideoSeconds(barStarts, barOneSeconds, videoSeconds)` and its inverse `videoSecondsOfBar`. Before bar 1's second it is "not started"; after the last bar's end, "ended"
- **Lining the tab up, once per link:** the app can't know where bar 1 falls in a video. Until a link is lined up, a quiet line under the video offers it: "Line the tab up: when bar 1 starts, press" and one big button, "Bar 1 starts now", on once the video has been started, playing or paused (19 QA, question 2: pausing on the downbeat and pressing is the most exact way by hand). Before the video has ever been played it is off, and a tap on it says why ("Press Play on the video first."). The press saves the video's time as the link's `bar_one_seconds`. After that the same place holds "Tab earlier" / "Tab later" nudges (a quarter of a second each, with bar 1's time in the video on show: "Bar 1 at 0:07.25") and "Line up again". Never required: an unlined video plays exactly as in Unit 14
- **Or type the time** (Shane, trying it on 2026-11-28: "let's allow users to enter a timestamp directly"). Beside "Bar 1 starts now" is "Type a time": a field in the same rows (nothing moves) that takes "0:07.25", "83.5", "1:02:03.5" or YouTube's "1m30s" and "1h2m3s" (`parseVideoClock`, pure; "1m90s" is refused), opened on the saved time when there is one (by way of "Line up again"), with a phone's whole keyboard (the decimal keypad has no colon). It needs no playing video, only a connection for the save. What isn't a time is refused in fixed copy and never clamped; the time the field opened on, saved back, sends nothing, even when it was saved by a press to the millisecond
- **Following:** once lined up, the bar the video is on is marked on the score with the highlight the loops use (`setHighlight`, never the orange playback cursor, which stays hidden under a recording) and kept on screen (`showBar`, and the window on a phone): from the first marked bar of a fresh load, at every size and in a phone on its side, and again at once after a rotation, playing or paused. The page turns a line early (19 QA, question 1): when the marked bar is the last one on show, its line goes to the top, so the lines after it are on show before they are played; a bar with the bar after it already on show never moves the page, and between two bars the reader's own scroll is left alone. Per bar, not per beat. It tracks pause, seek, buffering and the video's speed, because it reads the video's own clock (polled while playing, a few times a second, and about once a second while a started video is paused, which is the only way to hear a seek made on YouTube's own bar then). While the score is only read under a recording the score box is never scrolled to the tab's own, hidden cursor, so a turn of the phone or any other redraw leaves the bar the video is on on show. A "Follow" toggle (on by default once lined up, in the URL-free page state) turns the scrolling off for someone who wants to read ahead; the mark stays
- **Tap a bar to hear it:** while lined up, a tap on a bar seeks the video to that bar's start (`seekTo`); the tab's own player stays set aside
- **Space plays and pauses the video** on a recording source once the player has reported ready (the page's other playback keys still do nothing there). It can't start a video that has never been tapped; then the note says to press Play on the video once
- **Data:** `song_links.bar_one_seconds numeric null`, between 0 and 43200, client-writable through a column grant on update (and insert), additive. Saved with the links' existing update (`pointLinkAt`'s pattern: the write asks for its row back), optimistic, online only like the other link edits (a video needs a connection anyway). The save is for the video it was made on: it matches the link only while it still has the address the page knew, so a page that hasn't heard the link was pointed at another video writes nothing onto it and says the recording was changed (no migration: a filter on `url`). Types regenerated; `tests/db` covers the grant and the check. The migration is pushed before the build is live (docs/release.md: the build reads the new column on the play screen)
- **Drift is said, not hidden:** the tab's tempo and a recording's rarely match over four minutes. The nudges are the answer in this unit, and the line under the video says what they are for beside bar 1's time ("Drifting? Nudge the tab")

**Walk-throughs** (from the song's play screen on a recording, the video already tapped to play)

- _First time on a link:_ "Bar 1 starts now" as the song comes in (1 tap). From then on the bar is marked and the page follows
- _Every later time, any device:_ Play on the video. Nothing else
- _The tab runs ahead by the second chorus:_ "Tab later" twice (2 taps), saved
- _A phone on its side:_ the video on the right, the line-up beside it in rows of its own, the score under both from bar 1; nothing to scroll by hand
- _A slow connection, the video tapped before YouTube's script has arrived:_ followed from the moment it arrives, with nothing more to press
- _A hard fill at bar 33:_ tap bar 33; the video jumps there
- _A link never lined up, or a Spotify or other link:_ exactly Unit 14
- _A song whose tab has repeats:_ the mark follows the bars in the order they are played, as the tab's own cursor does
- _Offline:_ no video, so nothing to follow; the tab works as before

**Acceptance:**

- A lined-up video marks the bar it is on and keeps it on screen at phone, tablet and desktop sizes and in a phone on its side, from bar 1 of a fresh load, through pause, seek, a speed change, a rotation and a repeat in the tab, with the bar played next on show under it wherever the window holds two lines
- Every control of the line-up is on screen and takes a tap in every state at 320 px and in a phone on its side, and no state of it moves the score
- "Bar 1 starts now" and the nudges are saved with the link and are there on another device
- A tap on a bar seeks the video to it; Space plays and pauses the video
- An unlined link, a Spotify link and a song with no links behave exactly as before, and nothing is requested from YouTube before a recording is opened

**Test focus:** the sync maths as tables (a tempo change, a meter change, repeats, before bar 1, past the end, a negative offset after nudges, rates of 0.25 to 2); the player interface with the fake (late events after dispose, a seek while buffering, StrictMode, a source switch mid-poll, the link removed on another device while following); the save (optimistic, a failed save puts the old offset back, two nudges in flight); e2e with a stub page that answers the player protocol, for the frame's parameters and one following pass. **QA focus:** a real video at each size and a phone on its side; lining up late or early and nudging; a video with an ad if one turns up; rotation; a long song; the tab with repeats. **Human check:** at the kit, line a song up and play along on the tablet and on a phone in portrait; whether per-bar marking is enough to read from; how far a real recording drifts over a song.

**Not in this unit, and why**

- No following for Spotify or other links: nothing to read from them
- No second sync point or tempo stretch (lining up bar 1 and, say, the last chorus, and stretching between): the nudges come first; do it if Shane finds drift is the norm
- No markers, loops on a recording, speed keys or a pedal: Unit 15, on this unit's player
- The tab's synth does not play along muted to move its own cursor: two clocks would drift from each other, and the highlight already says where the song is

**Asked of Shane** (the questions and the options are in docs/units/19-follow-video.md, QA and "Build (QA fix round 1)")

- _Per bar, or a beat line too?_ Asked on 2026-11-28, default built: per bar
- _A tap on a bar: seek the video, or line up to that bar?_ Asked on 2026-11-28, default built: seek
- _Following on by default?_ Asked on 2026-11-28, default built: yes
- _When the page turns_ (QA question 1): a line early. Built in QA fix round 1
- _Lining up while paused_ (QA question 2): yes, and the off button says why. Built in QA fix round 1
- _The phone's keyboard for "Type a time"_ (QA question 3) and _a phone on its side_ (question 4): the whole keyboard; fixed. Built in QA fix round 1
- _Taking a line-up away_ (question 5) and _keeping a playing frame through a dropped connection_ (question 6): asked on 2026-11-28, not built; the second goes with the loose-ends work
- _YouTube's player API script from `www.youtube.com`, or the frame driven by `postMessage` alone?_ Asked on 2026-11-28 (19 Review), default built: the documented API script, asked for only when a video's frame is drawn
- _A phone on its side narrower than 768 px_ (a line of music doesn't fit between the video and the tab bar), _one line of music at 844 x 390_, _how early a turn should be_ and _the note's place in a phone on its side_: asked on 2026-11-28 (19 QA after fix round 1, 19 Review), default built: as it is

**Carried forward**

None left (19 Review): each line was fixed, accepted below, or moved to Open human checks. The questions are under "Asked of Shane" above.

**Accepted** (each with what would change that)

- From 19 Build: from 768 px, on a song whose sounds failed to load (the status line says so), the video's bar is marked but the score's own box isn't scrolled to it: `showBar` waits for the player to be ready. The sounds are precached and tried again when the connection returns, and a reload puts it right. Revisit if `showBar` is ever let go of its wait for the sounds.
- From 19 QA fix round 1: on a slow connection, a tap on "Bar 1 starts now" in the seconds between starting the video and YouTube's script arriving says "Press Play on the video first." though the video is playing. Until the script arrives the app can't know that it plays, and on a page just opened those words are the true ones; the button comes on by itself when the script lands. Revisit if the script is ever loaded ahead of the frame.
- From 19 QA fix round 1: in a phone on its side, with a link lined up, a keyboard's Tab reaches "Line up again" before the two nudges, though it is drawn after them. It is first in the page so that it and "Bar 1 starts now" stay one element and keep focus through a press, and every control is reached. Revisit if the sideways layout is drawn again.
- From 19 Review: a link removed on another device while this one's focus is in its line-up (a nudge pressed, which then says "It has been deleted…"): the screen goes to Tab, the video and its line-up leave, and focus falls to `<body>`. The screen itself has changed under the reader, as in Unit 14. Revisit with any work on what a removed source does to the play screen.

### 18 Songs from a link alone

Split from Unit 14 when it was re-walked (2026-11-27). Planned in outline; detail it with `/design` after Unit 14 has been used.

**Goal:** a song heard yesterday can be in the app today from a pasted link, with no tab, and played along to badly to find out what is in it (job 1 in `docs/product.md`, for "a song they only have as a link someone sent").

- "Add a song" on the Songs list takes a file as now, or a pasted link with a title and artist (typed; filled from the link's oEmbed only if the browser may call it, which is unchecked)
- `songs.file_path`, `file_hash`, `original_tempo` and `bar_count` become nullable, all set or all null. Every screen that reads them says what it shows without them: the Songs row, the overview (no "Tab" button, no "New loop", a quiet "Add a tab"), the play screen (the recording alone), Stats, the offline file store. The loops trigger that checks `end_bar` against `bar_count` refuses a loop on a song with no tab
- A tab can be added later to a song that began as a link
- A link-only song whose link is Spotify or another site has nothing to play in the app: its overview is the way out and "Add a tab", and says so plainly
- Not additive for a build that assumes the columns are set: two releases (docs/release.md, section 2), or the nullable columns go out a release before anything writes a null

**Carried forward**

None yet.

### 16 Songs first and practice progress

Numbered 16 when main was merged in: main had taken 14 and 15 for recordings while this unit was being built. It was built first, so 14 and 15 build on its screens (see their Carried forward). Its handoff note keeps its first name, `docs/units/14-songs-first.md`.

**Goal:** organise the app the way practice happens: songs, then a song's loops, then practising one loop, with light game-like feedback on progress and a Stats tab. Shane signed off on the "songs first, minimal" mockup on 2026-11-26: plain rows with dividers, one ring or bar per item, one main action per screen; no level names, no cards around list items.

- **Navigation:** Songs · Stats · Settings (bottom tabs below `md`, sidebar from `md`, as now). `/` is the Songs list; the library merges into it (upload by picker and drop, search, sort, edit, delete all kept). `/library` redirects to `/`. The On the go page goes; a finished loop is shown as mastered inside its song.
- **Songs list (`/`):** one row per song: a mastery ring (finished loops of all its loops; a dashed ring with no loops; a full ring and "Mastered" when every loop is finished) and one line under the name ("2 of 4 loops mastered", "No loops yet"). Recently practised first by default. The header carries the streak as a flame and a number of days, hidden at 0. Upload is a quiet link-style action, not a big drop box once songs exist.
- **Song overview (`/songs/:id`):** title, artist and "n of m mastered". The loops: active ones first (last practised first), then finished ones below with a trophy. An active loop's row shows its name, bars and saved speed as a percent, a thin bar of that speed towards full speed (100%), and a round play button that opens its practice screen. Edit, history and delete stay in the row's More menu. "New loop" and "Play whole song" are quiet actions (since Unit 14, "Play whole song" is the "Tab" button under "Play along"). This screen doesn't load alphaTab or the file (percent only, as the home page does today).
- **Practice screen (`/songs/:id/loops/:loopId`):** the player set to the loop (range, looping, saved speed), as `useLoopPractice.openLoop` does now. On it: the loop's name, one muted line with the session's play time and passes, the score, the speed in large type with BPM and "n% to full speed", nudge buttons and "Save speed", and one big Play/Pause. Count-in, metronome, drum toggles, keyboard shortcuts and the "Mark finished?" prompt keep working; the loop keys switch to the song's other loops (the URL follows with `replace`). Back goes to the song.
- **Play whole song (`/songs/:id/play`):** today's jam mode. "New loop" opens it with the bar picker open; after the save, the app goes to the new loop's practice screen.
- **Old links:** `/songs/:id?loop=<id>` redirects to that loop's practice screen (`loopPracticePath` changes to the new path), so bookmarks and links from earlier builds still work.
- **Session complete:** removed on 2026-11-27 (it came up at every pause). See "No Session complete pop-up; a summary when you leave" under "From Shane's first try" below: nothing appears while practising, and the song's overview sums the sitting up.
- **Stats (`/stats`):** a Week / Month / All time choice (in the URL) over: practice time, days practised, loop passes, loops mastered; minutes per day for the last 14 days with today marked; a heatmap of practice days for the last 26 weeks; speed over time for a chosen loop (each session's speed); and the badges, earned ones in colour and locked ones with their progress. Charts are SVG drawn by the app on the design tokens (no chart library), each with a text alternative.
- **Data:** everything is derived on the client from the user's sessions and loops; nothing new is stored and there is no migration. Every session of the user is read with `fetchAllPages`. Streaks, totals and badges are pure modules (`src/features/stats/`): a streak is consecutive local calendar days with at least one logged session, ending today or yesterday. The badge list is fixed in code (streaks of 3, 7 and 30 days; 1, 10 and 50 hours; 100 and 1,000 passes; first loop mastered; 5 loops mastered; a song with every loop mastered), each with its progress.
- **Not in this unit:** XP or levels, a daily minutes goal (it would need a `user_settings` column), anything that reads or writes `target_ratio` (dropped after 13, in "practice feedback": "full speed" is always 100%).
- Offline: every new screen reads from the persisted cache like the others, and the Stats page says so when it has nothing cached.

**From Shane's first try (2026-11-27), in this unit before Readability:**

- **Practice screen: focused, with the whole song a toggle away.** The score opens showing only the loop's bars (and a bar either side for context), so nothing else invites a tap. A "Show whole song" toggle draws the whole score; there, tapping or dragging across bars picks a new range and a "Save as loop" bar (name, then save) appears on the screen itself, with no backing out to the song; saving opens the new loop's practice screen (`replace`). Tapping a bar outside the loop never seeks out of it.
- **Speed controls on the practice screen:** keep the round ±5%, and add ±1 BPM steps, typing an exact BPM (tap the BPM) and typing an exact percent (tap the big percent). Each change is saved as it is made, as the nudges are (`useSaveLoopSpeed`), stored as a ratio (`bpmToRatio`).
- **Track mixer:** a per-track mute list (each track by name, on or off) in the controls bar on both player screens, every track on at open, live like the other options (`setTrackMuted`, which Drums only and Mute drums already respect). Not saved per song in this unit.
- **Bar count in the loop form:** the loop form (the jam page's panel and the practice screen's "Save as loop" sheet) says how many bars its range covers ("5 bars", "1 bar"), live as the fields change or bars are picked, and nothing while the fields make no range (`barCountLabel`).
- **Practice screen header (Shane's review of the build):** one sticky band. From 1024 px three columns: back, name and a meta line (bars · time · passes · bar n of N) left; the speed stepper (a pill: its ends ±5%, the percent over the BPM, each tapped to type, quiet ±1 BPM either side of the BPM, a thin bar to full speed under it) on the band's centre; Show whole song, Shortcuts and Play right. Below 1024 px (a phone, and a tablet beside the sidebar) the stepper is a centred row under the name and Play; in a `short` window one row.
- **In the whole-song view the toggle reads "Show the loop"** (it names what a press shows next), the loop stays highlighted until other bars are picked, and a whole range picked there is what plays, so a new loop is heard before it is saved (`useLoopPractice`'s `previewPickedBars`); "Show the loop" or Cancel goes back to the loop's own bars. Time played on picked bars still counts to the loop being practised.
- **The metronome's slider reaches 3 times louder** (`metronomeChannelGain`), and **a loop's name on the song overview opens it**, as its play button does.
- **No Session complete pop-up; a summary when you leave** (Shane, practising on 2026-11-27: the sheet "is kind of buggy and annoying" and "not serving its purpose"; it came up at every pause). Replaces the "Session complete" bullet above. While practising nothing appears: a pause is silent, and the practice screen's time and passes count the whole sitting on that loop (every session since the loop was opened, logged or still open), not the session since the last pause. Leaving the loop (back to the song, or to another loop) ends the sitting. The song overview then shows, once, one line per loop practised in that visit ("Verse fill: 12 min, 80% → 90%", the speed the loop was opened at and the speed it was left at), the streak in days, and any badge earned since the sitting began, with a way to dismiss it; it goes by itself when the overview is left. A sitting under the 30 seconds a session needs shows nothing. Kept in memory only (a reload forgets it), derived from the sessions and loops like the rest; sessions are logged exactly as before.
- **Saving a loop asks what next** (Shane, practising on 2026-11-27: "I want to make a few then go to them"; and after using it, "it should be more obvious what's happening… practice it now or make more loops? right now it just sort of happens"). After a save from the overview's "New loop" form or the practice screen's "Save as loop" sheet, the form's place shows "Saved “Verse”" with three choices: "Practise it now" (the main one), "Make another loop" (the empty form comes back) and the way out ("Back to the song", or "Back to <the loop>" on the practice screen). Nothing happens until one is chosen; picking bars on the score counts as "make another". Neither screen jumps to the new loop by itself.
- **The metronome's sounds change while playing** (done: the engine rebuilds its MIDI and carries on; AGENTS.md, Metronome sounds).
- **Local testing:** "Dev: sign in" on the dev server's login page (done; AGENTS.md, App shell).
- **Song links and the YouTube player are not in this unit:** they are Unit 14, built next, after this unit's PR.

**Acceptance:** at all three sizes a user goes Songs → a song → a loop's practice screen → practises (a pause shows nothing) → goes back to the song, which sums up what was practised, and the e2e journey covers it; on the practice screen the score shows only the loop until "Show whole song", where a new loop can be saved without leaving the screen; the speed can be set by ±1 BPM, a typed BPM and a typed percent; each track can be muted on its own while playing; Stats' totals for the seed user equal sums over their sessions in the database; an old `?loop=` link opens the loop's practice screen; the player, loop, offline and shortcut specs still pass on the new routes.

**Test focus:** streak, totals and badge maths with local-time dates (a DST change, midnight, a gap of one day); routes and redirects; the sitting's sums and the overview's summary. **QA focus:** back and forward through the three levels, deep links, offline, 50 songs and 30 loops in one song, empty states, a phone in landscape. **Human check:** Shane signs off on the screenshots, then practises with the new flow for a week.

**Carried forward**

None yet.

### 17 Stats that say something

Shane after using Unit 16's Stats page (2026-11-27): the idea is good, but the charts don't say enough. Make the page useful, fun and motivating, with enough detail to be interesting, and remove what is only there for fluff. **Not shipped automatically:** the PR is made ready and Shane reviews it. Song links (Unit 14) come after.

**For whom and when:** a drummer between sessions asking three things: am I showing up, is each loop getting faster, and what have I been neglecting. Every number on the page answers one of them; a graphic that shows a shape without its numbers and dates goes or gains them.

- **Totals compare with the period before:** practice time, days practised and loops mastered (no "Loop passes": a pass of one bar and of sixteen count the same). Week and Month show each total with its change against the previous week or month ("42 min, 12 min more than the week before"), and no change at all while the period before has no practice in it; All time shows none. The streak line gives the current and the longest streak. Play time under a minute is "<1 min" everywhere, never "0 min".
- **Last two weeks:** each bar carries its minutes, and its weekday and day of the month under it; the caption gives the total and how many of the 14 days were practised.
- **Loop progress replaces "Speed over time":** a list of the loops practised (active first, last practised first, six shown with a "Show all"), each row with where its speed started and where it is now ("70% → 85%, up 15"), play time, days practised and a small sparkline; a row opens that loop's chart under it. The chart plots one point per practice day at the speed with the most play time that day (`dailySpeeds`), never a session's last speed: a quick try at 100% to see how far off it is must not read as a day at 100%. It has its first and last date under its two ends and the percent on its points: every point that has room up to 8 days, the first, best and last day's up to 30, and past 30 days the line alone with those three days marked, so a year of practice reads as a line. No two labels overlap. Each row links to the loop's practice screen.
- **Not practised lately**, under Loop progress: up to three active loops whose last session was 7 or more days ago, the most recently practised first, so the loop that slipped last week is named ahead of ones dropped months ago (loops never practised count from the day they were saved and come after those, the most recently saved first), each with its song, how long it has been and its name as the way to its practice screen. Nothing when there is none.
- **Where the time went:** play time per song in the chosen period, as bars with their minutes, most first (five songs, then "Other"). The bars are scaled to the longest named song; "Other" is muted and never wider than it.
- **Records:** longest streak, most practice in one day (with its date), longest single session. From the second practice day on: after one day they would all be that day.
- **Practice days heatmap stays** (Shane asked for it in 16 QA) and gains its numbers: "Practised on N days in the last W weeks" and, from two practised days, the best calendar week (Monday to Sunday, said so beside the rolling "Last 7 days"). It spans from the first practice week to this one, 12 to 26 weeks, and has a hidden table with a row a week.
- **Which period:** only the totals and "Where the time went" follow the Period choice; every other section says what it covers beside its heading ("All time", "Last 12 weeks").
- **Badges, less wall:** earned ones, then "Next up": the three unearned badges closest to done, with their progress; the rest behind a "Show all badges" disclosure.
- **Goes:** the lone "Speed over time" picker, and any caption that only restates the heading.
- Everything stays derived on the client from sessions and loops (no migration), in pure modules under `src/features/stats/` taking `now`, with SVG drawn by the app on the tokens and a text alternative per graphic, as Unit 16 set.

**Acceptance:** with the seed user, every number on the page can be checked against their sessions (a spec does); a loop whose only 100% is a one-minute try after ten minutes at 80% shows that day at 80%; a new user still sees the one empty state; nothing overflows at 390 px.

**Test focus:** the per-day speed rule (ties, one session, a try at full speed), period comparisons across a month and year boundary and a DST change, the records, "next up" ordering. **QA focus:** one session ever, 30 loops, a year of history, a phone in portrait. **Human check:** Shane reviews the PR and the screenshots.

**Carried forward**

- [FIX 17.3a, batch 9] From 17 Build (QA fix round 1): dates are written in the browser's locale inside English sentences ("the week of 8. Juni"; counts now follow the locale in a total and its change line alike, issue 4), where QA suggested `'en'` throughout. (docs/units/17-stats.md, Build (QA fix round 1))
- [FIX 17.3b, batch 9] "Other" is still its own row for a single sixth song. (docs/units/17-stats.md, Build (QA fix round 1))
- [FIX 17.4a, batch 9] From 17 Review: the Stats page's "Couldn't load your stats" takes its reason from the sessions read's error when there is one, also when it is the loops read that failed to load (`sessions.error ?? loops.error`, from Unit 16). (docs/units/17-stats.md, Review)
- [FIX 17.4b, batch 9] From 17 Review: the page works its dates out when it renders, so one left open past midnight shows yesterday's "today" until something redraws it. (docs/units/17-stats.md, Review)
- [FIX 17.5a, 17.5b, batch 9] From 17 QA (after QA fix round 1): counts that are never grouped ("1100 h", "1100-day streak") sit beside one that is ("1,100" days), and a locale's date ending in a full stop doubles the sentence's. (docs/units/17-stats.md, QA (after QA fix round 1), issues 1 to 6)
- [FIX 17.5e, batch 9] From 17 QA (after QA fix round 1): under 358 px of page a 26-week map opens scrolled to its oldest week.

Each line carries its class, its id from the Unit 20 triage (`docs/loose-ends.md`) and the batch that closes it. Accepted: 17.3c, 17.5c and 17.5d, in the Accepted section.

### 20 Loose ends

**Goal:** every loose end in this plan is tied up: fixed, decided by Shane, accepted in writing, or handed to him as a check on a real device. Nothing new is built here that a Carried forward line didn't ask for.

The triage is `docs/loose-ends.md` (2026-11-28): every Carried forward line checked against the code and classed as gone, done, fix, decide, accept or human. The gone and done lines are deleted above, the human ones are rows of Open human checks, the accepted ones are the Accepted section below with their reasons, and decisions with nothing to build are in Decisions for Shane here. So each Carried forward line left is one a batch closes, with its class, id and batch in brackets. That file has, per batch, the items, the files, the fix, the test and the acceptance.

**Batches**, one Build session each, in order of value at the kit; no two touch the same files:

1. A slow connection never holds up Play: a loop's practice screen opens from the cached list after a short wait, and a failed read says so in seconds (13.06, 13.14, 13.16a, 14.4b). Done (docs/units/20-loose-ends.md, Batch 1)
2. Queued practice is never dropped: no write goes out as `anon`, and an outbox removal can't be replayed (13.23, 14.6). Done (docs/units/20-loose-ends.md, Batch 2)
3. Tab page, the score stays put: at a logged session, a Pause during Play's scroll, a rotation, and with the clef on show on a phone (13.26, 13.29, 13.30, 13.31a); and when playback closes the loop sheet on a phone (20.4a, found in batch 4). It runs last
4. Tab page, the loop sheet: starting playback with a count-in closes it so the number shows, focus and the playing loop are where they should be, typed bars come on screen (13.27a, 13.28a, 13.28b, 13.32). This is D1's default (keep the sheet and fix it), built. Done (docs/units/20-loose-ends.md, Batch 4); which count-ins close the sheet is D9
5. Practice history: a session is logged at the speed most of it was played at (17.1), and History is a row per day (D4's default, built). Done (docs/units/20-loose-ends.md, Batch 5); what History says about a day with a try at full speed is D10
6. Sign-in and sign-out: a refused token on a read recovers or goes to the login page (13.01), and unsent practice survives a forced sign-out (D2's default); "Sign out anyway", the other half of that default, discards unsent practice, so Shane is asked before it is built
7. Recordings: a loaded video survives a dropped connection (D8's default), and `sandbox` on the frame once the Human check has tried it (14.2)
8. Focus and small jumps: a refused status change, C to Off, the Songs list's cold start (13.21, 13.35c, 13.37a, 13.37b)
9. Stats copy and locale: English dates and grouped counts, the right error, the right "today", six songs named (17.3a, 17.3b, 17.4a, 17.4b, 17.5a, 17.5b, 17.5e)
10. Scripts and seed: a sweep for files in Storage with no song, which only lists them unless run with `--delete` (Shane is asked before it is ever run that way on the hosted project), and recordings in the seed (13.10, 14.5)
11. Docs only: the triage itself, with the **Accepted** section of this plan written in the same pass (no ACCEPT line is left in a Carried forward list). At the end of the unit it only confirms that every Carried forward list is empty

**Decisions for Shane**, asked on 2026-11-28 (options and the reasoning for each in `docs/loose-ends.md`). Each decision's recommendation is built as the default without waiting for his answer (AGENTS.md, Stage workflow: a question is asked, not parked). The unit keeps a running list of what was built for each decision, with the options beside it, in its handoff note (`docs/units/20-loose-ends.md`), and its report puts that list to him, so he can overrule any of them.

- D1, whether the Tab page still plays loops. Default: keep the loop sheet and fix its faults (batch 4, built)
- D2, unsent practice at a forced sign-out, and a Sign out that stays off (13.05a, 13.05b). Default: keep the outbox across a forced sign-out and offer "Sign out anyway" (batch 6; the second half is asked first, see below)
- D3, time with the page hidden on a laptop (13.18a). Default: keep it as it is, a hidden page ends the session; nothing to build
- D4, a loop's History by day (13.18b). Default: one row per day (batch 5, built)
- D5, short stretches on several loops adding up (13.20). Default: keep the 30 seconds per stretch; nothing to build. Look again after the pedal check (Open human checks, row 10)
- D6, the notation's size (13.36). Default: leave `NOTATION_SCALE` at 1; nothing to build. It waits on Shane reading a loop from the throne ("The look at the kit" row); raising it is a unit of its own
- D7, the video beside the score on a phone on its side (14.1). Nothing is built until the "Recordings" row has been looked at; then a column beside the score only if one line of score isn't enough
- D8, a playing video and a dropped connection (14.3). Default: a frame that has loaded is left alone (batch 7)
- D9, which count-ins close the Tab page's loop sheet (from batch 4). Built: only the count-in that starts a run, and never while the loop form is open; a repeat's count-in is heard but not seen behind a sheet opened mid-loop. The other options are every count-in closing it, or a beat count in the sheet's header
- D10, what History says about a day with a try at full speed (from batch 5). Built: one line under the History's total, the sentence the Stats page has under Loop progress ("Each day counts at the speed you spent the most time at…"). The other options are "mostly 80%" in each row, or the day's top speed beside it ("80%, up to 100%"), which needs the tracker to keep it

Waits that stay, because only a real device can settle them: `sandbox` on the YouTube frame (14.2), D6 and D7.

Shane's standing exceptions for this unit (2026-11-28), where he is asked first and nothing is built or run until he answers: any database migration (no batch needs one as written); anything that deletes user data (batch 6's "Sign out anyway", which discards unsent practice, and batch 10's sweep run with `--delete`); and anything sized L (D1's "make the sheet a list", D6's bigger notation, Web Locks for 13.22).

**Acceptance:** every Carried forward list in this plan is empty, or holds only Accepted items; each batch that was built meets its acceptance in `docs/loose-ends.md` with `npm run check` and `npm run e2e` green; Open human checks describes the screens as they are.

**Test focus:** each fix's own test, named in its batch. **QA focus:** the Tab page and the practice screen on a phone, upright and on its side, on a throttled and a dropped connection. **Human check:** the Open human checks table, which batches 3, 4 and 7 lean on.

**Carried forward**

None yet.

## Open human checks

Rewritten in the Unit 20 triage (2026-11-28) for the screens as they are now: the Tab page is `/songs/:id/play`, the practice screen `/songs/:id/loops/:loopId`, the overview `/songs/:id`. `docs/loose-ends.md` says what became of each earlier row; ids in brackets are its items. None of these is recorded as done; delete a row once it is. Everything audible is still unverified.

| From         | Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01, 05, 08   | **First sound on iOS.** iPhone and iPad on the live app: the first Play tap makes sound on the Tab page and on a loop's practice screen, with the count-in off and on, and with the ringer on silent; the screen stays on while playing; lock and app switch mid-play                                                                                                                                                                                                                                                                                                                                                                                          |
| 01, after 13 | **Drum sound.** By ear on phone and laptop: MuseScore's kit over Sonivox (snare, hi-hat, toms, the cymbals' level, the drums lifted over the band); a song whose drum track uses another kit program, which falls back to Sonivox's kit (A13.1)                                                                                                                                                                                                                                                                                                                                                                                                                |
| 01, 07, 08   | **Loop seam.** A loop's seam at 50%, 100%, 200% and a typed BPM. With "before every repeat": does each repeat land on the downbeat, and is the last bar clipped (07.2, 07.4). Start latency. Memory and battery on a long loop. `repeats.gp` bars 4 to 5 (13.13)                                                                                                                                                                                                                                                                                                                                                                                               |
| 04           | iPhone and Android: `.gp` isn't greyed out in the picker, and an upload works; on the LAN dev server too (the non-secure-context hash and id fallbacks). A real `.gp5` or `.gpx` if one is on hand                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 05, 16       | Every device: speed, metronome, mute, the track mixer and a changed metronome sound mid-play with no click, gap or restart; sound stops at once on leaving the page; rotating mid-play; 20 fast Play/Pause taps                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 06           | Tab page on phone and tablet: a tap on a bar seeks there and a swipe never does; auto-scroll feels smooth on iOS; the tab opens with the clef on show (13.26); in an installed PWA the sticky bar sits below the status bar                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 08, 16       | **Making a loop.** Phone at the kit: "New loop" on the Tab page, picking two bars by tap with the sheet open (thumb reach, the keyboard over the form); on the practice screen "Show whole song", pick bars, hear them, "Save as loop". Laptop: dragging across bars, across a line end too                                                                                                                                                                                                                                                                                                                                                                    |
| 08, 16       | **Count-in on screen.** Practice screen on a phone, upright and on its side: the 1-bar and 2-bar count-in number is readable from the throne and doesn't cover the bars being read (13.33b). Tab page: Play, Space or "Play loop" with the loop sheet open closes it for the number (is it readable the moment the sheet drops away?); with "before every repeat", a sheet opened mid-loop hides each repeat's count-in, which is only heard (D9: is that enough?); the score slides on the downbeat (13.33a); making a loop on a phone and playing it moves the score at Play and again at Pause (20.4a). Safari and Firefox: everything ran on Chromium only |
| 09, 16       | **Practice is remembered.** Practise a loop for a minute, pause (nothing should appear), go back to the song: the summary line and the loop's History are right. Then mid-practice lock the phone, switch apps, close the tab: each leaves one session with no pocket time in it (iOS Safari and an installed PWA especially: `pagehide` and `keepalive` only ran on Chromium). With "before every repeat": one session, without the count-ins                                                                                                                                                                                                                 |
| 09, 16       | Two devices: save a loop on the laptop, open it on a phone that had the song open a minute before; change its speed on one and open it on the other. The Songs list's order after practising two songs; Mark finished and Reopen on the overview. Count the taps from opening the app to sound (Songs, song, loop, Play)                                                                                                                                                                                                                                                                                                                                       |
| 10           | A real page-turner pedal on a laptop and an iPad (Page Up / Page Down or the arrows), on the practice screen and the Tab page: it switches loops while playing with no gap, and Space or the pedal never restarts a loop by accident (D5 waits on this). Safari: Space on a focused button plays or pauses and doesn't also press it; a Bluetooth keyboard's Space starts sound on iOS                                                                                                                                                                                                                                                                         |
| 11           | iPhone: Add to Home Screen, open from the icon, sign in with the 6-digit code, open a song, then airplane mode: it plays, a loop's practice and a changed speed reach the server once after reconnecting, also after closing the app offline. Android Chrome: the install prompt and the maskable icon. A deploy while the installed app is open shows "Reload to update"                                                                                                                                                                                                                                                                                      |
| 12, 16       | **The look at the kit.** Phone in a dim room and a bright one: the score paper and notation readable from the throne on the practice screen (D6: is it big enough?), the orange not too loud. Installed PWA on iPhone and Android: the icon, the maskable crop, the status bar colour                                                                                                                                                                                                                                                                                                                                                                          |
| metronome    | Metronome sounds, phone and laptop by ear: each sound over the kit (loud enough, not harsh, the slider's louder end), beat one louder, 2 and 4 per beat in time at 50% and 150%, a sound changed while paused plays from the same bar, and one changed while playing carries on in time                                                                                                                                                                                                                                                                                                                                                                        |
| 14           | **Recordings.** A real YouTube video on phone, tablet and laptop: first tap, inline on iOS, slowed with YouTube's speed menu; a video whose owner blocks embedding; a Spotify link opening the app on the phone and coming back. The tab under the video on a phone: one bar to a line upright (14.8c), one line on its side (D7). A short Wi-Fi drop mid-video (D8). Then try `sandbox` on the frame: plays, fullscreen, "Watch on YouTube" (14.2)                                                                                                                                                                                                            |
| 16, 17       | A week of practice with the songs-first flow: the speed stepper (±5%, ±1 BPM, typed), the overview's summary, and the Stats page read against what was really practised                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 19           | At the kit, a song with a YouTube link: line it up ("Bar 1 starts now" as the song comes in, and with the video paused on the downbeat) and play along on the tablet and on a phone in portrait. Whether a bar-by-bar mark is enough to read from and a turn a line early is early enough; whether a line-up by ear is always a little late (then a fixed reaction time comes off the press); how far a real recording drifts from its tab over a song and whether the nudges are enough                                                                                                                                                                       |
| 19           | A real phone: "Type a time" brings up a keyboard with a colon and letters and no autocorrect bar in the way; with the video paused, a drag on YouTube's own bar moves the mark within a second; the first turn of the phone to its side mid-song keeps the bar being played on show. iPhone and iPad Safari (everything ran on Chromium): the player API in an iOS frame, Space from a Bluetooth keyboard. A video with an advert in it, if one turns up: does the mark hold still through it                                                                                                                                                                  |
| 20           | **History by day.** After a real sitting that ends with a try at full speed, read the overview: the summary ("80% → 100%"), the loop's line (100%) and History's row for today (80%, with the line under the total saying a day counts at the speed most of it was played at). Does the 80% read as right, or as the 100% gone missing (D10)? Then with a week of rows on the phone, in the Tab page's loop sheet: can the speeds be read down the list at arm's length, though they don't line up and some rows wrap (20.5a)?                                                                                                                                 |

## Accepted

Real, known, and not worth fixing now, written down so nobody raises them again (AGENTS.md, Stage workflow: nothing is carried a third time). Each has why it was accepted and what would make it worth another look. Ids and evidence are in `docs/loose-ends.md` (Unit 20 triage, 2026-11-28). An item that is fixed, or stops being true, is deleted from here.

**Data and sync**

- **13.02** `useUpdateSong`'s `onSuccess` merges the whole server row (08 Copilot review). Unreachable: song edits are online only, one locked form per song, and the row it merges has no `last_played_at`, the one song column written from a queue. Revisit if song edits are ever queued; then do as `useUpdateLoop` does.
- **13.04** A device whose clock is more than a day ahead has every session refused (23514), on replay from the outbox too, which then drops it (09 Build). It needs a clock wrong by more than a day. Revisit if a real session is ever lost this way; the client would then take its time from the server.
- **13.07a** Song files kept on the device have no size cap or eviction (11 Build). A tab is tens of kilobytes and the store asks for `navigator.storage.persist()`. Revisit at hundreds of songs, or if the app ever keeps bigger files.
- **13.07b** A stored file alphaTab can't read stays stored (11 Build). Files are parsed before upload and never change, so it needs a corrupted IndexedDB row. Revisit if a song ever fails to open from the device's copy.
- **13.07c** A replayed loop edit, one whose answer was lost, can overwrite a newer change made on another device (11 Build). Last write wins, as the Risks table says, and it needs two devices and a lost answer. Revisit if a saved speed is ever seen to go back.
- **13.15** A reload about a second after an upload, with every read failing, can show "No songs yet" from the cache written before the upload (13 QA issue 3). Seen once; it needs a reload inside the second before the cache is saved, with reads failing. Revisit if it is seen again; the fix is "Couldn't refresh" over cached data.
- **13.22** Two tabs share one outbox: a tab opened while another has a loop edit queued replays that entry too, and the older value can land last (bug hunt D2). It needs two tabs and an edit queued offline, and the fix is entries claimed across tabs with Web Locks, a unit of its own. Revisit if the app is really used in two tabs at once.
- **13.25** A loop deleted on another device: a speed change on it here fails as "deleted" and the loop leaves the list (the practice screen says "Loop not found", the Tab page's sheet drops it with no message), and its open edit form says so only after a refetch (08 Build, 08 QA). It needs two devices. Revisit if it confuses anyone practising on two.

**Slow connections** (from Unit 20, batch 1; evidence in `docs/units/20-loose-ends.md`, Batch 1)

- **20.1a** Two waits have no cap: "Loading the loop…" for a loop the cached list lacks, and any first load with nothing cached. On a connection that drops requests they end in about 3 s; on one that hangs without dropping, they last as long as the browser takes to give up, three times over. The device holds nothing to go by, and "Loop not found" after 2 s for a loop another device has just saved would be wrong. Revisit if a screen is seen stuck on "Loading…" at the kit; the fix is a timeout on each read (an `AbortSignal`), a change to every read.
- **20.1b** `?source=` on a connection that works but takes over 2 s to read the links, with nothing cached, lands on the tab; the recording then appears in the switch, one tap away, and doesn't open by itself. The cap that keeps a hung connection from holding up the tab can't tell slow from hung. Revisit if it happens at the kit; a longer wait for sources alone is one constant.
- **20.1c** A loop opened from the cached list after the 2 s wait plays the cached speed while the list may hold one another device has saved since, and the next speed change here is saved over it. Last write wins, as the Risks table says; it needs two devices and a read that hangs. The refetched speed also counts as "moved" for "Mark finished?", as any refetch's does. Revisit if a saved speed is ever seen to go back.
- **20.1d** Two reads made outside a query lost postgrest-js's retries with the rest: the upload's duplicate check (`findSongByHash`) and `createLoop`'s read back after "already saved". One lost request fails the upload (nothing stored) or the save (the form keeps what was typed), under a button that can be pressed again; tests pin both. Revisit if uploads on flaky Wi-Fi often fail at the check; then ask for `.retry(true)` there as `findSavedSong` does.

**Queued writes** (from Unit 20, batch 2; evidence in `docs/units/20-loose-ends.md`, Batch 2)

- **20.2a** A queued write asks for the session, and supabase-js then asks again by itself as it builds the request. A write can still go out as `anon`, and be dropped on its 42501, only if the access token's last second ends between those two reads, a few milliseconds apart, with the refresh failing: inside the 90 s before expiry auth-js still hands out the stored token after a failed refresh, so only the real expiry counts. Closing it means signing each queued write with the token in hand, a change to every queued write's API function. Revisit if a 42501 on a loop edit or a session log is ever seen for a signed-in user, or if supabase-js stops handing out a still-valid token after a failed refresh.
- **20.2b** Reads are not held back: with no session in hand (the refresh failed for the connection) a query goes out as `anon` and is refused (401 with 42501; `anon` has no grants, so it is a refusal, never an empty list). A list already on show keeps its rows, as after any failed refetch; a first load says it couldn't load, with "Try again", which works once the refresh has got through. Nothing is lost. Revisit with batch 6 (13.01), which decides what a refused read does, or if that message is seen at the kit.
- **20.2c** A held-back write on a hidden page isn't tried again until the page is shown: TanStack Query waits for focus between retries, as it does for a dropped request. After the connection is back it can take up to a minute more, plus the back-off (30 s at most): auth-js answers from its last failed refresh for 60 s. The entry is in the outbox meanwhile, so the next start sends it, and the value stays on show. Revisit if practice is seen arriving minutes late on a second device.
- **20.2d** An outbox row whose delete failed stays, so that page counts it as unsent and Sign out stays off there until the next start, which sends the write once more (harmless: every queued write is safe twice) and deletes the row. It was so before this batch; a delete IndexedDB refuses needs a broken or closing database. Revisit if Sign out is ever seen stuck with nothing on its way.

**Playback and the score**

- **13.09a** The bar cursor and loop highlight are drawn with `color-mix()`, which Safari before 16.2 drops, leaving both invisible there (12 Review). iOS 16.2 is four years old. Revisit if anyone reports no cursor.
- **13.09b** Under "reduce motion" the beat cursor still glides (12 Review). Kept on purpose: the glide is how it keeps time (AGENTS.md, Visual design). Revisit if Shane would rather it sat on each beat's notes (`player.enableAnimatedBeatCursor: false`).
- **13.11** A bar with a tempo change part-way through shows its starting tempo for the whole bar (06 Build). By design (`barStartTempos`), and no fixture or real export has had one. Revisit when a real file has one.
- **13.12** If "before every repeat" can't count in for a bar (a tempo or meter of 0 or less), the service plays on and a session would be logged at every pass of 30 seconds or more (09 Build). Every bar a song has gets both; that alphaTab can never import such a bar isn't proven. Revisit if a loop's History ever shows a row per pass.
- **13.13** A loop that starts on a repeat's last bar and runs past it plays the bar before it too (bars 4 to 5 of `repeats.gp` play 4, 3, 4, 5) (08 Test bug 1, 08 QA issue 3). Pinned by `tests/unit/loop-fixtures.test.ts`, and by ear it is in the "Loop seam" row of Open human checks. Revisit only if it sounds wrong there.
- **13.24** A "playing" from alphaTab for a play the service called off, arriving after the next count-in's downbeat, is taken as the new play's, and its "paused" then reads as a pause (bug hunt P1). It needs a worker more than a bar late. Revisit if playback is ever seen to pause by itself after a count-in.
- **13.27b** After a rotation or a resize across 768 px the picked bars or the paused loop can be outside the score box (08 QA fix round 1, N5). alphaTab's own re-layout brought it back every time QA tried, but for one press inside about 150 ms, and the practice screen draws the loop's bars alone. Revisit if it is seen at the kit after batch 3's rotation fix (13.29).
- **13.33a** On the Tab page a count-in leaves its bar where it is when the bar is already on show, and alphaTab slides it to the start of the box on the downbeat, up to 453 px on a tablet (08 QA fix round 1, N2). Tab page only: the practice screen draws the loop's bars alone. It is in the "Count-in on screen" row of Open human checks; revisit if the slide gets in the way there.
- **13.33b** On the Tab page in page layout, a loop in the last lines of the song sits under the count-in number (08 QA fix round 1, N3). Tab page only; whether the number covers the bars on the practice screen is in the same row. Revisit if that check says it does.

**The Tab page's loop sheet** (13.31b, 13.34a, 13.35b, 13.38a, 13.38b, 20.4b and 20.4d go away if D1 is ever answered "make the sheet a list"; 20.4c and 20.4e are about the loop form, which that answer keeps)

- **13.31b** The loop sheet closed while the controls are folded makes the page too short for the Pause to scroll back, so the score moves by up to 32 px (12 QA after fix round 3, issue 1). Rare and small. Revisit if it is noticed at the kit.
- **13.34a** "Mark finished?" sits in the playing loop's item, inside the sheet that "Play loop" closes on a phone, so the prompt for a loop opened already at full speed is behind the closed sheet (09 Build). Tab page only: the practice screen, where a loop is now practised, shows it under the score. Revisit if loops are still mostly finished from the Tab page.
- **13.34c** A loop's History opens inline and makes a long item longer (09 Build). It shows ten rows, then "Show all", and is a row per day since batch 5, with one line under its total saying how a day's speed is chosen (D10). Revisit if it is still long.
- **13.35b** The sheet lists every loop of the song in one column with no grouping or paging (09 QA issue 6). A song with 30 loops was walked in 16 QA. Revisit at a song with far more.
- **13.38a** On a phone with the sheet open and nothing playing, about 112 px of the score shows (08 QA issue 6). Only while a loop is being made or chosen. Revisit if picking bars under the sheet is too cramped at the kit (the "Making a loop" row of Open human checks).
- **13.38b** A phone on its side with the sheet open leaves a 284 x 234 px score (08 QA). Same case, same reason, same check.
- **20.4b** In the reopened sheet "Exit loop" is below the list's edge on a phone and a laptop: the playing loop's item is 412 px tall (542 with "Mark finished?") in a list of 360 to 380, so the sheet shows it from its top, with the speed all in view, and "Exit loop" (and, with the prompt, "Restart loop", the status button and "More") one scroll down (20 batch 4 QA issue 2). The card visibly runs on past the edge, and the speed is what the sheet is reopened for. Revisit if leaving a loop from the Tab page is fumbled at the kit; then put "Exit loop" on the row with "Restart loop", or let the sheet be taller.
- **20.4c** Correcting a typed bar number flashes the score to another bar and back: 12 to 13 by Backspace and "3" shows bar 12, bar 1, bar 13, each keystroke that makes a range scrolling at once (20 batch 4 QA issue 5). The eyes are on the field, on a phone the keyboard is over half the screen, and the last move is right. The cure is a short wait before scrolling, a timer in the form with its own cancel paths. Revisit if it is noticed with a phone's keyboard up (the "Making a loop" row of Open human checks).
- **20.4d** Keyboard, a long list of loops: the first Tab from the reopened sheet's header goes to "New loop" at the top of the list, and the browser scrolls the list back there from the playing loop; the loop's speed is then many Tabs away (20 batch 4 QA issue 6). It is the browser bringing the focused control on show, which it must: stopping the scroll would leave focus on a button out of sight, and sending that Tab to the playing loop would change the sheet's Tab order. "Loop speed" in the controls bar opens the sheet with focus on the loop's speed. Revisit if anyone works a song with a dozen loops from the keyboard on the Tab page; then the header's next stop while a loop plays is that loop's item.
- **20.4e** With the loop form open, Play with a count-in leaves the sheet open, so below 1024 px the number is behind it (what 13.32 was, for this case only). On purpose: taps on the score pick the form's bars for as long as it is open, and a sheet closed over the form hid that mode (20 batch 4 QA issue 3); a covered number is the lesser fault, and the clicks are heard. The same holds for a form cancelled or saved while it counts in: the sheet stays until the next start. Revisit if hearing a passage before saving it, with a count-in, is common on the Tab page; the practice screen's "Show whole song" form plays the picked bars and has no sheet.
- **20.4f** "Play loop" for a saved loop that runs past the end of the loaded score is drawn enabled, and a press does nothing and says nothing (20 batch 4, Copilot review: `playLoop` refuses such a loop, and since that round the press no longer closes the sheet or moves focus either; the button's gate is still `canPlay` alone). Nobody found a way to reach it: the song's stored bar count, which the loop form and the database check a loop against, and the score loaded from the same file would have to disagree. Revisit if a loop is ever seen that the score lacks (a file replaced under a song, if that is ever built); then the button takes the action's own precondition and says why it is off.

**A loop's History** (from Unit 20, batch 5; evidence in `docs/units/20-loose-ends.md`, Batch 5)

- **20.5a** A History row is a run of text, not columns: the day and the time vary in width, so the speeds don't line up under one another at any size, the speed is in the same muted ink as the rest, and in the phone's loop sheet (332 px, where the BPM shows) rows that begin "N days ago" take two lines and the others one (20 batch 5 QA issue 2; `b5-390x844-sheet-history.png`, `b5-1440x900-overview-history.png`). Nothing is cut off or wrong, and the fix is a redesign of the row (a grid of day, time, speed, passes, the speed in `ink`), which wants real rows to judge it by. Revisit when Shane has read a week of his own rows on the phone (Open human checks, "History by day") and says the speeds can't be read down the list.
- **20.5b** A session dated on a later day than the device's today is counted in History's "Today" row and on its own later day by the Stats page: for that loop History says "1 day" while its Stats row says "2 days" and its chart has a point on tomorrow, until tomorrow comes (20 batch 5 Test; `sessions.test.ts` pins the difference). It needs a device clock that was ahead when the session was logged (the server allows a day) or was put back since; time zones alone can't do it. Folding the day in Stats too means giving `dailySpeeds` the time and passing it through `loopProgress` and its callers, for a case nobody has seen. Revisit if a real History and its chart are ever seen to disagree; then Stats folds a day after today into today, as `historyDays` does.
- **20.5c** The rule for a day's speed is written twice, in `historyDays` (`practice/sessions.ts`) and in the Stats chart's `dailySpeeds` (`stats/loopProgress.ts`), held together by a test that runs both over one table. Not shared on purpose: History also keeps the exact ratio played (for a typed BPM) and folds a day after today into today, and `dailySpeeds` does neither. Revisit if the rule changes (a third place needing it, or D10 answered with the day's top speed); then one function gives both.

**Recordings**

- **14.4a** `?source=` naming a recording that a list read in the last 30 seconds lacks is settled as Tab without a read since the page opened (14 Review). It needs a link saved on another device and the address typed here inside that half minute. Revisit if links to a source are ever shared between devices by the app itself.
- **14.4c** A link out opened by a middle click or "Open in new tab" runs no click handler, so no `last_played_at` is written, and offline it opens a tab that can't load (14 Review). It costs a place in the "recently practised" order and nothing else. Revisit if that order starts to matter more (Unit 15 logs time played instead).
- **14.7** A look-alike of YouTube or Spotify in another script (a Cyrillic letter, or its punycode host) is saved as a plain link named by its punycode host, not refused (14 Test bug 1). It is never played, embedded or called YouTube (`songLinks.test.ts` pins that), and the user pastes their own links. Revisit if links ever come from someone else.
- **14.8a** On the overview's cold load, a second row of buttons or Other links push "New loop" and the loops down when the links arrive (14 Build, QA fix round 1). The usual cases (no link, a YouTube Original and Drumless) move nothing. Revisit if songs with Other links become common.
- **14.8b** A failed save of the recordings form that was left is said on return, but what was typed went with the form (14 Build, QA fix round 1). The form is two pasted links. Revisit if the form grows.
- **14.8d** QA's "Paste" button per link field wasn't built (14 QA issue 10). The field takes a paste in one tap. Revisit if pasting on a phone at the kit turns out fiddly.

**Stats**

- **17.3c** The chart's label boxes are estimated from a width per character (`approxTextWidth`), not measured (17 Build, QA fix round 1). `stats.spec.ts` measures the real boxes with the app's font. Revisit if the font changes.
- **17.5c** A capped "Other" bar looks equal to the top song's (17 QA after fix round 1). `barShare` caps it at the scale on purpose (17 QA issue 9), and its minutes are written beside it. Revisit if "Other" is often the biggest row.
- **17.5d** Under 358 px of page the charts' text is 9.3 px (17 QA after fix round 1). That is narrower than any phone the app is laid out for. Revisit if a phone that narrow is ever used.

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
- ~~Stats: speed over time, weekly practice time, streaks~~ (shipped in Units 16 and 17)
- Setlists built on jam mode
- Full track mixer: volumes, and saving per song (per-track mute and Mute all shipped in Unit 16)
- Remember jam speed per song
- Notes per loop
- Custom shortcut and pedal mapping
- MIDI import (quantize drum MIDI into an alphaTab score), only if GP exports turn out to be a hassle
- E-kit input over Web MIDI to score timing (desktop and Android only)
