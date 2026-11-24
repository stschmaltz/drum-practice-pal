import { findItemControl, neighbourAfterLeaving } from './itemFocus';

describe('neighbourAfterLeaving', () => {
  it('is the item after the one leaving', () => {
    expect(neighbourAfterLeaving(['a', 'b', 'c'], 'a')).toBe('b');
    expect(neighbourAfterLeaving(['a', 'b', 'c'], 'b')).toBe('c');
  });

  it('is the item before when the last one leaves', () => {
    expect(neighbourAfterLeaving(['a', 'b', 'c'], 'c')).toBe('b');
  });

  it('is nothing when the only item leaves, or one not in the list', () => {
    expect(neighbourAfterLeaving(['a'], 'a')).toBeNull();
    expect(neighbourAfterLeaving(['a', 'b'], 'x')).toBeNull();
    expect(neighbourAfterLeaving([], 'a')).toBeNull();
  });
});

describe('findItemControl', () => {
  afterEach(() => document.body.replaceChildren());

  function item(html: string) {
    document.body.insertAdjacentHTML('beforeend', html);
  }

  it('finds the control itself when it is on the page', () => {
    item(
      '<button data-item-control="delete:a">Delete</button><button data-item-menu="a">More</button>',
    );
    expect(findItemControl('a', 'delete')?.textContent).toBe('Delete');
  });

  it('stands the item’s "More" button in for a control inside its closed menu', () => {
    item('<button data-item-menu="a">More</button><button data-item-menu="b">More b</button>');
    expect(findItemControl('a', 'delete')?.textContent).toBe('More');
    expect(findItemControl('a', 'edit')?.textContent).toBe('More');
  });

  it('is nothing for an item that has neither', () => {
    item('<button data-item-menu="b">More b</button>');
    expect(findItemControl('a', 'delete')).toBeNull();
  });
});
