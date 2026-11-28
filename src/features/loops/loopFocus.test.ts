import { itemAttributes } from '@/lib/itemFocus';
import type { LoopStatus } from '@/lib/schema';
import { findStatusButtonAfterRefusal, statusButtonAttributes } from './loopFocus';

/** One loop's item with its status button, as a list draws it. */
function listLoop(id: string, status: LoopStatus) {
  const item = document.createElement('li');
  for (const [name, value] of Object.entries(itemAttributes(id))) item.setAttribute(name, value);
  const button = document.createElement('button');
  for (const [name, value] of Object.entries(statusButtonAttributes({ id, status }))) {
    button.setAttribute(name, value);
  }
  const other = document.createElement('button');
  item.append(button, other);
  document.body.append(item);
  return { item, button, other };
}

afterEach(() => {
  document.body.replaceChildren();
});

// 20 batch 8 (13.21): where focus goes when a refused "Mark finished" moves its loop back.
describe('findStatusButtonAfterRefusal', () => {
  it('with focus nowhere, finds the loop’s button once it is listed with its old status', () => {
    // Still where the refused change put it.
    const moved = listLoop('a', 'finished');
    const find = findStatusButtonAfterRefusal('a', 'finished');
    expect(find?.()).toBeNull();

    moved.item.remove();
    const back = listLoop('a', 'active');
    expect(find?.()).toBe(back.button);
  });

  it('with focus in the loop’s item, waits until what had focus has left the page', () => {
    const moved = listLoop('a', 'finished');
    moved.button.focus();
    const find = findStatusButtonAfterRefusal('a', 'finished');
    expect(find?.()).toBeNull();

    moved.item.remove();
    expect(find?.()).toBeNull();
    const back = listLoop('a', 'active');
    expect(find?.()).toBe(back.button);
  });

  it('leaves alone an item that is already back with the user in it', () => {
    const back = listLoop('a', 'active');
    back.other.focus();
    const find = findStatusButtonAfterRefusal('a', 'finished');
    // Nothing leaves the page, so nothing is ever found: focus stays on the other control.
    expect(find?.()).toBeNull();
  });

  it('is null when focus is somewhere else on the page', () => {
    listLoop('a', 'active');
    const elsewhere = listLoop('b', 'active');
    elsewhere.button.focus();
    expect(findStatusButtonAfterRefusal('a', 'finished')).toBeNull();
  });

  it('a refused Reopen looks for the loop among the finished', () => {
    const find = findStatusButtonAfterRefusal('a', 'active');
    listLoop('a', 'active');
    expect(find?.()).toBeNull();
    document.body.replaceChildren();
    const back = listLoop('a', 'finished');
    expect(find?.()).toBe(back.button);
  });
});
