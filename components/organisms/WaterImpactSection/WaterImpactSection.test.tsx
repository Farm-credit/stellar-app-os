import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WaterImpactSection } from './WaterImpactSection';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

describe('WaterImpactSection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows annual hydrological metrics and the litres-per-year chart', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({
        projectId: 'proj-001',
        projectName: 'Amazon Rainforest Reforestation',
        hasData: true,
        assessments: [
          {
            year: 2025,
            watershedProtectionLitres: 900,
            estimatedGroundwaterRechargeLitres: 600,
            protectedLitresPerYear: 1500,
            assessedAt: '2025-06-01',
            source: 'hydrology-report-2025',
          },
        ],
      }),
    });

    render(
      <WaterImpactSection projectId="proj-001" projectName="Amazon Rainforest Reforestation" />
    );

    expect(screen.getByRole('status')).toHaveTextContent('Loading water assessments');
    expect(await screen.findByText('900 L')).toBeInTheDocument();
    expect(screen.getByText('600 L')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /water protected per year/i })).toBeInTheDocument();
  });

  it('makes missing assessments explicit instead of displaying invented values', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => ({
        projectId: 'proj-002',
        projectName: 'Wind',
        hasData: false,
        assessments: [],
      }),
    });

    render(<WaterImpactSection projectId="proj-002" projectName="Wind" />);

    expect(
      await screen.findByText(/no hydrological assessments published yet/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/no estimated values are shown/i)).toBeInTheDocument();
  });

  it('shows a deterministic error when the assessment request fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: () => ({ error: 'Assessment service unavailable' }),
    });

    render(<WaterImpactSection projectId="proj-001" projectName="Amazon" />);

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('Assessment service unavailable')
    );
  });
});
