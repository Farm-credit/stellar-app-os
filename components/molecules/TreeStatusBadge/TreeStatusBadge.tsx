import { Badge } from '@/components/atoms/Badge';
import type { TreeStatus } from '@/lib/types/tree';

const STATUS_CONFIG: Record<
  TreeStatus,
  { variant: 'default' | 'secondary' | 'destructive' | 'success'; label: string }
> = {
  funded: { variant: 'secondary', label: 'Funded' },
  planted: { variant: 'default', label: 'Planted' },
  verified: { variant: 'success', label: 'Verified' },
  completed: { variant: 'success', label: 'Completed' },
  failed: { variant: 'destructive', label: 'Failed' },
};

export function TreeStatusBadge({ status }: { status: TreeStatus }) {
  const { variant, label } = STATUS_CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
