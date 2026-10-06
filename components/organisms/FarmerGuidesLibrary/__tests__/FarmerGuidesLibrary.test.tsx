import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FarmerGuidesLibrary } from '../FarmerGuidesLibrary';

describe('FarmerGuidesLibrary', () => {
  it('renders all five guides', () => {
    render(<FarmerGuidesLibrary />);
    expect(screen.getAllByRole('article')).toHaveLength(5);
  });

  it('filters guides by search and shows an empty state', async () => {
    const user = userEvent.setup();
    render(<FarmerGuidesLibrary />);
    await user.type(screen.getByRole('searchbox', { name: /search guides/i }), 'sampling');
    expect(screen.getAllByRole('article')).toHaveLength(1);
    await user.clear(screen.getByRole('searchbox', { name: /search guides/i }));
    await user.type(screen.getByRole('searchbox', { name: /search guides/i }), 'zzzz');
    expect(screen.getByText(/no guides match/i)).toBeInTheDocument();
  });
});
