import { useCallback, useEffect, useState } from 'react';

type AnalyticsTimeRange = '1M' | '6M' | '1Y' | 'ALL';

export interface ProjectImpactData {
  range: AnalyticsTimeRange;
  generatedAt: string;
  stats: {
    totalCO2Offset: number;
    totalTreesPlanted: number;
    activePlanters: number;
    survivalRate: number;
  };
  historicalData: {
    lastMonth: {
      totalCO2Offset: number;
      totalTreesPlanted: number;
      activePlanters: number;
      survivalRate: number;
    };
    lastSixMonths: {
      totalCO2Offset: number;
      totalTreesPlanted: number;
      activePlanters: number;
      survivalRate: number;
    };
    lastYear: {
      totalCO2Offset: number;
      totalTreesPlanted: number;
      activePlanters: number;
      survivalRate: number;
    };
  };
}

export function useProjectImpact(range: AnalyticsTimeRange) {
  const [data, setData] = useState<ProjectImpactData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setIsLoading(true);
    setError(null);

    const response: ProjectImpactData = {
      range,
      generatedAt: new Date().toISOString(),
      stats: {
        totalCO2Offset:
          range === 'ALL' ? 6_856 : range === '1Y' ? 6_000 : range === '6M' ? 2_800 : 600,
        totalTreesPlanted:
          range === 'ALL' ? 142_850 : range === '1Y' ? 120_000 : range === '6M' ? 60_000 : 15_000,
        activePlanters:
          range === 'ALL' ? 1_250 : range === '1Y' ? 1_100 : range === '6M' ? 850 : 200,
        survivalRate: range === 'ALL' ? 87.5 : range === '1Y' ? 85.2 : range === '6M' ? 83.0 : 80.0,
      },
      historicalData: {
        lastMonth: {
          totalCO2Offset: 480,
          totalTreesPlanted: 8_500,
          activePlanters: 180,
          survivalRate: 82.0,
        },
        lastSixMonths: {
          totalCO2Offset: 2_400,
          totalTreesPlanted: 42_500,
          activePlanters: 600,
          survivalRate: 85.5,
        },
        lastYear: {
          totalCO2Offset: 5_200,
          totalTreesPlanted: 94_000,
          activePlanters: 1_050,
          survivalRate: 86.0,
        },
      },
    };

    setData(response);
    setIsLoading(false);
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
