import type { ReactNode } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TreeGrowthTimeline } from './TreeGrowthTimeline';
import { buildTreeGrowthTimeline } from '@/lib/tree-growth/timeline';
import type { Tree } from '@/lib/types/tree';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children?: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const tree: Tree = {
  id: 'tree-001',
  treeId: 'HRV-2024-0001',
  species: 'Teak',
  region: 'Kano, Nigeria',
  status: 'verified',
  plantedAt: '2024-03-12T08:00:00Z',
  lat: 12.04,
  lng: 8.48,
  co2OffsetKgPerYear: 22,
  projectName: 'Northern Savanna Reforestation',
};

describe('TreeGrowthTimeline', () => {
  it('renders the story heading with species, id, region and planting date', () => {
    render(<TreeGrowthTimeline timeline={buildTreeGrowthTimeline(tree)} />);

    expect(screen.getByRole('heading', { name: /Teak · HRV-2024-0001/ })).toBeInTheDocument();
    expect(screen.getByText('Kano, Nigeria')).toBeInTheDocument();
    expect(screen.getByText(/Planted 12 March 2024/)).toBeInTheDocument();
  });

  it('summarises impact with CO₂, height, canopy and milestone counts', () => {
    const timeline = buildTreeGrowthTimeline(tree);
    render(<TreeGrowthTimeline timeline={timeline} />);

    const impact = within(screen.getByTestId('growth-impact'));
    expect(impact.getByText('CO₂ absorbed')).toBeInTheDocument();
    expect(impact.getByText(`${timeline.impact.cumulativeCo2Kg} kg`)).toBeInTheDocument();
    expect(impact.getByText(`${timeline.impact.heightCm} cm`)).toBeInTheDocument();
    expect(impact.getByText(`${timeline.impact.canopyCm} cm`)).toBeInTheDocument();
    expect(impact.getByText('Milestones')).toBeInTheDocument();
    expect(impact.getByText(`${timeline.impact.milestonesReached}`)).toBeInTheDocument();
  });

  it('shows every monthly photo, newest first', () => {
    const timeline = buildTreeGrowthTimeline(tree);
    render(<TreeGrowthTimeline timeline={timeline} />);

    const list = screen.getByRole('list', { name: 'Growth photo timeline' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(timeline.photos.length);

    const latestCaption = timeline.photos[timeline.photos.length - 1].caption;
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent(latestCaption);
  });

  it('filters photos by year with accessible pressed state', () => {
    const timeline = buildTreeGrowthTimeline(tree);
    render(<TreeGrowthTimeline timeline={timeline} />);

    const allYears = screen.getByRole('button', { name: 'All years' });
    expect(allYears).toHaveAttribute('aria-pressed', 'true');

    const firstYear = screen.getByRole('button', { name: 'First year' });
    fireEvent.click(firstYear);

    expect(firstYear).toHaveAttribute('aria-pressed', 'true');
    expect(allYears).toHaveAttribute('aria-pressed', 'false');

    const expected = timeline.photos.filter((photo) => photo.year === 0).length;
    const list = screen.getByRole('list', { name: 'Growth photo timeline' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(expected);
  });

  it('marks the most recent photo as latest', () => {
    render(<TreeGrowthTimeline timeline={buildTreeGrowthTimeline(tree)} />);
    expect(screen.getByText('Latest')).toBeInTheDocument();
  });

  it('surfaces milestone stories next to their photo', () => {
    render(<TreeGrowthTimeline timeline={buildTreeGrowthTimeline(tree)} />);

    expect(screen.getByText('Planted')).toBeInTheDocument();
    expect(screen.getByText('First anniversary')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('uses the provided back link', () => {
    render(
      <TreeGrowthTimeline timeline={buildTreeGrowthTimeline(tree)} backHref="/trees/tree-001" />
    );

    expect(screen.getByRole('link', { name: /Back to tree/ })).toHaveAttribute(
      'href',
      '/trees/tree-001'
    );
  });

  it('shows an awaiting-planting story instead of an empty timeline', () => {
    const funded: Tree = { ...tree, status: 'funded', plantedAt: undefined };
    render(<TreeGrowthTimeline timeline={buildTreeGrowthTimeline(funded)} />);

    expect(screen.getByRole('heading', { name: /Your tree's story/ })).toBeInTheDocument();
    expect(screen.getByText(/Photos begin once the tree is in the ground/)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Growth photo timeline' })).not.toBeInTheDocument();
  });
});
