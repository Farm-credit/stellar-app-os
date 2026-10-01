import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARTreeViewer } from './ARTreeViewer';
import { AR_PROJECTION_YEARS, buildTreeARProjection } from '@/lib/ar/projection';
import type { Tree } from '@/lib/types/tree';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children?: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const tree: Tree = {
  id: 'tree-001',
  treeId: 'HRV-2024-0001',
  species: 'Teak',
  region: 'Kano, Nigeria',
  status: 'verified',
  plantedAt: '2024-03-12T08:00:00Z',
  lat: 12.04,
  lng: 8.48,
  co2OffsetKgPerYear: 22,
  projectName: 'Northern Savanna Reforestation',
};

const projection = buildTreeARProjection(tree, { nowMs: Date.UTC(2026, 8, 1) });

function createStream() {
  const stop = vi.fn();
  return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
}

function setMediaDevices(value: unknown) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    writable: true,
    value,
  });
}

afterEach(() => {
  setMediaDevices(undefined);
  vi.restoreAllMocks();
});

describe('ARTreeViewer', () => {
  it('renders the AR heading and the growth overlay in studio preview', () => {
    render(<ARTreeViewer projection={projection} />);

    expect(screen.getByRole('heading', { name: /See your Teak at maturity/ })).toBeInTheDocument();
    expect(screen.getByTestId('ar-tree-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('ar-camera-status')).toHaveTextContent(/Start the camera/);
  });

  it('reports browser support when there is no camera API', async () => {
    setMediaDevices(undefined);
    render(<ARTreeViewer projection={projection} />);

    fireEvent.click(screen.getByRole('button', { name: /Start camera/ }));

    await waitFor(() =>
      expect(screen.getByTestId('ar-camera-status')).toHaveTextContent(
        /cannot open a camera stream/
      )
    );
  });

  it('attaches the camera stream when permission is granted', async () => {
    const { stream } = createStream();
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    setMediaDevices({ getUserMedia });

    render(<ARTreeViewer projection={projection} />);
    fireEvent.click(screen.getByRole('button', { name: /Start camera/ }));

    await waitFor(() =>
      expect(screen.getByTestId('ar-camera-status')).toHaveTextContent(/Camera live/)
    );
    expect(getUserMedia).toHaveBeenCalledWith(
      expect.objectContaining({ video: expect.objectContaining({ facingMode: 'environment' }) })
    );
  });

  it('reports a blocked camera without breaking the viewer', async () => {
    setMediaDevices({ getUserMedia: vi.fn().mockRejectedValue(new Error('denied')) });

    render(<ARTreeViewer projection={projection} />);
    fireEvent.click(screen.getByRole('button', { name: /Start camera/ }));

    await waitFor(() =>
      expect(screen.getByTestId('ar-camera-status')).toHaveTextContent(/Camera access was blocked/)
    );
    expect(screen.getByTestId('ar-tree-overlay')).toBeInTheDocument();
  });

  it('stops the camera tracks when the viewer unmounts', async () => {
    const { stream, stop } = createStream();
    setMediaDevices({ getUserMedia: vi.fn().mockResolvedValue(stream) });

    const { unmount } = render(<ARTreeViewer projection={projection} />);
    fireEvent.click(screen.getByRole('button', { name: /Start camera/ }));
    await waitFor(() =>
      expect(screen.getByTestId('ar-camera-status')).toHaveTextContent(/Camera live/)
    );

    unmount();
    expect(stop).toHaveBeenCalled();
  });

  it('only enables capture once the camera is live', async () => {
    setMediaDevices({ getUserMedia: vi.fn().mockResolvedValue(createStream().stream) });
    render(<ARTreeViewer projection={projection} />);

    const button = screen.getByRole('button', { name: /Capture photo/ });
    expect(button).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Start camera/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Capture photo/ })).toBeEnabled()
    );
  });

  it('scrubs through the 20-year projection and updates the metrics', () => {
    render(<ARTreeViewer projection={projection} />);

    const slider = screen.getByLabelText('Tree age');
    const maturityHeight = projection.timeline[AR_PROJECTION_YEARS].heightCm;

    expect(screen.getByText(`Year ${AR_PROJECTION_YEARS}`)).toBeInTheDocument();

    fireEvent.change(slider, { target: { value: '0' } });
    expect(screen.getByText('Year 0 · just planted')).toBeInTheDocument();
    expect(screen.getAllByText('0% of maturity').length).toBeGreaterThan(0);

    fireEvent.change(slider, { target: { value: String(AR_PROJECTION_YEARS) } });
    expect(screen.getAllByText('100% of maturity').length).toBeGreaterThan(0);

    const heightLabel =
      maturityHeight >= 100 ? `${(maturityHeight / 100).toFixed(1)} m` : `${maturityHeight} cm`;
    expect(screen.getAllByText(heightLabel).length).toBeGreaterThan(0);
  });

  it('jumps to key ages with quick actions', () => {
    render(<ARTreeViewer projection={projection} />);

    fireEvent.click(screen.getByRole('button', { name: '+5 years' }));
    expect(screen.getByText('Year 5')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Planting' }));
    expect(screen.getByText('Year 0 · just planted')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Maturity' }));
    expect(screen.getByText(`Year ${AR_PROJECTION_YEARS}`)).toBeInTheDocument();
  });

  it('offers a jump to the tree’s age today', () => {
    render(<ARTreeViewer projection={projection} />);

    const today = screen.getByRole('button', { name: /Today \(Age 2\)/ });
    fireEvent.click(today);

    expect(screen.getByText('Year 2')).toBeInTheDocument();
    expect(today).toHaveAttribute('aria-pressed', 'true');
  });

  it('compares the projected tree against an adult and the mature projection', () => {
    render(<ARTreeViewer projection={projection} />);

    expect(screen.getByText('Scale against a person')).toBeInTheDocument();
    expect(screen.getByText(/1\.75 m/)).toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(`${projection.lifetimeCo2Tonnes} tonnes of CO₂`))
    ).toBeInTheDocument();
  });

  it('uses the provided back link', () => {
    render(<ARTreeViewer projection={projection} backHref="/trees/tree-001" />);
    expect(screen.getByRole('link', { name: /Back to my forest/ })).toHaveAttribute(
      'href',
      '/trees/tree-001'
    );
  });

  it('ignores device orientation when the API is unavailable', () => {
    expect(() => render(<ARTreeViewer projection={projection} />)).not.toThrow();
    expect(screen.getByTestId('ar-tree-overlay').style.transform).toContain('rotate(0deg)');
  });
});
