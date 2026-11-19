import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CO2_METHODOLOGY_PATH, estimateTreeSequestration } from '@/lib/carbon/ipcc-tier1';
import { TreeCo2Calculation } from './TreeCo2Calculation';

describe('TreeCo2Calculation', () => {
  const sequestration = estimateTreeSequestration({
    species: 'Teak',
    climateZone: 'tropical',
    plantedAt: '2024-03-12T08:00:00Z',
    asOf: new Date('2026-03-12T08:00:00Z'),
  });

  it('shows the species, climate zone and age used for the calculation', () => {
    render(<TreeCo2Calculation sequestration={sequestration} />);

    expect(screen.getByText('Teak')).toBeInTheDocument();
    expect(screen.getByText('tropical')).toBeInTheDocument();
    expect(screen.getByText(/^2\.0 years$/)).toBeInTheDocument();
  });

  it('shows the yearly and stored CO2 figures', () => {
    render(<TreeCo2Calculation sequestration={sequestration} />);

    expect(screen.getByText(`${sequestration.annualCo2Kg.toFixed(1)} kg CO₂`)).toBeInTheDocument();
    expect(
      screen.getByText(`${sequestration.cumulativeCo2Kg.toFixed(1)} kg CO₂`)
    ).toBeInTheDocument();
  });

  it('links to the methodology page', () => {
    render(<TreeCo2Calculation sequestration={sequestration} />);

    expect(screen.getByRole('link', { name: /how is this calculated/i })).toHaveAttribute(
      'href',
      CO2_METHODOLOGY_PATH
    );
  });

  it('says a tree that is not planted yet has no age', () => {
    const unplanted = estimateTreeSequestration({ species: 'Teak', climateZone: 'tropical' });
    render(<TreeCo2Calculation sequestration={unplanted} />);

    expect(screen.getByText('Not planted yet')).toBeInTheDocument();
  });
});
