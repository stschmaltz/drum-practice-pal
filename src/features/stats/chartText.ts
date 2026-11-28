/**
 * What the Stats page's charts share. Each chart is SVG drawn by the app on
 * the design tokens, no chart library (Unit 16), in a file of its own
 * (`DailyMinutesChart`, `PracticeHeatmap`, `SpeedChart`, `Sparkline`). The
 * geometry is chartScale.ts and speedChartLayout.ts and the data totals.ts,
 * heatmap.ts and loopProgress.ts, all pure; the components only draw. Every
 * graphic carries the numbers and dates it stands for (Unit 17), and is an
 * `img` named by a one-line summary with those numbers in a visually hidden
 * table, so a screen reader gets the data rather than a picture of it.
 *
 * Size (17 QA issue 10): a chart's text is in the SVG's own units and grows
 * with the picture, so each chart caps its width (`chartWidthClass`, the
 * heatmap's own limits) to keep that text between 10 px on a 390 px phone and
 * about the page's own size on a laptop. `stats.spec.ts` measures it.
 */

/**
 * The bar and line charts are 280 units wide with 9-unit text: full width on
 * a phone (11.5 px text at 390 px), and no wider than 28rem, where that text
 * is 14.4 px.
 */
export const chartWidthClass = 'w-full max-w-md';
/** The font size of every label in the bar and line charts, in their units. */
export const CHART_FONT = 9;
export const chartTextClass = 'text-[9px]';

/** A weekday as one letter: under a day's bar, beside a row of the heatmap. */
export const narrowWeekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' });
