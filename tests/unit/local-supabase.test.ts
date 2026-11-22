import { envFromProcess, parseStatusJson } from '../../scripts/local-supabase.ts';

const status = {
  API_URL: 'http://127.0.0.1:54321',
  PUBLISHABLE_KEY: 'sb_publishable_x',
  SECRET_KEY: 'sb_secret_y',
  DB_URL: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
};

describe('parseStatusJson', () => {
  it('reads the URL and keys', () => {
    expect(parseStatusJson(JSON.stringify(status))).toEqual({
      url: status.API_URL,
      publishableKey: status.PUBLISHABLE_KEY,
      secretKey: status.SECRET_KEY,
    });
  });

  it('skips notices printed before the JSON', () => {
    const output = `A new version of Supabase CLI is available\n${JSON.stringify(status)}`;
    expect(parseStatusJson(output).url).toBe(status.API_URL);
  });

  it('throws when the stack is not running', () => {
    expect(() => parseStatusJson('failed to inspect container health')).toThrow(/running/);
  });

  it('throws when a key is missing or empty', () => {
    expect(() => parseStatusJson(JSON.stringify({ ...status, SECRET_KEY: '' }))).toThrow(
      /SECRET_KEY/,
    );
    const withoutPublishable = { ...status, PUBLISHABLE_KEY: undefined };
    expect(() => parseStatusJson(JSON.stringify(withoutPublishable))).toThrow(/PUBLISHABLE_KEY/);
  });
});

describe('envFromProcess', () => {
  const full = {
    VITE_SUPABASE_URL: 'http://localhost:54321',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'pk',
    SUPABASE_SECRET_KEY: 'sk',
  };

  it('uses env vars when all three are set', () => {
    expect(envFromProcess(full)).toEqual({
      url: full.VITE_SUPABASE_URL,
      publishableKey: 'pk',
      secretKey: 'sk',
    });
  });

  it('returns null when any is missing', () => {
    expect(envFromProcess({ ...full, SUPABASE_SECRET_KEY: undefined })).toBeNull();
    expect(envFromProcess({})).toBeNull();
  });
});
