import { throwIfError, unwrap } from './supabaseResult';

describe('unwrap', () => {
  it('returns data', () => {
    expect(unwrap({ data: { id: 1 }, error: null }, 'row')).toEqual({ id: 1 });
  });

  it('returns falsy data that is not null', () => {
    expect(unwrap({ data: [], error: null }, 'rows')).toEqual([]);
    expect(unwrap({ data: 0, error: null }, 'count')).toBe(0);
  });

  it('throws the error object itself, so callers keep its code', () => {
    const error = { message: 'permission denied', code: '42501' };
    expect(() => unwrap({ data: null, error }, 'row')).toThrow(
      expect.objectContaining({ code: '42501' }),
    );
  });

  it('throws when an error comes with data', () => {
    expect(() => unwrap({ data: { id: 1 }, error: { message: 'boom' } }, 'row')).toThrow();
  });

  it('throws when there is no data and no error', () => {
    expect(() => unwrap({ data: null, error: null }, 'settings')).toThrow('No settings returned');
  });
});

describe('throwIfError', () => {
  it('passes when there is no error', () => {
    expect(() => throwIfError({ error: null })).not.toThrow();
  });

  it('throws the error', () => {
    expect(() => throwIfError({ error: { message: 'offline' } })).toThrow(
      expect.objectContaining({ message: 'offline' }),
    );
  });
});
