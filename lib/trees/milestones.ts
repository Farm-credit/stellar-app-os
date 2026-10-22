export const TREE_MILESTONE_DEFINITIONS = [
  { id: 'six-months', label: '6-month milestone', months: 6 },
  { id: 'one-year', label: '1-year milestone', months: 12 },
  { id: 'five-years', label: '5-year milestone', months: 60 },
] as const;

export type TreeMilestoneDefinition = (typeof TREE_MILESTONE_DEFINITIONS)[number];

export interface ReachedTreeMilestone extends TreeMilestoneDefinition {
  reachedAt: string;
  ageYears: number;
}

/** Add calendar months while clamping to the final day of shorter months. */
function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const dayOfMonth = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(dayOfMonth, lastDay));
  return result;
}

/** Return the published anniversaries that have been reached by `asOf`. */
export function getReachedTreeMilestones(
  plantedAt?: string | Date | null,
  asOf: Date = new Date()
): ReachedTreeMilestone[] {
  if (!plantedAt) return [];
  const plantedDate = plantedAt instanceof Date ? new Date(plantedAt) : new Date(plantedAt);
  if (Number.isNaN(plantedDate.getTime()) || plantedDate > asOf) return [];

  return TREE_MILESTONE_DEFINITIONS.flatMap((milestone) => {
    const reachedDate = addCalendarMonths(plantedDate, milestone.months);
    if (reachedDate > asOf) return [];
    return [
      {
        ...milestone,
        reachedAt: reachedDate.toISOString(),
        ageYears: milestone.months / 12,
      },
    ];
  });
}
