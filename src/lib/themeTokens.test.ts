import { colorToken, contrastRatio, parseColorTokens, relativeLuminance } from './themeTokens';

describe('parseColorTokens', () => {
  it('reads every hex colour token, lower-cased, and nothing else', () => {
    const tokens = parseColorTokens(`
      @theme {
        --color-*: initial;
        --color-canvas: #0D0F14;
        --color-ink-muted: #9aa3b5;
        --spacing-touch: 2.75rem;
        --color-not-hex: rgb(1 2 3);
      }
      .x { color: var(--color-canvas); }
    `);
    expect([...tokens]).toEqual([
      ['canvas', '#0d0f14'],
      ['ink-muted', '#9aa3b5'],
    ]);
  });

  it('throws for a token the stylesheet lacks', () => {
    expect(() => colorToken(new Map(), 'brand')).toThrow('--color-brand');
  });
});

describe('contrast', () => {
  it('matches WCAG for black and white', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
  });

  it('matches published ratios', () => {
    // #767676 on white is the classic 4.54:1, the lightest grey that passes AA.
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#777777', '#ffffff')).toBeLessThan(4.5);
    expect(contrastRatio('#123456', '#123456')).toBe(1);
  });

  it('refuses anything but #rrggbb', () => {
    expect(() => relativeLuminance('#fff')).toThrow();
    expect(() => relativeLuminance('red')).toThrow();
  });
});
