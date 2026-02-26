'use client';

import type { CarbonProject } from '@/lib/types/carbon';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/molecules/Card';
import { Checkbox } from '@/components/atoms/Checkbox';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';

export interface ProjectSelectionCardProps {
  project: CarbonProject;
  isSelected: boolean;
  onSelectionChange: (_projectId: string, _selected: boolean) => void;
  disabled?: boolean;
}

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
}

export function ProjectSelectionCard({
  project,
  isSelected,
  onSelectionChange,
  disabled = false,
}: ProjectSelectionCardProps) {
  return (
    <Card className="relative">
      <div className="absolute top-4 right-4">
        <Checkbox
          checked={isSelected}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onSelectionChange(project.id, e.target.checked)
          }
          disabled={disabled || project.isOutOfStock}
          aria-label={`Select ${project.name} for comparison`}
        />
      </div>

      <CardHeader>
        <CardTitle className="pr-8">{project.name}</CardTitle>
        <CardDescription>{project.description}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Price per Ton
          </Text>
          <Text variant="small" as="span" className="font-semibold text-stellar-blue">
            {formatPrice(project.pricePerTon)}
          </Text>
        </div>

        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Type
          </Text>
          <Badge variant="default">{project.type}</Badge>
        </div>

        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Location
          </Text>
          <Text variant="small" as="span">
            {project.location}
          </Text>
        </div>

        <div className="flex items-center justify-between">
          <Text variant="small" as="span" className="text-muted-foreground">
            Verification
          </Text>
          <Badge variant="success">{project.verificationStatus}</Badge>
        </div>

        {project.isOutOfStock && (
          <Badge variant="destructive" className="w-full justify-center">
            Out of Stock
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
