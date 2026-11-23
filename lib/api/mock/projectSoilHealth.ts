export interface SoilHealthReading {
  date: string;
  ph: number;
  nitrogenMgKg: number;
  moisturePercent: number;
  organicMatterPercent: number;
}

export interface ProjectSoilHealthData {
  source: string;
  isSampleData: boolean;
  readings: SoilHealthReading[];
}

const sampleSoilHealthByProject: Record<string, ProjectSoilHealthData> = {
  'proj-001': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 5.2,
        nitrogenMgKg: 185,
        moisturePercent: 19,
        organicMatterPercent: 2.2,
      },
      {
        date: '2026-01-15',
        ph: 5.8,
        nitrogenMgKg: 218,
        moisturePercent: 23,
        organicMatterPercent: 2.8,
      },
    ],
  },
  'proj-002': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 6.2,
        nitrogenMgKg: 116,
        moisturePercent: 13,
        organicMatterPercent: 1.5,
      },
      {
        date: '2026-01-15',
        ph: 6.5,
        nitrogenMgKg: 142,
        moisturePercent: 17,
        organicMatterPercent: 2.0,
      },
    ],
  },
  'proj-003': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 6.4,
        nitrogenMgKg: 128,
        moisturePercent: 15,
        organicMatterPercent: 1.7,
      },
      {
        date: '2026-01-15',
        ph: 6.7,
        nitrogenMgKg: 159,
        moisturePercent: 19,
        organicMatterPercent: 2.2,
      },
    ],
  },
  'proj-004': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 6.1,
        nitrogenMgKg: 230,
        moisturePercent: 31,
        organicMatterPercent: 3.4,
      },
      {
        date: '2026-01-15',
        ph: 6.4,
        nitrogenMgKg: 258,
        moisturePercent: 35,
        organicMatterPercent: 4.1,
      },
    ],
  },
  'proj-005': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 5.6,
        nitrogenMgKg: 145,
        moisturePercent: 16,
        organicMatterPercent: 1.8,
      },
      {
        date: '2026-01-15',
        ph: 6.2,
        nitrogenMgKg: 192,
        moisturePercent: 21,
        organicMatterPercent: 2.7,
      },
    ],
  },
  'proj-006': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 5.4,
        nitrogenMgKg: 160,
        moisturePercent: 20,
        organicMatterPercent: 2.0,
      },
      {
        date: '2026-01-15',
        ph: 5.9,
        nitrogenMgKg: 204,
        moisturePercent: 25,
        organicMatterPercent: 2.9,
      },
    ],
  },
  'proj-007': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 4.8,
        nitrogenMgKg: 270,
        moisturePercent: 38,
        organicMatterPercent: 6.2,
      },
      {
        date: '2026-01-15',
        ph: 5.1,
        nitrogenMgKg: 294,
        moisturePercent: 42,
        organicMatterPercent: 6.8,
      },
    ],
  },
  'proj-008': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 5.8,
        nitrogenMgKg: 92,
        moisturePercent: 21,
        organicMatterPercent: 1.9,
      },
      {
        date: '2026-01-15',
        ph: 6.0,
        nitrogenMgKg: 117,
        moisturePercent: 24,
        organicMatterPercent: 2.4,
      },
    ],
  },
  'proj-009': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 5.7,
        nitrogenMgKg: 132,
        moisturePercent: 14,
        organicMatterPercent: 1.6,
      },
      {
        date: '2026-01-15',
        ph: 6.1,
        nitrogenMgKg: 174,
        moisturePercent: 18,
        organicMatterPercent: 2.3,
      },
    ],
  },
  'proj-010': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 6.6,
        nitrogenMgKg: 245,
        moisturePercent: 34,
        organicMatterPercent: 4.2,
      },
      {
        date: '2026-01-15',
        ph: 6.8,
        nitrogenMgKg: 272,
        moisturePercent: 38,
        organicMatterPercent: 4.8,
      },
    ],
  },
  'proj-011': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 6.3,
        nitrogenMgKg: 205,
        moisturePercent: 24,
        organicMatterPercent: 2.9,
      },
      {
        date: '2026-01-15',
        ph: 6.6,
        nitrogenMgKg: 241,
        moisturePercent: 29,
        organicMatterPercent: 3.7,
      },
    ],
  },
  'proj-012': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 6.0,
        nitrogenMgKg: 225,
        moisturePercent: 30,
        organicMatterPercent: 3.2,
      },
      {
        date: '2026-01-15',
        ph: 6.3,
        nitrogenMgKg: 251,
        moisturePercent: 34,
        organicMatterPercent: 3.8,
      },
    ],
  },
  'proj-013': {
    source: 'Illustrative field-team sample',
    isSampleData: true,
    readings: [
      {
        date: '2024-01-15',
        ph: 5.5,
        nitrogenMgKg: 175,
        moisturePercent: 22,
        organicMatterPercent: 2.4,
      },
      {
        date: '2026-01-15',
        ph: 5.9,
        nitrogenMgKg: 209,
        moisturePercent: 26,
        organicMatterPercent: 3.1,
      },
    ],
  },
};

export function getMockProjectSoilHealthData(projectId: string): ProjectSoilHealthData | null {
  return sampleSoilHealthByProject[projectId] ?? null;
}
