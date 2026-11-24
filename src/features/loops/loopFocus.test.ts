import { neighbourAfterLeaving } from './loopFocus';

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
