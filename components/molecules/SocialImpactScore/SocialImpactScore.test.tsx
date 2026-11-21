import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SocialImpactScore } from './SocialImpactScore';
import { calculateSocialImpactScore } from '@/lib/impact/social-impact-score';

describe('SocialImpactScore Component', () => {
  const initialScore = calculateSocialImpactScore({
    treesFunded: 200,
    speciesCount: 5,
    regionsCount: 2,
    yearsOfEngagement: 1.5,
  });

  it('renders total score out of 1000 and tier level', () => {
    render(<SocialImpactScore initialScore={initialScore} />);

    expect(screen.getByRole('heading', { name: /Social Impact Score/i })).toBeTruthy();
    expect(screen.getByText(/\/ 1000/i)).toBeTruthy();
    expect(screen.getByText(/Canopy Guardian/i)).toBeTruthy();
  });

  it('renders breakdown of all four contributing factors with progress bars', () => {
    render(<SocialImpactScore initialScore={initialScore} />);

    expect(screen.getByTestId('factor-card-treesFunded')).toBeTruthy();
    expect(screen.getByTestId('factor-card-speciesDiversity')).toBeTruthy();
    expect(screen.getByTestId('factor-card-geographicSpread')).toBeTruthy();
    expect(screen.getByTestId('factor-card-yearsOfEngagement')).toBeTruthy();

    expect(screen.getByText('Trees Funded')).toBeTruthy();
    expect(screen.getByText('Species Diversity')).toBeTruthy();
    expect(screen.getByText('Geographic Spread')).toBeTruthy();
    expect(screen.getByText('Years of Engagement')).toBeTruthy();

    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBe(4);
  });

  it('allows opening simulator and dynamically updating simulated score', () => {
    render(<SocialImpactScore initialScore={initialScore} />);

    const simButton = screen.getByRole('button', { name: /Simulate Growth/i });
    fireEvent.click(simButton);

    expect(screen.getByTestId('impact-simulator-panel')).toBeTruthy();

    // Click "+50" trees in the simulator
    const add50Btn = screen.getByRole('button', { name: '+50' });
    fireEvent.click(add50Btn);

    // Verify simulated badge appears
    expect(screen.getByText(/Live Simulated Preview/i)).toBeTruthy();

    // Reset button should be visible and can be clicked
    const resetBtn = screen.getByRole('button', { name: /Reset/i });
    fireEvent.click(resetBtn);

    expect(screen.queryByText(/Live Simulated Preview/i)).toBeNull();
  });
});
