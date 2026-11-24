import '@testing-library/jest-dom/vitest';

// jsdom's Blob has no arrayBuffer(), which the upload flow reads files with.
if (typeof Blob !== 'undefined' && !('arrayBuffer' in Blob.prototype)) {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    value(this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
        reader.readAsArrayBuffer(this);
      });
    },
  });
}

// Per-device preferences (the single-key shortcuts switch) live in localStorage, which
// jsdom keeps for the whole file: start every test from a device that has saved nothing.
// Node-environment files have no window, and nothing of theirs to clear.
afterEach(() => {
  if (typeof window !== 'undefined') window.localStorage.clear();
});
