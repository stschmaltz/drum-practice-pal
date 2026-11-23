// Stand-ins so the shell has every route. Each is replaced by its own unit:
// On the go (09).
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';

export function OnTheGoPage() {
  return (
    <PageHeader title="On the go">
      Loops you're working on will show up here, most recently practiced first.
    </PageHeader>
  );
}

export function NotFoundPage() {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Page not found">There's nothing at this address.</PageHeader>
      <Link to="/" className="text-sky-400 underline">
        Go to On the go
      </Link>
    </div>
  );
}
