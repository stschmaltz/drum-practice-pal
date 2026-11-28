import type { MouseEvent, ReactNode } from 'react';
import { Icon } from '@/components/icons';
import type { ParsedLink } from './songLinks';

/**
 * A link that leaves the app for a recording or another site: in a new tab,
 * with nothing of this page passed on, saying so in its accessible name. Its
 * address is always the parser's (`link` is what `parseSongLink` made of a
 * saved row), never text as it was typed.
 *
 * `off` draws it locked and leaves it focusable; the handler is what refuses
 * the press (`canOpenRecording`).
 */
export function LinkOut({
  link,
  className,
  textClassName,
  title,
  spokenAs,
  off,
  onClick,
  children,
}: {
  link: Pick<ParsedLink, 'url'>;
  className: string;
  /** How the words wrap or are cut short where they may be long. */
  textClassName?: string;
  title?: string;
  /** The link's accessible name, when the words on show are a shortened form of it. */
  spokenAs?: string;
  off: boolean;
  onClick: (event: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title={title}
      aria-disabled={off || undefined}
      onClick={onClick}
    >
      <Icon name="external" className="size-4 shrink-0" />
      <span className={textClassName ? `min-w-0 ${textClassName}` : 'min-w-0'}>
        {spokenAs === undefined ? (
          children
        ) : (
          <>
            <span aria-hidden="true">{children}</span>
            <span className="sr-only">{spokenAs}</span>
          </>
        )}
        <span className="sr-only"> (opens in a new tab)</span>
      </span>
    </a>
  );
}
