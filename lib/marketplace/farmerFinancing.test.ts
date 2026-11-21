import { describe, it, expect } from 'vitest';
import { getFarmerCreditLines, applyForLandPrepCredit } from '@/lib/marketplace/farmerFinancing';

describe('Farmer Financing - Credit Lines for Land Prep (#1352)', () => {
  it('returns mock credit lines with 0% interest and repayment from carbon credits', () => {
    const lines = getFarmerCreditLines();
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0].interestRate).toBe(0.0);
    expect(lines[0].repaymentTerms).toContain('carbon credit');
  });

  it('allows applying for a new land prep credit line at 0% interest', () => {
    const newLine = applyForLandPrepCredit({
      farmerId: 'farmer-test',
      farmerName: 'Test Farmer',
      projectName: 'Test Land Prep Project',
      location: 'Kenya',
      requestedAmount: 2000,
      carbonProjectLinkedId: 'listing-005',
    });

    expect(newLine.approvedAmount).toBe(2000);
    expect(newLine.interestRate).toBe(0.0);
    expect(newLine.status).toBe('Active');

    const farmerLines = getFarmerCreditLines('farmer-test');
    expect(farmerLines.length).toBe(1);
    expect(farmerLines[0].id).toBe(newLine.id);
  });
});
