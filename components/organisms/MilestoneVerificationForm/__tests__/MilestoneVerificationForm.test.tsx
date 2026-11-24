import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MilestoneErrorBoundary } from '@/components/organisms/MilestoneErrorBoundary';
import { MilestoneVerificationForm } from '../MilestoneVerificationForm';
import { LOCAL_PHASH_STORAGE_KEY } from '@/lib/image/client-phash';
import { PHASH_RESIZE } from '@/lib/image/dct-core';

describe('MilestoneVerificationForm & MilestoneErrorBoundary', () => {
  const originalFetch = globalThis.fetch;
  const originalGeolocation = navigator.geolocation;

  beforeEach(() => {
    window.localStorage.removeItem(LOCAL_PHASH_STORAGE_KEY);
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              latitude: 11.99,
              longitude: 8.52,
              accuracy: 10,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: Date.now(),
            toJSON: () => ({}),
          } as GeolocationPosition),
      },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: originalGeolocation,
    });
  });

  it('displays 98%/2% split preview, transitions through grace period, handles error & finalizes payout', async () => {
    const gracePeriodEndsAt = '2026-11-30T00:00:00.000Z';
    let finalizeCalls = 0;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (
        url.includes('/api/planting/photo/dedup-check') ||
        url.includes('/api/image/check-duplicate')
      ) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ isDuplicate: false }),
        });
      }
      if (url.includes('/api/escrow/release')) {
        return Promise.resolve({
          ok: true,
          status: 202,
          json: () =>
            Promise.resolve({
              transactionHash: '',
              releasedAmountUsdc: 750,
              farmerWalletAddress: 'GFARMER',
              farmerPayoutUsdc: 735,
              verifierWalletAddress: 'GVERIFIER',
              verifierRewardUsdc: 15,
              gracePeriodEndsAt,
              finalizationStatus: 'pending_grace',
              explorerUrl: '',
            }),
        });
      }
      if (url.includes('/api/escrow/finalize')) {
        finalizeCalls += 1;
        if (finalizeCalls === 1) {
          return Promise.resolve({
            ok: false,
            status: 409,
            json: () => Promise.resolve({ error: 'Grace period has not expired yet' }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              finalization: {
                transactionHash: 'tx-fin-ok',
                explorerUrl: 'https://stellar.expert/explorer/testnet/tx/tx-fin-ok',
                totalDisbursementUsdc: 750,
                farmerWalletAddress: 'GFARMER',
                approvingVerifierAddress: 'GVERIFIER',
                gracePeriodEndsAt,
                split: { farmerPayoutUsdc: 735, verifierRewardUsdc: 15 },
              },
            }),
        });
      }
      return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const matrix = new Float64Array(PHASH_RESIZE * PHASH_RESIZE).fill(42);

    render(
      <MilestoneVerificationForm
        loanId="loan-ui-1930"
        farmerWalletAddress="GFARMER"
        verifierWalletAddress="GVERIFIER"
        gracePeriodEndsAt={gracePeriodEndsAt}
        escrowSecretKey="SESCROW"
        totalAmountUsdc={1000}
        network="testnet"
        decodeToGrayscale={() => Promise.resolve(matrix)}
      />
    );

    expect(screen.getByText('Farmer Net (98%)')).toBeInTheDocument();
    expect(screen.getByText('735.00 USDC')).toBeInTheDocument();
    expect(screen.getByText('Verifier Reward (2%)')).toBeInTheDocument();
    expect(screen.getByText('15.00 USDC')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /capture current gps location/i }));
    const file = new File(['original-jpeg'], 'field.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText('Upload field photo'), { target: { files: [file] } });

    const submitBtn = screen.getByRole('button', {
      name: /submit verification and release funds/i,
    });
    await waitFor(() => expect(submitBtn).toBeEnabled());
    fireEvent.click(submitBtn);

    await screen.findByText('Grace Period Active');

    // First finalize attempt fails (grace still active) and renders alert
    fireEvent.click(screen.getByRole('button', { name: /finalize milestone payout/i }));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Grace period has not expired yet');

    // Retry succeeds and shows verifier reward confirmation
    fireEvent.click(screen.getByRole('button', { name: /finalize milestone payout/i }));
    await screen.findByText('Funds Released!');
    expect(screen.getByText(/15\.00 USDC/)).toBeInTheDocument();
  });

  it('catches rendering errors inside MilestoneErrorBoundary and allows recovery', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function ProblemPanel() {
      if (shouldThrow) throw new Error('Boom during payout render');
      return <div>Recovered payout view</div>;
    }

    render(
      <MilestoneErrorBoundary fallbackTitle="Payout panel crashed">
        <ProblemPanel />
      </MilestoneErrorBoundary>
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Boom during payout render');
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('Recovered payout view')).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
