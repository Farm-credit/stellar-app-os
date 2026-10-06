export type FarmerGuide = {
  slug: string;
  title: string;
  summary: string;
  category: 'Land' | 'Measurement' | 'Funding' | 'Certification';
  difficulty: 'Starter' | 'Practical';
  steps: string[];
  resources: string[];
};

export const FARMER_GUIDES: readonly FarmerGuide[] = [
  {
    slug: 'regenerative-agriculture',
    title: 'Regenerative agriculture practices',
    summary:
      'Build healthier soil while improving water retention, biodiversity, and farm resilience.',
    category: 'Land',
    difficulty: 'Practical',
    steps: [
      'Start with a baseline: record soil cover, erosion, inputs, yields, and water use.',
      'Keep living roots and ground cover whenever possible with cover crops or managed residue.',
      'Reduce soil disturbance, diversify rotations, and introduce grazing only at a sustainable intensity.',
      'Review results each season and change one practice at a time so the impact is measurable.',
    ],
    resources: [
      'FAO soil health guidance',
      'USDA soil-health principles',
      'Local extension services',
    ],
  },
  {
    slug: 'soil-testing',
    title: 'Soil testing and sampling',
    summary:
      'Collect representative samples and turn a lab report into an affordable soil-management plan.',
    category: 'Measurement',
    difficulty: 'Starter',
    steps: [
      'Divide fields by soil type, crop history, and management zone before sampling.',
      'Take multiple cores at the same depth, mix them in a clean bucket, and label the composite sample.',
      'Request pH, organic matter, phosphorus, potassium, and any locally relevant micronutrients.',
      'Apply amendments from the report, keep the lab result, and retest on a consistent schedule.',
    ],
    resources: [
      'Accredited soil laboratory',
      'Local agronomist or extension officer',
      'Farm input records',
    ],
  },
  {
    slug: 'carbon-measurement',
    title: 'Carbon measurement on the farm',
    summary:
      'Create a repeatable emissions and sequestration record that can support credible credit claims.',
    category: 'Measurement',
    difficulty: 'Practical',
    steps: [
      'Choose a reporting boundary and record fuel, electricity, fertilizer, livestock, and land-area data.',
      'Keep dates, units, invoices, and field identifiers with every measurement.',
      'Separate estimated reductions from verified removals; do not count the same benefit twice.',
      'Use a consistent baseline and have claims reviewed before presenting them as carbon credits.',
    ],
    resources: [
      'GHG Protocol agriculture guidance',
      'FarmCredit carbon calculator',
      'Independent verifier',
    ],
  },
  {
    slug: 'grant-applications',
    title: 'Grant applications for farmers',
    summary:
      'Turn a good farm project into a clear, evidence-based application funders can evaluate quickly.',
    category: 'Funding',
    difficulty: 'Practical',
    steps: [
      'Match the project to the funder’s objectives, geography, eligible costs, and deadline.',
      'Describe the problem, measurable outcomes, work plan, budget, and maintenance plan in plain language.',
      'Attach land records, quotations, baseline measurements, permits, and community or cooperative support.',
      'Submit early, keep a copy of every document, and report progress against the promised indicators.',
    ],
    resources: [
      'Funder guidelines and FAQ',
      'Cooperative or extension adviser',
      'Project budget template',
    ],
  },
  {
    slug: 'certification-process',
    title: 'Certification process checklist',
    summary:
      'Prepare records and controls before an organic, sustainability, or carbon-certification audit.',
    category: 'Certification',
    difficulty: 'Practical',
    steps: [
      'Select a recognised standard and read its prohibited-input, worker, traceability, and record rules.',
      'Map fields, suppliers, storage, equipment, and product flows so every claim is traceable.',
      'Keep input logs, harvest records, training notes, sales records, and corrective actions together.',
      'Schedule an internal review before the external inspection and close gaps with evidence.',
    ],
    resources: [
      'Chosen certification standard',
      'Accredited certification body',
      'Traceability and input logs',
    ],
  },
];

export function searchFarmerGuides(query: string, category = 'All'): FarmerGuide[] {
  const normalized = query.trim().toLowerCase();
  return FARMER_GUIDES.filter((guide) => {
    const matchesCategory = category === 'All' || guide.category === category;
    const haystack = [guide.title, guide.summary, guide.category, ...guide.steps]
      .join(' ')
      .toLowerCase();
    return matchesCategory && (!normalized || haystack.includes(normalized));
  });
}
