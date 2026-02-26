'use client';

import type { CarbonProject } from '@/lib/types/carbon';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { cn } from '@/lib/utils';

export interface ComparisonTableProps {
  projects: CarbonProject[];
  onAddToCart?: (_projectId: string) => void;
  className?: string;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function ComparisonTable({ projects, onAddToCart, className }: ComparisonTableProps) {
  if (projects.length === 0) {
    return (
      <div className="text-center py-12">
        <Text variant="muted" as="p">
          No projects selected for comparison
        </Text>
      </div>
    );
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left p-4 bg-muted/50">
              <Text variant="small" as="span" className="font-semibold">
                Attribute
              </Text>
            </th>
            {projects.map((project) => (
              <th key={project.id} className="text-left p-4 bg-muted/50 min-w-[200px]">
                <Text variant="small" as="span" className="font-semibold">
                  {project.name}
                </Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border">
            <td className="p-4 font-semibold">
              <Text variant="small" as="span">
                Price per Ton
              </Text>
            </td>
            {projects.map((project) => (
              <td key={project.id} className="p-4">
                <Text variant="small" as="span" className="text-stellar-blue font-semibold">
                  {formatPrice(project.pricePerTon)}
                </Text>
              </td>
            ))}
          </tr>

          <tr className="border-b border-border bg-muted/20">
            <td className="p-4 font-semibold">
              <Text variant="small" as="span">
                Type
              </Text>
            </td>
            {projects.map((project) => (
              <td key={project.id} className="p-4">
                <Badge variant="default">{project.type}</Badge>
              </td>
            ))}
          </tr>

          <tr className="border-b border-border">
            <td className="p-4 font-semibold">
              <Text variant="small" as="span">
                Location
              </Text>
            </td>
            {projects.map((project) => (
              <td key={project.id} className="p-4">
                <Text variant="small" as="span">
                  {project.location}
                </Text>
              </td>
            ))}
          </tr>

          <tr className="border-b border-border bg-muted/20">
            <td className="p-4 font-semibold">
              <Text variant="small" as="span">
                Co-Benefits
              </Text>
            </td>
            {projects.map((project) => (
              <td key={project.id} className="p-4">
                <div className="flex flex-wrap gap-1">
                  {project.coBenefits.map((benefit) => (
                    <Badge key={benefit} variant="success" className="text-xs">
                      {benefit}
                    </Badge>
                  ))}
                </div>
              </td>
            ))}
          </tr>

          <tr className="border-b border-border">
            <td className="p-4 font-semibold">
              <Text variant="small" as="span">
                Verification Status
              </Text>
            </td>
            {projects.map((project) => (
              <td key={project.id} className="p-4">
                <Badge variant="default">{project.verificationStatus}</Badge>
              </td>
            ))}
          </tr>

          <tr className="border-b border-border bg-muted/20">
            <td className="p-4 font-semibold">
              <Text variant="small" as="span">
                Vintage Year
              </Text>
            </td>
            {projects.map((project) => (
              <td key={project.id} className="p-4">
                <Text variant="small" as="span">
                  {project.vintageYear}
                </Text>
              </td>
            ))}
          </tr>

          <tr className="border-b border-border">
            <td className="p-4 font-semibold">
              <Text variant="small" as="span">
                Available Supply
              </Text>
            </td>
            {projects.map((project) => (
              <td key={project.id} className="p-4">
                <Text variant="small" as="span">
                  {project.availableSupply.toFixed(2)} tons CO₂
                </Text>
              </td>
            ))}
          </tr>

          {onAddToCart && (
            <tr>
              <td className="p-4 font-semibold">
                <Text variant="small" as="span">
                  Actions
                </Text>
              </td>
              {projects.map((project) => (
                <td key={project.id} className="p-4">
                  <Button
                    stellar="primary"
                    size="sm"
                    onClick={() => onAddToCart(project.id)}
                    disabled={project.isOutOfStock}
                    aria-label={`Add ${project.name} to cart`}
                  >
                    {project.isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
                  </Button>
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
