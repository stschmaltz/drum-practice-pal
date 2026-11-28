import type { ReactNode } from 'react';
import { Icon } from './icons';
import { ghostButtonClass } from './styles';

/**
 * Under a list that shows only its first few: one button whose words change
 * ("Show all 9 loops" / "Show fewer"), so focus stays on it either way.
 */
export function ExpandButton({
  expanded,
  controls,
  onToggle,
  children,
}: {
  expanded: boolean;
  /** The id of what it opens out. */
  controls: string;
  onToggle: () => void;
  /** Its words for the state it is in. */
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`${ghostButtonClass} -ml-4 self-start`}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      <Icon name={expanded ? 'chevronUp' : 'chevronDown'} />
      {children}
    </button>
  );
}
