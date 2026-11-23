import { NavLink, Outlet } from 'react-router';
import { SignOutButton } from '@/features/auth/SignOutButton';
import { useSignedInUser } from '@/lib/auth';
import { NAV_ITEMS } from './navItems';

// Bottom tabs below 768 px (md), a sidebar from there up: the same split the
// player uses for page vs horizontal layout.
export function AppShell() {
  const user = useSignedInUser();

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden md:sticky md:top-0 md:flex md:h-dvh md:w-56 md:shrink-0 md:flex-col md:gap-6 md:border-r md:border-neutral-800 md:p-4">
        <p className="px-3 text-lg font-semibold">Drum Practice Pal</p>
        <nav aria-label="Main" className="flex flex-col gap-1">
          <NavLinks
            linkClass={(isActive) =>
              `flex min-h-11 items-center rounded-md px-3 ${
                isActive
                  ? 'bg-neutral-800 font-semibold text-white'
                  : 'text-neutral-300 hover:bg-neutral-900'
              }`
            }
          />
        </nav>
        <div className="mt-auto flex flex-col gap-2 px-3 text-sm">
          <p className="truncate text-neutral-400" title={user.email}>
            {user.email}
          </p>
          <SignOutButton />
        </div>
      </aside>

      {/* Bottom padding keeps content clear of the fixed tab bar and the iOS home indicator.
          min-w-0 lets main shrink below a wide child (alphaTab's rendered score) when the window narrows. */}
      <main className="mx-auto w-full min-w-0 max-w-5xl p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:p-8">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 flex border-t border-neutral-800 bg-neutral-950 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <NavLinks
          linkClass={(isActive) =>
            `flex min-h-14 flex-1 items-center justify-center text-sm ${
              isActive ? 'font-semibold text-sky-400' : 'text-neutral-400'
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
      {item.label}
    </NavLink>
  ));
}
