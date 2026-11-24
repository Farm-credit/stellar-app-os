// Copyright 2024 Farm-credit Contributors
// Licensed under the Apache License, Version 2.0

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TreeSponsorshipComparison } from './TreeSponsorshipComparison';
import { TreeSponsorshipTable } from './molecules/TreeSponsorshipTable';
import { MOCK_TREE_SPONSORSHIP_OFFERINGS } from '@/lib/treeSponsorshipComparison';

describe('TreeSponsorshipComparison & Table components', () => {
  const sampleFour = MOCK_TREE_SPONSORSHIP_OFFERINGS.slice(0, 4);

  describe('TreeSponsorshipTable structured table', () => {
    it('renders the structured comparison table with project columns and metric rows', () => {
      render(
        <TreeSponsorshipTable offerings={sampleFour} activeSortMetric="cost" sortDirection="asc" />
      );

      // Verify table exists
      const table = screen.getByTestId('tree-sponsorship-table');
      expect(table).toBeInTheDocument();

      // Verify all 4 project columns are present
      for (const project of sampleFour) {
        expect(screen.getByTestId(`project-column-${project.id}`)).toBeInTheDocument();
      }

      // Verify all 5 metrics rows are rendered
      expect(screen.getByTestId('metric-row-cost')).toBeInTheDocument();
      expect(screen.getByTestId('metric-row-species')).toBeInTheDocument();
      expect(screen.getByTestId('metric-row-co2')).toBeInTheDocument();
      expect(screen.getByTestId('metric-row-survivalRate')).toBeInTheDocument();
      expect(screen.getByTestId('metric-row-location')).toBeInTheDocument();
    });

    it('links to the full project page from each column', () => {
      render(
        <TreeSponsorshipTable offerings={sampleFour} activeSortMetric="cost" sortDirection="asc" />
      );

      for (const project of sampleFour) {
        const column = screen.getByTestId(`project-column-${project.id}`);
        // Links inside the column header
        const linksInColumn = within(column).getAllByRole('link');
        const expectedHref = `/projects/${project.projectId || project.id}`;

        const hasMatchingLink = linksInColumn.some(
          (link) => link.getAttribute('href') === expectedHref
        );
        expect(hasMatchingLink).toBe(true);
      }
    });

    it('triggers sort callback when a metric row is clicked', () => {
      let changedMetric = '';
      let changedDirection = '';

      render(
        <TreeSponsorshipTable
          offerings={sampleFour}
          activeSortMetric="cost"
          sortDirection="asc"
          onSortChange={(metric, dir) => {
            changedMetric = metric;
            changedDirection = dir;
          }}
        />
      );

      // Click on Survival Rate sort button
      const survivalSortButton = screen.getByRole('button', {
        name: /sort table by survival rate/i,
      });
      fireEvent.click(survivalSortButton);

      expect(changedMetric).toBe('survivalRate');
      expect(changedDirection).toBe('desc');
    });
  });

  describe('TreeSponsorshipComparison organism', () => {
    it('allows sponsors to compare up to four projects simultaneously and enforces the 4-project limit', () => {
      render(<TreeSponsorshipComparison initialProjectIds={['proj-001', 'proj-004']} />);

      // Starts with 2 projects selected
      expect(screen.getByTestId('selection-counter')).toHaveTextContent('2 / 4 selected');

      // Select 3rd project
      const cardProj005 = screen.getByTestId('project-picker-card-proj-005');
      fireEvent.click(cardProj005);
      expect(screen.getByTestId('selection-counter')).toHaveTextContent('3 / 4 selected');

      // Select 4th project
      const cardProj006 = screen.getByTestId('project-picker-card-proj-006');
      fireEvent.click(cardProj006);
      expect(screen.getByTestId('selection-counter')).toHaveTextContent('4 / 4 selected');

      // Try selecting a 5th project (proj-007) - should be disabled
      const cardProj007 = screen.getByTestId('project-picker-card-proj-007');
      expect(cardProj007).toBeDisabled();

      // Click disabled card, count must remain 4
      fireEvent.click(cardProj007);
      expect(screen.getByTestId('selection-counter')).toHaveTextContent('4 / 4 selected');
    });

    it('sorts table projects when sort buttons are clicked for each metric', () => {
      render(
        <TreeSponsorshipComparison
          initialProjectIds={['proj-001', 'proj-004', 'proj-005', 'proj-006']}
          initialSortMetric="cost"
          initialSortDirection="asc"
        />
      );

      // Verify sort buttons exist for all 5 metrics
      const costBtn = screen.getByTestId('sort-btn-cost');
      const speciesBtn = screen.getByTestId('sort-btn-species');
      const co2Btn = screen.getByTestId('sort-btn-co2');
      const survivalBtn = screen.getByTestId('sort-btn-survivalRate');
      const locationBtn = screen.getByTestId('sort-btn-location');

      expect(costBtn).toBeInTheDocument();
      expect(speciesBtn).toBeInTheDocument();
      expect(co2Btn).toBeInTheDocument();
      expect(survivalBtn).toBeInTheDocument();
      expect(locationBtn).toBeInTheDocument();

      // Click species sort button
      fireEvent.click(speciesBtn);
      // Project columns in the table should now be sorted alphabetically by species
      const columns = screen.getAllByTestId(/^project-column-/);
      expect(columns).toHaveLength(4);

      // First column should be proj-006 (Acacia)
      expect(columns[0]).toHaveAttribute('data-testid', 'project-column-proj-006');
    });

    it('provides links to the full project page from every column in the table', () => {
      render(
        <TreeSponsorshipComparison
          initialProjectIds={['proj-001', 'proj-004', 'proj-005', 'proj-006']}
        />
      );

      const table = screen.getByTestId('tree-sponsorship-table');
      expect(table).toBeInTheDocument();

      const columns = screen.getAllByTestId(/^project-column-/);
      expect(columns).toHaveLength(4);

      for (const col of columns) {
        const link = within(col).getByRole('link', { name: /view full project page/i });
        expect(link).toBeInTheDocument();
        expect(link.getAttribute('href')).toMatch(/^\/projects\/proj-\d+/);
      }
    });
  });
});
