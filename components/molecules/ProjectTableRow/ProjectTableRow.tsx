'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/atoms/Button';
import { StatusBadge } from '@/components/atoms/StatusBadge';
import { RiskBadge } from '@/components/atoms/RiskBadge';
import { Text } from '@/components/atoms/Text';
import type { AdminProjectDetail } from '@/lib/types/adminProject';
import {
  formatCredits,
  formatDate,
  formatPrice,
  canApproveProject,
  canPauseProject,
  canArchiveProject,
} from '@/lib/admin/projectFilters';

// ... rest of file remains the same
interface ProjectTableRowProps {
  project: AdminProjectDetail;
  isSelected: boolean;
  onSelect: (projectId: string) => void;
  onEdit: (projectId: string) => void;
  onApprove: (projectId: string) => void;
  onPause: (projectId: string) => void;
  onArchive: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

export function ProjectTableRow({
  project,
  isSelected,
  onSelect,
  onEdit,
  onApprove,
  onPause,
  onArchive,
  onDelete,
}: ProjectTableRowProps): ReactNode {
  return (
    <tr className="border-b border-border hover:bg-muted/50 transition-colors">
      {/* Checkbox */}
      <td className="w-12 px-4 py-3">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelect(project.id)}
          className="h-4 w-4 cursor-pointer rounded border-input accent-stellar-blue"
          aria-label={`Select ${project.name}`}
        />
      </td>

      {/* ID */}
      <td className="px-4 py-3">
        <Text variant="small" className="font-mono text-xs">
          {project.id.slice(0, 8)}...
        </Text>
      </td>

      {/* Name & Type */}
      <td className="px-4 py-3 max-w-xs">
        <div>
          <Link
            href={`/admin/projects/${project.id}`}
            className="font-medium text-stellar-blue hover:underline line-clamp-1"
          >
            {project.name}
          </Link>
          <Text variant="muted" className="text-xs mt-1">
            {project.type}
          </Text>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <StatusBadge status={project.lifecycleStatus} size="sm" />
      </td>

      {/* Risk */}
      <td className="px-4 py-3">
        <RiskBadge risk={project.riskRating} size="sm" />
      </td>

      {/* Credits Available */}
      <td className="px-4 py-3 text-right">
        <div>
          <Text variant="small" className="font-semibold">
            {formatCredits(project.availableSupplyTons)}
          </Text>
          <Text variant="muted" className="text-xs">
            {formatPrice(project.pricePerTonUsd)}/ton
          </Text>
        </div>
      </td>

      {/* Last Updated */}
      <td className="px-4 py-3">
        <Text variant="small">{formatDate(project.lastUpdatedAt)}</Text>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex gap-1.5 flex-wrap">
          {canApproveProject(project.lifecycleStatus) && (
            <Button
              onClick={() => onApprove(project.id)}
              stellar="success"
              size="sm"
              className="text-xs"
              title="Approve this project"
            >
              Approve
            </Button>
          )}

          {canPauseProject(project.lifecycleStatus) && (
            <Button
              onClick={() => onPause(project.id)}
              stellar="accent"
              size="sm"
              className="text-xs"
              title="Pause this project"
            >
              Pause
            </Button>
          )}

          {canArchiveProject(project.lifecycleStatus) && (
            <Button
              onClick={() => onArchive(project.id)}
              variant="outline"
              size="sm"
              className="text-xs"
              title="Archive this project"
            >
              Archive
            </Button>
          )}

          <Button
            onClick={() => onEdit(project.id)}
            variant="outline"
            size="sm"
            className="text-xs"
            title="Edit this project"
          >
            Edit
          </Button>

          <Button
            onClick={() => onDelete(project.id)}
            variant="outline"
            size="sm"
            className="text-xs text-destructive hover:text-destructive"
            title="Delete this project"
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}
