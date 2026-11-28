/**
 * Where focus goes when the recordings form closes (checklist 5, a control
 * that replaces itself): back to what opened it. "Add a recording" is on the
 * page only while the song has no link, so after the first link is saved the
 * header's "More" button, which holds "Manage recordings", takes it.
 */

/** On "Add a recording". */
export const ADD_RECORDING_ATTRIBUTES = { 'data-recordings-opener': 'add' };
/** On the song header's "More" button. */
export const RECORDINGS_MENU_ATTRIBUTES = { 'data-recordings-opener': 'menu' };

export function findRecordingsOpener(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-recordings-opener="add"]') ??
    document.querySelector<HTMLElement>('[data-recordings-opener="menu"]')
  );
}

/** A form field's input, for focus after "Add another link" and a refused Save. */
export const linkInputId = (formId: string, slot: string) => `${formId}-${slot}`;
