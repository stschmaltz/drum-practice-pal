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
