import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CertificationRegistryPanel } from '../CertificationRegistryPanel';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe('CertificationRegistryPanel', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it('renders an API key field and all three registry panels', () => {
    render(<CertificationRegistryPanel />);

    expect(screen.getByLabelText(/partner api key/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /sync project/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /verify credit/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /renewal documentation/i })).toBeInTheDocument();
  });

  it('disables the sync button until an API key and project ID are provided', () => {
    render(<CertificationRegistryPanel />);

    expect(screen.getByRole('button', { name: /sync project/i })).toBeDisabled();
  });

  it('syncs a project and displays the result', async () => {
    const project = {
      provider: 'verra',
      projectId: 'VCS-1913',
      name: 'Test Forest Project',
      status: 'active',
      countryCode: 'BR',
      methodologyId: 'VM0007',
      methodologyName: 'REDD+ Methodology',
      proponent: null,
      creditingPeriodStart: null,
      creditingPeriodEnd: null,
      issuedCredits: 1000,
      availableCredits: 400,
      retiredCredits: 600,
      documents: [],
      providerUpdatedAt: null,
      syncedAt: '2026-09-27T00:00:00.000Z',
    };
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse(200, { project }));

    render(<CertificationRegistryPanel />);

    fireEvent.change(screen.getByLabelText(/partner api key/i), {
      target: { value: 'fc_test' },
    });
    fireEvent.change(screen.getAllByLabelText(/^project id$/i)[0], {
      target: { value: 'VCS-1913' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sync project/i }));

    await waitFor(() => expect(screen.getByText('Test Forest Project')).toBeInTheDocument());

    expect(fetch).toHaveBeenCalledWith(
      '/api/v2/marketplace/certifications/projects/sync',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'fc_test' }),
      })
    );
    expect(screen.getByText(/400 available/i)).toBeInTheDocument();
  });

  it('surfaces a provider-not-configured error without crashing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse(503, {
        error: 'verra certification provider is not configured',
        code: 'PROVIDER_NOT_CONFIGURED',
      })
    );

    render(<CertificationRegistryPanel />);

    fireEvent.change(screen.getByLabelText(/partner api key/i), {
      target: { value: 'fc_test' },
    });
    fireEvent.change(screen.getAllByLabelText(/^project id$/i)[0], {
      target: { value: 'VCS-1913' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sync project/i }));

    await waitFor(() => expect(screen.getByText(/PROVIDER_NOT_CONFIGURED/)).toBeInTheDocument());
  });
});
