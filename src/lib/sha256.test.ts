// @vitest-environment node
import { createHash } from 'node:crypto';
import { toHex } from './hex';
import { sha256, sha256Hex } from './sha256';

const nodeHex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const utf8 = (text: string) => new TextEncoder().encode(text);

describe('sha256 (fallback)', () => {
  it.each([
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    ],
  ])('matches the FIPS vector for %j', (text, hex) => {
    expect(toHex(sha256(utf8(text)))).toBe(hex);
  });

  // Padding changes at 55/56 and 63/64 bytes, so cover every length around them.
  it('matches node crypto for lengths 0 to 200', () => {
    for (let length = 0; length <= 200; length++) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 31 + length) % 256);
      expect(toHex(sha256(bytes))).toBe(nodeHex(bytes));
    }
  });

  it('matches node crypto for a fixture-sized file', () => {
    const bytes = new Uint8Array(300_000).map((_, i) => (i * 2654435761) % 251);
    expect(toHex(sha256(bytes))).toBe(nodeHex(bytes));
  });
});

describe('sha256Hex', () => {
  const bytes = utf8('drum practice pal');

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses crypto.subtle when there is one', async () => {
    expect(await sha256Hex(bytes)).toBe(nodeHex(bytes));
  });

  it('falls back outside a secure context, where crypto.subtle is missing', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    expect(globalThis.crypto.subtle).toBeUndefined();
    expect(await sha256Hex(bytes)).toBe(nodeHex(bytes));
  });
});
