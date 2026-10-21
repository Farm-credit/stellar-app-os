import { TREE_SPECIES } from "@/lib/constants/species";
import { NATIVE_SPECIES } from "@/lib/native-species";

export type QuizTrait =
  | "climate-warm"
  | "climate-cool"
  | "water-low"
  | "water-high"
  | "growth-fast"
  | "growth-slow"
  | "native-preference"
  | "ornamental"
  | "wildlife"
  | "shade";

export interface QuizOption {
  id: string;
  label: string;
  /** Weights toward species traits. Positive values increase affinity. */
  weights: Partial<Record<QuizTrait, number>>;
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  /** Key used to look up the illustration asset for this question. */
  illustrationKey: string;
  options: QuizOption[];
}

export interface QuizAnswers {
  [questionId: string]: string;
}

export interface SpeciesRecommendation {
  slug: string;
  name: string;
  scientificName: string;
  co2KgPerYear: number;
  maturityYears: number;
  isNative: boolean;
  sponsorLink: string;
  /** Normalized match score (0-1) for display purposes. */
  matchScore: number;
}

export const TREE_SPECIES_QUIZ: QuizQuestion[] = [
  {
    id: "climate",
    prompt: "What kind of climate does your planting site have?",
    illustrationKey: "quiz/climate",
    options: [
      {
        id: "warm",
        label: "Warm and sunny most of the year",
        weights: { "climate-warm": 2, "water-low": 1 },
      },
      {
        id: "cool",
        label: "Cool with distinct seasons",
        weights: { "climate-cool": 2, "growth-slow": 1 },
      },
      {
        id: "temperate",
        label: "Mild and temperate",
        weights: { "climate-cool": 1, "climate-warm": 1 },
      },
    ],
  },
  {
    id: "water",
    prompt: "How much water is available at the site?",
    illustrationKey: "quiz/water",
    options: [
      {
        id: "dry",
        label: "Dry — little rainfall or irrigation",
        weights: { "water-low": 2 },
      },
      {
        id: "moderate",
        label: "Moderate — occasional rain",
        weights: { "water-low": 1, "water-high": 1 },
      },
      {
        id: "wet",
        label: "Wet — near a river or frequent rain",
        weights: { "water-high": 2 },
      },
    ],
  },
  {
    id: "growth",
    prompt: "How quickly do you want to see a canopy form?",
    illustrationKey: "quiz/growth",
    options: [
      {
        id: "fast",
        label: "As fast as possible",
        weights: { "growth-fast": 2 },
      },
      {
        id: "balanced",
        label: "A balanced pace",
        weights: { "growth-fast": 1, "growth-slow": 1 },
      },
      {
        id: "patient",
        label: "I'm patient — quality over speed",
        weights: { "growth-slow": 2 },
      },
    ],
  },
  {
    id: "native",
    prompt: "How important is it that the tree is native to the region?",
    illustrationKey: "quiz/native",
    options: [
      {
        id: "essential",
        label: "Essential — native only",
        weights: { "native-preference": 3 },
      },
      {
        id: "preferred",
        label: "Preferred, but flexible",
        weights: { "native-preference": 1 },
      },
      {
        id: "open",
        label: "I'm open to any species",
        weights: { "ornamental": 1 },
      },
    ],
  },
  {
    id: "purpose",
    prompt: "What is the main purpose of your tree?",
    illustrationKey: "quiz/purpose",
    options: [
      {
        id: "wildlife",
        label: "Support wildlife and biodiversity",
        weights: { "wildlife": 2, "native-preference": 1 },
      },
      {
        id: "shade",
        label: "Provide shade and cooling",
        weights: { "shade": 2, "growth-fast": 1 },
      },
      {
        id: "ornamental",
        label: "Beauty and landscaping",
        weights: { "ornamental": 2 },
      },
    ],
  },
  {
    id: "space",
    prompt: "How much space do you have?",
    illustrationKey: "quiz/space",
    options: [
      {
        id: "small",
        label: "A small yard or urban plot",
        weights: { "ornamental": 1, "growth-slow": 1 },
      },
      {
        id: "medium",
        label: "A medium garden",
        weights: { "shade": 1, "ornamental": 1 },
      },
      {
        id: "large",
        label: "A large open area",
        weights: { "shade": 2, "growth-fast": 1 },
      },
    ],
  },
  {
    id: "soil",
    prompt: "What is the soil like?",
    illustrationKey: "quiz/soil",
    options: [
      {
        id: "sandy",
        label: "Sandy and well-drained",
        weights: { "water-low": 2 },
      },
      {
        id: "loam",
        label: "Rich loam",
        weights: { "water-high": 1, "growth-fast": 1 },
      },
      {
        id: "clay",
        label: "Heavy clay",
        weights: { "water-high": 2 },
      },
    ],
  },
  {
    id: "maintenance",
    prompt: "How much maintenance can you commit to?",
    illustrationKey: "quiz/maintenance",
    options: [
      {
        id: "low",
        label: "Very little — low maintenance",
        weights: { "water-low": 1, "growth-slow": 1 },
      },
      {
        id: "some",
        label: "Some seasonal care",
        weights: { "growth-fast": 1 },
      },
      {
        id: "high",
        label: "I enjoy tending to trees",
        weights: { "water-high": 1, "ornamental": 1 },
      },
    ],
  },
  {
    id: "season",
    prompt: "What's your favorite seasonal feature?",
    illustrationKey: "quiz/season",
    options: [
      {
        id: "flowers",
        label: "Spring blossoms",
        weights: { "ornamental": 2 },
      },
      {
        id: "foliage",
        label: "Autumn color",
        weights: { "climate-cool": 1, "ornamental": 1 },
      },
      {
        id: "evergreen",
        label: "Evergreen year-round",
        weights: { "climate-cool": 1, "shade": 1 },
      },
    ],
  },
  {
    id: "impact",
    prompt: "What impact matters most to you?",
    illustrationKey: "quiz/impact",
    options: [
      {
        id: "carbon",
        label: "Maximum carbon capture",
        weights: { "growth-fast": 2, "shade": 1 },
      },
      {
        id: "habitat",
        label: "Habitat for local species",
        weights: { "wildlife": 2, "native-preference": 1 },
      },
      {
        id: "community",
        label: "Community beauty and wellbeing",
        weights: { "ornamental": 1, "shade": 1 },
      },
    ],
  },
];

interface SpeciesTraitProfile {
  slug: string;
  traits: Partial<Record<QuizTrait, number>>;
}

/**
 * Static trait profiles for species. These describe how well each species
 * matches the quiz traits. Species not listed here fall back to a neutral
 * profile derived from their native status.
 */
const SPECIES_TRAIT_PROFILES: SpeciesTraitProfile[] = [
  {
    slug: "oak",
    traits: {
      "climate-cool": 2,
      "climate-warm": 1,
      "water-low": 1,
      "growth-slow": 2,
      "native-preference": 2,
      wildlife: 3,
      shade: 2,
    },
  },
  {
    slug: "maple",
    traits: {
      "climate-cool": 2,
      "water-high": 1,
      "growth-fast": 1,
      "native-preference": 1,
      ornamental: 2,
      shade: 1,
    },
  },
  {
    slug: "pine",
    traits: {
      "climate-cool": 2,
      "climate-warm": 1,
      "water-low": 2,
      "growth-fast": 1,
      "growth-slow": 1,
      "native-preference": 1,
      shade: 1,
    },
  },
  {
    slug: "birch",
    traits: {
      "climate-cool": 2,
      "water-high": 2,
      "growth-fast": 2,
      "native-preference": 1,
      ornamental: 1,
    },
  },
  {
    slug: "willow",
    traits: {
      "water-high": 3,
      "growth-fast": 2,
      "native-preference": 1,
      wildlife: 1,
      shade: 1,
    },
  },
  {
    slug: "cedar",
    traits: {
      "climate-warm": 1,
      "water-low": 2,
      "growth-slow": 2,
      "native-preference": 1,
      ornamental: 1,
    },
  },
  {
    slug: "ash",
    traits: {
      "climate-cool": 1,
      "water-high": 1,
      "growth-fast": 2,
      "native-preference": 1,
      shade: 1,
    },
  },
  {
    slug: "elm",
    traits: {
      "climate-cool": 1,
      "water-high": 1,
      "growth-fast": 1,
      "native-preference": 1,
      shade: 2,
    },
  },
];

function isNative(slug: string): boolean {
  const normalized = slug.toLowerCase();
  return NATIVE_SPECIES.some((entry) => {
    const nativeSlug =
      typeof entry === "string"
        ? entry
        : (entry as { slug?: string }).slug ?? "";
    return nativeSlug.toLowerCase() === normalized;
  });
}

function accumulateWeights(answers: QuizAnswers): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const question of TREE_SPECIES_QUIZ) {
    const selectedId = answers[question.id];
    if (!selectedId) continue;

    const option = question.options.find((o) => o.id === selectedId);
    if (!option) continue;

    for (const [trait, weight] of Object.entries(option.weights)) {
      if (typeof weight !== "number") continue;
      totals[trait] = (totals[trait] ?? 0) + weight;
    }
  }

  return totals;
}

function getProfile(slug: string): Partial<Record<QuizTrait, number>> {
  const found = SPECIES_TRAIT_PROFILES.find(
    (p) => p.slug.toLowerCase() === slug.toLowerCase(),
  );
  if (found) return found.traits;

  // Neutral fallback profile.
  return {
    "climate-cool": 1,
    "climate-warm": 1,
    "water-low": 1,
    "water-high": 1,
    "growth-fast": 1,
    "growth-slow": 1,
    "native-preference": 1,
    ornamental: 1,
    wildlife: 1,
    shade: 1,
  };
}

function scoreSpecies(
  slug: string,
  totals: Record<string, number>,
): number {
  const profile = getProfile(slug);
  let score = 0;

  for (const [trait, userWeight] of Object.entries(totals)) {
    const speciesWeight = profile[trait as QuizTrait] ?? 0;
    score += userWeight * speciesWeight;
  }

  // Bonus for native species when the user cares about natives.
  const nativePreference = totals["native-preference"] ?? 0;
  if (nativePreference > 0 && isNative(slug)) {
    score += nativePreference * 2;
  }

  return score;
}

function buildSponsorLink(slug: string): string {
  return `/sponsor?species=${encodeURIComponent(slug)}`;
}

export function scoreQuiz(answers: QuizAnswers): SpeciesRecommendation[] {
  const totals = accumulateWeights(answers);

  const scored = TREE_SPECIES.map((species) => {
    const slug = species.slug;
    const rawScore = scoreSpecies(slug, totals);
    return { species, slug, rawScore };
  });

  const maxScore = scored.reduce(
    (max, item) => Math.max(max, item.rawScore),
    0,
  );

  scored.sort((a, b) => b.rawScore - a.rawScore);

  const top = scored.slice(0, 3);

  return top.map(({ species, slug, rawScore }) => {
    const matchScore = maxScore > 0 ? rawScore / maxScore : 0;
    return {
      slug,
      name: species.name,
      scientificName: species.scientificName,
      co2KgPerYear: species.co2KgPerYear,
      maturityYears: species.maturityYears,
      isNative: isNative(slug),
      sponsorLink: buildSponsorLink(slug),
      matchScore: Math.round(matchScore * 100) / 100,
    };
  });
}