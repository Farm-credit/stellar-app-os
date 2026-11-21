import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TreeDetail } from '../TreeDetail';
import type { Tree } from '@/lib/types/tree';

const baseTree: Tree = {
  id: 'tree-001',
  treeId: 'HRV-2024-0001',
  species: 'Teak',
  region: 'Kano, Nigeria',
  status: 'verified',
  plantedAt: '2024-03-12T08:00:00Z',
  lat: 12.04,
  lng: 8.48,
  co2OffsetKgPerYear: 25,
  projectName: 'Northern Savanna Reforestation',
  sponsorName: 'Acme EcoSolutions',
};

describe('TreeDetail dedication display', () => {
  it('renders the dedication inscription with a heart icon when present', () => {
    render(
      <TreeDetail
        tree={{
          ...baseTree,
          dedication: 'In loving memory of Grandma Rose.',
        }}
      />
    );

    expect(screen.getByLabelText('Tree dedication')).toBeInTheDocument();
    expect(screen.getByTestId('dedication-heart-icon')).toBeInTheDocument();
    expect(screen.getByText(/In loving memory of Grandma Rose\./)).toBeInTheDocument();
  });

  it('does not render the dedication banner when dedication is absent', () => {
    render(<TreeDetail tree={baseTree} />);

    expect(screen.queryByLabelText('Tree dedication')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dedication-heart-icon')).not.toBeInTheDocument();
  });
});
