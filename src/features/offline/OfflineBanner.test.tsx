import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import { setUpdateWaiting } from './appUpdate';
import { OfflineBanner } from './OfflineBanner';

describe('OfflineBanner', () => {
  it('shows nothing online with no update waiting', () => {
    render(<OfflineBanner />);
    expect(screen.queryByTestId('app-banner')).not.toBeInTheDocument();
  });

  it('says what still works while offline, and goes when the connection is back', () => {
    render(<OfflineBanner />);
    act(() => onlineManager.setOnline(false));
    expect(screen.getByRole('status')).toHaveTextContent("You're offline.");
    act(() => onlineManager.setOnline(true));
    expect(screen.queryByTestId('app-banner')).not.toBeInTheDocument();
  });

  it('offers a waiting update, and swaps it in only when asked', async () => {
    const apply = vi.fn();
    render(<OfflineBanner />);
    act(() => setUpdateWaiting(apply));
    expect(apply).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Reload to update' }));
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
