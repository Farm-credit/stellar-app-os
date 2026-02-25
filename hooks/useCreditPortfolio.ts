'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CreditHolding, PortfolioStats, PriceCache } from '@/lib/types/credits';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useCreditPortfolio(publicKey: string | null) {
  const [credits, setCredits] = useState<CreditHolding[]>([]);
  const [stats, setStats] = useState<PortfolioStats>({
    totalCredits: 0,
    totalValue: 0,
    activeCredits: 0,
    retiredCredits: 0,
    lastUpdated: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cacheRef = useRef<PriceCache>({});
  const lastFetchRef = useRef<number>(0);

  const fetchCreditBalances = useCallback(async () => {
    if (!publicKey) {
      setCredits([]);
      setError('No wallet connected');
      return;
    }

    // Skip if cached data is fresh
    if (Date.now() - lastFetchRef.current < CACHE_TTL) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const horizonUrl = 'https://horizon-testnet.stellar.org';
      const response = await fetch(`${horizonUrl}/accounts/${publicKey}`);

      if (!response.ok) {
        if (response.status === 404) {
          setCredits([]);
          setStats({
            totalCredits: 0,
            totalValue: 0,
            activeCredits: 0,
            retiredCredits: 0,
            lastUpdated: Date.now(),
          });
          return;
        }
        throw new Error('Failed to fetch account balances');
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const account = (await response.json()) as any;
      const balances: CreditHolding[] = [];
      let totalValue = 0;
      let activeCount = 0;
      let retiredCount = 0;

      // Mock carbon credit detection (in production, use specific asset codes)
      for (const balance of account.balances) {
        if (balance.asset_type === 'native') continue;

        const assetCode = balance.asset_code as string;
        if (!assetCode.startsWith('CARBON')) continue;

        // Parse credit info from asset code (CARBON-PROJ-YEAR format)
        const parts = assetCode.split('-');
        const projectId = parts[1] || 'unknown';
        const vintage = parseInt(parts[2] || '2024', 10);
        const quantity = parseFloat(balance.balance);
        const isRetired = assetCode.includes('RET');
        const status = isRetired ? 'retired' : 'active';

        // Get or use cached price
        let price = 50; // Default fallback price
        if (cacheRef.current[projectId]) {
          const cached = cacheRef.current[projectId];
          if (Date.now() - cached.timestamp < CACHE_TTL) {
            price = cached.price;
          }
        }

        const holding: CreditHolding = {
          projectId,
          projectName: getProjectName(projectId),
          quantity,
          vintage,
          status,
          pricePerTon: price,
          totalValue: quantity * price,
          assetCode,
          issuer: balance.asset_issuer || '',
        };

        balances.push(holding);
        totalValue += holding.totalValue;

        if (status === 'active') {
          activeCount++;
        } else {
          retiredCount++;
        }
      }

      setCredits(balances);
      setStats({
        totalCredits: balances.reduce((sum, c) => sum + c.quantity, 0),
        totalValue,
        activeCredits: activeCount,
        retiredCredits: retiredCount,
        lastUpdated: Date.now(),
      });

      lastFetchRef.current = Date.now();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch portfolio';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (publicKey) {
      fetchCreditBalances();
      const interval = setInterval(fetchCreditBalances, CACHE_TTL);
      return () => clearInterval(interval);
    }
  }, [publicKey, fetchCreditBalances]);

  const refreshPortfolio = useCallback(async () => {
    lastFetchRef.current = 0;
    await fetchCreditBalances();
  }, [fetchCreditBalances]);

  return {
    credits,
    stats,
    isLoading,
    error,
    refreshPortfolio,
  };
}

function getProjectName(projectId: string): string {
  const projectNames: Record<string, string> = {
    'PROJ-001': 'Amazon Rainforest Reforestation',
    'PROJ-002': 'Wind Energy Farm - Texas',
    'PROJ-003': 'Solar Power Initiative - India',
    'PROJ-004': 'Mangrove Restoration - Indonesia',
    'PROJ-005': 'Sustainable Agriculture - Kenya',
  };

  return projectNames[projectId] || `Project ${projectId}`;
}
