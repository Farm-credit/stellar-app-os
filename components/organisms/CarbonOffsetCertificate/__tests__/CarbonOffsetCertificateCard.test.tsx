import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CarbonOffsetCertificateCard } from '../CarbonOffsetCertificateCard';
import { getMockTrees } from '@/lib/api/mock/trees';

// Mock canvas context for QrCode component in jsdom
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  fillRect: vi.fn(),
  clearRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Array(4) })),
  putImageData: vi.fn(),
  createImageData: vi.fn(() => []),
  setTransform: vi.fn(),
  drawImage: vi.fn(),
  save: vi.fn(),
  fillText: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  closePath: vi.fn(),
  stroke: vi.fn(),
  translate: vi.fn(),
  scale: vi.fn(),
  rotate: vi.fn(),
  arc: vi.fn(),
  fill: vi.fn(),
  measureText: vi.fn(() => ({ width: 0 })),
  transform: vi.fn(),
  rect: vi.fn(),
  clip: vi.fn(),
}) as any;

if (typeof window !== 'undefined') {
  window.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = vi.fn();
}

describe('CarbonOffsetCertificateCard Component', () => {
  const teakTree = getMockTrees().find(
    (t) => t.species === 'Teak' && t.treeId === 'HRV-2024-0001'
  )!;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders species, planting date, location, and sponsor', () => {
    render(<CarbonOffsetCertificateCard tree={teakTree} />);

    expect(screen.getByText('Carbon Offset Certificate')).toBeDefined();
    expect(screen.getByText('Teak')).toBeDefined();
    expect(screen.getByText(/March 12, 2024/i)).toBeDefined();
    expect(screen.getByText('Kano, Nigeria')).toBeDefined();
    expect(screen.getByText('Acme EcoSolutions')).toBeDefined();
  });

  it('displays estimated CO2 sequestration over time with units and time periods', () => {
    render(<CarbonOffsetCertificateCard tree={teakTree} />);

    expect(screen.getByText(/Estimated CO₂ Sequestration Over Time/i)).toBeDefined();
    expect(screen.getByText(/kg CO₂ \/ year/i)).toBeDefined();
    expect(screen.getByText(/Annual Rate/i)).toBeDefined();
    expect(screen.getByText(/Stored to Date/i)).toBeDefined();
    expect(screen.getByText(/10-Year Horizon/i)).toBeDefined();
    expect(screen.getByText(/At Maturity/i)).toBeDefined();
  });

  it('displays scannable QR code section with tree live tracking link', () => {
    render(<CarbonOffsetCertificateCard tree={teakTree} />);

    expect(screen.getByText(/Scannable QR Code Included in Both Formats/i)).toBeDefined();
    expect(screen.getByText(/\/trees\/HRV-2024-0001/i)).toBeDefined();
  });

  it('triggers download for PDF format when clicked', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(['fake-pdf'], { type: 'application/pdf' })),
    } as any);

    render(<CarbonOffsetCertificateCard tree={teakTree} />);

    const pdfButton = screen.getByRole('button', { name: /Download PDF/i });
    fireEvent.click(pdfButton);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/certificates/tree-001?format=pdf');
    });
  });

  it('triggers download for PNG image format when clicked', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(['fake-png'], { type: 'image/png' })),
    } as any);

    render(<CarbonOffsetCertificateCard tree={teakTree} />);

    const imageButton = screen.getByRole('button', { name: /Download Image/i });
    fireEvent.click(imageButton);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/certificates/tree-001?format=png');
    });
  });
});
