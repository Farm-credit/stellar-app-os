import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Keypair } from '@stellar/stellar-sdk';

const { exifrParseMock } = vi.hoisted(() => ({
  exifrParseMock: vi.fn(),
}));

vi.mock('exifr', () => ({
  default: {
    parse: exifrParseMock,
  },
}));

import { FarmerVerificationPortal } from '../FarmerVerificationPortal';
import { LOCAL_PHASH_STORAGE_KEY, recordLocalPhotoHash } from '@/lib/image/client-phash';
import { PHASH_RESIZE, computePHashFromGrayscale } from '@/lib/image/dct-core';

function makeDistinctMatrix(seed: 'alpha' | 'beta'): Float64Array {
  const out = new Float64Array(PHASH_RESIZE * PHASH_RESIZE);
  for (let y = 0; y < PHASH_RESIZE; y++) {
    for (let x = 0; x < PHASH_RESIZE; x++) {
      out[y * PHASH_RESIZE + x] =
        seed === 'alpha'
          ? Math.floor((x * 255) / (PHASH_RESIZE - 1))
          : (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0
            ? 20
            : 235;
    }
  }
  return out;
}

describe('FarmerVerificationPortal perceptual hash UI & accessibility integration', () => {
  const originalFetch = globalThis.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;

  beforeEach(() => {
    window.localStorage.removeItem(LOCAL_PHASH_STORAGE_KEY);
    exifrParseMock.mockResolvedValue({
      latitude: 12.1542,
      longitude: 9.3491,
    });
    URL.createObjectURL = vi.fn(() => 'blob:mock-preview-url');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('flags a duplicate photo immediately on selection with console.warn and an accessible role="alert" banner', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const reusedMatrix = makeDistinctMatrix('alpha');
    const reusedHash = computePHashFromGrayscale(reusedMatrix);

    recordLocalPhotoHash({
      hash: reusedHash.hex,
      entityType: 'tree',
      entityId: 'na-001',
      storageRef: 'bafy-existing-99',
    });

    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    render(<FarmerVerificationPortal decodeToGrayscale={() => Promise.resolve(reusedMatrix)} />);

    const stellarAddress = Keypair.random().publicKey();
    fireEvent.change(screen.getByPlaceholderText('G...'), {
      target: { value: stellarAddress },
    });
    fireEvent.change(screen.getByLabelText('Planting assignment'), {
      target: { value: 'na-001' },
    });

    const fileInput = screen.getByLabelText('Upload planting proof photo');
    const reusedFile = new File(['reused-bytes'], 'stock-photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [reusedFile] } });

    const alertBanner = await screen.findByTestId('duplicate-photo-alert');
    expect(alertBanner).toHaveAttribute('role', 'alert');
    expect(alertBanner).toHaveAttribute('aria-live', 'assertive');
    expect(alertBanner.textContent).toContain(reusedHash.hex);

    const submitButton = screen.getByRole('button', { name: /submit verification/i });
    expect(submitButton).toBeDisabled();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[pHash:upload-pipeline]'),
      expect.objectContaining({ hash: reusedHash.hex })
    );
  });

  it('verifies a unique planting photo via pHash, uploads to IPFS, and caches the hash locally', async () => {
    const uniqueMatrix = makeDistinctMatrix('beta');
    const uniqueHash = computePHashFromGrayscale(uniqueMatrix);

    globalThis.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/planting/photo/dedup-check')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              hash: uniqueHash.hex,
              population: uniqueHash.population,
              threshold: 5,
              isDuplicate: false,
              match: null,
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            ipfsCid: 'bafy-new-planting-proof',
            ipfsUrl: 'ipfs://bafy-new-planting-proof',
            gatewayUrl: 'https://gateway.pinata.cloud/ipfs/bafy-new-planting-proof',
            hash: uniqueHash.hex,
          }),
      } as Response);
    }) as unknown as typeof fetch;

    render(<FarmerVerificationPortal decodeToGrayscale={() => Promise.resolve(uniqueMatrix)} />);

    const stellarAddress = Keypair.random().publicKey();
    fireEvent.change(screen.getByPlaceholderText('G...'), {
      target: { value: stellarAddress },
    });
    fireEvent.change(screen.getByLabelText('Planting assignment'), {
      target: { value: 'na-002' },
    });

    const fileInput = screen.getByLabelText('Upload planting proof photo');
    const freshFile = new File(['fresh-bytes'], 'field-proof.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [freshFile] } });

    await screen.findByText(/originality verified via phash/i);
    expect(screen.getByText(uniqueHash.hex)).toBeInTheDocument();

    const submitButton = screen.getByRole('button', { name: /submit verification/i });
    await waitFor(() => expect(submitButton).not.toBeDisabled());

    fireEvent.click(submitButton);

    await screen.findByText(/photo uploaded!/i);
    expect(screen.getByText('bafy-new-planting-proof')).toBeInTheDocument();
    expect(screen.getByText(uniqueHash.hex)).toBeInTheDocument();
  });
});
