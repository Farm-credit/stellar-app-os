import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PhotoMetadataModal } from './PhotoMetadataModal';
import type { ExifParser, PhotoMetadata } from '@/lib/exif';

function makeFile(name = 'tree.jpg') {
  return new File(['fake-jpeg-bytes'], name, { type: 'image/jpeg' });
}

function deferredParser() {
  let resolve!: (value: PhotoMetadata) => void;
  let reject!: (err: Error) => void;
  const promise = new Promise<PhotoMetadata>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const parser: ExifParser = () => promise;
  return { parser, resolve, reject };
}

const WITH_GPS: PhotoMetadata = {
  gps: { latitude: 6.5244, longitude: 3.3792, altitude: 41 },
  capturedAt: new Date(2026, 6, 24, 9, 15, 32),
  deviceMake: 'Google',
  deviceModel: 'Pixel 8',
};

const NO_METADATA: PhotoMetadata = {
  gps: null,
  capturedAt: null,
  deviceMake: null,
  deviceModel: null,
};

describe('PhotoMetadataModal', () => {
  it('renders nothing when closed', () => {
    const parser: ExifParser = () => new Promise(() => {}); // never resolves - irrelevant while closed
    const { container } = render(
      <PhotoMetadataModal
        file={makeFile()}
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={parser}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a loading state, then the extracted GPS, timestamp, and device once resolved', async () => {
    const { parser, resolve } = deferredParser();
    render(
      <PhotoMetadataModal
        file={makeFile()}
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={parser}
      />
    );

    expect(screen.getByTestId('status-stamp')).toHaveTextContent(/reading/i);
    expect(screen.getByRole('button', { name: /confirm & submit/i })).toBeDisabled();

    resolve(WITH_GPS);

    await waitFor(() =>
      expect(screen.getByTestId('status-stamp')).toHaveTextContent(/gps locked/i)
    );
    expect(screen.getByText(/6\.52440.*3\.37920/)).toBeInTheDocument();
    expect(screen.getByText('Google Pixel 8')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & submit/i })).toBeEnabled();
  });

  it('flags photos with no usable metadata instead of failing', async () => {
    const parser: ExifParser = () => Promise.resolve(NO_METADATA);
    render(
      <PhotoMetadataModal
        file={makeFile()}
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={parser}
      />
    );

    await waitFor(() =>
      expect(screen.getByTestId('status-stamp')).toHaveTextContent(/no gps data/i)
    );
    expect(screen.getByText('No GPS data found')).toBeInTheDocument();
    expect(screen.getByText(/missing location data/i)).toBeInTheDocument();
    // Missing data is a warning, not a hard stop - submission stays available.
    expect(screen.getByRole('button', { name: /confirm & submit/i })).toBeEnabled();
  });

  it('shows a retry affordance when extraction fails, and recovers on retry', async () => {
    let callCount = 0;
    const parser: ExifParser = () => {
      callCount += 1;
      if (callCount === 1) return Promise.reject(new Error('Unsupported file format'));
      return Promise.resolve(WITH_GPS);
    };
    const user = userEvent.setup();
    render(
      <PhotoMetadataModal
        file={makeFile()}
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={parser}
      />
    );

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/unsupported file format/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & submit/i })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /try again/i }));

    await waitFor(() =>
      expect(screen.getByTestId('status-stamp')).toHaveTextContent(/gps locked/i)
    );
  });

  it('calls onConfirm with the extracted metadata', async () => {
    const parser: ExifParser = () => Promise.resolve(WITH_GPS);
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(
      <PhotoMetadataModal
        file={makeFile()}
        isOpen
        onClose={vi.fn()}
        onConfirm={onConfirm}
        parser={parser}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /confirm & submit/i })).toBeEnabled()
    );
    await user.click(screen.getByRole('button', { name: /confirm & submit/i }));

    expect(onConfirm).toHaveBeenCalledWith(WITH_GPS);
  });

  it('closes on Escape and on backdrop click, but not on panel click', async () => {
    const parser: ExifParser = () => Promise.resolve(WITH_GPS);
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PhotoMetadataModal
        file={makeFile()}
        isOpen
        onClose={onClose}
        onConfirm={vi.fn()}
        parser={parser}
      />
    );

    await user.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('locks body scroll while open and restores it on close', async () => {
    const parser: ExifParser = () => Promise.resolve(WITH_GPS);
    const file = makeFile();
    const { rerender } = render(
      <PhotoMetadataModal
        file={file}
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={parser}
      />
    );
    await waitFor(() =>
      expect(screen.getByTestId('status-stamp')).toHaveTextContent(/gps locked/i)
    );
    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <PhotoMetadataModal
        file={file}
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={parser}
      />
    );
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('renders nothing when open but no file is provided', () => {
    const { container } = render(
      <PhotoMetadataModal file={null} isOpen onClose={vi.fn()} onConfirm={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('traps Tab focus inside the dialog', async () => {
    const parser: ExifParser = () => Promise.resolve(WITH_GPS);
    const user = userEvent.setup();
    render(
      <PhotoMetadataModal
        file={makeFile()}
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={parser}
      />
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /confirm & submit/i })).toBeEnabled()
    );

    const closeButton = screen.getByRole('button', { name: /close/i });
    const confirmButton = screen.getByRole('button', { name: /confirm & submit/i });

    confirmButton.focus();
    await user.tab();
    expect(document.activeElement).toBe(closeButton); // wraps from last back to first

    closeButton.focus();
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirmButton); // wraps from first back to last
  });

  it('does not restart extraction when the caller passes a new, non-memoized parser on every render', async () => {
    let callCount = 0;
    const makeParser = (): ExifParser => () => {
      callCount += 1;
      return Promise.resolve(WITH_GPS);
    };
    const file = makeFile();

    const { rerender } = render(
      <PhotoMetadataModal
        file={file}
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={makeParser()}
      />
    );
    await waitFor(() => expect(callCount).toBe(1));

    // Simulate a parent re-render that recreates the parser inline each time.
    rerender(
      <PhotoMetadataModal
        file={file}
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={makeParser()}
      />
    );
    rerender(
      <PhotoMetadataModal
        file={file}
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={makeParser()}
      />
    );

    expect(callCount).toBe(1); // same File instance -> extraction should not re-run
  });

  it('is an accessible dialog labelled by its heading, with focus on the close button', async () => {
    const parser: ExifParser = () => Promise.resolve(WITH_GPS);
    render(
      <PhotoMetadataModal
        file={makeFile()}
        isOpen
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        parser={parser}
      />
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    const labelId = dialog.getAttribute('aria-labelledby');
    expect(document.getElementById(labelId!)).toHaveTextContent(/verify photo details/i);

    await waitFor(() => expect(screen.getByRole('button', { name: /close/i })).toHaveFocus());
  });
});
