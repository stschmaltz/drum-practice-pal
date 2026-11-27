/** Mark the upload's file input and its section, for a hand-over of focus (the last song deleted). */
export const UPLOAD_PICKER_ATTRIBUTES = { 'data-upload-picker': '' };
export const UPLOAD_SECTION_ATTRIBUTES = { 'data-upload-section': '', tabIndex: -1 };

/**
 * The upload's file input, or its section while the input is off (an upload
 * pending, offline): `focus()` on a disabled input does nothing, and the
 * hand-over that asked would be used up with focus left on `<body>`.
 */
export function findUploadPicker(): HTMLElement | null {
  const input = document.querySelector<HTMLInputElement>('[data-upload-picker]');
  if (input && !input.disabled) return input;
  return document.querySelector<HTMLElement>('[data-upload-section]');
}
