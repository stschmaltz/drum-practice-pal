import {
  CHARACTER_KEYS_STORAGE_KEY,
  readCharacterKeysOn,
  saveCharacterKeysOn,
  subscribeCharacterKeys,
} from './characterKeysPreference';

const storageFails = () => {
  throw new DOMException('The operation is insecure.', 'SecurityError');
};

afterEach(() => {
  vi.restoreAllMocks();
  // A save that works clears what a failed one left in memory for the next test.
  expect(saveCharacterKeysOn(true)).toBe(true);
  localStorage.clear();
});

describe('the single-key shortcuts preference', () => {
  it('is on when this device has never saved it', () => {
    expect(readCharacterKeysOn()).toBe(true);
  });

  it('reads back what was saved, and keeps it in localStorage', () => {
    expect(saveCharacterKeysOn(false)).toBe(true);
    expect(readCharacterKeysOn()).toBe(false);
    expect(localStorage.getItem(CHARACTER_KEYS_STORAGE_KEY)).toBe('off');

    expect(saveCharacterKeysOn(true)).toBe(true);
    expect(readCharacterKeysOn()).toBe(true);
  });

  it('is on for a stored value it doesn’t know', () => {
    localStorage.setItem(CHARACTER_KEYS_STORAGE_KEY, 'maybe');
    expect(readCharacterKeysOn()).toBe(true);
  });

  it('is on when storage can’t be read at all (blocked site data)', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(storageFails);
    expect(readCharacterKeysOn()).toBe(true);
  });

  it('is on when reading throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(storageFails);
    expect(readCharacterKeysOn()).toBe(true);
  });

  it('says a save didn’t stick when storage throws, and holds the choice for this page', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(storageFails);
    expect(saveCharacterKeysOn(false)).toBe(false);
    expect(readCharacterKeysOn()).toBe(false);
  });

  it('holds a failed save even when storage can’t be reached at all', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(storageFails);
    expect(saveCharacterKeysOn(false)).toBe(false);
    expect(readCharacterKeysOn()).toBe(false);
  });

  describe('subscribeCharacterKeys', () => {
    it('tells listeners about a save in this page', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeCharacterKeys(listener);
      saveCharacterKeysOn(false);
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
      saveCharacterKeysOn(true);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('tells listeners about a save in another tab, and about storage being cleared', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeCharacterKeys(listener);
      window.dispatchEvent(new StorageEvent('storage', { key: CHARACTER_KEYS_STORAGE_KEY }));
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
      expect(listener).toHaveBeenCalledTimes(2);
      unsubscribe();
      window.dispatchEvent(new StorageEvent('storage', { key: CHARACTER_KEYS_STORAGE_KEY }));
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('ignores another tab’s writes of other keys', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeCharacterKeys(listener);
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });
  });
});
