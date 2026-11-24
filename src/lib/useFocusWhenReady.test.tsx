import { useState } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FOCUS_WAIT_MS, useFocusWhenReady } from './useFocusWhenReady';

/**
 * A press whose button goes away, and a target that shows up only on a later
 * render (`Show target`), as a loop's new place does after an optimistic edit.
 */
function Harness() {
  const focusWhenReady = useFocusWhenReady();
  const [pressed, setPressed] = useState(false);
  const [targetShown, setTargetShown] = useState(false);
  return (
    <>
      {!pressed && (
        <button
          type="button"
          onClick={() => {
            focusWhenReady(() => document.getElementById('target'));
            setPressed(true);
          }}
        >
          Press
        </button>
      )}
      <button type="button">Elsewhere</button>
      <button type="button" onClick={() => setTargetShown(true)}>
        Show target
      </button>
      {targetShown && (
        <button type="button" id="target">
          Target
        </button>
      )}
    </>
  );
}

describe('useFocusWhenReady', () => {
  it('focuses the target on the render that brings it, once the pressed button has gone', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Press' }));
    expect(document.body).toHaveFocus();

    act(() => screen.getByRole('button', { name: 'Show target' }).click());
    // .click() moves no focus, so it is still lost when the target shows up.
    expect(screen.getByRole('button', { name: 'Target' })).toHaveFocus();
  });

  it('leaves focus where the user has put it meanwhile', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Press' }));

    await user.click(screen.getByRole('button', { name: 'Elsewhere' }));
    act(() => screen.getByRole('button', { name: 'Show target' }).click());
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
  });

  it('gives up on a target that takes too long, so a late change can’t take focus', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      render(<Harness />);
      act(() => screen.getByRole('button', { name: 'Press' }).click());
      vi.setSystemTime(Date.now() + FOCUS_WAIT_MS + 1);

      // A render to notice the wait is over, then one that brings the target.
      act(() => screen.getByRole('button', { name: 'Show target' }).click());
      expect(screen.getByRole('button', { name: 'Target' })).not.toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });
});
