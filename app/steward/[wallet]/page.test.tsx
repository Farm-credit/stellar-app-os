import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockAllTimeSponsors } from '@/lib/api/mock/leaderboard';
import * as stewardPortfolioService from '@/lib/api/steward-portfolio';
import StewardNotFound from './not-found';
import StewardPortfolioPage from './page';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const WALLET = mockAllTimeSponsors[0].address;

describe('steward portfolio page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the public portfolio with sample data', async () => {
    const page = await StewardPortfolioPage({ params: Promise.resolve({ wallet: WALLET }) });
    render(page);

    expect(screen.getByRole('heading', { name: 'Acme EcoSolutions' })).toBeTruthy();
    expect(screen.getByText('Trees sponsored')).toBeTruthy();
    expect(screen.getByText('Species planted')).toBeTruthy();
  });

  it('shows the steward not found state for an invalid wallet', async () => {
    await expect(
      StewardPortfolioPage({ params: Promise.resolve({ wallet: 'not-a-wallet' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND');

    render(<StewardNotFound />);
    expect(screen.getByRole('heading', { name: 'Steward not found' })).toBeTruthy();
  });

  it('lets data-fetch failures reach the route error boundary', async () => {
    vi.spyOn(stewardPortfolioService, 'getStewardPortfolio').mockImplementation(() => {
      throw new Error('portfolio unavailable');
    });

    await expect(
      StewardPortfolioPage({ params: Promise.resolve({ wallet: WALLET }) })
    ).rejects.toThrow('portfolio unavailable');
  });
});
