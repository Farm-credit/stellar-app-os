import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SponsorImpactComparison } from './SponsorImpactComparison';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('SponsorImpactComparison', () => {
  it('renders impact comparison heading', () => {
    renderWithQuery(<SponsorImpactComparison sponsorCo2OffsetKg={500} sponsorTreeCount={10} />);

    expect(screen.getByText(/impact comparison/i)).toBeInTheDocument();
    expect(screen.getByText(/see how your co₂ offset compares/i)).toBeInTheDocument();
  });

  it('shows your ranking section', async () => {
    renderWithQuery(<SponsorImpactComparison sponsorCo2OffsetKg={500} sponsorTreeCount={10} />);

    expect(screen.getByText(/your ranking/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/top \d+%/i)).toBeInTheDocument();
    });
  });

  it('displays comparison bars for sponsor and platform', () => {
    renderWithQuery(<SponsorImpactComparison sponsorCo2OffsetKg={500} sponsorTreeCount={10} />);

    expect(screen.getByText(/your co₂ offset/i)).toBeInTheDocument();
    expect(screen.getByText(/platform average/i)).toBeInTheDocument();
    expect(screen.getByText(/platform median/i)).toBeInTheDocument();
  });

  it('shows vs average and vs median stats', () => {
    renderWithQuery(<SponsorImpactComparison sponsorCo2OffsetKg={500} sponsorTreeCount={10} />);

    expect(screen.getByText(/vs average/i)).toBeInTheDocument();
    expect(screen.getByText(/vs median/i)).toBeInTheDocument();
  });

  it('shows loading state when isLoading is true', () => {
    renderWithQuery(
      <SponsorImpactComparison sponsorCo2OffsetKg={500} sponsorTreeCount={10} isLoading={true} />
    );

    expect(screen.getByText(/impact comparison/i)).toBeInTheDocument();
  });
});
