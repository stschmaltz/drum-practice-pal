import {
  CANDIDATE_DIR,
  DEFAULT_SOUND_FONT_URL,
  isLocalSoundFontPath,
  SOUND_FONTS,
} from './soundfonts';

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

describe('SOUND_FONTS', () => {
  it('lists the default soundfont as a shipped option', () => {
    const option = SOUND_FONTS.find((sf) => sf.url === DEFAULT_SOUND_FONT_URL);
    expect(option?.shipped).toBe(true);
  });

  it('keeps unshipped candidates in the gitignored drop folder', () => {
    for (const option of SOUND_FONTS.filter((sf) => !sf.shipped)) {
      expect(option.url.startsWith(`${CANDIDATE_DIR}/`)).toBe(true);
    }
  });
});
