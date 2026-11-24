import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { SURVIVAL_METHODOLOGY, type SurvivalStatistic } from '@/lib/census/survival';
import { SurvivalRateStat } from './SurvivalRateStat';

const censusStatistic: SurvivalStatistic = {
  survivalRate: 87.5,
  treesCounted: 1200,
  censusYear: 2026,
  lastUpdated: '2026-06-01T00:00:00.000Z',
  source: 'census',
  historical: [
    { year: 2025, survivalRate: 84.2, totalTreesCounted: 1100 },
    { year: 2026, survivalRate: 87.5, totalTreesCounted: 1200 },
  ],
};

const baselineStatistic: SurvivalStatistic = {
  survivalRate: 82,
  treesCounted: null,
  censusYear: 2026,
  lastUpdated: '2026-01-01T00:00:00.000Z',
  source: 'baseline',
  historical: [],
};

describe('SurvivalRateStat (Issue #1645)', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the survival rate with census metadata and year-over-year change', () => {
    render(<SurvivalRateStat initial={censusStatistic} />);

    expect(screen.getByText('87.5%')).toBeInTheDocument();
    expect(screen.getByText('of planted trees still alive')).toBeInTheDocument();
    expect(screen.getByText('Field census')).toBeInTheDocument();
    expect(screen.getByText('1,200')).toBeInTheDocument();
    expect(screen.getByText('+3.3 pts vs 2025 census')).toBeInTheDocument();
    expect(screen.queryByText(/platform estimate/i)).not.toBeInTheDocument();
  });

  it('labels baseline estimates pending the first census', () => {
    render(<SurvivalRateStat initial={baselineStatistic} />);

    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText('Baseline estimate')).toBeInTheDocument();
    expect(screen.getByText(/pending the next census/i)).toBeInTheDocument();
  });

  it('shows the methodology explanation in a tooltip', async () => {
    const user = userEvent.setup();
    render(<SurvivalRateStat initial={baselineStatistic} />);

    const trigger = screen.getByRole('button', {
      name: /how is the survival rate calculated/i,
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.click(trigger);

    const tooltip = screen.getByRole('tooltip');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(tooltip).toHaveTextContent(SURVIVAL_METHODOLOGY);
  });

  it('refreshes the figure from the census API on mount', async () => {
    const refreshed: SurvivalStatistic = {
      ...censusStatistic,
      survivalRate: 91.2,
      censusYear: 2027,
      source: 'census',
      historical: [],
      treesCounted: 1500,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ statistic: refreshed }),
    });

    render(
      <SurvivalRateStat initial={baselineStatistic} refreshQuery={{ projectId: 'proj-001' }} />
    );

    await waitFor(() => {
      expect(screen.getByText('91.2%')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/census/survival?projectId=proj-001');
  });

  it('keeps the initial figure when the refresh fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    render(
      <SurvivalRateStat
        initial={baselineStatistic}
        refreshQuery={{ speciesSlug: 'teak', speciesName: 'Teak' }}
      />
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/census/survival?species=teak&name=Teak');
  });
});
