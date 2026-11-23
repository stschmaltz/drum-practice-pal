// The catch-all route. The stand-in pages that used to live here have all been
// replaced by their units (On the go by Unit 09, in src/features/practice/).
import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';

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
