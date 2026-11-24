import { render, screen } from '@testing-library/react';
import { Icon } from './icons';

describe('Icon', () => {
  it('is hidden from screen readers and from Tab', () => {
    const { container } = render(<Icon name="play" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('leaves a control named by its words alone', () => {
    render(
      <button type="button">
        <Icon name="metronome" />
        Metronome
      </button>,
    );
    expect(screen.getByRole('button')).toHaveAccessibleName('Metronome');
  });

  it('takes the size it is given, or 20 px', () => {
    const { container } = render(
      <>
        <Icon name="play" />
        <Icon name="play" className="size-6 text-brand" />
        <Icon name="play" className="text-brand" />
      </>,
    );
    const [plain, sized, coloured] = Array.from(container.querySelectorAll('svg'));
    expect(plain).toHaveClass('size-5');
    expect(sized).toHaveClass('size-6');
    expect(sized).not.toHaveClass('size-5');
    // A colour alone mustn't leave the icon at the SVG's natural size.
    expect(coloured).toHaveClass('size-5', 'text-brand');
  });
});
