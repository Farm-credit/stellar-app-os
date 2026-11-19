import type { FarmerSuccessStory } from '@/lib/types/farmer-success-story';

/**
 * Static fixture for the public "Farmer success stories" page (issue #1427).
 *
 * There is no farmer case-study endpoint in the API surface yet, so the page is
 * driven by this typed local fixture. The exports below deliberately mirror the
 * async `lib/api/mock/*` helpers used elsewhere (e.g. `fetchLeaderboard`) so the
 * UI already exercises loading/error/empty states and can be pointed at a real
 * endpoint later without changing the component contract.
 */
export const farmerSuccessStories: FarmerSuccessStory[] = [
  {
    id: 'story-kano-amina',
    slug: 'aminu-musa-kano-reforestation',
    farmerName: 'Aminu Musa',
    headline: 'From a dusted plot to a 3.2-hectare woodland in three seasons',
    summary:
      'Aminu joined the Kano Reforestation project with degraded farmland. Verified payouts and a 91% tree survival rate now support his household year-round.',
    region: 'Kano State',
    country: 'Nigeria',
    projectName: 'Kano Reforestation Phase 1',
    projectType: 'Reforestation',
    status: 'verified',
    featured: true,
    storyDate: '2026-03-12',
    incomeEarned: {
      totalUsdc: 4850,
      previousPeriodUsdc: 2900,
      periodLabel: '2024 – 2025 season',
    },
    landTransformation: {
      degradedHectaresBefore: 3.2,
      restoredHectares: 3.2,
      treesPlanted: 1250,
      survivalRatePercent: 91,
      beforeSummary:
        'Crusted, wind-scoured soil with almost no tree cover and a failing dry-season harvest.',
      afterSummary:
        'A continuous 3.2-hectare canopy of acacia and baobab that now shelters the family millet plot.',
    },
    environmentalImpact: {
      co2SequesteredTonnes: 34.5,
      nativeSpeciesCount: 6,
      waterRetainedMegalitres: 2.4,
      soilHealthImprovementPercent: 38,
    },
    quote:
      'The first payout paid my children’s school fees. The trees are the reason we can stay on this land.',
  },
  {
    id: 'story-sokoto-fatima',
    slug: 'fatima-bello-sokoto-greenbelt',
    farmerName: 'Fatima Bello',
    headline: 'Agroforestry turns a single dry field into three income streams',
    summary:
      'Fatima intercropped nitrogen-fixing trees with her millet, doubling her farm income while rebuilding soil that had been losing nutrients for a decade.',
    region: 'Sokoto State',
    country: 'Nigeria',
    projectName: 'Sokoto Greenbelt Initiative',
    projectType: 'Sustainable Agriculture',
    status: 'verified',
    featured: false,
    storyDate: '2026-02-04',
    incomeEarned: {
      totalUsdc: 3210,
      previousPeriodUsdc: 2050,
      periodLabel: '2024 – 2025 season',
    },
    landTransformation: {
      degradedHectaresBefore: 2.4,
      restoredHectares: 2.4,
      treesPlanted: 820,
      survivalRatePercent: 88,
      beforeSummary: 'A single rain-fed field with falling yields and exposed topsoil.',
      afterSummary:
        'A living fence of locust-bean and acacia sheltering an intercropped millet and legume rotation.',
    },
    environmentalImpact: {
      co2SequesteredTonnes: 21.8,
      nativeSpeciesCount: 5,
      waterRetainedMegalitres: 1.8,
      soilHealthImprovementPercent: 31,
    },
    quote:
      'My harvest is bigger and I still earn from the trees. The land feels alive again.',
  },
  {
    id: 'story-accra-kwame',
    slug: 'kwame-mensah-volta-mangroves',
    farmerName: 'Kwame Mensah',
    headline: 'Rebuilding a mangrove shield that protects a whole fishing village',
    summary:
      'Kwame led a community planting of 2,400 mangroves along the Volta delta, restoring a natural sea wall for his village and a nursery income for his family.',
    region: 'Greater Accra',
    country: 'Ghana',
    projectName: 'Volta Delta Mangrove Shield',
    projectType: 'Mangrove Restoration',
    status: 'verified',
    featured: false,
    storyDate: '2026-01-20',
    incomeEarned: {
      totalUsdc: 5120,
      previousPeriodUsdc: 3900,
      periodLabel: '2024 – 2025 season',
    },
    landTransformation: {
      degradedHectaresBefore: 4.1,
      restoredHectares: 4.1,
      treesPlanted: 2400,
      survivalRatePercent: 84,
      beforeSummary: 'Eroded shoreline and cleared mangrove flats that let salt water onto farm plots.',
      afterSummary:
        'Four hectares of re-established mangrove that shelters the shore and the village fish nursery.',
    },
    environmentalImpact: {
      co2SequesteredTonnes: 58.9,
      nativeSpeciesCount: 3,
      waterRetainedMegalitres: 5.2,
    },
    quote:
      'When the mangroves came back, the fish came back too. That is income no one can take away.',
  },
  {
    id: 'story-nakuru-grace',
    slug: 'grace-wanjiru-rift-riparian-buffer',
    farmerName: 'Grace Wanjiru',
    headline: 'A riparian buffer keeps a riverside farm productive through drought',
    summary:
      'Grace planted a native riparian buffer along the Njoro river. The restored bank now holds water through the dry season and supports her dairy herd.',
    region: 'Nakuru County',
    country: 'Kenya',
    projectName: 'Rift Valley Riparian Buffer',
    projectType: 'Conservation',
    status: 'verified',
    featured: false,
    storyDate: '2025-12-08',
    incomeEarned: {
      totalUsdc: 2680,
      previousPeriodUsdc: 2240,
      periodLabel: '2024 – 2025 season',
    },
    landTransformation: {
      degradedHectaresBefore: 1.8,
      restoredHectares: 1.8,
      treesPlanted: 640,
      survivalRatePercent: 93,
      beforeSummary: 'A collapsing riverbank with gully erosion and silted water points.',
      afterSummary:
        'A dense native riparian strip that stabilises the bank and keeps watering points clear.',
    },
    environmentalImpact: {
      co2SequesteredTonnes: 16.4,
      nativeSpeciesCount: 7,
      waterRetainedMegalitres: 1.1,
      soilHealthImprovementPercent: 42,
    },
    quote:
      'The river runs clear now and my cattle drink without wading through mud. The buffer pays for itself.',
  },
  {
    id: 'story-zamfara-ibrahim',
    slug: 'ibrahim-sani-zamfara-watershed',
    farmerName: 'Ibrahim Sani',
    headline: 'Watershed planting brings a dry gully back into production',
    summary:
      'Ibrahim restored a washed-out gully with terraced tree planting, stabilising the slope and earning verified carbon income for his family.',
    region: 'Zamfara State',
    country: 'Nigeria',
    projectName: 'Zamfara Watershed Restoration',
    projectType: 'Reforestation',
    status: 'verified',
    featured: false,
    storyDate: '2025-11-15',
    incomeEarned: {
      totalUsdc: 1980,
      previousPeriodUsdc: 1450,
      periodLabel: '2024 – 2025 season',
    },
    landTransformation: {
      degradedHectaresBefore: 1.5,
      restoredHectares: 1.5,
      treesPlanted: 520,
      survivalRatePercent: 79,
      beforeSummary: 'An actively eroding gully that was swallowing grazing land each rainy season.',
      afterSummary:
        'Terraced, tree-anchored slopes that hold rainwater and have stopped the gully advancing.',
    },
    environmentalImpact: {
      co2SequesteredTonnes: 12.7,
      nativeSpeciesCount: 4,
      waterRetainedMegalitres: 0.9,
    },
    quote:
      'The gully used to take more land every year. Now it holds water and gives us shade.',
  },
  {
    id: 'story-katsina-aisha',
    slug: 'aisha-garba-katsina-sahel-buffer',
    farmerName: 'Aisha Garba',
    headline: 'A young farmer builds a first shelterbelt on the Sahel edge',
    summary:
      'Aisha is in her first verification cycle on the Katsina Sahel Buffer, planting a mixed native shelterbelt while her first carbon income is confirmed.',
    region: 'Katsina State',
    country: 'Nigeria',
    projectName: 'Katsina Sahel Buffer',
    projectType: 'Sustainable Agriculture',
    status: 'pending',
    featured: false,
    storyDate: '2025-10-02',
    incomeEarned: {
      totalUsdc: 940,
      previousPeriodUsdc: 700,
      periodLabel: 'first season',
    },
    landTransformation: {
      degradedHectaresBefore: 0.9,
      restoredHectares: 0.9,
      treesPlanted: 300,
      survivalRatePercent: 82,
      beforeSummary: 'Bare, compacted soil at the edge of the family compound.',
      afterSummary:
        'A young shelterbelt of drought-tolerant natives protecting a new vegetable plot.',
    },
    environmentalImpact: {
      co2SequesteredTonnes: 7.1,
      nativeSpeciesCount: 4,
    },
    quote: 'My first season gave me both a garden and a reason to keep planting.',
  },
];

/** Simulate the async access pattern used by the other `lib/api/mock` helpers. */
export async function fetchFarmerSuccessStories(): Promise<FarmerSuccessStory[]> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return farmerSuccessStories.map((story) => ({
    ...story,
    incomeEarned: { ...story.incomeEarned },
    landTransformation: { ...story.landTransformation },
    environmentalImpact: { ...story.environmentalImpact },
  }));
}

/** Look up a single case study by its slug (used for future detail routes). */
export async function fetchFarmerSuccessStoryBySlug(
  slug: string
): Promise<FarmerSuccessStory | null> {
  const stories = await fetchFarmerSuccessStories();
  return stories.find((story) => story.slug === slug) ?? null;
}
