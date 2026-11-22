import { linkErrorFromHash, loginPathFor, safeNextPath } from './nextPath';

describe('safeNextPath', () => {
  it.each(['/', '/library', '/songs/abc', '/settings?tab=1', '/library#top'])(
    'keeps the app path %s',
    (path) => {
      expect(safeNextPath(path)).toBe(path);
    },
  );

  it.each([
    null,
    undefined,
    '',
    'library',
    'https://evil.example/',
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
  ])('falls back to / for %j', (raw) => {
    expect(safeNextPath(raw)).toBe('/');
  });

  it.each(['/login', '/login?next=/library', '/login/'])('never loops back to %s', (raw) => {
    expect(safeNextPath(raw)).toBe('/');
  });
});

describe('loginPathFor', () => {
  it('has no next for home', () => {
    expect(loginPathFor('/')).toBe('/login');
  });

  it('encodes the path to return to', () => {
    expect(loginPathFor('/songs/abc?x=1')).toBe('/login?next=%2Fsongs%2Fabc%3Fx%3D1');
  });

  it('drops unsafe paths', () => {
    expect(loginPathFor('//evil.example')).toBe('/login');
  });
});

describe('linkErrorFromHash', () => {
  it('reads the description of a failed magic link', () => {
    expect(
      linkErrorFromHash(
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toBe('Email link is invalid or has expired');
  });

  it('has a fallback when there is no description', () => {
    expect(linkErrorFromHash('#error_code=otp_expired')).toBe('That sign-in link did not work.');
  });

  it.each(['', '#', '#top', '#access_token=abc'])('is null for %j', (hash) => {
    expect(linkErrorFromHash(hash)).toBeNull();
  });
});
