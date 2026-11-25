# Unit 12: Visual design

## Build

### Summary

The app has one look, built from design tokens, and nothing about what it does changed.

- **Tokens** live in `src/index.css`'s `@theme static` block: colours (surfaces, lines, text, the brand orange, focus, danger / warning / success, the score's paper and ink), the type steps the app adds (`text-readout`, `text-count-in`), `spacing-touch` (44 px, `min-h-touch`), `radius-control` / `radius-card`, `shadow-card` / `shadow-sheet` / `shadow-dialog`, and two small animations (`animate-beat`, `animate-fade-in`). Tailwind's own palette is switched off (`--color-*: initial`), so a palette class such as `text-sky-400` draws nothing, and `tests/unit/designTokens.test.ts` fails on any palette class, `bg-[#…]` or hex string in `src/`, and on any colour utility that names no token.
- **Contrast** is checked in that test over the pairs the screens draw (text on each surface it sits on: 4.5:1; field edges, the focus ring, the pressed toggle's ring, the brand fill: 3:1), with a pure WCAG contrast module, `src/lib/themeTokens.ts` (`parseColorTokens`, `contrastRatio`, own test). The test also checks the copies of token values outside the stylesheet: the score's colours (`scoreTheme.ts`) and the manifest's and `index.html`'s theme colour.
- **Identity.** One dark theme (`canvas` `#0d0f14`) with a warm stick-tip orange (`brand` `#ff8a3d`, dark `on-brand` text on it). The mark is a snare with two crossed sticks, kept as data in `src/components/brandMark.ts`, drawn in the page by `Brand.tsx` (`BrandMark`, `Wordmark`: "Drum Practice" with "Pal" in the brand colour) and into the icons by `npm run icons`, which now reads its colours from `index.css`. Manifest `theme_color` / `background_color` and the `theme-color` meta are `canvas`.
- **Shared components**: `styles.ts` rebuilt on the tokens (`buttonClass`, `pressedButtonClass`, `primaryButtonClass`, `ghostButtonClass`, `quietButtonClass` / `quietPressedButtonClass` for a list item's secondary actions, `toolButtonClass(pressed)` for the controls bar, `segmentOnClass` / `segmentOffClass`, `dangerButtonClass`, `inputClass`, `selectClass`, `cardClass`, `activeCardClass`, `linkClass`, `labelClass`, `inlineIconClass`, `focusRing`). New: `icons.tsx` (`Icon`, line icons in `currentColor`, always `aria-hidden` beside a label), `StatusMessages.tsx` (`LoadingLine` with a spinner, `EmptyState` with an icon and a next step). `ErrorAlert`, `LoadErrorAlert`, `OfflineNote`, `FullPageMessage`, `PageHeader` redrawn.
- **Every screen redrawn**: login (wordmark, card), the shell (sidebar with the wordmark and icon links, the active one marked by a brand edge; phone tab bar with icons over labels, still 56 px), On the go (cards, the two views as a segmented control), library (drop zone, song cards, quiet Edit / Delete), song page (sticky readout with a bottom edge, controls bar, loop line, score box, session notices with icons), loop panel (sheet with a shadow and a chevron header, "Now looping" card, loop items with Play loop as the one filled button and the rest quiet), loop history, settings (each section a card, count-in pills), the shortcut overlay, the count-in counter, the offline banner and update line, not-found.
- **Controls bar**: icons with labels. On a phone it is three rows (390 px): the four buttons as one row of tiles (icon over label), speed beside the metronome volume (the volume shows a speaker in place of its words and readout, which stay for screen readers), then the count-in pair, the mode select giving way first. A tablet is the same, its tiles with the label under the icon; from 1024 px the buttons are a line of icon-and-label buttons beside the sliders.
- **The score**: warm paper (`score-paper`), ink notation, staff lines a step lighter, bar numbers in the score accent, passed to alphaTab as `display.resources` (`scoreTheme.ts`, `SCORE_RESOURCES`). The cursor bar, the beat cursor and the loop highlight in `index.css` use the brand and score-accent tokens. Notation stays at alphaTab's default size (`NOTATION_SCALE` 1, see Decisions); it reads larger for the darker ink and the lighter staff lines, not a bigger scale.
- **Motion** is small and decoration only: colour transitions on controls (150 ms), the count-in number pops on each beat (`motion-safe:animate-beat`, re-keyed per beat), the overlay, the "Mark finished?" prompt fade in, the loading spinner turns. `motion-safe:` on each, and `index.css` cuts every animation and transition to 0.01 ms under `prefers-reduced-motion: reduce` (WCAG 2.3.3).
- **Kept**: 44 px targets (`min-h-touch`; tiles are 56 px), a visible focus ring on every control (`focus-visible:outline-focus`, `#8ecbff`, apart from the brand so it shows on an orange button), every accessible name unchanged (icons are `aria-hidden`; visible text is the same words).

### Files

New:

- `src/lib/themeTokens.ts` (+ test): token parsing and WCAG contrast.
- `src/components/icons.tsx`, `src/components/Brand.tsx`, `src/components/brandMark.ts`, `src/components/StatusMessages.tsx`.
- `src/features/player/scoreTheme.ts`: the score's colours and size for alphaTab.
- `tests/unit/designTokens.test.ts`: contrast pairs, tokens only, copies in step.
- `docs/units/12-shots/build-*.png`: the Build stage's own screenshots (login, home, song, loop, playing, overlay, library, settings at each size).

Changed:

- `src/index.css` (tokens, base styles, score and highlight colours, `touch-action: manipulation` on the score, reduced motion), `index.html`, `vite.config.ts` (theme colour), `scripts/generate-icons.ts` and the five icons in `public/`.
- `src/components/*` (above), `src/App.tsx`.
- Every screen: `LoginPage`, `SignOutButton`, `AppShell`, `navItems` (each item has an icon), `NotFoundPage`, `OfflineBanner`, `LibraryPage`, `SongListItem`, `UploadPanel`, `OnTheGoPage`, `LoopHistory`, `SettingsPage`, `ShortcutOverlay`, `SongPage`, `PlayerControls`, `CountInCounter`, `LoopPanel`, `LoopSpeedControl`, `LoopStatusButton`, `LoopEditorForm`, `alphaTabEngine.ts` (score resources and scale).
- `src/features/spike/SpikePage.tsx`: palette classes mapped to tokens only (the palette is off; Unit 13 retires the page).
- `src/features/library/UploadPanel.test.tsx`: the drop zone's highlight class is now `border-brand`.

### Decisions

- **Dark only, score on paper.** The app is used in a dim room at the kit; the notation is the one light surface, warm rather than white so it doesn't glare, with dark ink so it still reads in a bright room. A light theme would double every pair to check; not asked for.
- **Tokens are hex in CSS, one source.** The token test, the contrast check and the icon script all parse `index.css`. Where a value must exist outside CSS (alphaTab takes colour values, the manifest takes a string) it is copied once and a test keeps the copy equal. `@theme static` puts every token on `:root`, used by a class or not, so `var(--color-…)` works anywhere.
- **The default palette is off**, not just unused: a stray `bg-neutral-800` draws nothing rather than a colour outside the system, and the token test names it.
- **Accessible names stayed put.** Every button keeps its words; icons are `aria-hidden`. Where a phone has no room for words (the metronome volume's label and readout), they are `max-md:sr-only`, so `getByLabel('Metronome volume')` and screen readers are unchanged. No e2e locator or unit test needed a change, apart from one class name in `UploadPanel.test.tsx`.
- **The shortcut overlay's Close moved to the top**, beside the title. Focus goes to Close on open, and a landscape phone scrolled the dialog down to it (10 QA issue 2); with Close first the title and first rows show. Still the only control, so Tab still stays on it.
- **`max-md:hidden`, not `hidden md:inline-flex`,** for a button shown only from 768 px: every button is `inline-flex` now (icon beside label), and a base `hidden` would not reliably win over it.
- **`Icon` defaults to `size-5`** only when its `className` has no `size-*`, so a colour-only class can't leave an icon at the SVG's natural size.
- **Notation scale stays 1.** At 1.15 every phone tap test failed (`jam.spec.ts`, `loops.spec.ts`, `count-in.spec.ts`): taps in the horizontal layout no longer landed on their bar. The engine's hit-test (`watchScorePointer` into `barIndexAtPoint`), the highlight (`highlightRects`) and the scroll (`barBounds`) treat alphaTab's `boundsLookup` as page pixels, which holds only at scale 1. Making them divide by the scale is engine behaviour, outside this unit; moved to Unit 13. `scoreTheme.ts` passes `scale` explicitly so the change is one constant once that is done.
- **Long loop names**: the "Looping …" line is clamped to two lines (`line-clamp-2`, the name in `title`), so an unbroken name can't stack a letter per line (08 QA issue 13).

### Async windows and inputs

None added. This unit changes classes, markup around existing text and alphaTab's rendering settings (set once at creation, like the layout). The count-in number is re-keyed per beat (a new element each beat, so its pop replays); that is rendering only, and e2e's beat recorder watches the whole body, so it still sees every beat.

### Carried forward

Dealt with here (deleted from Unit 12's list): the placeholder icons and the plain amber / sky banner lines (11 Build); the four-row controls bar (05 Build); the volume readout overflowing at 320 px, the sticky bar's missing bottom edge and double-tap zoom on the score (06 QA); the controls bar not regrouped (08 Build); the "Looping" line 220 px tall for a long name (08 QA issue 13); the shortcut overlay opening scrolled to Close on a landscape phone (10 QA issue 2); the home page's plain cards and toggle-button tabs, and the plain "Practice logged" / "Couldn't save" lines (09 Build).

Moved to Unit 13 (they change behaviour or layout decisions, not looks): the phone score opening 47 px sideways; the narrow tablet loop panel and the playing loop shown twice; the slider's 5% steps; loop bars not scrolled to after typing or a rotation; where the loop speed lives on a phone while practising, and the count-in number behind the open sheet (N1); the downbeat slide and the last-lines loop under the count-in number (N2, N3); "Mark finished?" behind a closed sheet; 09 QA issues 3, 4 and 6 and the sticky status-write error; 08 QA issues 5 and 6 and the landscape phone with the panel open; BPM on the home page.

### Known gaps

- Notation size is unchanged (see Decisions): the plan's "notation size readable from the throne" is met by contrast only until Unit 13 makes the engine scale-aware.
- Only Chromium was looked at, at 390 x 844, 820 x 1180 and 1440 x 900 (`docs/units/12-shots/build-*`). Safari's range inputs and selects draw with its own chrome (`accent-color` covers the fill).
- The tablet loop panel is still 256 px wide, so a loop item's five actions take three rows there (quieter now, but not fewer).
- Disabled controls are 50% opacity, which WCAG exempts from contrast; the disabled count-in mode select is faint.
- The phone's sidebar-less layout shows the wordmark only on the login page; the signed-in phone screens have no brand header (the tab bar is the frame).
- `public/sf-candidates/`, the spike page and its fixtures are untouched apart from token classes.

### Manual verify

1. `npm run icons` and check `public/icon-512.png` and the favicon: the orange snare with white sticks on near-black.
2. `npm run dev`, sign in (`demo@drumpal.test`), and walk every screen at a phone width: the controls bar is three rows, the tab bar has icons, the loop sheet has a chevron header.
3. Tab through any page: every control shows the light-blue focus ring.
4. In the OS, turn on "reduce motion": the count-in number no longer pops, the overlay appears without a fade, the spinner stands still.
5. Open the shortcut overlay with `?` on a landscape phone (or a 844 x 390 window): the title and Close are at the top.
6. `npm test -- designTokens`: change a token to a low-contrast value and see the pair fail; add `text-sky-400` to a component and see "only tokens" fail.

### Results

- `npm run check`: 97 files, 3979 tests green (the token test adds about 320: one per contrast pair and per source file).
- `npm run e2e`: 358 passed, 14 skipped (the real-fixture and offline-only skips as before), on a fresh build. Two earlier full runs each had one different failure that passed on its own three times out of three and in the next full run: `jam.spec.ts` "tapping a bar moves playback" (phone) and `count-in.spec.ts` "count-in defaults come from Settings" (desktop). Neither fails in isolation; watch them in Test.
- A `vite preview` left running on port 4173 from an earlier session served the old build to the first run (Playwright reuses it). It couldn't be stopped from here, so `dist` was rebuilt in place, which `vite preview` serves from disk.

### Human checks (for Shane, not done by an agent)

- Sign off on the screenshots in `docs/units/12-shots/` (the plan's acceptance).
- Look and feel on the phone at the kit, in a dim room and a bright one: is the score paper readable, is the orange too loud, is the notation (at alphaTab's default size) readable from the throne.
- Installed PWA on iPhone and Android: the new icon on the home screen, the maskable icon's crop, the status bar colour.

## Test

### What the tests prove

- **e2e passes with no change to behaviour**: the whole suite, unchanged apart from two hardened helpers (see Flakes).
- **Contrast on the token pairs**: `tests/unit/designTokens.test.ts` as built, plus see-through surfaces: text on the playing loop's card (`brand-soft/40` over `surface` and over `canvas`) and on the count-in number's veil (`canvas/90` over `score-paper`), blended as the browser draws them. On screen, `design.spec.ts` reads every text's computed colour against what is really behind it (backgrounds composited up the tree, opacity modifiers included) on every screen at every size: 4.5:1, 3:1 for large text.
- **No one-off colours**: `designTokens.test.ts` "only tokens", as built.
- **44 px touch targets**: `design.spec.ts` measures every visible button, link, field, select and slider (a checkbox or radio by the label that takes the tap) on login, home empty and with a loop, settings, not found, library, the song page in jam, with the loop panel, with a loop's history and with a loop playing, and the shortcut overlay.
- **Visible focus rings**: `design.spec.ts` Tabs through login, home, settings, the song page (jam and with the panel open) and the library. Each control must show an outline other than `none`: the browser's own (`auto`: native checkboxes, radios, sliders) or 2 px at 3:1 against what is behind it, read once its colour transition has ended.
- **Controls bar in three rows on a phone**: at 390, 375 and 360 px the bar's eight controls stand in at most three rows; at 320 px (the volume may wrap under the speed) nothing spills out of the bar or the page and every target is still 44 px.
- **Reduced motion**: `design.spec.ts` "reduced motion", run both ways. With motion the overlay fades in (`fade-in`, 150 ms), the count-in number pops (`beat-pop`, 160 ms) and controls change colour over 150 ms; with `prefers-reduced-motion: reduce` none of them moves.
- **Icons hidden, accessible names unchanged**: `icons.test.tsx`, `StatusMessages.test.tsx`, `Brand.test.tsx` (the wordmark reads "Drum Practice Pal"; the mark is drawn in token colours only); in `design.spec.ts` no `svg` outside the score is spoken, every button and link has words of its own, and the controls bar and the nav keep their exact names.
- **Shortcut overlay on a landscape phone**: at 844 x 390, `?` opens it with focus on Close, the title wholly in view and the first row showing; the rest scrolls inside the dialog.

Each new test was seen to fail with the code it covers broken, then restored: `ink-muted` and `brand-soft` set to low-contrast values (on-screen contrast on every audited screen, token and blended pairs); the `prefers-reduced-motion` block removed; Close moved below the list (landscape test); `focus` set to a dark grey (every control's ring on every screen); `aria-hidden` taken off `Icon`, `BrandMark` and the spinner; `Icon`'s default size dropped; the slider fix below reverted (four rows at 390 px); the two target fixes below absent (small targets).

### Bugs found

Fixed (a few lines each):

1. **The controls bar was four rows on a 390 px phone**, not three (the Build's own `build-phone-song.png` shows it): the speed and the metronome volume each took a row. A range input is 129 px wide by default in Chromium, which pushed both sliders' minimum widths past their flex bases. `w-0` on the slider (its `min-w-*` still sets the floor), and the speed's basis from 13rem to 12rem so the row also fits a 360 px Android phone (`PlayerControls.tsx`).
2. **`linkClass` links were 24 px tall**: "Go to Library" on the empty home page and the offline and song-not-found pages, "Go to On the go" on not found, "Open “…”" after an upload. Every use is a link on a line of its own, so `linkClass` is now `inline-flex min-h-touch items-center` (`styles.ts`).
3. **A library song's title link was 28 px tall** (from Unit 04; Unit 12 keeps 44 px targets): `inline-flex min-h-touch items-center` (`SongListItem.tsx`).

Noted, not a bug: a button's focus ring fades in with its colours (`transition-colors` includes `outline-color`), so for 150 ms it is drawn in the text colour, which on a brand button is near-black on the dark page. It is the focus colour once settled, and at once under reduced motion.

### Flakes

- `jam.spec.ts` "tapping a bar moves playback" (reproduced: 2 failures in 18 runs, then 2 in 48), two causes, both in the test:
  - Phone: alphaTab scrolls the score box to its cursor (40 to 47 px along, the 06 QA sideways scroll) at about the moment Play is enabled. Under load that can land after `nextBarPoint` measured bar 2 and before the tap, which then hits bar 1. New `scoreSettled(page)` in `playerPage.ts` waits until the window, the box and the bar cursor are still; `openFixture`, `nextBarPoint` and `cursorBarPoint` call it, so every spec that taps a bar gets it.
  - Tablet and desktop: the "far" tap is the middle of the score box, which in about one run in ten fell in the gap between two lines of music (it depends on where alphaTab scrolled the box on load). The engine rightly seeks to the nearest line, above, but the bar cursor covers only the staves, so "the cursor is over the point tapped" failed. The point is now on the staves of the line at the box's middle (`staffLineAt`, from alphaTab's per-line blocks in `.at-surface`). 60 of 60 runs passed after.
- `loops.spec.ts` "a tap on a bar outside the playing loop moves nothing" failed once on tablet in this stage's first full run (the tap reached bar 2, not 3): a point measured by `nextBarPoint` just after the side panel opened and the score laid out again. Covered by `scoreSettled`: 90 of 90 runs of the three named tests, then 225 of 225 runs of `loops.spec.ts` and `count-in.spec.ts`, passed after.
- `count-in.spec.ts` "count-in defaults come from Settings" (desktop): not reproduced in about 55 runs, alone and beside the rest of its spec; no change made. If it fails again, keep its error context.

### Files

- New: `tests/e2e/design.spec.ts`, `tests/e2e/designPage.ts` (the screen audit, the focus-ring walk, `motionOf`, `rowsOf`), `src/components/icons.test.tsx`, `src/components/StatusMessages.test.tsx`, `src/components/Brand.test.tsx`.
- Changed: `tests/unit/designTokens.test.ts` (see-through pairs), `tests/e2e/playerPage.ts` (`scoreSettled`), `tests/e2e/jam.spec.ts` (`staffLineAt`); app fixes in `PlayerControls.tsx`, `styles.ts`, `SongListItem.tsx`; `AGENTS.md` (the design audit, `scoreSettled`, `linkClass`).

### Results

- `npm run check`: 100 files, 4004 tests green.
- `npm run e2e`: 381 passed, 18 skipped (the real-fixture and offline-only skips, plus the phone-only design tests on tablet and desktop), on a fresh build of this branch. The `vite preview` on port 4173 left from an earlier session (not started by this stage) was still running and was not stopped; `dist` was rebuilt in place before every run, and the served bundle name was checked against `dist`.

## QA

**Verdict: PASS.** No blocker and no major issue. Every acceptance criterion an agent can judge passes at all three sizes, and also on a landscape phone (844 x 390) and at 320 px. Three cosmetic issues were fixed here. Two minor and two cosmetic issues are left (below).

**How it was run.** Two builds side by side against the same local Supabase. "Before" is `main`, built in a detached git worktree in the scratchpad and served on 4180. "After" is this branch, built with `vite build --mode development` into a scratch `dist-qa` and served on 4181. The stale `vite preview` on 4173 (not this stage's) was left alone and never used. A throwaway Playwright driver (not kept) walked every screen and state in five projects: phone 390 x 844, tablet 820 x 1180 and desktop 1440 x 900 (the plan's three), plus landscape phone 844 x 390 and 320 x 640. It took a shot of each in both builds. On the after build it also ran `auditScreen` from `tests/e2e/designPage.ts` on every shot: 44 px targets, text contrast against what is really behind it, icons hidden, every control named, no sideways scroll. Slow network was a 5 to 6 s delay on the soundfont or on a list read. Errors were a 500 from PostgREST or Storage. Offline was `context.setOffline`. The update line used a real service worker and a changed `sw.js`. Chromium only; nothing was heard.

Shots are `docs/units/12-shots/qa-before-<size>-NN-name.png` and `qa-after-<size>-NN-name.png`. Both builds use the same names, so each pair is a before and after:

- 01 to 05: login (form, sent, bad email, expired link, offline).
- 10 to 21: home empty, loading and load error; library empty, loading and load error; MIDI and corrupt upload errors; library offline; settings online and offline; not found; song not found.
- 30 to 51: library with songs and the duplicate warning; song loading; jam; loop form; the "Mark finished?" prompt; loop panel; count-in; loop playing; "Practice logged"; history; a long loop name playing; shortcut overlay; focus ring; song offline; no drum track; song file error; home with loops; the Finished tab.
- 60 to 67: long song title and artist; 40 loops in the panel and on the home page; a long unbroken loop name; "Reload to update" (phone and desktop), alone and with the offline banner.
- 70 to 71: the fixes below.

That is about 240 shots per build. A few before shots are missing where the old UI differed under the driver (the phone's 40-loop steps). Nothing is missing from the after set.

**Acceptance criteria**

| Criterion                                                                          | Phone | Tablet | Desktop | What was seen                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------- | ----- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every screen and state at all three sizes uses the tokens, with no one-off colours | Pass  | Pass   | Pass    | Every screen in the list above is redrawn on the tokens. In `src/` (spike and tests aside) the only colour literals are the token block in `index.css` and the four copies in `scoreTheme.ts`, which `designTokens.test.ts` keeps equal. The only arbitrary colour utility is the sidebar's `shadow-[inset_3px_0_0_var(--color-brand)]`, which uses a token. The same holds at 320 px and in landscape. |
| e2e passes with no change to behaviour                                             | Pass  | Pass   | Pass    | After this stage's fixes, the whole suite ran against a fresh build on 4181 (the config copied with only the port changed): 381 passed, 18 skipped (the same skips as Test). The scripted walk of every flow found no behaviour difference from `main`: the same copy, states and gates (Play disabled while loading; upload and Save disabled offline; sign-out disabled offline).                     |
| Shane signs off on the screenshots                                                 | Human | Human  | Human   | Not an agent's call; see Human checks.                                                                                                                                                                                                                                                                                                                                                                  |

**QA focus and the unit's promises**

| Check                         | Result                                                                                                                                                                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AA contrast                   | Pass. `auditScreen` found no text under 4.5:1 (3:1 for large text) on any of the ~240 after shots, including error, offline, loading, the count-in veil and the playing loop's card.                                                                                             |
| 44 px targets                 | Pass on every shot at every size, 320 px and landscape included.                                                                                                                                                                                                                 |
| Visible focus rings           | Pass. The light-blue ring shows on a controls tile in shots 45 and 46. Test's `design.spec.ts` walk passes in the e2e run above.                                                                                                                                                 |
| Reduced motion                | Pass (Test's `design.spec.ts` "reduced motion", run both ways, in the e2e run). Play's smooth scroll of the window (Unit 06, JS `scrollIntoView`) isn't under the CSS rule. It is behaviour, not decoration, so it was left.                                                     |
| Icons hidden, names unchanged | Pass on every shot: no spoken `svg`, no unnamed control. Every e2e locator still finds its control.                                                                                                                                                                              |
| The score                     | Pass (shots 37 and 40). Warm paper and dark ink. Bar numbers and the beat cursor are in the score accent. The playing bar has a light brand wash. The loop highlight is a brand wash with an accent edge. The count-in veil dims the score, with the number in white on it (39). |
| Controls bar on a phone       | Pass: three rows at 390 px (four tiles; speed with the volume; count-in), as Test fixed. See minor issue 1 for the count-in mode select.                                                                                                                                         |
| Long names                    | Pass after fix 1. A long unbroken loop name is clamped with an ellipsis in the "Looping" line and the sheet header (63, 64). A long song title wraps on the song page (61).                                                                                                      |
| Many loops                    | Pass (62, 65). With 40 loops on one song, the panel and the home page list them all, with no sideways scroll at any size and a clean audit. Paging is Unit 13's (09 QA issue 6).                                                                                                 |
| Slow network, errors, offline | Pass. Seen: loading lines with the spinner; `LoadErrorAlert` with Try again in the danger card; the song file error; the offline banner over every signed-in screen; the `OfflineNote`s; and "Reload to update" in its brand card, also stacked under the offline banner (67).   |

**Fixed here (cosmetic)**

1. **A long unbroken song title pushed the library page sideways.** The page was 715 px wide in a 390 px window, and 955 px on a tablet (shot 60 before the fix, 71 after). Cause: Test's 44 px fix made the title link `inline-flex self-start`, so the link was as wide as its longest word. Before Unit 12 the title wrapped. The link now has `max-w-full wrap-anywhere` (`SongListItem.tsx`). Normal titles are unchanged.
2. **The sidebar wordmark wrapped**, leaving "Pal" alone on a second line at every size from 768 px. The sidebar's wordmark is now `text-base` and `whitespace-nowrap` (`Brand.tsx`, the `md` size only; the login page's large wordmark is unchanged). It fits the 224 px sidebar with nothing clipped: the sidebar's scroll width equals its width.
3. **"Metronome" ran past its tile at 320 px**, 2 px past the padding, touching the edge. Below 360 px the tiles' gap is now `gap-1`, their padding `px-0.5` and the label 11 px (`PlayerControls.tsx`, and `toolButtonClass` in `styles.ts`). `hyphens-auto` and `text-center` were added for wrapped labels. Nothing changed from 360 px up. After the fix, every tile's scroll width equals its width at all five sizes.

After the fixes, the after shots were taken again and every audit was clean. `npm run check` is green (100 files, 4004 tests), and the e2e run above passed.

**Issues left**

1. **Minor: the count-in mode select shows a cut-off value on phones.** At 390 px it reads "At the start or", which could be either option; at 320 px it reads "At tl". Repro: open any song on a phone (shots `qa-after-phone-33`, `qa-after-narrow-33`). The select still works, and its options show in full. Before Unit 12 it read "At the start only", on a row of its own. The Build chose to let this select give way first so the bar fits in three rows. A shorter option label on small screens ("Start only" / "Every repeat") would keep both. Handed to Unit 13.
2. **Minor (not new): a loop item's actions take three rows in the side panel at every width**, with Delete alone on the last row, on the desktop too (shot `qa-after-desktop-40`). The Build's known gap names only the tablet.
3. **Cosmetic: at 320 px the login page's wordmark wraps**, with "Pal" centred under "Drum Practice" (`qa-after-narrow-01`). It is readable, so it was left.
4. **Cosmetic: on the home page, a song title with a very long unbroken word leaves the library icon alone on its line** above the wrapped title (`qa-after-phone-65`). It needs a 40-character word, so it was left.

The Build's other known gaps are unchanged: notation at scale 1, the score opening 47 px sideways on a phone (the clef in shot 33), and the narrow tablet panel.

**Human checks (for Shane, not done by an agent)**

- Sign off on the screenshots: `docs/units/12-shots/qa-before-*` against `qa-after-*` (and the Build's `build-*`). This is the plan's acceptance.
- Look and feel on the phone at the kit, in a dim room and a bright one. Does the score paper glare? Is the orange too loud? Does notation at alphaTab's default size read from the throne?
- Installed PWA on iPhone and Android: the new icon, the maskable crop, the status bar colour.
- Safari (iOS and macOS) and Firefox: range inputs and selects draw with the browser's own chrome, so check the controls bar and the count-in selects there. Everything here ran on Chromium.
- A real 320 px phone (iPhone SE, 1st gen) if one is around: the controls bar's tiles after fix 3.

## Readability

No behaviour or visual change. The built stylesheet (`dist/assets/index-*.css`) is byte-identical before and after. Every class a component ends up with is the same set; only where the string is written changed.

### Changes

- **Shared class strings** in `src/components/styles.ts`:
  - `dangerPanelClass` (`rounded-control`, the danger wash and edge, `p-3`) is now used by the login page's link error and by the two inline delete confirms (`SongListItem`, `LoopPanel`). `dangerCardClass` (`rounded-card` with the same wash) is used by `LoadErrorAlert` and the song page's unsaved-practice notice. All five had repeated `border border-danger-solid/50 bg-danger-soft` by hand.
  - `sectionHeadingClass` (`text-lg font-bold tracking-tight`) is now used by the library's and the loop panel's h2s, the settings page's h2s and fieldset legends, and the shortcut overlay's title, seven places in all.
  - Inside the module, `quietButtonClass` and `quietPressedButtonClass` share `quietBase`. `segmentOnClass` / `segmentOffClass` are built on `buttonBase`, which is the same shape they had spelled out.
- **`PlayerControls.tsx`**: the slider's label and the select's label share `controlLabelClass` and a `LabelIcon` (the muted 20 px icon before the words), instead of two copies of each.
- **`SongPage.tsx`**: `LoadFailed` had become a one-line pass-through to `LoadErrorAlert`, so it is gone. Its two callers use `LoadErrorAlert` directly, with the same copy.
- **`Brand.tsx`**: the shape-to-props mapping is `shapeProps(shape)`, with `reactPropName` (was `camel`) and a comment on why the names change.
- **Dead code**: two icons nothing draws (`drum`, `speed`) are removed from `icons.tsx`. `MIN_TARGET_PX` in `tests/e2e/designPage.ts` is no longer exported, since only that file uses it.
- **`AGENTS.md`**: the new helpers are in the `styles.ts` list, with the rule that a class string a second component needs moves into `styles.ts` and one used twice in a file becomes a local constant. It also notes that the token test reads comments, so a word that looks like a utility (`stroke-width`) fails "only tokens". The shell bullet's `min-h-11` now reads `min-h-touch`.

### Left alone

- The remaining one-off class strings, such as the warning and success panels, the offline banner and the history box. Each is used once, and a helper would only rename it.
- `tests/e2e/design.spec.ts` / `designPage.ts` beyond the export, and the spike page, which Unit 13 retires.

### Results

- Before: `npm run check` gave 100 files and 4004 tests, all green. `npm run e2e` on a fresh build gave 381 passed and 18 skipped.
- After: `npm run check` gave 100 files and 4004 tests, all green.
- After, e2e on a rebuilt `dist`: the served bundle name was checked against `dist`. The `vite preview` on 4173 from an earlier session was not stopped. First full run: 380 passed, 18 skipped, and 1 failed, `offline.spec.ts:338` on phone. Its error text was lost to a `tail` pipe. It then passed 15 of 15 runs on its own across all three projects.
- Second full run on the same build: 381 passed, 18 skipped, 0 failed (exit 0). That matches the baseline. The `offline.spec.ts:338` failure in the first run is a one-off flake, not a regression: the refactor doesn't touch the home page's offline path, and the built CSS is unchanged. If it fails again, keep its error context.

## Review

Read AGENTS.md, this note, `docs/review-checklist.md` and every line of `git diff main...HEAD` apart from PNG contents: app code, `index.css`, `index.html`, `vite.config.ts`, `scripts/generate-icons.ts`, the unit and component tests, `tests/e2e/design.spec.ts`, `designPage.ts`, the `playerPage.ts` and `jam.spec.ts` changes, and the docs.

### Inventory

This unit adds no hooks, services, mutations or migrations. What it touched that has behaviour:

- **Controls with handlers, restyled or moved**: `PlayerControls` (regrouped into tiles; `PlayPauseButton`, `ToggleButton`, `PercentSlider` with the phone's `compact` volume, `LabelledSelect`), `LoopPanel` (the sheet's header toggle, `LoopListItem`'s five actions, `FinishPrompt`, `ConfirmDelete`, `ActiveLoopCard`), `LoopStatusButton` (`aria-disabled` lock), `LoopSpeedControl`, `LoopEditorForm`, `ShortcutOverlay` (Close moved to the top), `SongPage` (`ShortcutsButton` and `LoopPanelToggle` now `max-md:hidden`, `ActiveLoopLine`, `SessionNotice`, the sticky `JamBar`, `ScoreBox`), `OnTheGoPage`'s view buttons, `AppShell`'s two navs and the sidebar's `SignOutButton` class, `LoginPage`'s steps, `UploadPanel`'s drop zone and file label, `SongListItem`, `SettingsPage`, `OfflineBanner`'s "Reload to update".
- **Rendering that runs with playback**: `CountInCounter` (re-keyed per beat), alphaTab's settings in `alphaTabEngine.ts` (`display.scale`, `display.resources` from `scoreTheme.ts`), the `.jam-score` rules (paper, cursors, highlight, `touch-action: manipulation`) and the `prefers-reduced-motion` rule in `index.css`.
- **PWA**: the manifest colours, `theme-color`, the five icons and `scripts/generate-icons.ts`.
- **Test helpers**: `scoreSettled` (`playerPage.ts`, now in `openFixture`, `nextBarPoint`, `cursorBarPoint`), `staffLineAt` (`jam.spec.ts`), `auditScreen`, `controlsWithoutFocusRing`, `motionOf`, `rowsOf` (`designPage.ts`).

### Findings

1. **Fixed: under "reduce motion" the beat cursor pointed a beat ahead** (`src/index.css:188`; checklist 5, new row "A blanket style that reaches a library's elements"). The rule cut every transition to 0.01 ms with `!important`, which beats inline styles. alphaTab 1.9 moves its beat cursor by setting an inline `transition: transform <beat>ms linear` and the end-of-beat position at the start of each beat (`ToNextBeatAnimatingCursorHandler.transitionBeatCursor`). With the transition cut, the cursor jumped to the end of each beat as it began and sat on the next beat while the current one played. iOS and macOS users with Reduce Motion on would have read along a beat early. Before Unit 12 the cursor glided as usual. Fix: the rule is `*:not(.at-cursor-beat)`, with a comment on why. Test: `design.spec.ts` "reduced motion" now polls the beat cursor's computed transition once playback has started and expects more than 50 ms, run with and without reduce motion. It failed on all three projects before the fix (0.00001 s) and passes after.
2. **Fixed: a wrong pointer in a comment** (`src/index.css:57`): the score tokens' comment said `alphaTabEngine.ts` reads them; `scoreTheme.ts` copies them and the token test keeps the copy equal.
3. **Open: `color-mix()` for the bar cursor and the loop highlight** (`src/index.css:129`, `:159`, `:160`). Safari before 16.2 drops the declaration, so both are invisible there; before Unit 12 they were `rgb()`. A fallback needs a colour outside `@theme`, which the token test refuses, so it's a support decision. Carried to Unit 13.
4. **Open: the beat cursor under reduced motion** keeps gliding after the fix (as on `main`). alphaTab can place it on each beat's notes instead (`player.enableAnimatedBeatCursor: false`). That is an engine setting chosen at creation, so it isn't a style change, and it belongs to Unit 13 along with the other player decisions. Carried there.

### Checked, nothing found

- **Accessible names**: every icon is `aria-hidden` and `focusable="false"`; each control keeps its words. The phone's volume label and readout are `max-md:sr-only`, so the slider's name and `aria-valuetext` don't change. The sheet header still reads "Loop: … Close" / "Loops (n) Open". The login `h1` reads "Drum Practice Pal" (`Brand.test.tsx`).
- **Gates**: no `disabled` or `aria-disabled` condition changed. Play, Back to start and "Play loop" still use `canPlay`, the options use `optionsDisabled`, the drum toggles use `drumTogglesDisabled`, and the online-only controls use `!online`. `quietButtonClass` and the tool tiles keep `aria-disabled:` styling, so `LoopStatusButton`'s lock still shows.
- **Focus**: the overlay still focuses Close on open, keeps Tab on it from the document, makes the rest `inert` and returns focus. Moving Close above the list changes none of that, since it is still the only control. `ShortcutsButton` and `LoopPanelToggle` are `display: none` below 768 px as before (`max-md:hidden` sorts after `inline-flex`).
- **Elements that moved**: the controls bar keeps one handler per control and the same live engine calls. `JamBar`'s new bottom border is part of the height `useJamMode` measures for the scroll margin. The phone nav is `h-14` (was `min-h-14`). Its tallest content, an icon over a `text-xs` label, is 38 px, so the sheet's `3.5rem + 1px` offset still holds.
- **Score pointer and touch**: `touch-action: manipulation` keeps panning and pinch-zoom and drops double-tap zoom. The engine listens for `click` and a touch never drags, so nothing it hears changes (`jam.spec.ts` "a touch tap seeks; a touch swipe scrolls" passes). `NOTATION_SCALE` is 1, so `boundsLookup` stays in page pixels for `barIndexAtPoint`, `highlightRects` and `barBounds`. `core.fontDirectory` is still passed. The `display.resources` names exist in alphaTab 1.9's `RenderingResourcesJson`.
- **CountInCounter re-keying**: only the beat span is replaced, each beat. Nothing holds a ref to it, and e2e locators re-resolve.
- **Other motion**: nothing in `src/` or `tests/` listens for `transitionend` or `animationend`. alphaTab's other cursor and scroll moves aren't CSS transitions.
- **PWA**: icon file names and `globPatterns` are unchanged (`png`, `svg` covered). `npm run icons` rerun here leaves `public/` byte-identical to what is committed. The maskable mark (scale 0.72) sits within about 33% of the icon's width from the centre, inside the 40% safe zone. The script closes its browser in `finally`.
- **Hygiene**: no new supabase-js, fetch or Storage calls, list reads or multi-step writes. `staffLineAt` throws when no line is found, so it can't pass on a miss. `untilStill` fails on its poll's timeout. `auditScreen` awaits finite animations and catches the rejection of a cancelled one, so a replaced cursor transition can't hang it. `scoreSettled` is called while playing at one call site (`jam.spec.ts:385`, within bar 1). It returns on the first two equal reads, about 100 ms, which leaves the same measure-then-tap window as before.
- **Bars**: no bar arithmetic changed.
- **AGENTS.md**: named exports only, `@/` imports across features, no palette colours (the token test), no `crypto` or ad hoc fetches.

### `offline.spec.ts:338` on phone

Readability saw it fail once and lost the error text. Here it passed 8 of 8 runs with `--repeat-each=8 --project=phone` on 8 parallel workers, and passed again in the full run below. No failure was reproduced, so nothing was changed. If it fails again, keep `test-results/…/error-context.md`.

### Changed

- `src/index.css`: the reduced-motion rule leaves `.at-cursor-beat` alone; comment fixed.
- `tests/e2e/design.spec.ts`: the beat cursor's transition is checked in both "reduced motion" tests.
- `AGENTS.md` (Visual design, Motion): the exemption, and the rule that a global style leaves library-driven elements alone. `docs/review-checklist.md`: the new row in section 5. `docs/plan.md`: one Carried forward line under Unit 13 (findings 3 and 4).

### Results

- `npm run check`: 100 files, 4004 tests green.
- `npm run e2e`: 381 passed, 18 skipped, 0 failed, on a fresh `vite build --mode development`. The `vite preview` on 4173 (PID 56088, from an earlier session) was left running; the bundle it served (`index-CiRP3sfD.js`, `index-DsIk1PFU.css`) was checked against `dist/index.html` before the run.
- Not committed.

## Merge with main

`origin/main` gained the bug-hunt PR (docs/units/bug-hunt-2026-11.md) after this branch was cut; merged with `git merge origin/main`, not rebased. Main's behaviour is kept in full and drawn with this unit's tokens and classes.

### Conflicts and how each was resolved

- `src/features/library/LibraryPage.tsx` (imports): both sides' imports kept: `EmptyState` / `LoadingLine`, `labelClass` / `sectionHeadingClass` from here, `itemFocus` helpers and the search field's `ref` from main.
- `src/features/library/SongListItem.tsx`: the item is `cardClass` with main's `itemAttributes`; the edit form's `onDone` is main's (`onEditClosed` hand-over); Edit and Delete are `quietButtonClass` with their icons and main's `itemControlAttributes`; the "Delete …?" group is `dangerPanelClass` and keeps main's `ref`, `tabIndex={-1}` and `focus:outline-none` (it focuses itself on mount; the outline is off on the group, not on its buttons).
- `src/features/loops/LoopPanel.tsx`: Edit is `quietButtonClass` with main's `disabled={!canEdit}` (`canPickBars`); Delete is `quietButtonClass` with its icon and main's `itemControlAttributes`; the confirm group as in the library.
- `src/features/practice/OnTheGoPage.tsx` (imports): this unit's style imports, with `neighbourAfterLeaving` from `@/lib/itemFocus` as main moved it.

Auto-merged with no edit needed: `AGENTS.md`, `docs/plan.md` (Unit 13's Carried forward list holds both sides' new lines; neither side had dealt with the other's), `docs/review-checklist.md`, `SignOutButton.tsx`, `alphaTabEngine.ts` and main's logic files. Main added no new markup with colours, so nothing else needed tokens; the token test passes over the merged tree.

### Decisions

None about behaviour: every conflict was a class string or an import beside one of main's attributes.

### Results

- `npm run check`: 102 files, 4055 tests green.
- `npm run e2e`: 381 passed, 18 skipped, 0 failed, on a fresh `npm run build -- --mode development`. The `vite preview` on 4173 (PID 56088, not ours) was left running; the bundle it served (`assets/index-zb0pTqMD.js`) was checked equal to the fresh `dist/index.html`.

## Copilot review

Two comments on PR #16, each checked against the code, proved with a test that failed first, then fixed.

### 1. `LoopPanel.tsx:516`: a long unbroken loop name overflows the panel (id 4685776684)

**Verdict: real.** The name's paragraph is `flex` (the "playing" icon beside it), so the name is an anonymous flex item whose `min-width: auto` is its min-content width; `break-words` (`overflow-wrap: break-word`) doesn't lower that, so a 100-character name with no spaces stayed on one line and ran out of the loop item: 53 to 826 px in a 16 to 374 px box on a phone, 586 to 1359 in 549 to 771 in the tablet's narrow panel, 1046 to 1819 in 1009 to 1295 on a laptop. The panel clips it, so the page-level overflow check never saw it.

- Test first: `design.spec.ts` "a long unbroken loop name wraps inside the loop panel and on the home page" saves a loop named `Paradiddle` x 10 (the 100 characters `LOOP_NAME_MAX_LENGTH` allows), opens the panel and checks with the new `textSpillingOutOf` (`designPage.ts`: the text's own line boxes through a `Range`, since the paragraph's box doesn't move when its text overflows) that no text in the item or the panel runs past its edges, that nothing in the panel scrolls sideways, that the page doesn't, and that the name is on more than one line; then the same on the home page's item. It failed on all three profiles with the figures above.
- Fix: `wrap-anywhere` on that paragraph, as `SongListItem` has. The other loop-name lines were already right: the playing loop's card and the home page's item are block paragraphs, the sheet header truncates (a flex item with `overflow: hidden`, so its minimum is 0), and the song page's "Looping" line is `line-clamp-2 min-w-0`. No other `flex` or `grid` element in `src/` relies on `break-words`.
- Checklist: no row covered it. New section 6, "What is drawn", row **Wrapping that can't shrink the box**. AGENTS.md (Visual design): a bullet on user text in flex and grid items.

### 2. `designPage.ts:264`: the focus audit measures the hidden file input, not the upload label (id 4685776765)

**Verdict: real.** On the library, Tab lands on the upload's `sr-only` file input; `controlsWithoutFocusRing` read that input's outline, Chromium's `auto`, which the audit accepts, so the label's ring (`has-[:focus-visible]:outline-*` in `UploadPanel.tsx`) could be deleted and the audit would still pass.

- Fix: when the focused element is visually hidden (a box of 1 px or less), the audit measures its label (`labels[0]`, else the enclosing `label`), waits for the label's colour transition, and reads its outline against the label's parents; a hidden control with no label is reported with no ring. It returns `throughLabel`, the controls measured that way, and the library's focus check asserts the upload label is among them, so the case can't silently stop being exercised.
- Proved: with the label's three focus classes removed and dist rebuilt, the library test failed on every profile with `<label> "Upload a Guitar Pro file": outline none 3px at 1.10:1`; with them restored it passes.
- Checklist: no row covered it. New row in section 6, **A hidden stand-in measured instead of what shows**, which points to "Accessibility claims" in section 5 as the same miss the other way round. AGENTS.md (e2e for the design): the audit's label rule, `throughLabel` and `textSpillingOutOf`.

Hygiene went to section 7 (renumbered; nothing referred to it by number).

### Results

- The fix was undone and redone in one rebuild alongside the label's ring, so both new checks were seen failing on the same build and passing on the next.
- `npm run check`: 102 files, 4055 tests green.
- `npm run e2e`: 384 passed (the new long-name test on three profiles), 18 skipped, 0 failed, on a fresh `npm run build -- --mode development`. The `vite preview` on 4173 (PID 56088, not ours) was left running; the bundle it served (`assets/index-C1u9JK4V.js`) was checked equal to the fresh `dist/index.html`.

## Tablet loop sheet (after screenshot review)

Shane's review of `final-tablet-04-song-loop.png` and `final-tablet-05-song-playing.png`: on a tablet in portrait (820 x 1180) the 224 px sidebar and the 256 px loop column left the score about 260 px, one bar to a line. His choice: keep the full sidebar, and below tablet landscape make the loop panel the bottom sheet, as on the phone.

### Summary

- Below 1024 px (phone, tablet in portrait) the loop panel is the bottom sheet; from 1024 px (tablet in landscape at 1180, laptop) it is the side column, unchanged. On a tablet in portrait the score now spans the whole content column (532 px at 820 wide, was about 260).
- The rule lives in one pure module, `src/features/loops/loopPanelLayout.ts` (`LOOP_COLUMN_MIN_WIDTH` 1024, `loopPanelKindForWidth`, `LOOP_COLUMN_QUERY`). `loopPanelIsSheet()` and `loopPanelStartsOpen()` (`useLoopPanelOpen.ts`) ask that query; the CSS uses `lg:`, and `index.css` now writes out `--breakpoint-md: 48rem` and `--breakpoint-lg: 64rem` so `loopPanelLayout.test.ts` can check both against the code (`lg` = the column, `md` = `PAGE_LAYOUT_MIN_WIDTH`).
- The tablet's sheet is not a stretched phone sheet: from `md` there is no tab bar, so it sits on the safe area (`md:bottom-[env(safe-area-inset-bottom)]`) and spans the content column to the right of the sidebar (`md:left-[calc(var(--spacing-sidebar)+2rem)] md:right-8`, i.e. exactly the score's width, with side borders); its body is at most `min(40dvh, 30rem)` (the phone's is 45dvh). The sidebar's width is now the token `--spacing-sidebar` (14rem, `md:w-sidebar` in `AppShell`), so the sheet's offset follows it.
- Everything the phone sheet does applies at the new widths, because it is the same element and the same `loopPanelIsSheet()`: the header is the one toggle (`aria-expanded`, `aria-controls`), "Play loop" closes it when the press starts playback, it starts closed. The "Show loops" / "Hide loops" button is now `max-lg:hidden`, so the tablet in portrait has exactly one toggle. The score box's `scroll-mb` is `calc(4rem + safe area)` from `md` (clearing the sheet's header; there's no tab bar) and `scroll-mb-4` from `lg`; the page's bottom padding (`pb-12`) now runs to `lg`.
- The loop speed's nudge buttons are one row of four at every width (`md:grid-cols-2` existed only for the 256 px tablet column, which is gone).
- alphaTab's page/horizontal breakpoint (768 px, `layout.ts`, e2e's `layoutForWidth` / `expectedLayout`) did not move and means what it meant. e2e now asks `expectedLoopPanel(page)` (`loopsPage.ts`, mirroring the 1024 rule) wherever it meant "is the panel a sheet"; `loopPanelToggle`, `openLoopPanel` and `closeLoopPanel` are still one helper for all sizes.

### Files

- `src/features/loops/loopPanelLayout.ts` (new) and `loopPanelLayout.test.ts` (new): the rule, and the check that the stylesheet's `md` / `lg` match the code.
- `src/features/loops/useLoopPanelOpen.ts`: `loopPanelIsSheet` and `loopPanelStartsOpen` from the one query (`LOOP_PANEL_OPEN_MIN_WIDTH` is gone: the column starts open, the sheet closed). `useLoopPanelOpen.test.ts`: widths 390 to 1440 for both, and the hook's starting state.
- `src/features/loops/LoopPanel.tsx`: the classes (`md:` sheet placement, `lg:` column). `LoopPanel.test.tsx`: `atWidth(px)` answers any `(min-width: Npx)` query; new "on a tablet in portrait the panel is the sheet too: Play loop closes it"; the "nothing closes it" case now at 1180.
- `src/features/loops/LoopSpeedControl.tsx`: nudges one row.
- `src/features/song/SongPage.tsx`: `lg:` two columns, `max-lg:hidden` toggle, `scroll-mb` per size, comments. `src/features/song/useJamMode.ts`: comment.
- `src/features/shell/AppShell.tsx`, `src/index.css`: `--spacing-sidebar`, the written-out breakpoints.
- `tests/e2e/loopsPage.ts`: `expectedLoopPanel(page)`; the toggle helpers use it. `loops.spec.ts`: the panel test now has three cases (phone sheet on the tab bar; tablet sheet on the window's foot, right of the sidebar, as wide as the score, the score near the content column's full width; the column), and checks exactly one toggle is on show and the starting state. `loop-scroll.spec.ts`: sheet checks by `expectedLoopPanel`; the breakpoint test is now 767 / 1023 / 1024 (desktop project). `shortcuts.spec.ts`: "Restart loop keeps focus" only where the column is. `playerPage.ts`: comment.
- `docs/units/12-shots/final-tablet-04-song-loop.png`, `final-tablet-05-song-playing.png` (retaken), `final-tablet-landscape-05-song-playing.png` (new, 1180 x 820), from a temporary spec since deleted.

### Decisions

- **Why 1024 (Tailwind's `lg`).** The page already split at `lg` (the column's 320 px width, the controls bar's one-row layout, the "open by default" width), and it is the first width at which a column beside the score still leaves room for two bars a line (1180 landscape gives the score 556 px, two bars a line). Anything between 768 and 1023 is a tablet in portrait or a narrow window, where the column only ever left a strip. `md` stays the sidebar and alphaTab's page layout.
- **The sheet spans the content column, not the window right of the sidebar.** It lines up with the score above it (same left and right edges), so it reads as the score's drawer, and it never goes under the sidebar.
- **Crossing 1024 keeps the open state.** A rotation from landscape (column open) to portrait gives an open sheet; from portrait (sheet closed) to landscape a closed column. Same as crossing 768 did before; the user's last choice wins over the width's default.
- **Still one bar to a line at 820 in portrait.** The score is now 532 px wide (from about 260), every bar drawn full width, but alphaTab needs about 540 px for two of these bars. Narrowing the main column's `md:p-8` to `p-6` would likely give two a line; that changes every page's gutter, so it is left for Shane to decide.

### Async windows and inputs

None added. `loopPanelIsSheet()` is read at the press (as before), so a rotation since the page opened is answered by the current width.

### Known gaps

- Only Chromium (Playwright) at 390, 820 x 1180, 1180 x 820, 1440, and 767 / 1023 / 1024 wide.
- With the sheet open on a tablet in portrait, the score above it is the space between the controls and the sheet (about 140 px in shot 04, with the window scrolled to the top); scrolling the page brings more of it up, as on the phone.

### Manual verify

1. `npm run dev`, a song with a loop, a window 820 x 1180: no "Show loops" button; a sheet header at the foot of the content column, right of the sidebar, as wide as the score; the score is the full content width.
2. Open the sheet, press "Play loop": the sheet closes, the loop plays, the header says "Loop: …". Open it again while playing: the speed control is there; switching loops leaves it open.
3. Resize to 1180 x 820: the column beside the score with "Hide loops"; "Play loop" leaves it open.

### Results

- `npm run check`: 103 files, 4077 tests green.
- `npm run e2e`: 385 passed, 20 skipped, 0 failed (405 listed), on a fresh `npm run build -- --mode development` run from bash. The `vite preview` on 4173 (PID 56088, not ours) was left running; the page it served loaded `assets/index-CMcgEGtQ.js` and `assets/index-DEwLMAEV.css`, the files in the fresh `dist`, and its CSS had the new `--spacing-sidebar` rules.

### Narrower tablet gutter (follow-up)

Shane said yes to narrowing the gutter so an 820 px tablet in portrait fits two bars a line.

- **Gutter:** the main column's side padding from `md` was `md:p-8` (2rem, 32 px). It is now the token `--spacing-gutter`: 1.25rem (20 px) from `md` to 1023 px, 2rem again from `lg` (`@variant lg` on `:root` in `index.css`), so laptops and tablet landscape are unchanged. `AppShell`'s `main` uses `md:p-gutter`, the jam bar's full-bleed `md:-mx-gutter md:px-gutter`, and the tablet sheet `md:right-gutter md:left-[calc(var(--spacing-sidebar)+var(--spacing-gutter))]`, so the sheet's edges still line up with the score and the sidebar offset is unchanged (`loops.spec.ts`'s panel test checks both).
- **Why 1.25rem, measured in the browser** (Playwright at 820 x 1180, main padding overridden at runtime, alphaTab's systems counted from a loop's highlight blocks, one per line): score 532 px (2rem) one bar a line; 548 (1.5rem), 550, 552 one a line; 554 (1.3125rem) and 556 (1.25rem) two a line. alphaTab's threshold is 554 px, so 1.25rem, the nearest spacing step, is the smallest that works, with 2 px to spare: a 810 px iPad would still get one bar a line (1rem would leave 10 px to spare and still not reach 810).
- **Bars per line on the built app** (all 16 bars as a loop): 768 px, score 504, one bar a line (16 lines); 820 px, score 556, two a line (9 lines: bar 1, with clef, time and tempo, alone on the first, bar 16 alone on the last); 1023 px, score 759, two a line (8 lines). No sideways page scroll at 768, 820, 1023, 1180 or 1440.
- **Tests:** new `loops.spec.ts` "on a tablet in portrait the score fits two bars a line" (tablet project; a loop over bars 2 to 15 has 7 lines, and the page doesn't scroll sideways). `loop-scroll.spec.ts` "the score box is scrolled back at the wrap" used bars 5 to 12 on the tablet, which now fit the box whole, so the first bar never left it; on the tablet it is now bars 2 to 16, the only loop whose first bar the box leaves behind.
- **Screenshots retaken:** `final-tablet-02-library.png`, `-04-song-loop.png`, `-05-song-playing.png`, `-07-home.png`, `-08-settings.png`.
- **Results:** `npm run check` 103 files, 4077 tests green. `npm run e2e` 386 passed, 22 skipped, 0 failed (408 listed; `design.spec.ts`'s audits included: targets, contrast, focus rings, overflow), on a fresh `npm run build -- --mode development` from bash; the `vite preview` on 4173 (PID 56088, not ours) served `assets/index-CY0fJJCy.js` and `assets/index-B7uex7Zb.css`, the fresh `dist`'s files.

## UX pass (after screenshot review)

Shane reviewed `docs/units/12-shots/final-*.png` and asked for "all the changes that make sense", following established UX practice. Each item below says what changed and the guideline it follows. Nothing else about behaviour changed. All fourteen are done; item 9 is done for loops and deliberately not for the library (reason there).

### Song page

1. **The controls fold while playing** (progressive disclosure; Nielsen's "aesthetic and minimalist design"). While `isRunning(status)` the controls card is one strip: Metronome, the speed (or "Loop speed", item 3) and "Show controls" (`aria-expanded`). It sticks right under the jam bar (`sticky top-(--jam-bar-height)`; the page measures the jam bar with a `ResizeObserver`, `useHeightOf` in `SongPage.tsx`). "Show controls" brings the whole bar back for the rest of that run, with "Hide controls" to fold it again; the next start folds again and a stop unfolds (`useControlsFold`, `src/features/song/`). On a phone the strip shows the metronome's icon and mark, the loop speed's icon and percent, and "Controls"; the words are `max-sm:sr-only`, so every name is unchanged. Play/Pause stays in the jam bar; the region is still "Player controls". Folding only redraws: playback is never stopped, restarted or reloaded (component tests count the engine's play / pause / stop / load calls; e2e records every status), and the keys still act on what folded away (D and C while folded in the song page's tests, D in e2e). Metronome and Speed are the same elements folded or not (each keeps its slot among its siblings), so focus on them survives; focus on a control that folds away (Mute drums clicked, then Space) goes to the fold toggle, or to Metronome once playback stops and the toggle goes (`useFocusKeptInBar`). Only Play, Pause, Back to start, the end of the song and a load change `running`; a tap on the score seeks without changing it, so nothing moves between a press on the score and its click. The bar does change height at Play and Pause, so `useStaysOnScreen` scrolls the window by however far the score box moved in the page, keeping it still on screen (Chrome's scroll anchoring often does this already; Safari has none). At the very top of the page a fold can't be made up for (nothing above to scroll back), so there the score comes up with the press of Play; a Pause, which grows the bar, never moves the score from under the next tap. `useJamMode`'s scroll margin adds the strip's height while it sticks.
2. **The playing loop shows once** (consistency and standards; recognition rather than recall). The "Looping …" line above the score and the separate "Now looping" card are gone. The loop is marked in place: its own item opens out (`activeCardClass`, "Now looping", the loop icon, `data-testid="active-loop"` on the `<li>`) and holds its speed control (% and BPM fields, nudges, Save speed, "Saved: …"), the "Mark finished?" prompt and "Exit loop". Marked in place rather than left out of the list while active, because the item stays where it was pressed (08 QA issue 5: the card sat at the top, thousands of pixels from the item in a long list), the list keeps its order, and "Play loop" stays the same element as it becomes "Restart loop", so focus doesn't move. On a phone and a tablet in portrait the sheet's header still names the loop ("Loop: …") while the sheet is closed. The way out is "Exit loop" (the card's "Back to whole song" is gone with the card).
3. **One speed control while looping** (match between system and the real world: two controls that look alike, only one of which saves). While a loop is active the controls bar's slider gives way to a "Loop speed 85%" button that opens the loop panel and focuses the loop's speed group (`findLoopSpeed`, a `tabIndex={-1}` group rather than a field, so a phone's keyboard doesn't come up; at once when the column is already open, else through `useFocusWhenReady`). Hiding was the smaller change: the slider set the same unsaved player speed the nudges set, so removing a second way to do it changes no outcome, while making the slider save would change what it means everywhere. Jam mode keeps the slider; the speed keys work in both. With the slider gone in loop mode the bar never shows a 71% speed on a 5% slider, so that Unit 13 line is deleted.
4. **Toggles look different from actions** (WCAG 1.4.1, use of colour; HIG and Material draw toggles and buttons differently). Metronome, Mute drums and Drums only carry a `ToggleMark`: a check in a filled circle when on, an empty ring when off, in the tile's corner (after the label from `lg` and in the strip). On is also the `selected` fill and ring. Back to start has no mark and no `aria-pressed`, so it reads as an action. `aria-pressed` is unchanged; the mark is `aria-hidden`.
5. **Less orange** (the accent marks the main action and what is playing, nothing else). New tokens `selected` (`#22324d`) and `selected-line` (`#7ea6dc`) for on and selected: pressed toggles, segments, the home page's view buttons, the nav's current page (sidebar: fill and edge; phone tabs: bold `ink` with a bar along the top instead of orange text), Settings' count-in pills, the account initial. "Restart loop" is a neutral button (an action on what is already playing; Play keeps the brand). The brand stays on primary buttons, Play, "Now looping", the playing loop's icon and the count-in's first beat. On the score a loop's bars are a dashed `score-range` (`#2f64a8`) edge over a 7% tint, apart from the orange bar cursor and the accent beat cursor. Contrast pairs added to `designTokens.test.ts`: text on `selected`; `selected-line` against every surface it sits on (3:1 as a part, 4.5:1 as text); the focus ring on `selected`; `score-range` on paper; `danger` on `raised-hover` (a focused Delete in a menu).
6. **Count-in as a segmented control** (legibility; a segmented control for a few fixed choices; progressive disclosure). `SegmentedControl` (`src/components/`: native radios, visually hidden, in labels that draw the state and the focus ring): "Count-in: Off | 1 bar | 2 bars", and only while a count-in is on, "At the start | Every repeat" (`COUNT_IN_MODE_SHORT_LABELS`). Nothing is cut short from 320 to 390 px (the select read "At tl"), so the 12 QA issue 1 line is deleted from Unit 13. C still cycles it (it acts on the player). The arrow keys move a focused radio's choice: `focusKindOf` has a new `choice` kind (a radio, or a `menuitem`) that keeps its arrows, while the page keys still switch loops (a pedal) and Space stays play/pause. With the count-in on, the mode takes a row of its own on a phone (four rows while a count-in is chosen, three while it is off). e2e: `chooseCountIn` / `chooseCountInMode` / `checkedCountIn` / `checkedCountInMode` / `countInModeGroup` in `playerPage.ts` replace `countInSelect` / `countInModeSelect`. Settings keeps its visible radios (a form, not a toolbar), restyled in the `selected` colours.
7. **Phone score box sized to its line of music** (judgment call: no blank paper under the staff). Below 768 px the box has no fixed height: alphaTab's one horizontal line sets it, at least `min-h-44` (176 px), so the count-in number, which keeps its size, fits over it with "Bar 1 of 2" beside it rather than under it (`CountInCounter`). From 768 px it is `60dvh` as before. The page's bottom padding grows while the loop sheet is open (`45dvh + 4rem` on a phone, `min(40dvh,30rem) + 4rem` on a tablet in portrait): with a short score box the page alone was too short to scroll the score clear of the sheet when picking bars (`loops.spec.ts`'s phone tap tests caught it). `scroll-mb` is unchanged; `loop-scroll.spec.ts` passes at every size.
8. **A disabled Save looks disabled** (Nielsen, visibility of system status). A primary button that is off is drawn off, not as a faded orange: no fill, a dashed `line-strong` edge, `ink-muted` text (`primaryButtonClass` under `disabled:` and `aria-disabled:`; it always has a transparent border, so the size doesn't change between the two). That covers "Save speed", "Save settings", "Save loop", Play while loading and the upload button (`primaryLabelOffClass` for its label). Other buttons still fade to 50%. `disabled` and `aria-disabled` are exactly where they were (the focus hand-overs rely on `aria-disabled`). e2e reads the computed style of a disabled "Save speed".
9. **Overflow menu on loop items** (Material's and the HIG's overflow pattern; destructive actions away from the main one). Each loop item shows Play loop / Restart loop, its status button, and "More" (`OverflowMenu`, `src/components/`) with Edit, Show / Hide history and Delete (last, in danger text). It is the WAI-ARIA menu button: `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`; a click or Enter opens it on the first item, ArrowDown / ArrowUp on the button on the first / last; the arrows (wrapping), Home and End move; Escape and Tab close it with focus back on the button; a press that began outside closes it and leaves focus where the press put it (checklist 3, "where a click lands"); choosing an item closes it, focuses the button, then runs the item. The key rules are pure (`menuKeys.ts`, tested). It isn't modal, so nothing is made `inert` (unlike `ShortcutOverlay`), and it is drawn in place rather than in a portal: it hangs under its button inside the item, scrolls with the sheet and the column, and scrolls itself into view on open. Edit is `aria-disabled` until the score has bars (`canPickBars`, the same gate as before). Delete's inline confirm is unchanged. The focus hand-overs land on the More button: closing the edit form (`editButtonAttributes` is on it), "Keep it", and a neighbour's delete (`findItemControl` falls back to the item's `itemMenuAttributes`). Space on a menu item is play/pause, as on any button on the song page (Unit 10); Enter chooses. **The library is not done the same way**: a song has only Edit and Delete, and item 11 keeps them as buttons beside the card's link; a menu of two would add a press and hide nothing.

### Other screens

10. **Card grids** (use the width on wide screens; keep a readable measure for text). `cardGridClass`: one column, two from 1024 px, three from 1280 px, for the home page's loops and the library's songs. Settings keeps `max-w-xl`.
11. **Library cards open the song; a compact upload** (Fitts's law, a bigger target; one link per card, no nested interactive elements). The title link's hit area is stretched over the card (`after:absolute after:inset-0`, the `<li>` `relative`); Edit, Delete and the delete question sit above it (`relative z-10`) as separate buttons. Once songs exist, the drop box becomes an "Upload" button (its name is still "Upload a Guitar Pro file") and the whole library, list included, takes a dropped file, outlined while a file is over it ("Drop the file to upload it"). The upload itself is unchanged. Search and sort stay.
12. **Progress to target on home cards** (visibility of system status). A loop with a target shows a thin bar: `role="progressbar"`, named "Speed towards the target of …", `aria-valuenow` the shown speed percent (capped at the target), `aria-valuemax` the target percent, `aria-valuetext` "71% of a 100% target". It is worked out from the whole percents on show (`targetProgress` in `loopLabels.ts`, pure, tested), so it never disagrees with the "71% · target 71%" above it. `selected-line` fill, `success` once reached.
13. **Settings say how they save, and why the mode is off** (NN/g on disabled controls: say why). The account form opens with "For your account, on every device. Saved when you press Save settings." (its `aria-describedby`), the keyboard section with "Saved on this device as soon as you change it." (in the switch's description too). With the count-in off, "Choose 1 bar or 2 bars to say when the count-in plays." sits under the disabled mode radios (their group's `aria-describedby`). Neither save model changed.
14. **Login and the account line.** The email field has the placeholder "you@example.com" and takes focus on load only where the pointer is fine (`(pointer: fine)`, a mouse or trackpad): on a touch screen autofocus would bring the keyboard up over a page not yet read, and iOS ignores it anyway. The sidebar's account shows the address's first letter in a `selected` circle (hidden from screen readers) beside the address, truncated, the whole of it in `title`.

### Files

- New: `src/components/OverflowMenu.tsx` (+ test), `src/components/menuKeys.ts` (+ test), `src/components/SegmentedControl.tsx`, `src/components/styles.test.ts`, `src/features/song/useControlsFold.ts` (+ test), `src/test/countInControls.ts`.
- Changed (app): `src/index.css` (tokens `selected`, `selected-line`, `score-range`; the range highlight), `src/components/styles.ts`, `src/components/icons.tsx` (`more`, `controls`), `PlayerControls.tsx`, `CountInCounter.tsx`, `countInLabels.ts`, `SongPage.tsx`, `useJamMode.ts`, `useSongShortcuts.ts`, `shortcuts.ts`, `LoopPanel.tsx`, `LoopSpeedControl.tsx`, `loopFocus.ts`, `loopLabels.ts`, `itemFocus.ts`, `LibraryPage.tsx`, `SongListItem.tsx`, `UploadPanel.tsx`, `OnTheGoPage.tsx`, `SettingsPage.tsx`, `LoginPage.tsx`, `AppShell.tsx`.
- Changed (tests): the component tests of each of those (`LoopPanel.test.tsx`'s `press` opens a loop's menu for "Edit X", "History X" and "Delete X"); `tests/unit/designTokens.test.ts`; e2e helpers in `playerPage.ts` (`showControls`, the count-in helpers), `loopsPage.ts` (`exitLoop`, `expectLooping`, `chooseLoopAction`, `setSpeed`), `practicePage.ts` (`openLoopHistory` through the menu), and the specs' call sites; new e2e: the fold (`player.spec.ts`), the menu from the keyboard and "Loop speed" with the disabled Save look (`loops.spec.ts`), the card link and a drop on the list (`library.spec.ts`).
- `docs/units/12-shots/final-*.png` retaken at phone, tablet and desktop, and `final-tablet-landscape-05-song-playing.png`, from a temporary spec since deleted (the shortcut overlay's shot waits for its fade).
- `AGENTS.md`: the count-in UI, the Loops UI bullet (one presentation of the playing loop, the menu, the hand-overs), the loop and count-in e2e helpers, the class list, and four Visual design bullets (colour roles, `SegmentedControl`, `OverflowMenu`, the folded controls).
- `docs/plan.md`, Unit 13's list: deleted 12 QA issues 1 and 2 (the cut-off count-in select; a loop item's five actions in three rows); cut "the playing loop shows twice" and "the slider's thumb at 70 for 71%" from the 12 Build line and 08 QA issue 5 from its line; rewrote the "where does the loop speed live on a phone" line (now: in the item, reached by "Loop speed"; only the sheet's kept scroll position is left); "Mark finished?" is now in the playing loop's item.

### Decisions

- **Mark in place, not leave out** (item 2): see the item. The cost is that in a long list the playing item can be below what shows of the panel; it is where the user pressed it, and "Loop speed" takes them to it.
- **Hide the slider while looping** (item 3), not make it save.
- **The fold resets per run** (item 1): "Show controls" is for a change made mid-play; the next Play gives the score the screen again.
- **The library keeps two buttons** (item 9).
- **No count-in shrink**: an early try at a smaller count-in number for the phone's short score box failed `count-in.spec.ts`'s "big enough to read from the throne" (35% of the window's short side); the number kept its size and the box got a minimum height instead.

### Async windows and inputs

- **The menu open.** A press outside closes it, focus staying where the press put it; Tab or Escape closes it with focus on the button; the loop form opening replaces the list, menu and all; the loop deleted on another device unmounts the item and its menu (focus falls to `<body>`, as for any control of a removed item); `canEdit` changing while it is open updates the Edit item's `aria-disabled` on that render. Choosing an item closes the menu before the item runs, so an item that replaces the row (Edit, Delete) never leaves a menu behind.
- **The fold** follows `running`, which only Play, Pause, Back to start, the end of the song and `load` change. A tap on the score seeks without changing it. A count-in going to playing, and every repeat's count-in, stay running, so the strip doesn't flicker between passes (the service never passes through `ready` there). "Show controls" pressed in the render playback stops in is dropped (`useControlsFold` resets on the stop); the next run folds. `useStaysOnScreen` compares the score box's place in the page with its place on the render before, and only on a fold change.
- **"Loop speed"** opens the panel and hands focus to the speed group once it renders (`useFocusWhenReady`: up to 5 s, and only if focus is still on the button or `<body>`). Exiting the loop meanwhile leaves nothing to focus and the wait ends. With the column already open it focuses at once.
- **A file dragged over the compact library**: a drop while an upload runs is ignored (as before). If the library goes from compact to full mid-drag (its last song deleted), the full drop box can stay highlighted until the next dragleave or drop.

### Known gaps

- At the top of the page the score comes up by the controls' lost height at the press of Play (there is nothing above to scroll back); it never moves under a tap, and Pause puts nothing in its way.
- Chromium only. Safari has no scroll anchoring, so `useStaysOnScreen` is what keeps the score still there; not tried on a real iPhone.
- A loop deleted on another device while its menu is open drops focus to `<body>`.
- With a count-in chosen, the phone's full controls bar is four rows (the mode under the bars).

### Manual verify

1. A song on a phone: Play folds the bar to the metronome, the speed and "Controls", stuck under the jam bar as the page scrolls; Pause brings the rest back and the score doesn't move.
2. Play a loop: no "Looping …" line; the loop's item reads "Now looping" with the speed control; the controls bar shows "Loop speed 85%", which opens the sheet on the speed. "More" on any loop: the arrows, Escape, Tab, a click outside.
3. Count-in: Off / 1 bar / 2 bars; the mode appears with a count-in; C cycles it; at 320 px nothing is cut.
4. Library with songs: click anywhere on a card; Upload is a button; drop a `.gp` on the list.
5. Home: the progress bar on a loop with a target. Settings with the count-in off: the note under the mode.

### Human checks (for Shane)

- Sign off on the retaken `final-*` screenshots.
- At the kit on the phone: is the folded strip enough while playing (metronome and speed), and is the short score box with the big count-in number readable.
- iPhone Safari: Pause doesn't move the score (no scroll anchoring there).

### Results

- `npm run check`: 107 files, 4195 tests green (was 103 / 4077).
- `npm run e2e`: 398 passed, 22 skipped, 0 failed (420 listed), on a fresh `npm run build -- --mode development` from bash. The `vite preview` on 4173 (PID 56088, not ours) was left running; the page it served loaded `assets/index-1MaXR70u.js`, the fresh `dist`'s file. Under a full parallel run `loops.spec.ts` "tap the first bar, then the last" failed once on phone (its first tap didn't seek) and then passed 6 of 6 alone and in the next two full runs; `usePlayer.test.tsx` "a second online while the retry is on its way" failed once in a loaded `npm run check` and passed alone and in every later run. Neither touches code changed here; watch them.

## Test (after UX pass)

Tests for the three commits since the last Test stage (tablet loop sheet, narrower gutter, UX pass). The builder's own tests already covered most criteria (fold rules, the menu's keys, the segmented count-in, toggle marks, the playing loop shown once, the library card, the compact upload, `targetProgress`, settings copy, login autofocus, the account initial); this stage filled the gaps and walked the checklist rows over the new stateful pieces: `useControlsFold`, `useFocusKeptInBar`, `useStaysOnScreen`, `OverflowMenu`, the "Loop speed" hand-over, the compact drop zone and the `choice` focus kind.

### Added

- `src/features/song/useControlsFold.test.ts`: a "Show controls" that lands after playback stopped (a handler from the playing render) must leave the next run folded (failed; bug 1, fixed); renders that change nothing keep the user's choice for the run; mounting on a running player starts folded.
- `src/components/OverflowMenu.test.tsx` ("gates and late events"): Enter on a disabled item does nothing and keeps the menu; an item enabled while the menu is open can be chosen at once; opening a second menu closes the first; a pointerdown on the menu's own button is not "outside"; keys with no rule (Page Down, Space) are left to the page on the button and in the menu.
- `src/components/SegmentedControl.test.tsx` (new): one group of native radios sharing a name, named by `labelledBy` or `label`, described by `describedBy`; a press hands back the option's own (number) value; arrows move the choice; disabled refuses a press.
- `src/features/player/PlayerControls.test.tsx` ("folded"): Show / Hide controls keeps focus as it flips; focus on Hide controls when playback stops goes to Metronome; a control folded away doesn't pull focus the user has since put elsewhere; after a fold that moved focus the strip still works with no restart; Loop speed is the same element folded or not, focus kept.
- `src/features/song/useSongShortcuts.test.tsx` ("the input guard"): a focused radio and a focused `role="menuitem"` keep the four arrows (no speed change, no loop switch), while Page Down switches loops and Space plays; a plain button keeps no arrows.
- `src/features/song/SongPage.test.tsx` ("controls while playing"): on a phone, Play loop closes the sheet and "Loop speed" opens it and focuses the loop's speed group (the earlier test ran at jsdom's 1024, the column); the score keeps its place on screen through Play and Pause (the score box's rect and `window.scrollBy` modelled), positions while playing scroll nothing, and a scroll the user made while playing counts as where the score is.
- `src/features/library/UploadPanel.test.tsx` (compact): offline, a drag over the list draws no outline and a drop uploads nothing (then online the same drop uploads); during an upload the list takes no drop and draws no outline; a drop clears the outline and several files are refused.
- `src/features/loops/loopLabels.test.ts`: `targetProgress` at the schema's bounds (25% towards 200%) and 99.5% shown as 100% reaching a 100% target.
- e2e `player.spec.ts` "Pause and Play leave the score where it is on screen, with no scroll anchoring to help": `overflow-anchor: none` (as Safari) and room below the page; the score's top is unchanged within 1 px across Pause, the bar having grown by over 40 px; Show controls holds for one run and the next Play folds again.
- e2e `shortcuts.spec.ts` "on a focused count-in choice the arrows move the choice, and Space still plays and pauses".
- e2e `auth.spec.ts` "the email field takes focus on load on a laptop, and not on a phone or tablet" (by project: desktop has a fine pointer, phone and tablet touch).

Each new test was seen to fail with the code it covers broken: the disabled check, the own-button check and the key handling in `OverflowMenu`; `role` in `useSongShortcuts`' focus read; the Metronome fallback and the "focus still on body" check in `useFocusKeptInBar`; `useStaysOnScreen`'s `scrollBy` and its scroll listener; the drag outline's `blocked` check; Loop speed's `setLoopPanelOpen(true)`; the radios' shared name; the fold fix. For e2e, one build with `useStaysOnScreen` a no-op, the radio `choice` kind removed and autofocus off failed 7 tests (the score test at all three sizes, the radio test at all three, autofocus on desktop) and passed the two "not focused" cases; the restored build passed them.

### Bugs found

1. **Fixed (two lines, `useControlsFold.ts`).** "Show controls" from the playing render, landing after playback stopped, was kept and unfolded the next run. "Show controls" is now dropped on a start as well as a stop.
2. **Logged, not fixed: Pause moves the score on a short page.** `useStaysOnScreen` makes up for the fold by scrolling the window, which can't scroll past the page's end. On the `groove-120` song page with the panel closed the page is barely taller than the window: Play folds and the page shrinks to no scroll at all, then Pause grows the bar and the score moves down 32 px on a laptop (the hook asked for 131 and the page had 99), about 120 px on a tablet and about 160 px on a phone (Chromium, scroll anchoring off). The UX pass note says a Pause never moves the score from under the next tap; that holds only when the page has room. Fix: room below the score while folded (a bottom padding of the height the fold took), or accept it. Carried forward to Unit 13 in `docs/plan.md`.

### Not covered

- A loop deleted on another device while its menu is open (focus to `<body>`, a known gap): nothing observable in jsdom tells a leaked document listener apart, so no test was kept for it.
- The compact library switching to the full drop box mid-drag (known gap).
- Safari: the score-stays test stands in for it by turning scroll anchoring off in Chromium.

### Results

- `npm run check`: 108 files, 4225 tests green (was 107 / 4195).
- `npm run e2e`: 407 passed, 22 skipped, 0 failed (429 listed, was 420), on a fresh `npm run build -- --mode development` from bash; the `vite preview` on 4173 was reused and left running, and the break check above showed it serving the fresh `dist`.

## QA (after UX pass)

**Verdict: FAIL**, on one major issue: the loop item's "More" menu is drawn partly off its panel (issue 1). Everything else in the four commits passes. One cosmetic issue was fixed here. One minor issue was found, plus Test's bug 2, measured and rated minor.

**How it was run.** This branch, built with `npm run build -- --mode development` and served by the `vite preview` on 4173 that was already running (it was reused and left running; it served the fresh `dist`, `assets/index-CiU4Gu-h.js`, and then the rebuild after the fix). Local Supabase. A temporary Playwright spec (deleted after the run) drove the phone (390 x 844), tablet (820 x 1180) and desktop (1440 x 900) projects. Some steps were also run at 320 x 640, at 1180 x 820 (tablet landscape), at 1024 x 900 and at 844 x 390 (phone landscape). It logged measurements (element rects, focus, ARIA state) and took the shots. Slow network was a 4 s delay on loop reads and a 3 s delay on Storage. Offline was `context.setOffline`. Chromium only; nothing was heard.

Shots are `docs/units/12-shots/qa2-<size>-NN-name.png`. Sizes are `phone`, `tablet`, `desktop`, `phone320`, `tablet-landscape` and `phone-landscape`. The menu placement shots are `qa2-menu-<width>-<loop>.png`. They are:

- 01 to 07: the song paused; folded while playing; scrolled; unfolded with "Hide controls"; the strip stuck under the jam bar on a long page; phone landscape folded and paused.
- 10 to 15: the loop panel paused; a loop playing with the sheet closed; "Loop speed" from the bar with the speed group focused; "Mark finished?" in the playing item; after "Exit loop"; the phone and tablet sheet open with the score above it.
- 20 to 23: the More menu on the last item; the edit form from it; the delete confirm; the menu offline.
- 30 to 32: the segmented count-in with the mode showing; the same at 320 and in tablet landscape; counting in at 320, folded.
- 40 to 48: the library empty; the grid; offline (the Upload button drawn off); a file dragged over the list; a junk file dropped; a card's Edit; the home page progress bars; settings (full page); login.
- 50 to 52: the song page on a slow network; the loop panel while loops load; the loop speed offline.

### Per item

| Item                                 | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tablet loop sheet (below 1024 px)    | Pass. At 820 the sheet spans the content column, starts closed, and "Play loop" closes it. A switch or restart while playing leaves it open. At 1180 it is the column. No sideways scroll at 320, 390, 820, 1180 or 1440.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Narrower tablet gutter               | Pass. Two bars a line at 820 (shot `qa2-tablet-12`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1. Controls fold while playing       | Pass, with the minor issue Test logged as bug 2 (issue 2). Play folds to Metronome, the speed and "Show controls" at every size. The strip sticks right under the jam bar (region top 63 px under the 8 to 54 px jam bar on tablet and desktop, 61 px on a phone with the sheet open). "Show controls" unfolds for the run, with focus kept on its "Hide controls" form. D while folded mutes the drums. Focus on Mute drums, then Space: focus goes to "Show controls". Space again (stop): focus goes to Metronome. Phone landscape: the score box doesn't move between Play and Pause. At 320 the strip's readout ran into "Controls" (issue 3, fixed).                         |
| 2. The playing loop shows once       | Pass. No "Looping …" line. The item reads "Now looping", with the speed fields, the nudges, Save speed, the prompt and Exit loop. "Restart loop" keeps playing and keeps focus at every size. Switching loops while playing leaves the sheet open. The sheet's header names the loop ("Loop: Verse").                                                                                                                                                                                                                                                                                                                                                                              |
| 3. "Loop speed" from the bar         | Pass. While a loop plays there is no Speed slider in the bar. "Loop speed 100%" (the icon and the percent, folded on a phone) opens the sheet and focuses the speed group, which is on screen at all three sizes (phone 588 to 762 px, above the tab bar at 787). After Exit loop the slider is back.                                                                                                                                                                                                                                                                                                                                                                              |
| 4. Toggle marks                      | Pass. A filled check when on, a ring when off, in each tile's corner. No mark on Back to start.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5. Less orange                       | Pass, judged on the shots.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6. Segmented count-in                | Pass. Off, 1 bar and 2 bars. The mode shows only with a count-in, on its own row on a phone. Nothing is clipped at 320 or 390 (no control's `scrollWidth` beyond its box). The arrow keys on a focused radio move the choice (1 bar to 2 bars), and C cycles it (to Off).                                                                                                                                                                                                                                                                                                                                                                                                          |
| 7. Phone score box sized to its line | Pass. The box is 202 px on a phone, 234 px in phone landscape. With the sheet open, 112 px of it shows above the sheet (phone, window at the top; the staff is cut, the known Unit 13 line). On a tablet in portrait, 451 px shows.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 8. Disabled primary buttons          | Pass. A disabled Save speed has a transparent fill, a dashed edge and `ink-muted` text at every size. So does the Upload button offline (shot 42). Save settings is drawn off until a change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 9. Overflow menu                     | **Fail (issue 1).** The keys all pass: Enter opens it on Edit, ArrowUp wraps to Delete, Home goes to Edit, Escape returns focus to More, ArrowDown on More opens it on Edit, and Tab closes it with focus on More. A tap opens it on phone and tablet. A press outside (on the score) closes it. A press begun on an item and let go outside chooses nothing. The menu stays open while the sheet scrolls. Edit, then Cancel, and Delete, then "Keep it", each hand focus back to More. Space on a menu item plays and pauses. Offline, Edit opens the form (online only there, as before). But where More sits at the start of its row, the menu hangs off the panel's left edge. |
| 10. Card grids                       | Pass. Three columns at 1440, one at 390 and 820.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 11. Library cards and compact upload | Pass. A click in a card's bottom-right corner opens the song. A card's Edit opens the edit form, not the song. With songs present, Upload is a button ("Upload a Guitar Pro file"). A file dragged over the list draws the "Drop the file to upload it" outline. A junk `.gp` dropped on the list shows the fixed "isn't a Guitar Pro file" error and adds nothing.                                                                                                                                                                                                                                                                                                                |
| 12. Home progress bar                | Pass. "Speed towards the target of Fill", value 85, max 120, text "85% of a 120% target". "Done" (85 of a 100% target) matches the line above it. A loop with no target has no bar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 13. Settings copy                    | Pass. Both save models are said, and with the count-in off "Choose 1 bar or 2 bars …" sits under the disabled mode.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 14. Login and the account line       | Pass. The email field is focused on load on the desktop project, not on phone or tablet. The sidebar shows "E" in a circle beside the address, which is truncated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Slow network and offline             | Pass. Play stays disabled until the file and sounds are in. The loop panel says it is loading, then lists the loop. Offline, a loop's Save speed is enabled (it is queued), and Upload is off with its note.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

### Issues

1. **Major: the More menu is clipped on the left wherever More starts its row.** The menu is anchored to the button's right edge (`right-0` in `OverflowMenu.tsx`) and is 176 px wide. When the item's buttons wrap, More lands at the left of the item, and the menu hangs 66 px past the panel's left edge, which clips it. "Edit" is not on screen at all and "Delete" reads "ete" (shots `qa2-phone-20-menu-last-item.png`, `qa2-menu-1440-Qx.png`, `qa2-menu-320-Qx.png`). Measured (the menu's left edge against the clipping box's):
   - Phone at 390, every active loop, playing or not (Play loop or Restart loop and Mark finished fill the row): -67 against 0.
   - Phone at 320, finished loops too: -67 against 0.
   - The column at 1024, 1180 and 1440, every finished loop (Play loop and Reopen fill the row): 606 against 672, 762 against 828, 926 against 992.

   It fits only where More shares a row with the buttons before it: the tablet sheet at 820, phone landscape, and active loops in the column. Repro: a phone at 390, a song with one loop, open the sheet, press "More" on the loop. Or a laptop: mark a loop finished, then press "More" on it under "Finished". The items can still be pressed by their visible part. Fix: place the menu by measuring on open (`left-0` when the right-anchored menu would cross the clipping box's left edge), or keep More at the end of its row (`ml-auto`) so the right anchor always has room; then a check in `design.spec.ts` that an open menu lies inside its panel. Not fixed here: it is layout behaviour with a test to write, not a colour.

2. **Minor (Test's bug 2, measured): Play and Pause move the score on a short page.** The shift at Pause was the same with Chromium's scroll anchoring on and off, from the top or from the page's end: 32 px on the desktop, 120 px on the tablet and 163 px on the phone (`groove-120`, panel closed). On a phone with the sheet closed the song page never scrolls (its scroll height is the window's), so it happens at every Play (up 163 px, a fifth of the screen) and every Pause (back down), on every song. Rated minor: the score goes back to exactly where it was before Play, the bar cursor stays in the box, and nothing is lost. The UX pass note's "a Pause never moves the score" holds only where the page can scroll. The Unit 13 line in `docs/plan.md` now has these numbers.
3. **Cosmetic, fixed: at 320 px the folded strip's "100%" ran into "Controls".** The strip needed about 370 px (Metronome 68, the slider row with "Speed" 172, the toggle 100, the gaps) in 288. In `PlayerControls.tsx`, below 360 px and only while folded, the words "Speed" and "Controls" are now `sr-only`; the accessible names are unchanged ("Speed", "Show controls"). The toggle got `min-w-touch`, so the chevron alone is still a 44 px target. Measured at 320 after the fix: Metronome 16 to 84, slider 100 to 196, readout 204 to 248, toggle 256 to 304 (48 x 44), no overlap and no overflow (`qa2-phone320-32-counting-in-320.png`). From 360 px nothing changed.
4. **Minor (not new): "Exit loop" drops focus to `<body>`.** The button goes with the item's playing state, and nothing takes focus (the old card's "Back to whole song" did the same). A keyboard user starts again from the top of the page. Hand it to the item's "Play loop", which stays. Repro: play a loop, Tab to "Exit loop", press Enter; `document.activeElement` is `<body>`, at all three sizes.

Seen and judged fine: in the column, the "Mark finished?" prompt's "Not yet" wraps under "Mark finished". After "Play loop" on a phone, focus stays on the hidden button (a known Unit 13 line). With the sheet open, the staff is cut at the sheet's edge (also known).

### Human checks (for Shane)

From the plan's Unit 12 row and the UX pass note:

- Sign off on the retaken `final-*` screenshots, and look at `qa2-phone-20-menu-last-item.png` and `qa2-menu-1440-Qx.png` for issue 1.
- At the kit on the phone: is the folded strip (metronome and speed) enough while playing; is the short score box with the big count-in number readable; does the score moving 163 px at Play and Pause bother you (issue 2).
- iPhone Safari: Pause and the score's place (no scroll anchoring there).
- A dim room and a bright one: the score paper and notation, the orange, the count-in number. Installed PWA on iPhone and Android: the icon, the maskable crop, the status bar colour.

### Results

- `npm run check`: 108 files, 4225 tests green.
- `npm run e2e`: 407 passed, 22 skipped, 0 failed (429 listed), on a fresh `npm run build -- --mode development` from bash, with the fix in. The `vite preview` on 4173 was reused and left running.

## QA fix round (after UX pass)

Build fixes for QA (after UX pass) issues 1, 2 and 4, each with a test seen to fail first (the e2e ones against the build QA left in `dist`, the unit ones before the code).

### Summary

1. **The More menu lies inside its panel (issue 1, major).** `OverflowMenu`'s root takes `ml-auto`, so More is always at the end of its row, the end its right-anchored menu hangs from. Where the item's buttons wrap and More starts a row of its own (a phone's active loops, 320 px's finished loops, the column's finished loops), it now sits at the item's right edge and the 176 px menu lies over the item. Measuring on open was not needed: the narrowest item (320 px, about 264 px inside) is wider than the menu. On wider rows More moves to the right end of the row beside Play loop and the status button, which is where an overflow button usually is.
2. **The score doesn't move at Play or Pause (issue 2, Test's bug 2).** The window can't scroll above the top of the page, so on a short page (a phone's song page with the sheet closed doesn't scroll at all) `useStaysOnScreen` couldn't make up for the fold. It now holds the part it couldn't scroll as room, a bottom margin it writes on the controls' slot (`data-testid="controls-slot"`, `useStaysOnScreen(scrollRef, controlsRef, fold.folded)`) while folded; the unfold gives the room back first and scrolls only the rest. The rules are pure, in `keepInPlace.ts` (`{ shift, scrollY, reserve }` to `{ scrollBy, reserve }`): moved up, scroll up as far as the window goes and hold the rest; moved down, give back the room, then scroll; then give back any room the window could stand in for, with a scroll up by the same amount (so Chrome's scroll anchoring, which may already have kept the score still at an unfold, can't leave room behind that piles up at every fold). The hook moved to its own module, `src/features/song/useStaysOnScreen.ts`. The Unit 13 line for it in `docs/plan.md` is deleted.
3. **Exit loop hands focus to the item's Play loop (issue 4).** Play loop carries `itemControlAttributes(loop.id, 'play')` (`ItemControl` has a `play` kind now), and Exit loop schedules `focusWhenReady(() => findItemControl(loop.id, 'play'))` after `onExit`.

### Files

- New: `src/features/song/keepInPlace.ts` (+ test), `src/features/song/useStaysOnScreen.ts` (moved out of `SongPage.tsx`, now also takes the element that holds the room).
- Changed: `src/components/OverflowMenu.tsx` (`ml-auto`), `src/features/song/SongPage.tsx` (the slot's margin and test id), `src/features/loops/LoopPanel.tsx` (Exit loop's hand-over), `src/lib/itemFocus.ts` (`play`).
- Tests: `keepInPlace.test.ts`; `SongPage.test.tsx` (the jsdom layout model now has a real `window.scrollY` that stops at 0 and counts the slot's margin; two new cases, from the top and part way down); `LoopPanel.test.tsx` ("Exit loop hands focus to that loop's Play loop"); e2e `player.spec.ts` "on a short page Play and Pause leave the score where it is, from the top, panel open or closed" (scroll anchoring on and off, at all three sizes) and `design.spec.ts` "a loop's More menu opens inside the loop panel, for active and finished loops" (the menu against the window, the panel and every ancestor that clips it).
- `AGENTS.md`: the `OverflowMenu` bullet (`ml-auto`, the check), the fold bullet (`useStaysOnScreen`, `keepInPlace`, the room), the Loops UI bullet (Exit loop's hand-over). `docs/plan.md`: the Unit 13 line for bug 2 deleted.

### Decisions

- **Room, not a bottom padding.** The suggested padding at the foot of the page gives the window room to scroll down, which is what a Pause needs, but at the top of the page Play needs to scroll up, and nothing below the score can give that. The only way to keep the score still there is to keep the height above it, so the room is a margin under the folded strip (a margin, not padding: the strip sticks, the room scrolls with the page). It holds only what the window couldn't scroll, so on a page that can scroll (a long song, scrolled down) there is none, as before.
- **The room is below the strip, not above it.** The strip stays right under the jam bar, where it sticks once the page scrolls, so it never moves itself; the room is blank canvas between the strip and the status line.
- **The margin is written in the layout effect, not through state.** A first version kept the room in state; the layout effect's update rendered again before paint, but React runs the first commit's passive effects before that render, so Play's `scrollIntoView` of the score (`useJamMode`) measured the page without the room and stopped short (the full e2e run caught it: `jam.spec.ts` landscape phone, `loop-scroll.spec.ts` desktop). The slot has no `style` prop, so React never overwrites it.
- **Play still brings the score on screen.** Where the score box isn't all on show (a tablet's or laptop's 60dvh box under the full controls), Play scrolls the window to it as before (Unit 06); that move is Play's, and the e2e checks the score is then clear of the strip. Where nothing scrolls (a phone), the score doesn't move at all. Pause never moves it.
- **More moves to the row's end everywhere**, rather than only where it wraps: one place for it, and a menu that never needs measuring.

### Async windows and inputs

- **The room while folded.** A scroll by the user counts as where the score is (the scroll listener, as before) and leaves the room as it is; a Show controls mid-run is an unfold (the room goes first); a stop, the end of the song and a load unfold the same way. A resize while folded can change the strip's height; the unfold then moves the score by a different amount than the room held, and the difference is scrolled (or, at the top, held as room while unfolded until the next fold or unfold settles it). Chrome's scroll anchoring scrolling at an unfold reads as "nothing moved", and the room it scrolled over is given back with a scroll up.
- **Exit loop's hand-over** waits through `useFocusWhenReady` (up to `FOCUS_WAIT_MS`, only while focus is still on Exit loop or `<body>`). Play loop is the same element before and after, so it is there on the next render.
- **The menu**: nothing new; the placement is CSS.

### Known gaps

- At the top of a short page, while playing, the room is a band of blank canvas between the folded strip and the score: 163 px on a phone, about 120 to 170 px on a tablet, up to 131 px on a laptop. It is the height the controls had; the score is where it was before Play.
- If Play loop is disabled when Exit loop is pressed (a player error), `focus()` does nothing and focus stays on `<body>`.
- Chromium only, as before; Safari's lack of scroll anchoring is stood in for by `overflow-anchor: none`.

### Manual verify

1. Phone, `groove-120`, sheet closed: Play and Pause; the score doesn't move, and while playing there is blank space under the strip. The same with the sheet open, and on a tablet and a laptop.
2. Phone at 390: a loop's More, active and finished; the whole menu shows. Laptop: a finished loop's More in the column.
3. Play a loop, Tab to Exit loop, Enter: focus is on that loop's Play loop.

### Results

- `npm run check`: 109 files, 4240 tests green (was 108 / 4225).
- `npm run e2e`: 413 passed, 22 skipped, 0 failed (435 listed, was 429), on a fresh `npm run build -- --mode development` from bash; the `vite preview` on 4173 was reused and left running. The new e2e failed against the build QA left in `dist` before the fix: the menu check on phone (menu -67..109 against 0..390) and desktop (926 against the panel's 992), the short-page check at all three sizes (Play moved the score 163, 171 and 131 px). The first full run after the fix failed `jam.spec.ts` landscape phone and `loop-scroll.spec.ts` desktop (the room kept in state, see Decisions); both pass since.

## Test (after QA fix round)

Tests for the three fixes of 8a6205f, walking the checklist's interleavings over the one new stateful piece, `useStaysOnScreen` (the room it holds across folds), and proving `keepInPlace`'s rules over every kind of input. No app code changed.

### Added

- `src/features/song/keepInPlace.test.ts`, "keepInPlace, every case": a grid of 1,200 inputs (moves up and down by less than, as much as and more than the window or the room can take; the top, part way, far down; no room, a little, a lot; fractional pixels; an overscrolled, negative `scrollY`), each checked for: the element back where it was (move + change of room - scroll = 0); room never negative and held only with the window at its top; no scroll above the top; a scroll down never more than the move; settled (asked again with nothing moved, nothing to do). Also: the room never exceeds what was held plus what the window lacked; and many runs of fold and unfold with user scrolls and the full height changing between a fold and its unfold, which never pile room up.
- `src/features/song/useStaysOnScreen.test.tsx` (new): the hook in a page model (`layOut`: header, controls full or folded, the room as the slot's margin, a window that scrolls only between the top and the page's end and is pulled back when the page shrinks, Chrome's scroll anchoring on or off). Cases: five Plays and Pauses on a page that can't scroll (still, 240 px room while playing, none while paused, no scroll); a long page scrolled down (scroll only, no room); a long page at its top (room, no scroll); anchoring having kept the score still (nothing left behind, over three runs); anchoring part way down (held, then given back); a user scroll into the room while playing; re-renders that fold nothing, and the score moving for other reasons while folded (the panel, a wrapping line: no scroll, room kept, the Pause keeps the score where it is now); a resize while playing on a long page (the score still at every Pause and Play, no room at the end); a resize at the top of a short page (Bugs found 1); StrictMode (room held once, one scroll each way); no scroll listener left on the window after unmount, with and without StrictMode.
- `SongPage.test.tsx`, "the score stays where it is…": a long page scrolled down holds no room while playing; Show controls mid-run gives the room back and the next Play holds it again; a playing song left for another song, then for the library, leaves no margin anywhere and doesn't scroll the window.
- e2e `loops.spec.ts` "Exit loop goes back to the whole song…": Exit loop is now pressed from the keyboard (focus, Enter) and focus must land on that loop's Play loop.
- e2e `design.spec.ts`: the menu measurement is a helper (`menuOutside`), and "at 320 px a loop's More menu opens inside the sheet, active and finished" (phone project) covers the narrowest width the build note names.

### Each new test seen to fail

- `keepInPlace` with the stand-in give-back removed: the grid, the worked example and the hook's "anchoring part way down" fail. Returning `{ scrollBy: shift, reserve: 0 }` (the old behaviour): 19 fail across the three files, the new SongPage cases among them.
- `useStaysOnScreen` with the key check removed: "re-renders … that fold nothing" fails. With the scroll listener doing nothing: "a scroll by the user into the room" fails. With the cleanup removed: the listener test fails (a first version that counted `getBoundingClientRect` reads after unmount passed without the cleanup, since React nulls the ref; it now counts the window's scroll listeners).
- A build without `ml-auto` and without Exit loop's hand-over: the 320 px menu test (Fill's menu outside) and the Exit loop test (phone and desktop) fail.

### Bugs found

1. **Room left after a resize while playing, at the top of a page that can't scroll (minor, logged).** Play on a phone's short page holds the fold as room; if the full controls come back shorter (a rotation while playing), the Pause gives back only what they now take and the difference stays as blank room under the controls while paused, until they are that tall again. It never piles up, and the score doesn't move. Fixing it means choosing to let the score move at that Pause (drop the room at an unfold) or keeping it; pinned by `useStaysOnScreen.test.tsx` and carried forward to Unit 13 in `docs/plan.md`.

### Results

- `npm run check`: 110 files, 4258 tests green (was 109 / 4240).
- `npm run e2e`: 414 passed, 24 skipped, 0 failed (438 listed, was 435; the 320 px menu test is skipped off the phone project), on a fresh `npm run build -- --mode development` from bash; the `vite preview` on 4173 was reused and left running.

## QA (after QA fix round)

**Verdict: FAIL**, on one major issue: on a phone, rotating to landscape while playing leaves the score, and the beat cursor, wholly below the screen, because the room held for the fold in portrait stays (issue 1). Before the fix round the beat cursor was still on screen there. The More menu (the earlier major) passes everywhere, and so does Exit loop focus. Two minor issues in the scroll-keeping: Pause with a count-in on, and leftover room after Show and Hide controls. No cosmetic fixes were needed.

**How it was run.** This branch at c6ffb6c, built with `npm run build -- --mode development` from bash and served by the `vite preview` already on 4173 (reused, left running). Local Supabase. Three temporary Playwright specs (deleted after the run) drove the phone, tablet and desktop projects, also at 320 x 640, 844 x 390 (phone landscape), 1180 x 820 (tablet landscape) and 1024 x 900. They logged element rects, `window.scrollY`, the controls slot's margin (the room), focus and the player's statuses, and took the shots. Long song: the local real export in `tests/fixtures/real/` (measured only, no shots). Chromium only; nothing was heard.

Shots are `docs/units/12-shots/qa3-*.png`:

- `qa3-menu-<size>-<loop>.png`: the open More menu for Chorus (playing), Verse (active) and Fill (finished) at `phone`, `phone320`, `phone-landscape`, `tablet`, `tablet-landscape`, `w1024` and `desktop`.
- `qa3-<size>-NN-name.png`, sizes `phone`, `tablet` and `desktop`: 01 playing at the top of a short page (the band); 02 Show controls while playing; 03 to 05 rotated while playing, then paused, then back (phone and tablet); 06 and 10 after rapid Play/Pause; 07 counting in; 08 the library after leaving a playing song; 09 Exit loop by keyboard and by pointer; 11 paused after Show and Hide controls; `qa3-phone-12-rotated-landscape-playing-later.png` is issue 1.

### Per item

| Item                                                                          | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| More menu (QA after UX pass, issue 1)                                         | **Pass.** Opened by mouse, by keyboard (focus, Enter) and by touch (a tap, on the phone and tablet projects) for a playing loop (Chorus), an active one (Verse) and a finished one (Fill), at 390, 320, 844 x 390, 820, 1180 x 820, 1024 and 1440: 135 opens, every menu inside the window, the panel and every ancestor that clips it. Each opened on Edit; Escape closed it with focus back on More. At 320 the menu spans 115 to 291 in a 320 px window (`qa3-menu-phone320-Chorus.png`). |
| Play and Pause, short song, top and part way, sheet or column open and closed | Pass with the count-in off. Phone: the score never moves (413 px at the top; 293 part way with the sheet open). Tablet and desktop: Play scrolls the window to show the score (Unit 06; 47 and 83 px) and Pause leaves it there; part way down the score stays put on both. The room is 0 at every Pause.                                                                                                                                                                                    |
| Long song (the real export), the same                                         | Pass, with the same numbers. Below 768 px the box is one line tall, and from 768 px the score scrolls inside its 60dvh box, so the page is as tall as for a short song. At the page's end with the panel open, Play moves the window to show the score and Pause leaves it.                                                                                                                                                                                                                  |
| Show controls while playing                                                   | Pass on tablet and desktop (the score doesn't move). Phone: Show controls moves the score down 56 px (the bar unfolded while playing has its Hide controls row, 56 px taller than when paused, and the page can't scroll). After Hide controls and Pause, 56 px of room stays under the paused controls (issue 3).                                                                                                                                                                           |
| Rotating while playing                                                        | **Fail on the phone (issue 1).** Tablet portrait to landscape and back: the score stays on screen (408 and 396 px in an 820 and a 1180 px window).                                                                                                                                                                                                                                                                                                                                           |
| Rapid Play/Pause                                                              | Pass. 7, 8, 13 and 20 taps or clicks at a time: the label and the player's status agree at the end (some taps are swallowed while playback starts, so the parity varies, as before), the room is the fold's while playing and 0 after the Pause, and the score is where it was.                                                                                                                                                                                                              |
| Tapping bars right after Play or Pause                                        | Pass. A point measured on the next bar before Play, tapped at once after Play, seeks there at every size (the score didn't move under it). After Pause, taps at 0 to 1000 ms each report `barTapped` for the bar under the point. A mouse click in the same few ms as the Pause click on the desktop is reported but its seek doesn't stick; that isn't humanly reachable and is outside this fix's area.                                                                                    |
| Count-in on                                                                   | Pass on the phone (the score doesn't move through Play, the count-in, playing, or a Pause in the count-in). **Fail on tablet and desktop (issue 2)**: Pause moves the score down 109 and 117 px.                                                                                                                                                                                                                                                                                             |
| Leaving the page while playing                                                | Pass. To the library by nav link and by the browser's Back: no controls slot, `scrollY` 0, nothing left over. Back to the song: no room, and the next Play and Pause behave.                                                                                                                                                                                                                                                                                                                 |
| The band above the score while playing (phone)                                | Acceptable, not major. 163 px of canvas between the strip and "Bar 1 of 16" (`qa3-phone-01-playing-band.png`). The score sits mid-screen with the strip above it and the sheet's header below; it reads as deliberate rather than broken, and the count-in number lands where the score was at rest. On a page that can scroll it is smaller or gone. Shane should judge it at the kit.                                                                                                      |
| Exit loop focus                                                               | Pass at all three sizes, by keyboard (Enter) and by click or tap: focus lands on that loop's "Play loop" with its ring (`qa3-phone-09-exit-loop-keyboard.png`), playback goes on, and Space from there pauses rather than pressing the button.                                                                                                                                                                                                                                               |

### Issues

1. **Major: on a phone, rotating to landscape while playing puts the score off screen.** Repro: phone (390 x 844), open `groove-120` (sheet closed), Play at the top of the page, rotate to 844 x 390. The room held in portrait (163 px) stays, so the score box is at 447 to 681 px in a 390 px window: none of it shows, and the beat cursor (447 to 524) is below the screen while playing. With the room cleared by hand the box would be at 284 to 518 and the beat cursor at 284 to 361, on screen. So this comes from the fix round's room, and it breaks Unit 06's "cursor stays in view at every size" in Unit 05's rotation case. The page can be scrolled to the score, and Pause puts it back as it was. Rotating from landscape to portrait while playing is fine (it leaves 8 px of room after the Pause, Test's bug 1). Fix: on a resize while folded, give back the room the window can now stand in for (or drop it and let Play's scroll into view run again), then add a check in `player.spec.ts` that the beat cursor is on screen after a rotation while playing. Shot: `qa3-phone-12-rotated-landscape-playing-later.png` (only the controls and the sheet's header show).
2. **Minor: with a count-in on, Pause moves the score on a tablet and a laptop in Chrome.** Repro: tablet (820 x 1180) or desktop, `groove-120`, count-in 1 or 2 bars, window at the top, Play, wait (counting in or playing), Pause. The score goes from 408 to 517 px (tablet) or from 344 to 461 (desktop), and the window goes back to the top. A trace of the Pause: the hook removes the 165 px room, Chrome's scroll anchoring scrolls up 165 px to keep the score still, and then the hook scrolls by -165 as well (the `scrollBy` comes from SongPage's chunk, with the margin already gone). With `overflow-anchor: none` on `html, body, main` the score stays put, so Safari, which has no scroll anchoring, should be fine. With the count-in off it doesn't happen (anchoring picks something else there). Rated minor, as the same symptom was before: the score returns to where it was before Play and nothing is lost. `player.spec.ts`'s short-page check runs with the count-in off only. Carried to Unit 13.
3. **Minor: on a phone, Show controls, Hide controls, then Pause leaves 56 px of room under the paused controls.** It stays through later plain Play/Pause cycles and never grows; a Pause while unfolded clears it (moving the score up 56 px). It has the same cause as Test's bug 1 (the bar is a different height when it unfolds than when it folded), reached with no resize. Added to that Unit 13 line. Shot: `qa3-phone-11-paused-after-show-hide.png`.

### Human checks (for Shane)

From the plan's Unit 12 row and this round:

- At the kit on the phone: the blank band above the score while playing (`qa3-phone-01-playing-band.png`), and whether you'd rather the score moved up at Play.
- Rotating the phone while playing (issue 1, after its fix).
- iPhone Safari and iPad: Play and Pause with a count-in on keep the score where it is (there is no scroll anchoring there; issue 2 is Chrome's).
- The earlier rows: sign off on the screenshots, dim and bright rooms, the installed PWA's icon and status bar.

### Results

- `npm run check`: 110 files, 4258 tests green (unchanged; QA changed no app code).
- `npm run e2e`: 414 passed, 24 skipped, 0 failed (438 listed), on a fresh `npm run build -- --mode development` from bash; the `vite preview` on 4173 was reused and left running.

## QA fix round 2 (after UX pass)

Build fixes for QA (after QA fix round) issues 1, 2 and 3, each with a test seen to fail first: the e2e ones against the build QA left in `dist` (c6ffb6c), the unit ones before the code.

### Summary

1. **A rotation while playing no longer pushes the score off a phone (issue 1, major).** The room is the height the full controls had above the score, and that height follows the width (rows wrap; 768 px changes the layout). `useStaysOnScreen` now listens for `resize`, and a new width while folded drops the room (`roomAfterResize` in `keepInPlace.ts`, pure): the score goes where the new layout puts it, right under the strip at the top of a phone's short page, with the beat cursor on screen. A change of height alone (a phone's toolbar) keeps it. Every resize also re-measures where the score is, so the next fold or unfold starts from the new layout.
2. **Pause with a count-in on no longer moves the score in Chrome (issue 2).** Chrome's scroll anchoring acts after the layout effect, as the frame is drawn, so it and the hook both made up for the same change at a Pause (with the count-in on it picked an anchor that the room's removal moved). The hook now turns anchoring off (`overflow-anchor: none` on `html` and `body`) while the song page is up, and puts back what was there on unmount: the hook is the window scroll's one owner at a fold, in Chrome as in Safari (which has none). Measuring after anchoring was not an option: nothing in a layout effect runs after it.
3. **No room is left over after the controls come back another height (issue 3, Test's bug 1).** `keepInPlace` now works the room out afresh from measured positions instead of adding deltas: the move to make up for is where the score would be with no room (`shift - reserve`), the window scrolls as much of it as it can, and only while folded is what is left held as room. Unfolded no room is held at all, so every Pause clears it. Show controls, Hide controls, Pause on a phone ends with no room and the score where it was before the first Play (it moves up 56 px at that Pause, back to there). The two Unit 13 lines for issues 2 and 3 (and Test's bug 1) are deleted from `docs/plan.md`.

### Files

- `src/features/song/keepInPlace.ts`: `keepInPlace({ shift, scrollY, reserve, folded })` (the new rule), `roomAfterResize`.
- `src/features/song/useStaysOnScreen.ts`: the `resize` listener, `overflow-anchor`, `holdRoom`; the third argument is now `folded` (it was a generic key).
- Tests: `keepInPlace.test.ts` (rewritten for `folded`: worked cases, the unfold shorter than the room, `roomAfterResize`, the 1,200-case grid folded and unfolded, repeated folds with height changes never leaving room); `useStaysOnScreen.test.tsx` (the model gains `resize`; a rotation on a long page and at the top of a short page, a height-only resize, Show/Hide/Pause, the listener test counts resize listeners too, anchoring off while mounted and restored, StrictMode); e2e `jam.spec.ts` "rotating a phone while playing keeps the beat cursor on screen, portrait to landscape and back" (phone project), `player.spec.ts` "on a short page with a count-in on, Pause leaves the score where it is, counting in or playing" and "Show controls, Hide controls and Pause leave no room under the controls" (all three sizes).
- `AGENTS.md` (the fold bullet), `docs/plan.md` (two Unit 13 lines deleted).

### Decisions

- **Drop the room at a rotation rather than recompute it.** While folded the full controls can't be measured, so the height they will unfold at in the new layout isn't known; the room from the old layout is the one value known to be wrong. Dropping it is what the page did before the first fix round, which QA found kept the cursor in view.
- **Clear the room at every unfold.** Keeping the score exactly still when the bar comes back shorter would mean holding room while paused, which is the leftover band QA logged. The score moves instead, once, by the difference, and only at the top of a page that can't scroll up for it.
- **Anchoring off for the song page's lifetime, not around each fold.** Anchoring picks its anchor before the change and adjusts after the layout effect, so turning it off only for the fold would have to outlast a frame the hook doesn't see. The rest of the song page loses nothing it relied on: Safari already behaves this way, and every e2e passes with it.

### Async windows and inputs

- **A resize while folded** (rotation, window resize): a new width drops the room and re-measures; the next Pause makes up for what it can by scrolling and moves the score for the rest. A height-only resize re-measures and keeps the room. Both can come before or after React's own re-render for the 768 px layout change; either order ends with the room dropped and the position measured from the new layout.
- **A user scroll while folded**: re-measures, as before; the room stays until the unfold.
- **Show controls / Hide controls mid-run**: an unfold then a fold; the unfold clears the room, the fold holds what the window can't scroll for the taller bar.
- **Unmount** (leaving the page, another song): listeners removed, anchoring put back; the slot that carried the room goes with the page. StrictMode's second mount saves and sets again.

### Known gaps

- At the top of a phone's short page, a Pause after a rotation while playing moves the score down by what unfolding adds (nothing above can scroll); a Pause after Show controls and Hide controls moves it up 56 px. Both put it where the paused layout has it.
- Any width change while folded drops the room, a one-pixel desktop resize too; at the top of a short page that moves the score up under the strip.
- The window's scroll anchoring is off on the song page, so content that changes height above the score while scrolled (the session notice) moves it, as in Safari.
- Chromium only; Safari not run.

### Manual verify

1. Phone 390 x 844, `groove-120`, sheet closed, at the top: Play, rotate to 844 x 390: the score and the beat cursor are on screen. Rotate back: still. Pause: no blank band under the controls.
2. Tablet and laptop, count-in 1 or 2 bars, at the top: Play, Pause during the count-in, and again once playing: the score stays put.
3. Phone: Play, Show controls, Hide controls, Pause: no blank band; the score is where it was before Play.

### Results

- `npm run check`: 110 files, 4264 tests green (was 110 / 4258). One run before it failed a `usePlayer` soundfont-retry `findByText` under load, unrelated to this change; it passed on the rerun and in the run counted here.
- `npm run e2e`: 421 passed, 26 skipped, 0 failed (447 listed, was 438), on a fresh `npm run build -- --mode development` from bash; the `vite preview` on 4173 was reused and left running. Against the build QA left in `dist`, the four new e2e failed: the rotation (beat cursor off screen at 844 x 390), Show/Hide/Pause on the phone (56 px room), and the count-in Pause on tablet and desktop. After the fix the three new tests and the earlier short-page and anchoring-off ones passed at every size before the full run.

## Test (after QA fix round 2)

Tests for f58366f, walking the checklist's interleavings over the round's three changes (`keepInPlace` from measured positions, `roomAfterResize`, scroll anchoring off while `useStaysOnScreen` is mounted). No app code changed.

### Added

- `src/features/song/useStaysOnScreen.test.tsx`: the page model gains the session notice (`page.notice`, between the controls and the score) and a resize split in two (`layOutAt`, the page laid out at a new size, and `resized`, the event), so a render can come between them. New describe "useStaysOnScreen, interleavings":
  - **Two song pages in a row:** a song page replaced by another through a new key (React's real unmount-then-mount order, plain and StrictMode) keeps anchoring off throughout, and the last to go puts back values set before (`auto` / `inherit`, not the empty string); a song page, another page, a song page again, over four starting pairs including `none`; nothing else on `html` or `body` changes.
  - **Resizes around a fold:** a rotation while paused then Play with no render between (the room is what the new layout's fold can't scroll); Play rendered before the rotation's `resize` event (the late event drops the room, the Pause leaves none, and later runs keep the score still); a rotation and a Pause in one frame, in either order; rotated there and back across runs (each rotation drops the room held at its Play: this one caught the width not being remembered, which no earlier test did); a rotation during a count-in, then beats and the downbeat re-rendering with no fold change (nothing scrolls, the score stays).
  - **Leaving while folded, room held:** anchoring put back, and a resize and a scroll after the unmount scroll nothing and don't throw; coming back starts with no room and Play and Pause hold the score still.
  - **The session notice:** appearing in the same render as the Pause (the score stays where it was while playing), while folded (room untouched, no scroll, the Pause keeps the score where it is then), and after the Pause (nothing scrolled or held for it, the score moves down by its height, bug 2; the next Play and Pause keep it where it is then), on a short page and on a long scrolled one.
- `tests/e2e/jam.spec.ts` "rotating a phone during a count-in drops the room and plays on with the beat cursor on screen" (phone project): 2-bar count-in at 50%, rotated to 844 x 390 while counting in: still counting in, no room, then the beat cursor on screen once playing, and back in portrait; the Pause leaves no room. It doesn't assert the count-in number on screen after the turn, which fails (bug 1).
- `tests/e2e/player.spec.ts`, all three sizes: "scroll anchoring is off only on the song page, left while playing and opened again" (computed `overflow-anchor` on `html` and `body`: `none` on the song page, `auto` on the library after leaving it while playing with room held, twice, with Play and Pause on each visit leaving no room); "after the session notice appears, Play and Pause still leave the score where it is" (a 3 s loop session with `shortSessions(page, 2)`, then two runs from the top of the page).

Each was seen to fail with the code broken: anchoring not restored (the four restore tests, and the e2e at all three sizes); no re-measure after a resize (the rotation then Play); the width not remembered (there and back); the position measured only at fold changes (the notice after the Pause, and the e2e on the phone); the room kept on a width change (the count-in rotation e2e).

### Bugs found

1. **The count-in number ends below the window after a rotation during a count-in (phone, minor).** Portrait 390 x 844 at the top, Play with a 2-bar count-in at 50%, turn to 844 x 390: the counter (over the score box) is at 284 to 518 px in a 390 px window and the window isn't scrolled; started in landscape, Play scrolls it to 124 to 358. `useScoreOnScreen` brings the box on screen once per start, and the re-layout moves it after. Bringing it back after a width change while running is more than a few lines and a design choice (it must not fight the user's scroll); a Unit 13 Carried forward line.
2. **"Practice logged" moves the score 32 px about 100 ms after a Pause (every size, minor).** The notice sits above the score and appears when the log's answer lands, after the Pause's render, so the hook doesn't see it. Measured per frame: phone 413 to 445 px at scroll 0, tablet 404 to 436, desktop 328 to 360 at scroll 99. A bar tapped just after such a Pause can be the bar below the finger. Chromium's anchoring made up for it where the window was scrolled, until this round turned it off (the handoff's known gap); Safari never did. A Unit 13 Carried forward line (reserve the notice's line, or keep the score in place when it comes and goes).
3. **Latent, not reachable:** two song pages mounted at once and unmounted first-in-first-out would leave anchoring on for the second and then `none` for good, since each saves what it found. React unmounts the old song's page before mounting the new one (tested above), and the app has one song route, so it can't happen today; a page-level counter would be needed if two players ever share a screen. Not logged forward.

### Results

- `npm run check`: 110 files, 4277 tests green (was 110 / 4264).
- `npm run e2e`: 428 passed, 28 skipped, 0 failed (456 listed, was 447), on a fresh `npm run build -- --mode development` from bash; the `vite preview` on 4173 was reused and left running.

## QA (after QA fix round 2)

**Verdict: FAIL**, on one major issue. On a phone in landscape, Show controls then Hide controls while playing scrolls the window to the top and leaves the score and the beat cursor below the screen (issue 1). The three issues from the last round pass: rotation while playing and during a count-in, Pause with the count-in on, and Show, Hide, Pause in portrait. The scroll sweep, the More menu and Exit loop focus pass. No cosmetic fixes were needed.

**How it was run.** This branch at 1bdc84d, built with `npm run build -- --mode development` from bash and served by the `vite preview` already on 4173 (reused, left running). Local Supabase. Two temporary Playwright specs, deleted after the run, drove the phone, tablet and desktop projects. They also ran at 320 x 640 / 640 x 320, 844 x 390, 667 x 375, 740 x 360, 915 x 412 and 1180 x 820. Each step logged the score box's rect, `window.scrollY`, the room (the controls slot's bottom margin), whether the beat cursor's middle was inside both the window and the box, the count-in number's rect, the status line and the computed `overflow-anchor`. Long song: the local real export in `tests/fixtures/real/`, measured only, with no shots kept. Chromium only; nothing was heard.

Shots are `docs/units/12-shots/qa4-*.png`. Sizes are `phone`, `phone320`, `phoneland` (844 x 390), `tablet`, `tabletland` (1180 x 820) and `desktop`:

- `qa4-<size>-rot-ci<0|2>-1-rotated` / `-2-playing` / `-3-back` / `-4-paused`: rotation while playing (`ci0`) and during a 2-bar count-in (`ci2`).
- `qa4-<size>-pause-ci2-counting`: paused during a count-in.
- `qa4-<size>-show-1-shown` / `-2-paused`: Show controls while playing, then Hide controls and Pause.
- `qa4-<size>-sweep-1-playing`, `-2-panel-open-playing`, `-3-notice`, `-4-library`: the scroll sweep.
- `qa4-<size>-menu-Chorus` and `qa4-<size>-exit-loop-keyboard`.
- `qa4-phone-<w>x<h>-hide-controls-playing`: issue 1, at 844 x 390, 667 x 375, 740 x 360 and 915 x 412.
- `qa4-phone-<w>x<h>-rotated-twice-playing`: 667 x 375 and 740 x 360.

### Per item

| Item                                                                                                      | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rotating while playing (last round's issue 1)                                                             | **Pass.** At 390 x 844 to 844 x 390 the room drops to 0 at the turn. The score sits at 284 to 518 with the beat cursor on screen, and is back at 250 in portrait. The Pause in landscape leaves the score at 284 with no room. The next portrait Play and Pause hold it at 413. The same holds at 375 x 667 to 667 x 375 and at 360 x 740 to 740 x 360, there and back twice: the beat cursor stays on screen throughout (box at 250, beat at 285 to 412). Tablet 820 x 1180 to 1180 x 820 and back: 296 and 284, on screen, and the Pause leaves no room. At 320 x 640 the first turn passes (box at 35 or -10 to 192 in a 320 px window), but a second turn to landscape puts it off screen (issue 2, minor). |
| Rotating during a count-in                                                                                | Pass for the beat cursor at every size: the count-in carries on into playback, and the room is 0 after the turn. As Test found (bug 1, carried to Unit 13), on the phone the count-in number is below a 390 px window after the turn (284 to 518, `qa4-phone-rot-ci2-1-rotated.png`: only the score's top edge shows above the sheet header).                                                                                                                                                                                                                                                                                                                                                                   |
| Pause with the count-in off, 1 bar and 2 bars, while counting in and while playing (last round's issue 2) | **Pass** at all six sizes, 30 cases. The score's top is identical while running and after the Pause, and the room is 0 after every Pause. Tablet 408 / 408, desktop 344 / 344, tablet landscape 312 / 312, phone 475, 320 px 318, phone landscape 124.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Show controls, Hide controls, Pause (last round's issue 3)                                                | **Pass in portrait and on tablet and desktop**, two runs each: the room is 0 after the Pause and the score is where it was while playing (phone 413, 320 px 318, tablet 408, tablet landscape 312, desktop 344). Phone portrait moves the score down 56 px at Show controls and back at the Pause, as the fix round's known gap says. **Fail in phone landscape (issue 1).**                                                                                                                                                                                                                                                                                                                                    |
| Play brings the score into view                                                                           | Pass. Phone portrait doesn't move. Tablet scrolls 47 px, desktop 83, 320 px 215, phone landscape 331, tablet landscape 115, with the beat cursor on screen each time. Pause leaves the score where it is.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Taps right after Play and right after Pause                                                               | Pass. With a point measured on the next bar before Play and tapped at once after it, the seek lands on bar 2 on the phone, tablet, tablet landscape and desktop. At 320 px and in phone landscape, Play's scroll into view moves the score (Unit 06), so a point measured before it is off the score; that isn't this round's subject. After Pause the score doesn't move at any size (the numbers above), so a tap lands on the bar under the finger.                                                                                                                                                                                                                                                          |
| Loop sheet and column, opened and closed twice while playing                                              | Pass at every size. The score's top, the room and the beat cursor don't change (the column only narrows the box), and the statuses recorded are `ready, playing` only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Jam follow-cursor on a long song (119 bars, 40 s from the top)                                            | Pass on all three projects. The beat cursor was never off screen in 200 samples. A user's scroll while playing is kept, and the Pause leaves no room.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| "Practice logged"                                                                                         | As Test found (bug 2, carried to Unit 13): the notice pushes the score down 32 px within a frame or two of the Pause at every size (phone 413 to 445, tablet 408 to 440, desktop 344 to 376). The next Play scrolls it back, and the Pause after that holds it. Nothing new.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Leaving the page while playing                                                                            | Pass. On the library `overflow-anchor` is `auto` on `html` and `body`, and there is no controls slot. Back on the song the room is 0 and anchoring is `none`. In phone landscape the library opens scrolled 104 px down, and the song again at 192: the router keeps the window's scroll across pages. That was there before this round and isn't a scroll-keeping issue; noted only.                                                                                                                                                                                                                                                                                                                           |
| More menu                                                                                                 | Pass at 390, 320, 844 x 390, 820, 1180 x 820 and 1440, for the playing loop and an active one. Enter opens it on Edit, Escape puts focus back on More, and a click opens it too. Every menu is inside the window (tablet: 1034 to 1180 in a 1180 px window).                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Exit loop focus                                                                                           | Pass at the same six sizes. By Enter, focus goes to "Play loop Chorus" with a solid ring and playback goes on. Space from there pauses rather than pressing the button (the loop stays exited). By click, focus goes to "Play loop Verse".                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

### Issues

1. **Major: in phone landscape, Show controls then Hide controls while playing leaves the score off screen.** Repro: phone project at 844 x 390 (also 667 x 375, 740 x 360 and 915 x 412). Open `groove-120`, close the sheet, scroll to the top, Play (the window scrolls to 331 and the score is at 124), Show controls (scroll 387, score still at 124), Hide controls. The window goes to the top, the room becomes 191 px, and the score is at 475 in a 390 px window. None of it shows and the beat cursor is below the screen while playing (`qa4-phone-844x390-hide-controls-playing.png`). It is the same at 667 x 375 (score at 432, room 182), 740 x 360 (417, 167) and 915 x 412 (497, 213), and on both runs. The page can be scrolled back to the score, and Pause puts the score where it was before Play. Per-frame trace at 844 x 390 after the Hide click: scroll 387 to 382 (score 129), then a scroll to 36 (score 475), then to 0, where the score stays. So the hook scrolls up by about 346 px and holds 191 px of room for a fold that only shrank the bar by 215. Likely cause: the fold shrinks the document by 215 px while the window is near its bottom, so the browser clamps `scrollY` as the layout effect measures, and `shift`/`scrollY` then don't describe the same layout. That is a guess for Build to confirm. Portrait at 320 x 640, tablet portrait and landscape, and desktop are fine (their windows don't sit at the page's bottom). It breaks Unit 06's "cursor stays in view at every size" in the two-tap path the fold offers. Whether it is new in this round is unknown: earlier rounds didn't run Show and Hide in landscape. It needs a check in `player.spec.ts`'s "Show controls, Hide controls and Pause" at 844 x 390 that the beat cursor is on screen after Hide controls.
2. **Minor: on a 320 px phone, a second turn to landscape while playing leaves the beat cursor below the window.** Repro: 320 x 640, `groove-120`, Play at the top (the window scrolls to 215), turn to 640 x 320 (fine), back to 320 x 640 (window at 0, score at 286), then to 640 x 320 again. The window stays at 0 and the box is at 250 to 452 in a 320 px window, so the beat cursor's middle is below it. At 375 x 667 and 360 x 740 the same sequence keeps it on screen, if only just (beat at 285 to 412). The cause is Test's bug 1: nothing brings the score back after a width change while running. Added to that Unit 13 line in `docs/plan.md`. Shot: `qa4-phone320-rot-ci0-4-paused.png` (paused there, the same position).

### Human checks (for Shane)

- Phone at the kit in landscape: Show controls and Hide controls while playing (issue 1, after its fix), and turning the phone while playing.
- iPhone Safari and iPad: Play and Pause with a count-in on keep the score where it is.
- The earlier rows: sign off on the screenshots in `docs/units/12-shots/`, dim and bright rooms, the installed PWA's icon, maskable crop and status bar, and the blank band above the score while playing on a phone.

### Results

- `npm run check`: 110 files, 4277 tests green (unchanged; QA changed no app code).
- `npm run e2e`: 428 passed, 28 skipped, 0 failed (456 listed), on a fresh `npm run build -- --mode development` from bash; the `vite preview` on 4173 was reused and left running.
