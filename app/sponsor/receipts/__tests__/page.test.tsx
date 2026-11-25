import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SponsorReceiptsPage from '../page';
import { INITIAL_TAX_EXEMPT_RECEIPTS } from '@/lib/sponsor-receipts';
import * as pdfModule from '@/lib/sponsor-receipt-pdf';

describe('SponsorReceiptsPage', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL, init?: RequestInit) => {
        const url = String(input);

        if (url.includes('/api/sponsor/receipts') && init?.method === 'POST') {
          const body = JSON.parse(init.body as string);
          const newReceipt = {
            ...INITIAL_TAX_EXEMPT_RECEIPTS[0],
            id: 'rcpt_2026_new',
            receiptNumber: 'FC-TEIR-2026-9999',
            benefactor: {
              ...INITIAL_TAX_EXEMPT_RECEIPTS[0].benefactor,
              organizationName: body.benefactorName,
              walletAddress: body.walletAddress,
            },
            endowment: {
              ...INITIAL_TAX_EXEMPT_RECEIPTS[0].endowment,
              fiatValueUsd: body.amountUsd,
            },
          };
          return Promise.resolve({
            ok: true,
            status: 201,
            json: () => Promise.resolve({ receipt: newReceipt }),
          } as Response);
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              receipts: INITIAL_TAX_EXEMPT_RECEIPTS,
              totalCount: INITIAL_TAX_EXEMPT_RECEIPTS.length,
            }),
        } as Response);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders page header, 501(c)(3) badge, and KPI impact summary cards', async () => {
    render(<SponsorReceiptsPage />);

    expect(
      screen.getByRole('heading', { name: /Corporate Tax-Exempt Impact Receipts/i })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/TOTAL TAX DEDUCTIONS/i)).toBeInTheDocument();
      expect(screen.getByText(/CARBON IMPACT FUNDED/i)).toBeInTheDocument();
      expect(screen.getByText(/STEWARDS REWARDED/i)).toBeInTheDocument();
      expect(screen.getByText(/100% Sealed/i)).toBeInTheDocument();
    });
  });

  it('displays the list of audited receipts with steward reward distributions', async () => {
    render(<SponsorReceiptsPage />);

    await waitFor(() => {
      expect(screen.getByText('FC-TEIR-2026-1819')).toBeInTheDocument();
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
      expect(screen.getByText('FC-TEIR-2026-1820')).toBeInTheDocument();
      expect(screen.getByText('Apex Logistics Global')).toBeInTheDocument();
    });

    // Check steward badges
    expect(screen.getAllByText(/Farmers 55%/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Urban 20%/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Schools 15%/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Verifiers 10%/i).length).toBeGreaterThan(0);
  });

  it('filters receipts by tax year', async () => {
    render(<SponsorReceiptsPage />);

    await waitFor(() => {
      expect(screen.getByText('FC-TEIR-2026-1819')).toBeInTheDocument();
    });

    const taxYearSelect = screen.getByLabelText(/Filter receipts by tax year/i);
    fireEvent.change(taxYearSelect, { target: { value: '2025' } });

    await waitFor(() => {
      expect(screen.queryByText('FC-TEIR-2026-1819')).not.toBeInTheDocument();
      expect(screen.getByText('FC-TEIR-2025-0911')).toBeInTheDocument();
    });
  });

  it('filters receipts by search query', async () => {
    render(<SponsorReceiptsPage />);

    await waitFor(() => {
      expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    });

    const searchInput = screen.getByLabelText(/Search receipts/i);
    fireEvent.change(searchInput, { target: { value: 'Apex' } });

    await waitFor(() => {
      expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument();
      expect(screen.getByText('Apex Logistics Global')).toBeInTheDocument();
    });
  });

  it('triggers PDF download and displays an accessible user-facing UI notification', async () => {
    const downloadSpy = vi
      .spyOn(pdfModule, 'downloadTaxExemptReceiptPdf')
      .mockImplementation(() => {});

    render(<SponsorReceiptsPage />);

    await waitFor(() => {
      expect(screen.getByText('FC-TEIR-2026-1819')).toBeInTheDocument();
    });

    const pdfButtons = screen.getAllByRole('button', { name: /PDF/i });
    fireEvent.click(pdfButtons[0]);

    expect(downloadSpy).toHaveBeenCalled();

    await waitFor(() => {
      const statusAlert = screen.getByRole('status');
      expect(statusAlert).toBeInTheDocument();
      expect(statusAlert).toHaveTextContent(/Official tax-exempt impact receipt/i);
      expect(statusAlert).toHaveTextContent(/downloaded/i);
    });
  });

  it('opens Cryptographic Audit Proof modal and shows SHA-256 digest', async () => {
    render(<SponsorReceiptsPage />);

    await waitFor(() => {
      expect(screen.getByText('FC-TEIR-2026-1819')).toBeInTheDocument();
    });

    const proofButtons = screen.getAllByRole('button', { name: /Proof/i });
    fireEvent.click(proofButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Audited On-Chain Cryptographic Proof/i)).toBeInTheDocument();
      expect(screen.getByText(/CANONICAL SHA-256 DIGEST/i)).toBeInTheDocument();
      expect(screen.getByText(/View on Stellar Explorer/i)).toBeInTheDocument();
    });
  });

  it('opens Steward Rewards modal and shows farmer and non-farmer distribution details', async () => {
    render(<SponsorReceiptsPage />);

    await waitFor(() => {
      expect(screen.getByText('FC-TEIR-2026-1819')).toBeInTheDocument();
    });

    const farmerButtons = screen.getAllByText(/Farmers 55%/i);
    fireEvent.click(farmerButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Steward Allocation: FC-TEIR-2026-1819/i)).toBeInTheDocument();
      expect(screen.getByText(/Smallholder & Regenerative Farmers/i)).toBeInTheDocument();
      expect(screen.getByText(/Urban Planters & Micro-Nurseries/i)).toBeInTheDocument();
      expect(screen.getByText(/Community Schools & Youth Guilds/i)).toBeInTheDocument();
      expect(screen.getByText(/Decentralized Verifiers & Field Auditors/i)).toBeInTheDocument();
    });
  });

  it('validates Stellar wallet address with console warning and accessible error message on invalid input', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(<SponsorReceiptsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Issue Tax Receipt/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Issue Tax Receipt/i }));

    const walletInput = screen.getByLabelText(/Stellar Wallet Address/i);
    fireEvent.change(walletInput, { target: { value: 'invalid-wallet-format' } });

    fireEvent.click(screen.getByRole('button', { name: /Generate & Download PDF/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/Please enter a valid Stellar Ed25519 public key/i);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[sponsor-receipts] Invalid wallet address entered')
      );
    });
  });

  it('successfully issues a receipt and adds it to the list', async () => {
    const downloadSpy = vi
      .spyOn(pdfModule, 'downloadTaxExemptReceiptPdf')
      .mockImplementation(() => {});

    render(<SponsorReceiptsPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Issue Tax Receipt/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Issue Tax Receipt/i }));

    const nameInput = screen.getByLabelText(/Corporate Benefactor Name/i);
    fireEvent.change(nameInput, { target: { value: 'Global Green Enterprises' } });

    fireEvent.click(screen.getByRole('button', { name: /Generate & Download PDF/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/issued and sealed on Stellar ledger/i);
      expect(downloadSpy).toHaveBeenCalled();
      expect(screen.getByText('Global Green Enterprises')).toBeInTheDocument();
    });
  });
});
