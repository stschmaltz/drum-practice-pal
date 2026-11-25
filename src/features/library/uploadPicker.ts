/** Finds the upload's file input, for a hand-over of focus (the last song deleted). */
export const UPLOAD_PICKER_ATTRIBUTES = { 'data-upload-picker': '' };

export function findUploadPicker(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-upload-picker]');
}
