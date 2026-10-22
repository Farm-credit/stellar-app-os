'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { enrichHolding } from '@/lib/credits/portfolio';
import type { OwnedCredit, PortfolioStats, PriceCache } from '@/lib/types/credits';

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Renewal window (in days) within which a certification renewal is considered "due soon"
const RENEWAL_DUE_SOON_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface CertificationSummary {
  verifiedCount: number;
  pendingCount: number;
  unverifiedCount: number;
  renewalsDueSoon: number;
  renewalsOverdue: number;
  lastVerifiedAt: number | null;
}

export function useCreditPortfolio(publicKey: string | null) {
  const [credits, setCredits] = useState<OwnedCredit[]>([]);
  const [stats, setStats] = useState<PortfolioStats>({
    totalCredits: 0,
    totalCost: 0,
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

    if (typeof window !== 'undefined') {
      const refreshFlag = window.localStorage.getItem('portfolio_refresh');
      if (refreshFlag) {
        const refreshTimestamp = Number.parseInt(refreshFlag, 10);
        if (!Number.isNaN(refreshTimestamp) && refreshTimestamp > lastFetchRef.current) {
          lastFetchRef.current = 0;
        }
        window.localStorage.removeItem('portfolio_refresh');
      }
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
            totalCost: 0,
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
      const balances: OwnedCredit[] = [];
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

        const holding: OwnedCredit = enrichHolding({
          projectId,
          projectName: getProjectName(projectId),
          quantity,
          vintage,
          status,
          pricePerTon: price,
          totalValue: quantity * price,
          assetCode,
          issuer: balance.asset_issuer || '',
        });

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
        totalCost: balances.reduce((sum, c) => sum + c.purchaseCost, 0),
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

  // Derived certification summary for the portfolio UI
  const certificationSummary = useMemo<CertificationSummary>(() => {
    const now = Date.now();
    const dueSoonThreshold = now + RENEWAL_DUE_SOON_DAYS * MS_PER_DAY;

    let verifiedCount = 0;
    let pendingCount = 0;
    let unverifiedCount = 0;
    let renewalsDueSoon = 0;
    let renewalsOverdue = 0;
    let lastVerifiedAt: number | null = null;

    for (const credit of credits) {
      switch (credit.certificationStatus) {
        case 'verified':
          verifiedCount++;
          break;
        case 'pending':
          pendingCount++;
          break;
        default:
          unverifiedCount++;
          break;
      }

      if (credit.certificationVerifiedAt) {
        if (lastVerifiedAt === null || credit.certificationVerifiedAt > lastVerifiedAt) {
          lastVerifiedAt = credit.certificationVerifiedAt;
        }
      }

      const renewalAt = credit.certificationRenewalAt;
      if (typeof renewalAt === 'number' && renewalAt > 0) {
        if (renewalAt < now) {
          renewalsOverdue++;
        } else if (renewalAt <= dueSoonThreshold) {
          renewalsDueSoon++;
        }
      }
    }

    return {
      verifiedCount,
      pendingCount,
      unverifiedCount,
      renewalsDueSoon,
      renewalsOverdue,
      lastVerifiedAt,
    };
  }, [credits]);

  return {
    credits,
    stats,
    isLoading,
    error,
    refreshPortfolio,
    certificationSummary,
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
