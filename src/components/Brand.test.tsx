import { render, screen } from '@testing-library/react';
import { BrandMark, Wordmark } from './Brand';

describe('Wordmark', () => {
  it('reads as the app name, so it can be a heading on its own', () => {
    render(
      <h1>
        <Wordmark size="lg" />
      </h1>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Drum Practice Pal');
  });

  it('draws the mark as decoration', () => {
    const { container } = render(<BrandMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    // The mark has shapes to draw, each in a token colour.
    const shapes = Array.from(svg?.children ?? []);
    expect(shapes.length).toBeGreaterThan(0);
    for (const shape of shapes) {
      const colours = [shape.getAttribute('fill'), shape.getAttribute('stroke')].filter(
        (value) => value !== null && value !== 'none',
      );
      for (const colour of colours) expect(colour).toMatch(/^var\(--color-[a-z-]+\)$/);
    }
  });
});
