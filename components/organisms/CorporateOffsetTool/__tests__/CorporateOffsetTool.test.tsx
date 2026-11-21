import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CorporateOffsetTool } from '../CorporateOffsetTool';

const WALLET = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

const mockProgram = {
  id: 'prog-1',
  companyName: 'GreenTech Labs',
  companyEmail: 'esg@greentech.io',
  walletAddress: WALLET,
  annualTargetTco2e: 1200,
  autoPurchase: true,
  monthlyBudgetCap: 2500,
  preferredProjects: ['PROJ-AMZ-001'],
  preferredTypes: ['reforestation'],
  netZeroPledge: true,
  targetYear: 2030,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('CorporateOffsetTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enrolls a company, runs an auto-purchase cycle, and generates a monthly report', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url === '/api/offset-program' && method === 'POST') {
        return new Response(JSON.stringify({ program: mockProgram }), { status: 201 });
      }

      if (url.startsWith('/api/offset-program?wallet=') && url.includes('report=1')) {
        return new Response(
          JSON.stringify({
            program: mockProgram,
            progress: { cumulative: 135, pctOfTarget: 11.25 },
            report: {
              programId: 'prog-1',
              period: '2026-06-01',
              tonnesPurchased: 135,
              tonnesCumulative: 135,
              targetRemaining: 1065,
              pctOfTarget: 11.25,
              amountSpent: 2497.5,
              projectsSupported: [{ projectId: 'PROJ-AMZ-001', tonnes: 135 }],
              coBenefits: ['reforestation'],
              onTrack: true,
            },
          }),
          { status: 200 }
        );
      }

      if (url.startsWith('/api/offset-program?wallet=') && method === 'GET') {
        return new Response(
          JSON.stringify({
            program: mockProgram,
            progress: { cumulative: 135, pctOfTarget: 11.25, remaining: 1065 },
          }),
          { status: 200 }
        );
      }

      if (url === '/api/offset-program' && method === 'PUT') {
        return new Response(
          JSON.stringify({
            run: {
              programId: 'prog-1',
              purchasedTco2e: 135,
              spent: 2497.5,
              purchases: [
                {
                  projectId: 'PROJ-AMZ-001',
                  quantityTco2e: 135,
                  unitPrice: 18.5,
                  totalPrice: 2497.5,
                  automated: true,
                },
              ],
              remainingToTarget: 1065,
              targetMet: false,
            },
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    });

    render(<CorporateOffsetTool />);

    // 1. Enroll company target
    fireEvent.change(screen.getByLabelText(/Company Name/i), {
      target: { value: 'GreenTech Labs' },
    });
    fireEvent.change(screen.getByLabelText(/ESG Contact Email/i), {
      target: { value: 'esg@greentech.io' },
    });
    fireEvent.change(screen.getByLabelText(/Stellar Wallet Address/i), {
      target: { value: WALLET },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Offset Target & Program/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Carbon offset target and auto-purchase configuration saved/i)
      ).toBeTruthy();
    });

    // 2. Run auto-purchase cycle
    fireEvent.click(screen.getByRole('tab', { name: /2\. Auto-Purchase Engine/i }));
    fireEvent.click(screen.getByRole('button', { name: /Run Auto-Purchase Cycle/i }));

    await waitFor(() => {
      expect(screen.getByText(/Latest Auto-Purchase Run Summary/i)).toBeTruthy();
      expect(screen.getByText(/135\.00 tCO2e/i)).toBeTruthy();
    });

    // 3. Generate monthly ESG report
    fireEvent.click(screen.getByRole('tab', { name: /3\. Monthly Reports & Docs/i }));
    fireEvent.click(screen.getByRole('button', { name: /Generate Monthly Report/i }));

    await waitFor(() => {
      expect(screen.getByText(/Monthly Report — 2026-06/i)).toBeTruthy();
      expect(screen.getByRole('button', { name: /Markdown \(\.md\)/i })).toBeTruthy();
      expect(screen.getByRole('button', { name: /CSV \(\.csv\)/i })).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalled();
  });
});
