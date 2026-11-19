import { Compass } from 'lucide-react';
import { ButtonLink, Card, EmptyState } from '@/components/ui';

export default function NotFoundPage() {
  return (
    <Card>
      <EmptyState icon={Compass} title="Page not found" action={<ButtonLink to="/app" variant="primary">Go to overview</ButtonLink>}>
        The page you're looking for doesn't exist.
      </EmptyState>
    </Card>
  );
}
