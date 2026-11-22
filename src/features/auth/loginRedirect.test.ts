import {
  EXPIRED_LINK_MESSAGE,
  FAILED_LINK_MESSAGE,
  linkErrorFromHash,
  loginPathFor,
  safeNextPath,
} from './loginRedirect';

describe('safeNextPath', () => {
  it.each(['/', '/library', '/songs/abc', '/settings?tab=1'])('keeps the app path %s', (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  // GoTrue appends `#access_token=...` to the redirect; a second `#` breaks the sign-in.
  it.each([
    ['/library#top', '/library'],
    ['/settings?tab=1#frag', '/settings?tab=1'],
    ['/#', '/'],
  ])('drops the fragment from %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

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

  it.each(['/login', '/login?next=/library', '/login/', '/login#x'])(
    'never loops back to %s',
    (raw) => {
      expect(safeNextPath(raw)).toBe('/');
    },
  );
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
  it('explains an expired or reused magic link', () => {
    expect(
      linkErrorFromHash(
        '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toBe(EXPIRED_LINK_MESSAGE);
  });

  it('never shows the description from the URL, which anyone can write', () => {
    expect(
      linkErrorFromHash('#error=access_denied&error_description=Call+0800+to+unlock+your+account'),
    ).toBe(FAILED_LINK_MESSAGE);
    expect(linkErrorFromHash('#error_code=otp_expired&error_description=Call+0800+to+unlock')).toBe(
      EXPIRED_LINK_MESSAGE,
    );
  });

  it.each(['', '#', '#top', '#access_token=abc'])('is null for %j', (hash) => {
    expect(linkErrorFromHash(hash)).toBeNull();
  });
});
