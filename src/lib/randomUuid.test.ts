import { randomUuid } from './randomUuid';

// The shape the gp-files storage policies accept, plus the v4 version and variant bits.
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomUuid', () => {
  it('makes lowercase version 4 UUIDs', () => {
    for (let i = 0; i < 200; i++) expect(randomUuid()).toMatch(UUID_V4);
  });

  it('makes a different one each time', () => {
    const ids = new Set(Array.from({ length: 1000 }, randomUuid));
    expect(ids.size).toBe(1000);
  });
});
