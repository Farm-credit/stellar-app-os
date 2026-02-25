'use client';

import { type ReactNode } from 'react';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';

interface BulkActionsBarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onApproveSelected: () => void;
  onPauseSelected: () => void;
  onArchiveSelected: () => void;
  onDeleteSelected: () => void;
  isDisabled?: boolean;
}

export function BulkActionsBar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onApproveSelected,
  onPauseSelected,
  onArchiveSelected,
  onDeleteSelected,
  isDisabled = false,
}: BulkActionsBarProps): ReactNode {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="mb-6 flex flex-col gap-4 rounded-lg border border-stellar-blue/30 bg-stellar-blue/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Text variant="small" className="font-semibold">
          {selectedCount} {selectedCount === 1 ? 'project' : 'projects'} selected
        </Text>
        {selectedCount < totalCount && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSelectAll}
            disabled={isDisabled}
            className="text-xs text-stellar-blue"
          >
            Select All ({totalCount})
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          stellar="success"
          size="sm"
          onClick={onApproveSelected}
          disabled={isDisabled}
          className="text-xs"
          title="Approve selected projects"
        >
          Approve ({selectedCount})
        </Button>
        <Button
          stellar="accent"
          size="sm"
          onClick={onPauseSelected}
          disabled={isDisabled}
          className="text-xs"
          title="Pause selected projects"
        >
          Pause ({selectedCount})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onArchiveSelected}
          disabled={isDisabled}
          className="text-xs"
          title="Archive selected projects"
        >
          Archive ({selectedCount})
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDeleteSelected}
          disabled={isDisabled}
          className="text-xs text-destructive hover:text-destructive"
          title="Delete selected projects"
        >
          Delete ({selectedCount})
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isDisabled}
          className="text-xs"
        >
          Clear
        </Button>
      </div>
    </div>
  );
}
