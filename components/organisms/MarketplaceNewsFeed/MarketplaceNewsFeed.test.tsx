import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MarketplaceNewsFeed } from './MarketplaceNewsFeed';

describe('MarketplaceNewsFeed', () => {
  it('renders market snapshots and representative news categories', () => {
    render(<MarketplaceNewsFeed />);

    expect(screen.getByRole('heading', { name: 'Carbon market news' })).toBeInTheDocument();
    expect(screen.getByText('Average spot price')).toBeInTheDocument();
    expect(
      screen.getByText('West African restoration credits move higher on tight supply')
    ).toBeInTheDocument();
    expect(
      screen.getByText('New buyer guidance raises demand for traceable project data')
    ).toBeInTheDocument();
  });

  it('filters updates by category', async () => {
    const user = userEvent.setup();
    render(<MarketplaceNewsFeed />);

    await user.click(screen.getByRole('tab', { name: 'Buyer demand' }));

    expect(
      screen.getByText('Corporate buyers prioritise durable removal for 2026 procurement')
    ).toBeInTheDocument();
    expect(
      screen.queryByText('New buyer guidance raises demand for traceable project data')
    ).not.toBeInTheDocument();
  });

  it('filters updates by search and shows an empty state when no story matches', async () => {
    const user = userEvent.setup();
    render(<MarketplaceNewsFeed />);
    const search = screen.getByRole('searchbox', { name: 'Search market news' });

    await user.type(search, 'antarctica');

    expect(screen.getByText('No market updates match your search.')).toBeInTheDocument();
  });
});
