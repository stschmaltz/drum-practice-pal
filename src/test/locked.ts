/**
 * A control locked with `aria-disabled` while a write is pending (the loop
 * status buttons, Unit 10), so focus can still land on it. Testing Library's
 * `toBeDisabled` ignores `aria-disabled`, so assert the lock with these.
 */
export function expectLocked(element: Element): void {
  expect(element).toHaveAttribute('aria-disabled', 'true');
}

export function expectUnlocked(element: Element): void {
  expect(element).not.toHaveAttribute('aria-disabled');
}
