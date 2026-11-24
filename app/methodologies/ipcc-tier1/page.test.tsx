import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TREE_SPECIES } from '@/lib/constants/species';
import IpccTier1MethodologyPage from './page';

describe('IPCC Tier 1 methodology page', () => {
  it('explains the method and cites its sources', () => {
    render(<IpccTier1MethodologyPage />);

    expect(screen.getByRole('heading', { level: 1, name: /IPCC Tier 1/i })).toBeInTheDocument();
    expect(screen.getByText(/Chave, J\. et al\. \(2014\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/Guidelines for National Greenhouse Gas Inventories/)
    ).toBeInTheDocument();
  });

  it('lists the inputs for every species', () => {
    render(<IpccTier1MethodologyPage />);

    for (const species of TREE_SPECIES) {
      expect(screen.getByRole('cell', { name: species.name })).toBeInTheDocument();
    }
  });
});
