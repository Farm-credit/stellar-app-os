import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProjectCard } from '../ProjectCard';
import type { CarbonProject } from '@/lib/types/carbon';

const project: CarbonProject = {
  id: 'proj-001',
  name: 'Amazon Rainforest Reforestation',
  description: 'High-density native canopy restoration.',
  vintageYear: 2025,
  pricePerTon: 18.5,
  availableSupply: 1200,
  isOutOfStock: false,
  type: 'Reforestation',
  location: 'Amazon Basin, Brazil',
  coordinates: { latitude: -3.4, longitude: -62.2 },
  coBenefits: ['Biodiversity'],
  verificationStatus: 'Gold Standard',
};

describe('ProjectCard compare button', () => {
  it('is not rendered unless a toggle handler is provided', () => {
    render(<ProjectCard project={project} />);
    expect(screen.queryByRole('button', { name: /compare/i })).not.toBeInTheDocument();
  });

  it('calls the handler with the project id', () => {
    const onToggleCompare = vi.fn();
    render(<ProjectCard project={project} onToggleCompare={onToggleCompare} />);

    const button = screen.getByRole('button', { name: /^compare/i });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);

    expect(onToggleCompare).toHaveBeenCalledWith('proj-001');
  });

  it('shows the pressed state when the project is selected', () => {
    render(<ProjectCard project={project} isComparing onToggleCompare={vi.fn()} />);

    const button = screen.getByRole('button', { name: /remove from compare/i });
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('is disabled when the comparison is full and the project is not selected', () => {
    render(<ProjectCard project={project} compareDisabled onToggleCompare={vi.fn()} />);
    expect(screen.getByRole('button', { name: /^compare/i })).toBeDisabled();
  });

  it('stays enabled for a selected project even when the comparison is full', () => {
    render(<ProjectCard project={project} isComparing compareDisabled onToggleCompare={vi.fn()} />);
    expect(screen.getByRole('button', { name: /remove from compare/i })).toBeEnabled();
  });
});
