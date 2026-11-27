import { NavLink, Outlet, useMatch } from 'react-router';
import { Wordmark } from '@/components/Brand';
import { Icon } from '@/components/icons';
import { focusRing, ghostButtonClass } from '@/components/styles';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { OfflineBanner } from '@/features/offline/OfflineBanner';
import { useOutboxReplay } from '@/features/offline/useOutboxReplay';
import { useSignedInUser } from '@/lib/auth';
import { NAV_ITEMS } from './navItems';

// Bottom tabs below 768 px (md), a sidebar from there up: the same split the
// player uses for page vs horizontal layout.
export function AppShell() {
  const user = useSignedInUser();
  // Writes an earlier page queued and never heard back about go once the user is known.
  useOutboxReplay();
  // The song page is the score, the app's most important spot: it takes the whole
  // width beside the sidebar. Other pages keep a readable line length.
  const fullWidth = useMatch('/songs/:id') !== null;

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-sidebar md:shrink-0 md:flex-col md:gap-8 md:border-r md:border-line md:bg-surface md:p-4">
        <p className="px-2 pt-2">
          <Wordmark />
        </p>
        <nav aria-label="Main" className="flex flex-col gap-1">
          <NavLinks
            linkClass={(isActive) =>
              `flex min-h-touch items-center gap-3 rounded-control px-3 transition-colors duration-150 ${focusRing} ${
                // The current page: a quiet fill and an edge, in the selected colour, not the brand.
                isActive
                  ? 'bg-selected font-semibold text-ink shadow-[inset_3px_0_0_var(--color-selected-line)]'
                  : 'text-ink-soft hover:bg-raised hover:text-ink'
              }`
            }
          />
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-line px-1 pt-4 text-sm">
          <AccountLine email={user.email ?? ''} />
          <SignOutButton className={`${ghostButtonClass} w-full justify-start`} />
        </div>
      </aside>

      {/* Bottom padding keeps content clear of the fixed tab bar and the iOS home indicator.
          min-w-0 lets main shrink below a wide child (alphaTab's rendered score) when the window narrows. */}
      <main
        className={`mx-auto w-full min-w-0 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-gutter ${
          fullWidth ? '' : 'max-w-5xl'
        }`}
      >
        <OfflineBanner />
        <Outlet />
      </main>

      {/* h-14 plus the 1px border: the loop sheet and the score's scroll margin sit above exactly this. */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <NavLinks
          linkClass={(isActive) =>
            `flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${focusRing} focus-visible:-outline-offset-2 ${
              // Bold and a bar along the top as well as the colour, so the current tab isn't told by colour alone.
              isActive
                ? 'font-semibold text-ink shadow-[inset_0_2px_0_var(--color-selected-line)]'
                : 'text-ink-muted'
            }`
          }
        />
      </nav>
    </div>
  );
}

/**
 * Who is signed in: the address's first letter in a circle, as account
 * pickers draw it, and the address cut short with the whole of it in `title`.
 */
function AccountLine({ email }: { email: string }) {
  const initial = email.trim().charAt(0).toUpperCase() || '?';
  return (
    <p className="flex min-w-0 items-center gap-2 px-2 text-ink-soft" title={email}>
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-selected font-semibold text-ink ring-1 ring-selected-line"
      >
        {initial}
      </span>
      <span className="truncate">{email}</span>
    </p>
  );
}

/** The main nav's links; each nav styles them its own way. */
function NavLinks({ linkClass }: { linkClass: (isActive: boolean) => string }) {
  return NAV_ITEMS.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      className={({ isActive }) => linkClass(isActive)}
    >
      <Icon name={item.icon} />
      {item.label}
    </NavLink>
  ));
}
