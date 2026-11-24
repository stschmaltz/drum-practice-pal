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
