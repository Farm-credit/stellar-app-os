import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DonorRecognitionWall } from './DonorRecognitionWall';

function mockWall(entries: unknown[], ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      json: async () => ({ generatedAt: '2026-10-21T00:00:00.000Z', entries }),
    })
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('DonorRecognitionWall', () => {
  it('groups sponsors under their tier, highest tier first, with name and trees', async () => {
    mockWall([
      { name: 'Acme', logoUrl: null, totalTrees: 1500, tier: 'platinum' },
      { name: 'Beta', logoUrl: 'https://x.test/b.png', totalTrees: 60, tier: 'silver' },
    ]);
    render(<DonorRecognitionWall />);

    await waitFor(() => expect(screen.getByText('Acme')).toBeInTheDocument());
    expect(screen.getByTestId('donor-tier-platinum')).toHaveTextContent('Acme');
    expect(screen.getByTestId('donor-tier-silver')).toHaveTextContent('Beta');
    expect(screen.queryByTestId('donor-tier-gold')).not.toBeInTheDocument();
    expect(screen.getByText('1,500 trees funded')).toBeInTheDocument();
  });

  it('shows a logo with alt text only when one is provided', async () => {
    mockWall([
      { name: 'Acme', logoUrl: null, totalTrees: 1500, tier: 'platinum' },
      { name: 'Beta', logoUrl: 'https://x.test/b.png', totalTrees: 60, tier: 'silver' },
    ]);
    render(<DonorRecognitionWall />);

    await waitFor(() => expect(screen.getByAltText('Beta logo')).toBeInTheDocument());
    expect(screen.queryByAltText('Acme logo')).not.toBeInTheDocument();
  });

  it('renders nothing when the wall is empty', async () => {
    mockWall([]);
    const { container } = render(<DonorRecognitionWall />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the request fails', async () => {
    mockWall([], false);
    const { container } = render(<DonorRecognitionWall />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
