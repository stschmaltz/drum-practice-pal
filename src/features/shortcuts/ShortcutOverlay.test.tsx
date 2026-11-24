import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShortcutOverlay } from './ShortcutOverlay';
import { shortcutHelp } from './shortcuts';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Shortcuts
      </button>
      <button type="button">After</button>
      <ShortcutOverlay open={open} onClose={() => setOpen(false)} />
      <button type="button">Behind</button>
    </>
  );
}

async function openOverlay() {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole('button', { name: 'Shortcuts' }));
  return { user, dialog: screen.getByRole('dialog', { name: 'Keyboard shortcuts' }) };
}

describe('ShortcutOverlay', () => {
  it('lists every shortcut with its keys', async () => {
    const { dialog } = await openOverlay();

    for (const row of shortcutHelp()) {
      const term = within(dialog).getByText(row.label);
      const keys = term.parentElement?.querySelectorAll('kbd') ?? [];
      expect([...keys].map((kbd) => kbd.textContent)).toEqual(row.keys);
    }
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('takes focus to Close and keeps it inside on Tab and Shift+Tab', async () => {
    const { user, dialog } = await openOverlay();
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab on Close after a click on its text has left focus on the page', async () => {
    const { user, dialog } = await openOverlay();
    const close = within(dialog).getByRole('button', { name: 'Close' });

    // The heading can't take focus, so the click leaves it on <body>, outside the dialog.
    await user.click(within(dialog).getByRole('heading', { name: 'Keyboard shortcuts' }));
    expect(document.body).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();

    await user.click(within(dialog).getByText(/Keys do nothing while you type/));
    expect(document.body).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
  });

  it('makes the page behind it inert while open, and only then', async () => {
    const { user, dialog } = await openOverlay();
    const opener = screen.getByRole('button', { name: 'Shortcuts' });

    expect(opener.closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Behind' }).closest('[inert]')).not.toBeNull();
    expect(dialog.closest('[inert]')).toBeNull();

    await user.keyboard('{Escape}');
    expect(document.querySelector('[inert]')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('leaves alone a part of the page that was inert already', async () => {
    const asleep = document.createElement('div');
    asleep.setAttribute('inert', '');
    document.body.append(asleep);
    try {
      const { user } = await openOverlay();
      await user.keyboard('{Escape}');
      expect(asleep).toHaveAttribute('inert');
    } finally {
      asleep.remove();
    }
  });

  it('Escape closes it and focus goes back to what opened it', async () => {
    const { user } = await openOverlay();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shortcuts' })).toHaveFocus();
  });

  it('Close and a click outside it close it', async () => {
    const { user, dialog } = await openOverlay();
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Shortcuts' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Shortcuts' }));
    const backdrop = screen.getByRole('dialog').parentElement;
    if (!backdrop) throw new Error('no backdrop');
    await user.click(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('a click inside it leaves it open', async () => {
    const { user, dialog } = await openOverlay();

    await user.click(within(dialog).getByRole('heading', { name: 'Keyboard shortcuts' }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a press that starts inside it and is let go outside leaves it open', async () => {
    const { dialog } = await openOverlay();
    const backdrop = dialog.parentElement;
    if (!backdrop) throw new Error('no backdrop');

    // Selecting a row's text and letting go past the edge: the browser sends the
    // click to the element both ends share, which is the backdrop.
    const heading = within(dialog).getByRole('heading', { name: 'Keyboard shortcuts' });
    fireEvent.mouseDown(heading);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // A press on the backdrop itself still closes it.
    fireEvent.mouseDown(backdrop);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('unmounted while open, gives focus back to what opened it when that is still on the page', async () => {
    const user = userEvent.setup();
    const view = render(
      <>
        <button type="button">Shortcuts</button>
        <ShortcutOverlay open={false} onClose={() => {}} />
      </>,
    );
    const opener = screen.getByRole('button', { name: 'Shortcuts' });
    await user.click(opener);
    view.rerender(
      <>
        <button type="button">Shortcuts</button>
        <ShortcutOverlay open onClose={() => {}} />
      </>,
    );
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();

    view.rerender(
      <>
        <button type="button">Shortcuts</button>
      </>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});
