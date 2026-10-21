import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { getMockTrees } from '@/lib/api/mock/trees';
import { CO2_METHODOLOGY_PATH, estimateTreeSequestration } from '@/lib/carbon/ipcc-tier1';
import { TreeDetail } from './TreeDetail';

describe('TreeDetail CO2 figures', () => {
  const tree = getMockTrees()[0];
  const sequestration = estimateTreeSequestration({
    species: tree.species,
    climateZone: 'tropical',
    plantedAt: tree.plantedAt,
    asOf: new Date('2026-03-12T08:00:00Z'),
  });

  it('shows the calculation inputs and links every CO2 figure to the methodology', () => {
    render(<TreeDetail tree={tree} sequestration={sequestration} />);

    expect(screen.getByText('CO₂ calculation')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: /how is this calculated/i });
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', CO2_METHODOLOGY_PATH);
    }
  });

  it('falls back to the recorded yearly figure without an estimate', () => {
    render(<TreeDetail tree={tree} />);

    expect(screen.getByText(`${tree.co2OffsetKgPerYear} kg / year`)).toBeInTheDocument();
    expect(screen.queryByText('CO₂ calculation')).not.toBeInTheDocument();
  });
});
