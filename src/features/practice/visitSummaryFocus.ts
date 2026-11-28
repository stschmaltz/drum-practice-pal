/** On the overview's practice summary, so the hand-over of focus from its Dismiss can wait until it has gone. */
export const VISIT_SUMMARY_ATTRIBUTES = { 'data-visit-summary': '' } as const;

export const isVisitSummaryShown = () => document.querySelector('[data-visit-summary]') !== null;
