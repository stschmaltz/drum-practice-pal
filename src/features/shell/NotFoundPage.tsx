import { Link } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { linkClass } from '@/components/styles';

export function NotFoundPage() {
  return (
    <div className="flex flex-col gap-3">
      <PageHeader title="Page not found">There's nothing at this address.</PageHeader>
      <Link to="/" className={`${linkClass} self-start`}>
        Go to Songs
      </Link>
    </div>
  );
}
