import { describe, expect, it } from 'vitest';
import { generateComplianceBundle } from '@/lib/services/compliance-reporting';
import { forecastCarbonCreditPrice } from '@/lib/services/price-forecasting';
import { createCommunityPool, joinCommunityPool } from '@/lib/services/community-offset-pools';
import { listFarmerCredentials } from '@/lib/services/farmer-certifications';

describe('issues 1435-1438 domain services', () => {
  it('calculates net emissions and carbon tax across regulatory reports', () => {
    const bundle = generateComplianceBundle({
      buyerId: 'buyer-1',
      reportingPeriodStart: '2026-01-01',
      reportingPeriodEnd: '2026-12-31',
      emissionsTonnes: 100,
      offsetsTonnes: 60,
      carbonTaxRate: 25,
    });
    expect(bundle.reports).toHaveLength(3);
    expect(bundle.totals.netEmissionsTonnes).toBe(40);
    expect(bundle.reports.find((report) => report.regime === 'CARBON_TAX')?.carbonTaxDue).toBe(
      1000
    );
  });
  it('produces a bounded 3-12 month forecast with uncertainty bands', () => {
    const forecast = forecastCarbonCreditPrice({
      currentPrice: 40,
      supplyGrowthPercent: 2,
      demandGrowthPercent: 8,
      policyMomentum: 0.5,
      horizonMonths: 6,
    });
    expect(forecast.points).toHaveLength(6);
    expect(
      forecast.points.every(
        (point) =>
          point.lowerBound <= point.predictedPrice && point.predictedPrice <= point.upperBound
      )
    ).toBe(true);
  });
  it('allocates a funded community pool proportionally', () => {
    const created = createCommunityPool({
      name: 'Neighbourhood pool',
      creditProject: 'Project A',
      targetAmount: 100,
      pricePerCredit: 10,
      creatorWallet: 'GABC1',
      initialContribution: 40,
    });
    const funded = joinCommunityPool({ poolId: created.id, wallet: 'GABC2', amount: 60 });
    expect(funded.status).toBe('funded');
    expect(funded.members.map((member) => member.creditsAllocated)).toEqual([4, 6]);
  });
  it('filters farmers who hold every requested credential', () => {
    expect(
      listFarmerCredentials(['organic', 'regenerative']).map((credential) => credential.farmerId)
    ).toEqual(['farmer_001']);
  });
});
