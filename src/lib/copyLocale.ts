/**
 * The locale of every date and number the app writes into its own copy:
 * English, since the words round them are ("the week of Jun 8.", "1,100
 * days", "Last practised Nov 2"). Left to the browser, a German one wrote
 * "the week of 8. Juni." and "1.100" into the same sentences (17 QA issue 4).
 * Nothing formats with no locale named; the label modules' tests run under a
 * German browser (`inBrowserLocale('de')`) to keep it so.
 */
export const COPY_LOCALE = 'en';
