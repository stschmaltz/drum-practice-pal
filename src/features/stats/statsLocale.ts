/**
 * The locale of every date and number the Stats page writes: English, since
 * the words round them are ("the week of Jun 8.", "1,100 days"). Left to the
 * browser, a German one wrote "the week of 8. Juni." and "1.100" into the
 * same sentences (17 QA issue 4). Nothing in this folder formats with no
 * locale named; `dateLabels.test.ts` and `statLabels.test.ts` run under a
 * German browser to keep it so.
 */
export const STATS_LOCALE = 'en';
