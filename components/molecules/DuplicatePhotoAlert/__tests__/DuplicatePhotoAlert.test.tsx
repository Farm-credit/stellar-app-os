import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DuplicatePhotoAlert } from '../DuplicatePhotoAlert';
import { MilestoneVerificationForm } from '@/components/organisms/MilestoneVerificationForm/MilestoneVerificationForm';
import { LOCAL_PHASH_STORAGE_KEY, recordLocalPhotoHash } from '@/lib/image/client-phash';
import { PHASH_RESIZE, computePHashFromGrayscale } from '@/lib/image/dct-core';
import type { PHashHex } from '@/lib/image/dct-core';

describe('DuplicatePhotoAlert & MilestoneVerificationForm pHash accessibility', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    window.localStorage.removeItem(LOCAL_PHASH_STORAGE_KEY);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('renders an assertive alert region with similarity stats and invokes onReplacePhoto', () => {
    const onReplace = vi.fn();
    render(
      <DuplicatePhotoAlert
        flag={{
          hash: '9a3f0e8c7b1d4256' as PHashHex,
          distance: 2,
          threshold: 5,
          similarityScore: 62 / 64,
          source: 'server-dedup',
          duplicateId: 404,
        }}
        onReplacePhoto={onReplace}
      />
    );

    const alert = screen.getByTestId('duplicate-photo-alert');
    expect(alert).toHaveAttribute('role', 'alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert.textContent).toContain('96.9% match (2 bits)');
    expect(alert.textContent).toContain('Ref: #404');

    fireEvent.click(
      screen.getByRole('button', { name: /choose a different original planting photo/i })
    );
    expect(onReplace).toHaveBeenCalledTimes(1);
  });

  it('blocks MilestoneVerificationForm submission when a reused field photo is selected', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onError = vi.fn();
    const matrix = new Float64Array(PHASH_RESIZE * PHASH_RESIZE);
    for (let i = 0; i < matrix.length; i++) {
      matrix[i] = (i * 17) % 256;
    }
    const existingHash = computePHashFromGrayscale(matrix);
    recordLocalPhotoHash({
      hash: existingHash.hex,
      entityType: 'tree',
      entityId: 'loan-prev',
      storageRef: 'escrow:prev',
    });

    globalThis.fetch = vi.fn() as unknown as typeof fetch;

    render(
      <MilestoneVerificationForm
        loanId="loan-99"
        farmerWalletAddress="GCFARMEREXAMPLE"
        escrowSecretKey="SESCROWEXAMPLE"
        totalAmountUsdc={1000}
        network="testnet"
        onError={onError}
        decodeToGrayscale={() => Promise.resolve(matrix)}
      />
    );

    const uploadInput = screen.getByLabelText('Upload field photo');
    const duplicateFile = new File(['duplicate-jpeg'], 'reused-field.jpg', {
      type: 'image/jpeg',
    });
    fireEvent.change(uploadInput, { target: { files: [duplicateFile] } });

    const alert = await screen.findByTestId('duplicate-photo-alert');
    expect(alert).toBeInTheDocument();
    expect(onError).toHaveBeenCalledWith('Duplicate or reused field photo detected.');

    const submitButton = screen.getByRole('button', {
      name: /submit verification and release funds/i,
    });
    expect(submitButton).toBeDisabled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
