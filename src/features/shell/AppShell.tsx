import { NavLink, Outlet } from 'react-router';
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
                isActive
                  ? 'bg-raised font-semibold text-ink shadow-[inset_3px_0_0_var(--color-brand)]'
                  : 'text-ink-soft hover:bg-raised hover:text-ink'
              }`
            }
          />
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-line px-1 pt-4 text-sm">
          <p className="truncate px-2 text-ink-muted" title={user.email}>
            {user.email}
          </p>
          <SignOutButton className={`${ghostButtonClass} w-full justify-start`} />
        </div>
      </aside>

      {/* Bottom padding keeps content clear of the fixed tab bar and the iOS home indicator.
          min-w-0 lets main shrink below a wide child (alphaTab's rendered score) when the window narrows. */}
      <main className="mx-auto w-full min-w-0 max-w-5xl p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-8">
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
              isActive ? 'font-semibold text-brand' : 'text-ink-muted'
            }`
          }
        />
      </nav>
    </div>
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
