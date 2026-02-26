import { describe, it, expect } from 'vitest';
import {
  filterProjects,
  getProjectTypes,
  getRiskRatings,
  getStatusColor,
  getRiskColor,
  formatDate,
  formatCredits,
  formatPrice,
  canApproveProject,
  canPauseProject,
  canArchiveProject,
} from '../projectFilters';
import { mockAdminProjectDetails } from '@/lib/api/mock/adminProjectDetails';
import type { TableFilterState } from '@/lib/types/admin';

describe('Project Filters', () => {
  const defaultFilters: TableFilterState = {
    search: '',
    lifecycleStatus: 'all',
    projectType: 'all',
    riskRating: 'all',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  };

  describe('filterProjects', () => {
    it('should return all projects with default filters', () => {
      const result = filterProjects(mockAdminProjectDetails, defaultFilters);
      expect(result.length).toBeGreaterThan(0);
    });

    it('should filter by search term', () => {
      const filters: TableFilterState = {
        ...defaultFilters,
        search: 'Amazon',
      };
      const result = filterProjects(mockAdminProjectDetails, filters);
      expect(result.some((p) => p.name.includes('Amazon'))).toBe(true);
    });

    it('should filter by lifecycle status', () => {
      const filters: TableFilterState = {
        ...defaultFilters,
        lifecycleStatus: 'Approved',
      };
      const result = filterProjects(mockAdminProjectDetails, filters);
      expect(result.every((p) => p.lifecycleStatus === 'Approved')).toBe(true);
    });

    it('should filter by project type', () => {
      const filters: TableFilterState = {
        ...defaultFilters,
        projectType: 'Reforestation',
      };
      const result = filterProjects(mockAdminProjectDetails, filters);
      expect(result.every((p) => p.type === 'Reforestation')).toBe(true);
    });

    it('should filter by risk rating', () => {
      const filters: TableFilterState = {
        ...defaultFilters,
        riskRating: 'Low',
      };
      const result = filterProjects(mockAdminProjectDetails, filters);
      expect(result.every((p) => p.riskRating === 'Low')).toBe(true);
    });

    it('should sort by name ascending', () => {
      const filters: TableFilterState = {
        ...defaultFilters,
        sortBy: 'name',
        sortOrder: 'asc',
      };
      const result = filterProjects(mockAdminProjectDetails, filters);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].name >= result[i - 1].name).toBe(true);
      }
    });

    it('should sort by credits descending', () => {
      const filters: TableFilterState = {
        ...defaultFilters,
        sortBy: 'credits',
        sortOrder: 'desc',
      };
      const result = filterProjects(mockAdminProjectDetails, filters);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].availableSupplyTons <= result[i - 1].availableSupplyTons).toBe(true);
      }
    });

    it('should combine multiple filters', () => {
      const filters: TableFilterState = {
        search: 'Renewable',
        lifecycleStatus: 'Approved',
        projectType: 'Renewable Energy',
        riskRating: 'all',
        sortBy: 'name',
        sortOrder: 'asc',
      };
      const result = filterProjects(mockAdminProjectDetails, filters);
      expect(result.every((p) => p.type === 'Renewable Energy')).toBe(true);
      expect(result.every((p) => p.lifecycleStatus === 'Approved')).toBe(true);
    });
  });

  describe('getProjectTypes', () => {
    it('should return unique project types', () => {
      const types = getProjectTypes(mockAdminProjectDetails);
      expect(new Set(types).size).toBe(types.length);
    });
  });

  describe('getRiskRatings', () => {
    it('should return unique risk ratings', () => {
      const risks = getRiskRatings(mockAdminProjectDetails);
      expect(new Set(risks).size).toBe(risks.length);
    });
  });

  describe('getStatusColor', () => {
    it('should return correct color for each status', () => {
      expect(getStatusColor('Draft')).toBe('secondary');
      expect(getStatusColor('Under Review')).toBe('accent');
      expect(getStatusColor('Approved')).toBe('success');
      expect(getStatusColor('Paused')).toBe('outline');
      expect(getStatusColor('Archived')).toBe('destructive');
    });
  });

  describe('getRiskColor', () => {
    it('should return correct color for each risk level', () => {
      expect(getRiskColor('Low')).toBe('success');
      expect(getRiskColor('Medium')).toBe('accent');
      expect(getRiskColor('High')).toBe('destructive');
    });
  });

  describe('formatDate', () => {
    it('should format date correctly', () => {
      const date = '2024-01-15T00:00:00Z';
      const formatted = formatDate(date);
      expect(formatted).toMatch(/Jan 15, 2024/);
    });
  });

  describe('formatCredits', () => {
    it('should format credits with thousand separators', () => {
      expect(formatCredits(1250.75)).toBe('1,251');
    });
  });

  describe('formatPrice', () => {
    it('should format price as USD currency', () => {
      const price = formatPrice(45.5);
      expect(price).toMatch(/\$45\.50/);
    });
  });

  describe('canApproveProject', () => {
    it('should allow approval of Under Review projects', () => {
      expect(canApproveProject('Under Review')).toBe(true);
    });

    it('should allow approval of Paused projects', () => {
      expect(canApproveProject('Paused')).toBe(true);
    });

    it('should not allow approval of Approved projects', () => {
      expect(canApproveProject('Approved')).toBe(false);
    });
  });

  describe('canPauseProject', () => {
    it('should only allow pausing of Approved projects', () => {
      expect(canPauseProject('Approved')).toBe(true);
      expect(canPauseProject('Draft')).toBe(false);
    });
  });

  describe('canArchiveProject', () => {
    it('should not allow archiving of already archived projects', () => {
      expect(canArchiveProject('Archived')).toBe(false);
    });

    it('should allow archiving of other statuses', () => {
      expect(canArchiveProject('Approved')).toBe(true);
      expect(canArchiveProject('Paused')).toBe(true);
    });
  });
});
