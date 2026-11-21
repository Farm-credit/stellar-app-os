import { cloneElement, type ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { ForestCoverageTracker } from './ForestCoverageTracker';
import { getMockProjectCoverage } from '@/lib/api/mock/projectCoverage';
import type { ProjectCoverageRecord } from '@/lib/canopy/project-coverage';

// jsdom has no layout, so Recharts' ResponsiveContainer measures 0x0 and draws nothing.
// Give it a fixed size so the real chart (line, points, target line) is rendered.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    ResponsiveContainer: ({
      children,
    }: {
      children: ReactElement<{ width?: number; height?: number }>;
    }) => cloneElement(children, { width: 800, height: 260 }),
  };
});

const proj001 = getMockProjectCoverage('proj-001')!;

const withLatestCanopy = (canopyAreaHa: number): ProjectCoverageRecord => ({
  projectId: 'proj-test',
  targetCoveragePercent: 70,
  snapshots: [
    { date: '2026-03-18', source: 'drone', projectAreaHa: 100, canopyAreaHa: 40 },
    { date: '2026-06-17', source: 'satellite', projectAreaHa: 100, canopyAreaHa },
  ],
});

describe('ForestCoverageTracker', () => {
  describe('coverage percentage is prominently displayed', () => {
    it('shows the latest coverage as the headline figure', () => {
      render(<ForestCoverageTracker coverage={proj001} />);
      expect(screen.getByTestId('coverage-percentage')).toHaveTextContent('54.6%');
      expect(
        screen.getByText(/of the project area has reached canopy coverage/i)
      ).toBeInTheDocument();
    });

    it('exposes progress to assistive tech with coverage and target', () => {
      render(<ForestCoverageTracker coverage={proj001} />);
      const bar = screen.getByRole('progressbar', { name: /canopy coverage progress/i });
      expect(bar).toHaveAttribute('aria-valuenow', '54.6');
      expect(bar).toHaveAttribute('aria-valuetext', '54.6% coverage, target 70%');
    });

    it('shows when and how the latest reading was taken', () => {
      render(<ForestCoverageTracker coverage={proj001} />);
      expect(screen.getByTestId('last-measured')).toHaveTextContent(
        'Q3 2026 · satellite imagery · Sep 15, 2026'
      );
    });

    it('labels drone readings as drone survey', () => {
      const droneLatest: ProjectCoverageRecord = {
        projectId: 'proj-test',
        targetCoveragePercent: 70,
        snapshots: [{ date: '2026-03-18', source: 'drone', projectAreaHa: 100, canopyAreaHa: 40 }],
      };
      render(<ForestCoverageTracker coverage={droneLatest} />);
      expect(screen.getByTestId('last-measured')).toHaveTextContent('drone survey');
    });
  });

  describe('target coverage threshold (per project)', () => {
    it('shows the project target, the marker position and the remaining gap', () => {
      render(<ForestCoverageTracker coverage={proj001} />);
      expect(screen.getByText('Target: 70%')).toBeInTheDocument();
      expect(screen.getByTestId('target-marker')).toHaveStyle({ left: '70%' });
      expect(screen.getByTestId('target-status')).toHaveTextContent('15.4 pts to target');
    });

    it('uses each project’s own target value', () => {
      render(<ForestCoverageTracker coverage={{ ...proj001, targetCoveragePercent: 60 }} />);
      expect(screen.getByText('Target: 60%')).toBeInTheDocument();
      expect(screen.getByTestId('target-marker')).toHaveStyle({ left: '60%' });
      expect(screen.getByTestId('target-status')).toHaveTextContent('5.4 pts to target');
    });

    it('says "Target reached" once coverage meets the target', () => {
      render(<ForestCoverageTracker coverage={withLatestCanopy(70)} />);
      expect(screen.getByTestId('target-status')).toHaveTextContent('Target reached');
    });

    it('says "Target reached" when coverage exceeds the target', () => {
      render(<ForestCoverageTracker coverage={withLatestCanopy(82)} />);
      expect(screen.getByTestId('coverage-percentage')).toHaveTextContent('82%');
      expect(screen.getByTestId('target-status')).toHaveTextContent('Target reached');
    });
  });

  describe('historical coverage trend chart', () => {
    it('renders a labelled trend figure', () => {
      render(<ForestCoverageTracker coverage={proj001} />);
      expect(screen.getByRole('figure', { name: /canopy coverage trend/i })).toBeInTheDocument();
    });

    it('provides every quarter as an accessible data table, oldest first', () => {
      render(<ForestCoverageTracker coverage={proj001} />);
      const table = screen.getByRole('table', { name: /canopy coverage by quarter/i });
      const rows = within(table).getAllByRole('row').slice(1); // drop header row
      expect(rows).toHaveLength(8);
      expect(rows[0]).toHaveTextContent('Q4 2024');
      expect(rows[0]).toHaveTextContent('12.5');
      expect(rows[7]).toHaveTextContent('Q3 2026');
      expect(rows[7]).toHaveTextContent('54.6');
    });

    it('draws the coverage line with one point per quarter', () => {
      const { container } = render(<ForestCoverageTracker coverage={proj001} />);
      expect(container.querySelector('.recharts-line-curve')).toBeInTheDocument();
      expect(container.querySelectorAll('.recharts-line-dots circle')).toHaveLength(8);
    });

    it('draws the project target as a labelled reference line', () => {
      const { container } = render(<ForestCoverageTracker coverage={proj001} />);
      expect(container.querySelector('.recharts-reference-line-line')).toBeInTheDocument();
      // Recharts renders reference-line labels in a separate layer, so query the label directly.
      expect(container.querySelector('svg .recharts-label')).toHaveTextContent('Target 70%');
    });

    it('labels the x-axis by quarter', () => {
      const { container } = render(<ForestCoverageTracker coverage={proj001} />);
      const ticks = [...container.querySelectorAll('.recharts-cartesian-axis-tick-value')]
        .map((t) => t.textContent ?? '')
        .filter((text) => /^Q[1-4] \d{4}$/.test(text));
      expect(ticks).toEqual(expect.arrayContaining(['Q4 2024', 'Q1 2026', 'Q3 2026']));
    });

    it('still renders with a single data point', () => {
      const single: ProjectCoverageRecord = {
        projectId: 'proj-test',
        targetCoveragePercent: 70,
        snapshots: [
          { date: '2026-06-17', source: 'satellite', projectAreaHa: 100, canopyAreaHa: 12 },
        ],
      };
      render(<ForestCoverageTracker coverage={single} />);
      expect(screen.getByTestId('coverage-percentage')).toHaveTextContent('12%');
      const table = screen.getByRole('table', { name: /canopy coverage by quarter/i });
      expect(within(table).getAllByRole('row').slice(1)).toHaveLength(1);
    });
  });

  describe('no data yet', () => {
    it('shows an empty state with the target instead of a 0% reading or an empty chart', () => {
      render(<ForestCoverageTracker coverage={{ ...proj001, snapshots: [] }} />);
      expect(screen.getByText(/no coverage measurements yet/i)).toBeInTheDocument();
      expect(screen.getByText(/target coverage for this project is 70%/i)).toBeInTheDocument();
      expect(screen.queryByTestId('coverage-percentage')).not.toBeInTheDocument();
      expect(screen.queryByRole('figure')).not.toBeInTheDocument();
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
  });
});
