import { render, screen } from '@testing-library/react';
import { EmptyState, LoadingLine } from './StatusMessages';

describe('LoadingLine', () => {
  it('is the copy, with a spinner screen readers skip', () => {
    render(<LoadingLine>Loading your songs…</LoadingLine>);
    const line = screen.getByText('Loading your songs…');
    // The copy is the line's own text, so getByText finds the element it found before Unit 12.
    expect(line.tagName).toBe('P');
    expect(line.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(line).toHaveAccessibleName('');
  });
});

describe('EmptyState', () => {
  it('shows the copy and the next step, with its icon hidden', () => {
    const { container } = render(
      <EmptyState icon="library" action={<a href="/library">Go to Library</a>}>
        No songs yet.
      </EmptyState>,
    );
    expect(screen.getByText('No songs yet.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Go to Library' })).toBeVisible();
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('has no action when given none', () => {
    render(<EmptyState icon="offline">You're offline.</EmptyState>);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
