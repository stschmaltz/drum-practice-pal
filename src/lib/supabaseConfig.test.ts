import { readSupabaseConfig, resolveSupabaseUrl } from './supabaseConfig';

describe('resolveSupabaseUrl', () => {
  it('keeps a loopback API when the page is on loopback', () => {
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', 'localhost')).toBe(
      'http://127.0.0.1:54321',
    );
    expect(resolveSupabaseUrl('http://localhost:54321', '127.0.0.1')).toBe(
      'http://localhost:54321',
    );
  });

  it('points a loopback API at the LAN host the page was opened on', () => {
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', '192.168.1.20')).toBe(
      'http://192.168.1.20:54321',
    );
    expect(resolveSupabaseUrl('http://localhost:54321', 'mylaptop.local')).toBe(
      'http://mylaptop.local:54321',
    );
  });

  it('never rewrites a hosted project URL', () => {
    expect(resolveSupabaseUrl('https://abc.supabase.co', '192.168.1.20')).toBe(
      'https://abc.supabase.co',
    );
  });

  it('keeps the URL when there is no page host', () => {
    expect(resolveSupabaseUrl('http://127.0.0.1:54321', '')).toBe('http://127.0.0.1:54321');
  });
});

describe('readSupabaseConfig', () => {
  const env = {
    VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  };

  it('returns the URL and key', () => {
    expect(readSupabaseConfig(env, 'localhost')).toEqual({
      ok: true,
      url: 'http://127.0.0.1:54321',
      publishableKey: 'sb_publishable_x',
    });
  });

  it('applies the LAN rewrite', () => {
    const config = readSupabaseConfig(env, '10.0.0.5');
    expect(config.ok && config.url).toBe('http://10.0.0.5:54321');
  });

  it('names every missing variable', () => {
    expect(readSupabaseConfig({}, 'localhost')).toEqual({
      ok: false,
      error: 'Missing VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
    });
    expect(
      readSupabaseConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: '  ' }, 'localhost'),
    ).toEqual({ ok: false, error: 'Missing VITE_SUPABASE_PUBLISHABLE_KEY.' });
  });

  it('rejects a URL that is not http or https', () => {
    const config = readSupabaseConfig(
      { ...env, VITE_SUPABASE_URL: 'ftp://localhost:54321' },
      'localhost',
    );
    expect(config).toEqual({
      ok: false,
      error: 'VITE_SUPABASE_URL is not a valid URL: ftp://localhost:54321',
    });
  });

  it('rejects a URL that does not parse', () => {
    const config = readSupabaseConfig({ ...env, VITE_SUPABASE_URL: 'not a url' }, 'localhost');
    expect(config.ok).toBe(false);
  });
});
