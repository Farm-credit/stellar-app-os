import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TreeBrowseCatalog } from '@/components/trees/TreeBrowseCatalog';
import { SPONSORABLE_TREES } from '@/lib/trees/browse';

describe('TreeBrowseCatalog', () => {
  it('supports multi-select species filtering in the browse sidebar', () => {
    render(<TreeBrowseCatalog trees={SPONSORABLE_TREES} />);

    expect(screen.getAllByTestId('tree-browse-card')).toHaveLength(SPONSORABLE_TREES.length);

    fireEvent.click(screen.getByLabelText(/^Teak/i));
    expect(screen.getAllByTestId('tree-browse-card')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'Teak' })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/^Mangrove/i));
    expect(screen.getAllByTestId('tree-browse-card')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Mangrove' })).toBeInTheDocument();
  });

  it('filters trees by native region dropdown', () => {
    render(<TreeBrowseCatalog trees={SPONSORABLE_TREES} />);

    const regionSelect = screen.getByLabelText(/Native region/i);
    fireEvent.change(regionSelect, { target: { value: 'West Africa' } });

    const expectedCount = SPONSORABLE_TREES.filter((t) => t.nativeRegion === 'West Africa').length;
    expect(screen.getAllByTestId('tree-browse-card')).toHaveLength(expectedCount);
  });

  it('sorts trees by CO2 sequestration rate', () => {
    render(<TreeBrowseCatalog trees={SPONSORABLE_TREES} />);

    const sortSelect = screen.getByLabelText(/Sort trees/i);

    // Default is co2_desc (highest CO2 first: Bamboo (Moso) 35 kg/yr)
    const cardsDesc = screen.getAllByTestId('tree-browse-card');
    expect(cardsDesc[0]).toHaveTextContent('35 kg/yr');

    // Switch to co2_asc (lowest CO2 first: Moringa 9 kg/yr)
    fireEvent.change(sortSelect, { target: { value: 'co2_asc' } });
    const cardsAsc = screen.getAllByTestId('tree-browse-card');
    expect(cardsAsc[0]).toHaveTextContent('9 kg/yr');
  });

  it('filters by growth rate and CO2 absorption rate and resets cleanly', () => {
    render(<TreeBrowseCatalog trees={SPONSORABLE_TREES} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fast' }));
    fireEvent.change(screen.getByLabelText(/Min kg\/yr/i), { target: { value: '30' } });

    // Only Eucalyptus (31) and Bamboo (Moso) (35) are fast and >= 30 kg/yr
    expect(screen.getAllByTestId('tree-browse-card')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
    expect(screen.getAllByTestId('tree-browse-card')).toHaveLength(SPONSORABLE_TREES.length);
  });
});
