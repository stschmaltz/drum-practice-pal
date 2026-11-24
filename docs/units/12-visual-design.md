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
