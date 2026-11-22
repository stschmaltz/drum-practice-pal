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
- Playback controls in both modes: metronome with volume, mute drums, count-in (off / 1 bar / 2 bars, at start only or before every repeat)
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
| Hosting       | Cloudflare Pages                                                                                                                     | Free, fast, static SPA                                                  |
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

Every unit runs through four agents in order, each starting cold and picking up from files in the repo, not chat history.

1. **Build**: implements the unit to its acceptance criteria.
2. **Test**: writes tests that prove each criterion.
3. **QA**: runs the app at phone, tablet and desktop sizes and tries to break it.
4. **Readability**: refactors for clarity with no behavior change.

If QA finds a real bug, a Build agent fixes it from QA's notes, then Test and QA re-run on the affected area before Readability. Merge after Readability with all checks green.

**Repo conventions**

- `AGENTS.md` at the root: stack, commands, folder structure, naming and patterns. Later units update it when a pattern is set.
- `docs/units/NN-name.md`: one handoff note per unit. Each agent appends its own section: what it did, decisions, open issues, how to verify.
- One branch and one PR per unit; one commit per stage.
- Every stage ends green: `npm run check`, and `npm run e2e` once e2e covers real flows.
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

## Units of work

Thirteen units, run in order. Each is sized for one Build agent session. Unit 01 proves the audio stack on real devices before anything is built on it.

| #   | Unit                                       | Depends on |
| --- | ------------------------------------------ | ---------- |
| 00  | Scaffold, conventions, CI, preview deploys |            |
| 01  | Spike: alphaTab on real devices            | 00         |
| 02  | Supabase schema, auth, storage             | 00         |
| 03  | App shell and auth UI                      | 02         |
| 04  | Song library and upload                    | 03         |
| 05  | Player core                                | 01, 04     |
| 06  | Jam mode                                   | 05         |
| 07  | Count-in                                   | 05         |
| 08  | Loops                                      | 06, 07     |
| 09  | Practice sessions and progress             | 08         |
| 10  | Keyboard shortcuts and pedals              | 09         |
| 11  | PWA and offline                            | 09         |
| 12  | Polish and release                         | all        |

### 00 Scaffold, conventions, CI, preview deploys

**Goal:** an empty app that builds, tests and deploys, with conventions every later agent follows.

- Vite + React + TS (strict), React Router, Tailwind, TanStack Query, ESLint, Prettier
- Vitest + Testing Library, Playwright with phone (390x844), tablet (820x1180) and desktop (1440x900) projects
- Folder structure per `AGENTS.md`
- Fixture script: alphaTex sources exported to GP7 via alphaTab: a 16-bar 4/4 groove at 120 BPM; a tempo change (120 to 90 at bar 9); multi-track (drums, bass, guitar); a 3/4 song
- `AGENTS.md`, `docs/plan.md`, `docs/units/`
- GitHub Actions: typecheck, lint, unit tests, e2e on PRs. Cloudflare Pages preview deploy per PR

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

- Routes: `/login`, `/` (On the go), `/library`, `/songs/:id`, `/settings`; SPA fallback `public/_redirects`
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

### 07 Count-in

**Goal:** the count-in options from the MVP scope.

- Off, 1 bar, 2 bars; at start only, or before every loop repeat
- Clicks follow the meter and the tempo at the start bar x current speed; accented first beat
- Scheduled on the AudioContext clock; playback resumes on the downbeat
- Big visual beat counter, readable from the throne
- `user_settings` defaults, overridable from the controls bar

**Acceptance:** count-in matches meter and speed, including 3/4 and after a tempo change; "every repeat" pauses at loop end, counts in, resumes on the downbeat.

**Test focus:** pure scheduler function (tempo, meter, ratio, bars to click times), tested exhaustively. **QA focus:** toggling mid-loop, extreme speeds. **Human check:** by ear.

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

- Space play/pause; up/down speed +/-5%; left/right and PageUp/PageDown previous/next loop; M metronome; D drums mute; C cycle count-in; ? overlay
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

### 12 Polish and release

**Goal:** ship it to yourself.

- Empty, loading and error states everywhere; touch targets 44 px+
- Full e2e journey on all three profiles: sign in, upload, jam, save loop, practice, hit target, finish
- Production Cloudflare Pages and Supabase; README

**Acceptance:** the journey passes in CI; a real-device pass finds nothing blocking.

**Test focus:** the e2e journey. **QA focus:** first-run experience. **Human check:** a week of real practice.

## Risks and mitigations

| Risk                                                               | Mitigation                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------- |
| iOS Safari Web Audio quirks (unlock, backgrounding, ringer switch) | Real-device spike in 01; tap-to-start; ringer hint in UI            |
| Thin default drum soundfont, or a large better one                 | Pick in 01; service worker caches it                                |
| alphaTab loop seam artifacts                                       | Listen in 01; report upstream if drums are affected                 |
| Count-in drift                                                     | AudioContext scheduling; pure scheduler tests; human check          |
| Songsterr export variation                                         | Test real exports locally in 04; null drum track handled            |
| Agent drift from earlier patterns                                  | `AGENTS.md`, handoff notes, one PR per unit, Readability every unit |
| Two devices edit one loop offline                                  | Last write wins on `updated_at`; sessions append-only               |
| Copyrighted tabs committed                                         | Synthetic fixtures in git; real exports gitignored                  |

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
