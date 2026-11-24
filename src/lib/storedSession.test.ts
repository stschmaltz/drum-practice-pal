import { FAKE_AUTH_STORAGE_KEY } from '@/test/fakeSupabase';
import { readStoredSession, sessionFromStorage } from './storedSession';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

const stored = {
  access_token: 'expired-access',
  refresh_token: 'refresh',
  expires_at: 1,
  token_type: 'bearer',
  user: { id: 'user-1', email: 'drummer@drumpal.test' },
};

afterEach(() => localStorage.clear());

describe('sessionFromStorage', () => {
  it('reads the session supabase-js keeps, expired or not', () => {
    expect(sessionFromStorage(JSON.stringify(stored))).toMatchObject({
      refresh_token: 'refresh',
      user: { id: 'user-1' },
    });
  });

  it.each([
    ['nothing stored', null],
    ['not JSON', '{nope'],
    ['JSON that is not an object', '"text"'],
    ['no refresh token', JSON.stringify({ ...stored, refresh_token: undefined })],
    ['no access token', JSON.stringify({ ...stored, access_token: 7 })],
    ['no user', JSON.stringify({ ...stored, user: undefined })],
    ['a user without an id', JSON.stringify({ ...stored, user: { id: '' } })],
  ])('is null for %s', (_case, raw) => {
    expect(sessionFromStorage(raw)).toBeNull();
  });
});

describe('readStoredSession', () => {
  it('reads the key the client stores its session under', () => {
    localStorage.setItem(FAKE_AUTH_STORAGE_KEY, JSON.stringify(stored));
    expect(readStoredSession()?.user.id).toBe('user-1');
  });

  it('is null when storage refuses to be read', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      expect(readStoredSession()).toBeNull();
    } finally {
      getItem.mockRestore();
    }
  });
});
