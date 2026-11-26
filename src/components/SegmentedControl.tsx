import { useId, type ReactNode } from 'react';
import { segmentOptionClass, segmentTrackClass } from './styles';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: ReactNode;
}

/**
 * A few fixed choices side by side, one of them on (the count-in's Off / 1 bar
 * / 2 bars). Native radios, so a screen reader hears a radio group and the
 * arrow keys move the choice as with any radio group (the song page's
 * shortcuts leave a focused radio its arrows: `focusKindOf`). Each radio is
 * visually hidden inside a label that draws its state and its focus ring.
 *
 * Name the group with `label` (read only by screen readers) or with
 * `labelledBy` pointing at words already on screen.
 */
export function SegmentedControl<T extends string | number>({
  label,
  labelledBy,
  describedBy,
  options,
  value,
  disabled = false,
  onChange,
  className = '',
}: {
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  options: readonly SegmentOption<T>[];
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`${segmentTrackClass} ${className}`}
    >
      {options.map((option) => (
        <label key={String(option.value)} className={segmentOptionClass}>
          <input
            type="radio"
            className="sr-only"
            name={name}
            value={String(option.value)}
            checked={option.value === value}
            disabled={disabled}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
