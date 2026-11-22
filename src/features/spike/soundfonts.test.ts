import { isLocalSoundFontPath, SOUND_FONTS } from './soundfonts';

describe('isLocalSoundFontPath', () => {
  it.each(['/soundfont/sonivox.sf2', '/sf-candidates/MuseScore_General.sf3', '/a.SF2'])(
    'accepts %s',
    (path) => {
      expect(isLocalSoundFontPath(path)).toBe(true);
    },
  );

  it.each([
    'https://example.com/a.sf2',
    '//example.com/a.sf2',
    'soundfont/sonivox.sf2',
    '/soundfont/sonivox.mid',
    '/../secret.sf2',
    '/a b.sf2',
  ])('rejects %s', (path) => {
    expect(isLocalSoundFontPath(path)).toBe(false);
  });

  it('accepts every listed option', () => {
    for (const option of SOUND_FONTS) expect(isLocalSoundFontPath(option.url)).toBe(true);
  });
});
