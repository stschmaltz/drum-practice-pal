import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OverflowMenu, type OverflowMenuItem } from './OverflowMenu';

function setup({ editDisabled = false } = {}) {
  const chosen: string[] = [];
  const item = (id: string, label: string, extra: Partial<OverflowMenuItem> = {}) => ({
    id,
    label,
    icon: 'edit' as const,
    onSelect: () => chosen.push(id),
    ...extra,
  });
  render(
    <div>
      <button type="button">Before</button>
      <OverflowMenu
        name="Verse"
        buttonAttributes={{ 'data-item-menu': 'verse' }}
        items={[
          item('edit', 'Edit', { disabled: editDisabled }),
          item('history', 'Show history'),
          item('delete', 'Delete', { danger: true }),
        ]}
      />
      <p>Outside text</p>
    </div>,
  );
  return { chosen, user: userEvent.setup() };
}

const more = () => screen.getByRole('button', { name: 'More actions for Verse' });
const menu = () => screen.queryByRole('menu', { name: 'Actions for Verse' });
const items = () => screen.getAllByRole('menuitem');

describe('OverflowMenu', () => {
  it('is a menu button: closed, it says so and has no menu', () => {
    setup();
    expect(more()).toHaveAttribute('aria-haspopup', 'menu');
    expect(more()).toHaveAttribute('aria-expanded', 'false');
    expect(more()).toHaveAttribute('data-item-menu', 'verse');
    expect(menu()).not.toBeInTheDocument();
  });

  it('a click opens the menu with focus on its first item, and lists the items in order', async () => {
    const { user } = setup();
    await user.click(more());
    expect(more()).toHaveAttribute('aria-expanded', 'true');
    expect(more()).toHaveAttribute('aria-controls', menu()?.id);
    expect(items().map((each) => each.textContent)).toEqual(['Edit', 'Show history', 'Delete']);
    expect(items()[0]).toHaveFocus();
    // Out of the Tab order: the arrows move between them.
    for (const each of items()) expect(each).toHaveAttribute('tabindex', '-1');
  });

  it('the arrows open it from the button: down on the first item, up on the last', async () => {
    const { user } = setup();
    more().focus();
    await user.keyboard('{ArrowUp}');
    expect(items()[2]).toHaveFocus();
    await user.keyboard('{Escape}');
    await user.keyboard('{ArrowDown}');
    expect(items()[0]).toHaveFocus();
  });

  it('the arrows, Home and End move inside it, wrapping round, and are taken from the page', async () => {
    const { user } = setup();
    await user.click(more());
    await user.keyboard('{ArrowDown}');
    expect(items()[1]).toHaveFocus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(items()[0]).toHaveFocus();
    await user.keyboard('{ArrowUp}');
    expect(items()[2]).toHaveFocus();
    await user.keyboard('{Home}');
    expect(items()[0]).toHaveFocus();
    await user.keyboard('{End}');
    expect(items()[2]).toHaveFocus();
    // Cancelled, so the song page's arrow shortcuts (which skip a handled key) leave it alone.
    expect(fireEvent.keyDown(items()[2] as HTMLElement, { key: 'ArrowDown' })).toBe(false);
  });

  it.each(['{Escape}', '{Tab}'])('%s closes it and puts focus back on its button', async (key) => {
    const { user } = setup();
    await user.click(more());
    await user.keyboard('{ArrowDown}');
    await user.keyboard(key);
    expect(menu()).not.toBeInTheDocument();
    expect(more()).toHaveFocus();
    expect(more()).toHaveAttribute('aria-expanded', 'false');
  });

  it('choosing an item closes the menu, hands focus to its button, then runs the item', async () => {
    const { chosen, user } = setup();
    await user.click(more());
    await user.click(screen.getByRole('menuitem', { name: 'Show history' }));
    expect(chosen).toEqual(['history']);
    expect(menu()).not.toBeInTheDocument();
    expect(more()).toHaveFocus();
  });

  it('Enter on an item chooses it', async () => {
    const { chosen, user } = setup();
    more().focus();
    await user.keyboard('{ArrowUp}{Enter}');
    expect(chosen).toEqual(['delete']);
  });

  it('a disabled item is shown and reachable, but choosing it does nothing and keeps the menu', async () => {
    const { chosen, user } = setup({ editDisabled: true });
    await user.click(more());
    const edit = screen.getByRole('menuitem', { name: 'Edit' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(edit).toHaveFocus();
    await user.click(edit);
    expect(chosen).toEqual([]);
    expect(menu()).toBeInTheDocument();
  });

  it('a press outside closes it and leaves focus where the press put it', async () => {
    const { user } = setup();
    await user.click(more());
    await user.click(screen.getByRole('button', { name: 'Before' }));
    expect(menu()).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
  });

  it('a press begun inside the menu keeps it open wherever it is let go', () => {
    setup();
    fireEvent.click(more());
    fireEvent.pointerDown(items()[1] as HTMLElement);
    fireEvent.pointerUp(screen.getByText('Outside text'));
    expect(menu()).toBeInTheDocument();
  });

  it('the button toggles it: a second click closes it', async () => {
    const { user } = setup();
    await user.click(more());
    await user.click(more());
    expect(menu()).not.toBeInTheDocument();
    expect(more()).toHaveFocus();
  });
});
