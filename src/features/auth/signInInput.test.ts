import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeEmail, normalizeSignInCode, SIGN_IN_CODE_LENGTH } from './signInInput';

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

  it('matches otp_length in supabase/config.toml', () => {
    const config = readFileSync(join(process.cwd(), 'supabase', 'config.toml'), 'utf8');
    expect(config).toMatch(new RegExp(`^otp_length = ${SIGN_IN_CODE_LENGTH}$`, 'm'));
  });
});
