import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui/Feedback';

export default function NotFound() {
  return (
    <div className="grid h-full place-items-center">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you’re looking for doesn’t exist."
        action={
          <Link to="/" className="text-sm font-medium text-accent hover:underline">
            Back to overview
          </Link>
        }
      />
    </div>
  );
}
