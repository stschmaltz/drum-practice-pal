import {
  FAILURE_COPY,
  failureCopy,
  failureKind,
  signInFailureCopy,
  UserFacingError,
} from './errorCopy';
import { TokenRefusedError } from './tokenRefresh';

vi.mock('@/lib/supabase', async () => (await import('@/test/fakeSupabase')).fakeSupabaseModule);

describe('failureKind', () => {
  it.each([
    ['a TypeError from fetch', new TypeError('Failed to fetch'), 'network'],
    [
      'PostgREST without a connection',
      { message: 'TypeError: Failed to fetch', code: '' },
      'network',
    ],
    [
      'auth without a connection',
      { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 },
      'network',
    ],
    [
      'storage without a connection',
      { name: 'StorageUnknownError', message: 'Failed to fetch', originalError: new TypeError() },
      'network',
    ],
    ['an expired token', { message: 'JWT expired', code: 'PGRST303' }, 'signIn'],
    ['an unreadable token', { message: 'JWSError', code: 'PGRST301' }, 'signIn'],
    ['a token the refresh could not fix', new TokenRefusedError(), 'signIn'],
    ['a parent row gone', { message: 'violates foreign key', code: '23503' }, 'gone'],
    ['no row for .single()', { message: 'no rows', code: 'PGRST116' }, 'gone'],
    ['a check constraint', { message: 'loops_bars_check', code: '23514' }, 'refused'],
    ['a missing grant', { message: 'permission denied', code: '42501' }, 'refused'],
    ['an HTTP refusal with no code', { message: 'Bad request', status: 400 }, 'refused'],
    ['a plain Error', new Error('boom'), 'unknown'],
    ['a string', 'boom', 'unknown'],
    ['nothing', undefined, 'unknown'],
  ])('%s is %s', (_label, error, kind) => {
    expect(failureKind(error)).toBe(kind);
  });
});

describe('failureCopy', () => {
  it("never shows the error's own message", () => {
    for (const error of [
      new Error('relation "loops" violates <script>'),
      { message: 'duplicate key value violates unique constraint', code: '23505' },
      { message: 'TypeError: Failed to fetch', code: '' },
    ]) {
      const copy = failureCopy(error);
      expect(Object.values(FAILURE_COPY)).toContain(copy);
      expect(copy).not.toContain(error.message);
    }
  });

  it('shows copy the app wrote itself as it is', () => {
    expect(failureCopy(new UserFacingError('That file is over 20 MB.'))).toBe(
      'That file is over 20 MB.',
    );
  });
});

describe('signInFailureCopy', () => {
  it.each([
    [
      { code: 'over_email_send_rate_limit', status: 429, message: 'raw server text' },
      /Too many emails/,
    ],
    [{ code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' }, /wrong/],
    [{ status: 429, message: 'Too Many Requests' }, /Too many tries/],
    [{ name: 'AuthRetryableFetchError', message: 'Failed to fetch' }, /couldn't be reached/],
    [{ code: 'something_new', status: 400, message: 'raw server text' }, /refused/],
    // Unit 13 Test: the rest of the codes the login page knows.
    [
      { code: 'over_request_rate_limit', status: 429, message: 'raw server text' },
      /^Too many tries/,
    ],
    [
      { code: 'signup_disabled', status: 422, message: 'Signups not allowed' },
      /^New accounts are closed\.$/,
    ],
    [
      { code: 'email_address_invalid', status: 400, message: 'Email address is invalid' },
      /isn't one the server takes/,
    ],
    [{ message: 'TypeError: Failed to fetch', code: '' }, /couldn't be reached/],
  ])('maps %o to fixed copy', (error, copy) => {
    expect(signInFailureCopy(error)).toMatch(copy);
    expect(signInFailureCopy(error)).not.toContain(error.message);
  });
});
