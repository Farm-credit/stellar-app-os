'use client';

import { useState, useCallback, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@/components/atoms/Button';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { ProjectTableRow } from '@/components/molecules/ProjectTableRow/ProjectTableRow';
import { TableFilterBar } from '@/components/molecules/TableFilterBar/TableFilterBar';
import { BulkActionsBar } from '@/components/molecules/BulkActionsBar/BulkActionsBar';
import { ConfirmationModal } from '@/components/molecules/ConfirmationModal/ConfirmationModal';
import type { AdminProjectDetail } from '@/lib/types/adminProject';
import type {
  TableFilterState,
  ConfirmationModalState,
  BulkActionPayload,
} from '@/lib/types/admin';
import { filterProjects, getProjectTypes, getRiskRatings } from '@/lib/admin/projectFilters';

interface AdminProjectTableProps {
  projects: AdminProjectDetail[];
  onProjectUpdate?: (payload: BulkActionPayload) => Promise<void>;
  onNavigateDetail?: (projectId: string) => void;
}

export function AdminProjectTable({
  projects,
  onProjectUpdate,
  onNavigateDetail,
}: AdminProjectTableProps): ReactNode {
  const [filters, setFilters] = useState<TableFilterState>({
    search: '',
    lifecycleStatus: 'all',
    projectType: 'all',
    riskRating: 'all',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  });

  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  const [confirmModal, setConfirmModal] = useState<ConfirmationModalState>({
    isOpen: false,
    action: null,
    projectId: null,
    projectIds: [],
    reason: '',
  });

  const [isLoading, setIsLoading] = useState(false);

  // Filter and sort projects
  const filteredProjects = useMemo(() => filterProjects(projects, filters), [projects, filters]);

  const projectTypes = useMemo(() => getProjectTypes(projects), [projects]);
  const riskRatings = useMemo(() => getRiskRatings(projects), [projects]);

  // Handle individual project selection
  const handleSelectProject = useCallback((projectId: string) => {
    setSelectedProjectIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  }, []);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    setSelectedProjectIds(new Set(filteredProjects.map((p) => p.id)));
  }, [filteredProjects]);

  // Handle clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedProjectIds(new Set());
  }, []);

  // Handle individual actions
  const handleApprove = useCallback((projectId: string) => {
    setConfirmModal({
      isOpen: true,
      action: 'approve',
      projectId,
      projectIds: [projectId],
      reason: '',
    });
  }, []);

  const handlePause = useCallback((projectId: string) => {
    setConfirmModal({
      isOpen: true,
      action: 'pause',
      projectId,
      projectIds: [projectId],
      reason: '',
    });
  }, []);

  const handleArchive = useCallback((projectId: string) => {
    setConfirmModal({
      isOpen: true,
      action: 'archive',
      projectId,
      projectIds: [projectId],
      reason: '',
    });
  }, []);

  const handleDelete = useCallback((projectId: string) => {
    setConfirmModal({
      isOpen: true,
      action: 'delete',
      projectId,
      projectIds: [projectId],
      reason: '',
    });
  }, []);

  // Handle bulk actions
  const handleBulkApprove = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      action: 'approve',
      projectId: null,
      projectIds: Array.from(selectedProjectIds),
      reason: '',
    });
  }, [selectedProjectIds]);

  const handleBulkPause = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      action: 'pause',
      projectId: null,
      projectIds: Array.from(selectedProjectIds),
      reason: '',
    });
  }, [selectedProjectIds]);

  const handleBulkArchive = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      action: 'archive',
      projectId: null,
      projectIds: Array.from(selectedProjectIds),
      reason: '',
    });
  }, [selectedProjectIds]);

  const handleBulkDelete = useCallback(() => {
    setConfirmModal({
      isOpen: true,
      action: 'delete',
      projectId: null,
      projectIds: Array.from(selectedProjectIds),
      reason: '',
    });
  }, [selectedProjectIds]);

  // Handle confirmation
  const handleConfirmAction = useCallback(async () => {
    if (!confirmModal.action) return;

    try {
      setIsLoading(true);

      if (onProjectUpdate) {
        await onProjectUpdate({
          projectIds: confirmModal.projectIds,
          action: confirmModal.action,
          reason: confirmModal.reason,
        });
      }

      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      setConfirmModal({
        isOpen: false,
        action: null,
        projectId: null,
        projectIds: [],
        reason: '',
      });

      setSelectedProjectIds(new Set());
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setIsLoading(false);
    }
  }, [confirmModal, onProjectUpdate]);

  const handleCancelAction = useCallback(() => {
    setConfirmModal({
      isOpen: false,
      action: null,
      projectId: null,
      projectIds: [],
      reason: '',
    });
  }, []);

  const handleEdit = useCallback(
    (projectId: string) => {
      onNavigateDetail?.(projectId);
    },
    [onNavigateDetail]
  );

  // Modal configuration
  const getModalConfig = () => {
    const config = {
      approve: {
        title: 'Approve Projects',
        description: 'This action will move the selected projects to Approved status.',
        action: 'Approve',
        variant: 'info' as const,
        includeReason: false,
      },
      pause: {
        title: 'Pause Projects',
        description: 'Paused projects will not accept new retirement credits.',
        action: 'Pause',
        variant: 'warning' as const,
        includeReason: true,
      },
      archive: {
        title: 'Archive Projects',
        description: 'Archived projects will be removed from active listing.',
        action: 'Archive',
        variant: 'warning' as const,
        includeReason: true,
      },
      delete: {
        title: 'Delete Projects',
        description: 'This action cannot be undone. Please confirm carefully.',
        action: 'Delete',
        variant: 'destructive' as const,
        includeReason: true,
      },
    };

    return confirmModal.action ? config[confirmModal.action] : null;
  };

  const modalConfig = getModalConfig();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Text as="h1" variant="h2" className="mb-1">
            Project Management
          </Text>
          <Text variant="muted">Manage, approve, and monitor carbon offset projects</Text>
        </div>
        <Button asChild stellar="primary">
          <Link href="/admin/projects/new">+ New Project</Link>
        </Button>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Projects</CardTitle>
          <CardDescription>
            {projects.length} total {projects.length === 1 ? 'project' : 'projects'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filters */}
          <TableFilterBar
            filters={filters}
            onFilterChange={(newFilters) => setFilters({ ...filters, ...newFilters })}
            projectTypes={projectTypes}
            riskRatings={riskRatings}
            resultCount={filteredProjects.length}
            totalCount={projects.length}
          />

          {/* Bulk Actions */}
          <BulkActionsBar
            selectedCount={selectedProjectIds.size}
            totalCount={filteredProjects.length}
            onSelectAll={handleSelectAll}
            onClearSelection={handleClearSelection}
            onApproveSelected={handleBulkApprove}
            onPauseSelected={handleBulkPause}
            onArchiveSelected={handleBulkArchive}
            onDeleteSelected={handleBulkDelete}
            isDisabled={isLoading}
          />

          {/* Table */}
          {filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 py-12">
              <Text variant="muted" className="text-center">
                No projects found matching your filters
              </Text>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setFilters({
                    search: '',
                    lifecycleStatus: 'all',
                    projectType: 'all',
                    riskRating: 'all',
                    sortBy: 'createdAt',
                    sortOrder: 'desc',
                  })
                }
                className="mt-2 text-xs"
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="w-12 px-4 py-3 text-left font-medium">
                      <input
                        type="checkbox"
                        checked={
                          selectedProjectIds.size === filteredProjects.length &&
                          filteredProjects.length > 0
                        }
                        onChange={() =>
                          selectedProjectIds.size === filteredProjects.length
                            ? handleClearSelection()
                            : handleSelectAll()
                        }
                        className="h-4 w-4 cursor-pointer rounded border-input accent-stellar-blue"
                        aria-label="Select all projects"
                        title="Select all projects on this page"
                      />
                    </th>
                    <th className="px-4 py-3 text-left font-medium">ID</th>
                    <th className="px-4 py-3 text-left font-medium">Name & Type</th>
                    <th className="px-4 py-3 text-left font-medium">Status</th>
                    <th className="px-4 py-3 text-left font-medium">Risk</th>
                    <th className="px-4 py-3 text-right font-medium">Credits & Price</th>
                    <th className="px-4 py-3 text-left font-medium">Updated</th>
                    <th className="px-4 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => (
                    <ProjectTableRow
                      key={project.id}
                      project={project}
                      isSelected={selectedProjectIds.has(project.id)}
                      onSelect={handleSelectProject}
                      onEdit={handleEdit}
                      onApprove={handleApprove}
                      onPause={handlePause}
                      onArchive={handleArchive}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Modal */}
      {modalConfig && (
        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          title={modalConfig.title}
          description={modalConfig.description}
          action={modalConfig.action}
          variant={modalConfig.variant}
          itemCount={confirmModal.projectIds.length}
          onConfirm={handleConfirmAction}
          onCancel={handleCancelAction}
          isLoading={isLoading}
          reasonField={
            modalConfig.includeReason
              ? {
                  label: 'Reason (optional)',
                  value: confirmModal.reason || '',
                  onChange: (reason: string) => setConfirmModal({ ...confirmModal, reason }),
                  placeholder: 'Explain why you are taking this action...',
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
