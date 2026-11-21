import type { ReactElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { FarmerSuccessStories } from '../FarmerSuccessStories';
import {
  computeIncomeGrowthPercent,
  filterFarmerSuccessStories,
  summarizeFarmerSuccessStories,
} from '@/lib/utils/farmerSuccessStoryStats';
import type { FarmerSuccessStory } from '@/lib/types/farmer-success-story';

function buildStory(overrides: Partial<FarmerSuccessStory> = {}): FarmerSuccessStory {
  return {
    id: 'story-test',
    slug: 'story-test',
    farmerName: 'Test Farmer',
    headline: 'A headline',
    summary: 'A summary',
    region: 'Kano State',
    country: 'Nigeria',
    projectName: 'Test Project',
    projectType: 'Reforestation',
    status: 'verified',
    featured: false,
    storyDate: '2026-01-01',
    incomeEarned: { totalUsdc: 1000, previousPeriodUsdc: 500, periodLabel: '2025 season' },
    landTransformation: {
      degradedHectaresBefore: 1,
      restoredHectares: 1,
      treesPlanted: 100,
      survivalRatePercent: 80,
      beforeSummary: 'Before',
      afterSummary: 'After',
    },
    environmentalImpact: { co2SequesteredTonnes: 10, nativeSpeciesCount: 4 },
    ...overrides,
  };
}

const featuredStory = buildStory({
  id: 'a',
  farmerName: 'Aminu Musa',
  region: 'Kano State',
  projectType: 'Reforestation',
  featured: true,
  storyDate: '2026-03-12',
  incomeEarned: { totalUsdc: 4850, previousPeriodUsdc: 2900, periodLabel: '2024 – 2025 season' },
  landTransformation: {
    degradedHectaresBefore: 3.2,
    restoredHectares: 3.2,
    treesPlanted: 1250,
    survivalRatePercent: 91,
    beforeSummary: 'Dusted soil',
    afterSummary: 'Woodland',
  },
  environmentalImpact: { co2SequesteredTonnes: 34.5, nativeSpeciesCount: 6 },
});

const mangroveStory = buildStory({
  id: 'b',
  farmerName: 'Kwame Mensah',
  region: 'Greater Accra',
  projectType: 'Mangrove Restoration',
  storyDate: '2026-01-20',
  incomeEarned: { totalUsdc: 5120, previousPeriodUsdc: 3900, periodLabel: '2024 – 2025 season' },
  landTransformation: {
    degradedHectaresBefore: 4.1,
    restoredHectares: 4.1,
    treesPlanted: 2400,
    survivalRatePercent: 84,
    beforeSummary: 'Eroded shore',
    afterSummary: 'Mangrove flats',
  },
  environmentalImpact: { co2SequesteredTonnes: 58.9, nativeSpeciesCount: 3 },
});

function renderWithQuery(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('farmer success story helpers', () => {
  it('computes income growth and guards a missing previous period', () => {
    expect(computeIncomeGrowthPercent(featuredStory)).toBe(67.2);
    expect(
      computeIncomeGrowthPercent(
        buildStory({ incomeEarned: { totalUsdc: 500, previousPeriodUsdc: 0, periodLabel: 'n/a' } })
      )
    ).toBe(0);
  });

  it('summarizes income, land and environmental totals', () => {
    expect(summarizeFarmerSuccessStories([featuredStory, mangroveStory])).toEqual({
      storyCount: 2,
      totalIncomeEarnedUsdc: 9970,
      totalHectaresRestored: 7.3,
      totalTreesPlanted: 3650,
      totalCo2SequesteredTonnes: 93.4,
      averageSurvivalRatePercent: 87.5,
    });
  });

  it('returns zeroed totals when there are no stories', () => {
    expect(summarizeFarmerSuccessStories([])).toEqual({
      storyCount: 0,
      totalIncomeEarnedUsdc: 0,
      totalHectaresRestored: 0,
      totalTreesPlanted: 0,
      totalCo2SequesteredTonnes: 0,
      averageSurvivalRatePercent: 0,
    });
  });

  it('filters by region and project type while keeping featured stories first', () => {
    const filtered = filterFarmerSuccessStories([mangroveStory, featuredStory], {
      region: 'Greater Accra',
      projectType: 'all',
    });
    expect(filtered.map((story) => story.id)).toEqual(['b']);

    const all = filterFarmerSuccessStories([mangroveStory, featuredStory], {
      region: 'all',
      projectType: 'all',
    });
    expect(all.map((story) => story.id)).toEqual(['a', 'b']);
  });
});

describe('FarmerSuccessStories', () => {
  it('renders the heading and aggregate impact stats', () => {
    renderWithQuery(<FarmerSuccessStories stories={[featuredStory, mangroveStory]} />);

    expect(screen.getByRole('heading', { level: 1, name: /real farmers/i })).toBeInTheDocument();
    expect(screen.getByText('$9,970')).toBeInTheDocument();
    expect(screen.getByText('7.3 ha')).toBeInTheDocument();
    expect(screen.getByText('3,650')).toBeInTheDocument();
    expect(screen.getByText('93.4 tCO₂e')).toBeInTheDocument();
  });

  it('renders income, land and environmental figures on a story card', () => {
    renderWithQuery(<FarmerSuccessStories stories={[featuredStory, mangroveStory]} />);

    expect(screen.getByText('$4,850')).toBeInTheDocument();
    expect(screen.getByText('+67.2% vs previous season')).toBeInTheDocument();
    expect(screen.getByText('91% survived first verification')).toBeInTheDocument();
    expect(screen.getByText('34.5 tCO₂e')).toBeInTheDocument();
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.getAllByText('Read the case study')).toHaveLength(2);
  });

  it('narrows the list when a region filter is applied', () => {
    renderWithQuery(<FarmerSuccessStories stories={[featuredStory, mangroveStory]} />);

    expect(screen.getByText(/showing 2 of 2 case studies/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Greater Accra' }));

    expect(screen.getByText(/showing 1 of 2 case studies/i)).toBeInTheDocument();
    expect(screen.getByText('Kwame Mensah')).toBeInTheDocument();
    expect(screen.queryByText('Aminu Musa')).not.toBeInTheDocument();
    expect(screen.queryByText('Featured')).not.toBeInTheDocument();
  });

  it('shows a loading status while stories are being fetched', () => {
    renderWithQuery(<FarmerSuccessStories isLoading />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/loading farmer success stories/i)).toBeInTheDocument();
  });

  it('shows an error alert and retries on demand', () => {
    const onRetry = vi.fn();
    renderWithQuery(<FarmerSuccessStories error="Network unavailable" onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('Network unavailable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state when there are no stories', () => {
    renderWithQuery(<FarmerSuccessStories stories={[]} />);

    expect(screen.getByText(/no farmer success stories are available yet/i)).toBeInTheDocument();
  });

  it('loads the local fixture through the data hook by default', async () => {
    renderWithQuery(<FarmerSuccessStories />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(await screen.findByText('Aminu Musa')).toBeInTheDocument();
  });
});
