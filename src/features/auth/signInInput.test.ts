import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeEmail,
  normalizeSignInCode,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_CODE_PATTERN,
} from './signInInput';

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Demo@DrumPal.test ')).toBe('demo@drumpal.test');
  });

  it.each(['', '   ', 'demo', 'demo@', '@drumpal.test', 'de mo@drumpal.test'])(
    'rejects %j',
    (raw) => {
      expect(normalizeEmail(raw)).toBeNull();
    },
  );
});

describe('normalizeSignInCode', () => {
  it.each([
    ['123456', '123456'],
    [' 123 456 ', '123456'],
    ['123-456', '123456'],
  ])('accepts %j', (raw, expected) => {
    expect(normalizeSignInCode(raw)).toBe(expected);
  });

  it.each(['', '12345', '1234567', '12a456'])('rejects %j', (raw) => {
    expect(normalizeSignInCode(raw)).toBeNull();
  });

  it.each(['123456', ' 123 456 ', '123-456', '12a456', '1234567', '      ', '12345', ''])(
    'the input pattern agrees with the normalizer on %j',
    (raw) => {
      // Browsers anchor `pattern` and compile it with the v flag.
      const pattern = new RegExp(`^(?:${SIGN_IN_CODE_PATTERN})$`, 'v');
      expect(pattern.test(raw)).toBe(normalizeSignInCode(raw) !== null);
    },
  );

  it('matches otp_length in supabase/config.toml', () => {
    const config = readFileSync(join(process.cwd(), 'supabase', 'config.toml'), 'utf8');
    expect(config).toMatch(new RegExp(`^otp_length = ${SIGN_IN_CODE_LENGTH}$`, 'm'));
  });
});
