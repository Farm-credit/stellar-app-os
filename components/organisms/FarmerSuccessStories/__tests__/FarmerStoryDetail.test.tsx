import type { ReactElement, ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FarmerStoryDetail } from '../FarmerStoryDetail';
import { FarmerStoryCard } from '../FarmerStoryCard';
import type { FarmerSuccessStory } from '@/lib/types/farmer-success-story';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children?: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function buildStory(overrides: Partial<FarmerSuccessStory> = {}): FarmerSuccessStory {
  return {
    id: 'story-detail',
    slug: 'aminu-musa-kano-reforestation',
    farmerName: 'Aminu Musa',
    headline: 'From a dusted plot to a 3.2-hectare woodland in three seasons',
    summary: 'Aminu joined the Kano Reforestation project with degraded farmland.',
    region: 'Kano State',
    country: 'Nigeria',
    projectName: 'Kano Reforestation Phase 1',
    projectType: 'Reforestation',
    status: 'verified',
    featured: true,
    storyDate: '2026-03-12',
    incomeEarned: { totalUsdc: 4850, previousPeriodUsdc: 2900, periodLabel: '2024 – 2025 season' },
    landTransformation: {
      degradedHectaresBefore: 3.2,
      restoredHectares: 3.2,
      treesPlanted: 1250,
      survivalRatePercent: 91,
      beforeSummary: 'Crusted, wind-scoured soil with almost no tree cover.',
      afterSummary: 'A continuous 3.2-hectare canopy of acacia and baobab.',
    },
    environmentalImpact: {
      co2SequesteredTonnes: 34.5,
      nativeSpeciesCount: 6,
      waterRetainedMegalitres: 2.4,
      soilHealthImprovementPercent: 38,
    },
    quote: 'The first payout paid my children’s school fees.',
    ...overrides,
  };
}

const relatedStory = buildStory({
  id: 'story-related',
  slug: 'ibrahim-sani-zamfara-watershed',
  farmerName: 'Ibrahim Sani',
  headline: 'Watershed planting brings a dry gully back into production',
  projectType: 'Reforestation',
});

function renderDetail(ui: ReactElement) {
  return render(ui);
}

describe('FarmerStoryDetail', () => {
  it('renders the farmer, headline, location and project', () => {
    renderDetail(<FarmerStoryDetail story={buildStory()} />);

    expect(screen.getByRole('heading', { level: 1, name: /dusted plot/i })).toBeInTheDocument();
    expect(screen.getByText('Aminu Musa')).toBeInTheDocument();
    expect(screen.getByText('Kano State, Nigeria')).toBeInTheDocument();
    expect(screen.getByText(/Kano Reforestation Phase 1/)).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText('Featured')).toBeInTheDocument();
  });

  it('renders income, land and environmental outcomes', () => {
    renderDetail(<FarmerStoryDetail story={buildStory()} />);

    expect(screen.getByText('$4,850')).toBeInTheDocument();
    expect(screen.getByText('+67.2% vs previous season')).toBeInTheDocument();
    expect(screen.getByText('3.2 ha')).toBeInTheDocument();
    expect(screen.getByText('1,250 trees planted')).toBeInTheDocument();
    expect(screen.getByText('34.5 tCO₂e')).toBeInTheDocument();
    expect(screen.getByText('6 native species')).toBeInTheDocument();
    expect(screen.getByText('2.4 ML water retained')).toBeInTheDocument();
    expect(screen.getByText('+38% soil health')).toBeInTheDocument();
  });

  it('renders the before/after land narrative and quote', () => {
    renderDetail(<FarmerStoryDetail story={buildStory()} />);

    expect(screen.getByText('Land before')).toBeInTheDocument();
    expect(screen.getByText(/Crusted, wind-scoured soil/)).toBeInTheDocument();
    expect(screen.getByText('Land today')).toBeInTheDocument();
    expect(screen.getByText(/canopy of acacia and baobab/)).toBeInTheDocument();
    expect(screen.getByText(/first payout paid my children/)).toBeInTheDocument();
  });

  it('links back to the stories index and to related case studies', () => {
    renderDetail(<FarmerStoryDetail story={buildStory()} relatedStories={[relatedStory]} />);

    expect(screen.getByRole('link', { name: /all success stories/i })).toHaveAttribute(
      'href',
      '/success-stories'
    );

    const related = screen.getByRole('heading', { name: /more case studies/i }).parentElement;
    expect(related).not.toBeNull();
    expect(
      within(related as HTMLElement).getByRole('link', { name: /Ibrahim Sani/i })
    ).toHaveAttribute('href', '/success-stories/ibrahim-sani-zamfara-watershed');
  });

  it('handles a pending-verification story without a quote', () => {
    renderDetail(<FarmerStoryDetail story={buildStory({ status: 'pending', quote: undefined })} />);

    expect(screen.getByText('Verification pending')).toBeInTheDocument();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });
});

describe('FarmerStoryCard case-study link', () => {
  it('links each card to its dedicated case-study page', () => {
    render(<FarmerStoryCard story={buildStory()} />);

    expect(screen.getByRole('link', { name: /view full case study/i })).toHaveAttribute(
      'href',
      '/success-stories/aminu-musa-kano-reforestation'
    );
  });
});
