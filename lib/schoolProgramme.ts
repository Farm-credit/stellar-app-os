export type SchoolLevel = 'primary' | 'secondary';

export type SchoolSponsorshipTier = {
  level: SchoolLevel;
  name: string;
  /** Percentage subsidy applied to the standard per-tree price. */
  subsidyPct: number;
  description: string;
};

/** Standard price of sponsoring one tree, in USD. */
export const STANDARD_TREE_PRICE_USD = 1;

export const SCHOOL_SPONSORSHIP_TIERS: readonly SchoolSponsorshipTier[] = [
  {
    level: 'primary',
    name: 'Primary school tier',
    subsidyPct: 60,
    description: 'Deepest subsidy for primary schools, with age-appropriate classroom activities.',
  },
  {
    level: 'secondary',
    name: 'Secondary school tier',
    subsidyPct: 50,
    description: 'Subsidised trees with data-driven science and geography activities.',
  },
];

export function getSchoolTreePrice(level: SchoolLevel): number {
  const tier = SCHOOL_SPONSORSHIP_TIERS.find((item) => item.level === level);
  const subsidy = tier?.subsidyPct ?? 0;
  return Math.round(STANDARD_TREE_PRICE_USD * (1 - subsidy / 100) * 100) / 100;
}

export function calculateSchoolSponsorshipCost(level: SchoolLevel, trees: number) {
  const count = Math.max(0, Math.floor(trees));
  const standard = Math.round(count * STANDARD_TREE_PRICE_USD * 100) / 100;
  const total = Math.round(count * getSchoolTreePrice(level) * 100) / 100;
  return { trees: count, standard, total, savings: Math.round((standard - total) * 100) / 100 };
}

export type LessonPlan = {
  species: string;
  title: string;
  curriculum: string[];
  gradeBands: SchoolLevel[];
  objectives: string[];
  activities: string[];
  discussion: string[];
};

export const LESSON_PLANS: readonly LessonPlan[] = [
  {
    species: 'mango',
    title: 'Mango trees: food, shade and carbon',
    curriculum: ['Science: plant life cycles', 'Geography: tropical climates', 'Maths: measuring'],
    gradeBands: ['primary', 'secondary'],
    objectives: [
      'Describe the life cycle of a fruit tree from seed to harvest.',
      'Explain how fruit trees support family income and nutrition.',
    ],
    activities: [
      'Measure and record your sponsored tree growth each month on a class chart.',
      'Draw the mango life cycle and label each stage.',
      'Estimate yearly fruit yield and convert it into meals.',
    ],
    discussion: ['How do mango trees help farmers in the community?'],
  },
  {
    species: 'moringa',
    title: 'Moringa: the miracle tree',
    curriculum: ['Science: nutrition and plants', 'Health education', 'Maths: data handling'],
    gradeBands: ['primary', 'secondary'],
    objectives: [
      'Identify why fast-growing trees restore land quickly.',
      'Compare the nutritional value of moringa leaves with common foods.',
    ],
    activities: [
      'Graph moringa growth against another species using tree-tracker data.',
      'Research and present three nutrients found in moringa leaves.',
    ],
    discussion: ['Why might farmers choose fast-growing trees?'],
  },
  {
    species: 'oak',
    title: 'Oak trees: biodiversity champions',
    curriculum: ['Science: ecosystems and food webs', 'Geography: temperate forests'],
    gradeBands: ['primary', 'secondary'],
    objectives: [
      'Build a food web showing species that depend on oak trees.',
      'Explain why long-lived trees store carbon for centuries.',
    ],
    activities: [
      'Create a food web poster of animals living in and around an oak.',
      'Calculate how much carbon a tree stores over 10, 50 and 100 years.',
    ],
    discussion: ['What happens to an ecosystem when a mature tree is removed?'],
  },
  {
    species: 'mangrove',
    title: 'Mangroves: coastal protectors',
    curriculum: ['Science: habitats and adaptation', 'Geography: coasts and flooding'],
    gradeBands: ['primary', 'secondary'],
    objectives: [
      'Explain how mangrove roots protect coastlines from erosion and storms.',
      'Describe how mangroves are adapted to salt water.',
    ],
    activities: [
      'Run a tray experiment comparing erosion with and without root-like barriers.',
      'Map coastal regions that rely on mangrove protection.',
    ],
    discussion: ['How do coastal communities benefit from healthy mangroves?'],
  },
];

export function getLessonPlan(species: string): LessonPlan | undefined {
  const key = species.trim().toLowerCase();
  return LESSON_PLANS.find((plan) => plan.species === key);
}

/** Render a lesson plan as a printable/downloadable Markdown document. */
export function renderLessonPlanMarkdown(plan: LessonPlan): string {
  const list = (items: string[]) => items.map((item) => `- ${item}`).join('\n');
  return [
    `# ${plan.title}`,
    '',
    `**Species:** ${plan.species}`,
    `**Suitable for:** ${plan.gradeBands.join(', ')}`,
    '',
    '## Curriculum links',
    list(plan.curriculum),
    '',
    '## Learning objectives',
    list(plan.objectives),
    '',
    '## Classroom activities',
    list(plan.activities),
    '',
    '## Discussion questions',
    list(plan.discussion),
    '',
  ].join('\n');
}
