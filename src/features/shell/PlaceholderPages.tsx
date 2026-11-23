// Stand-ins so the shell has every route. Each is replaced by its own unit:
// On the go (09), Song (05/06).
import { Link, useParams } from 'react-router';
import { PageHeader } from '@/components/PageHeader';

export function OnTheGoPage() {
  return (
    <PageHeader title="On the go">
      Loops you're working on will show up here, most recently practiced first.
    </PageHeader>
  );
}

export function SongPage() {
  const { id } = useParams();
  return (
    <PageHeader title="Song">
      The player for song <code className="break-all">{id}</code> will open here.
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
