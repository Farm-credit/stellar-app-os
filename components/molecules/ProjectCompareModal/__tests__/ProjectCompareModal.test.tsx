import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProjectCompareModal } from '../ProjectCompareModal';
import { resolveCompareOfferings } from '@/lib/projectCompareSelection';

const SHARE_URL = 'https://example.test/projects?compare=proj-001%2Cproj-004&compareOpen=1';
const offerings = resolveCompareOfferings(['proj-001', 'proj-004', 'proj-005']);

function renderModal(overrides: Partial<Parameters<typeof ProjectCompareModal>[0]> = {}) {
  const props = {
    offerings,
    open: true,
    onOpenChange: vi.fn(),
    onRemove: vi.fn(),
    shareUrl: SHARE_URL,
    ...overrides,
  };
  render(<ProjectCompareModal {...props} />);
  return props;
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProjectCompareModal', () => {
  it('renders nothing while closed', () => {
    renderModal({ open: false });
    expect(screen.queryByTestId('project-compare-modal')).not.toBeInTheDocument();
  });

  it('shows one column per project and the four required metrics as rows', () => {
    renderModal();

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Amazon Rainforest Reforestation')).toBeInTheDocument();
    expect(screen.getByText('Mangrove Restoration - Indonesia')).toBeInTheDocument();
    expect(screen.getByText('Sustainable Agriculture - Kenya')).toBeInTheDocument();

    expect(screen.getByText('Survival rate')).toBeInTheDocument();
    expect(screen.getByText('Cost per tree')).toBeInTheDocument();
    expect(screen.getByText('Species diversity')).toBeInTheDocument();
    expect(screen.getByText('CO₂ per tree')).toBeInTheDocument();
  });

  it('renders formatted values from the offering data', () => {
    renderModal();

    expect(screen.getByTestId('compare-cell-survivalRate-proj-001')).toHaveTextContent('91%');
    expect(screen.getByTestId('compare-cell-costPerTree-proj-005')).toHaveTextContent('$9.50');
    expect(screen.getByTestId('compare-cell-speciesDiversity-proj-004')).toHaveTextContent(
      '3 species'
    );
    expect(screen.getByTestId('compare-cell-co2PerTree-proj-001')).toHaveTextContent(
      '22 kg CO₂/yr'
    );
  });

  it('highlights the best value in each row', () => {
    renderModal();

    expect(screen.getByTestId('compare-cell-survivalRate-proj-001')).toHaveAttribute(
      'data-best',
      'true'
    );
    expect(screen.getByTestId('compare-cell-survivalRate-proj-004')).not.toHaveAttribute(
      'data-best'
    );
    // Lower cost is better, so the cheapest project wins that row.
    expect(screen.getByTestId('compare-cell-costPerTree-proj-005')).toHaveAttribute(
      'data-best',
      'true'
    );
    expect(screen.getByTestId('compare-cell-costPerTree-proj-001')).not.toHaveAttribute(
      'data-best'
    );
  });

  it('calls onRemove with the project id when a column is removed', () => {
    const { onRemove } = renderModal();

    const name = 'Remove Mangrove Restoration - Indonesia from comparison';
    fireEvent.click(screen.getByRole('button', { name }));

    expect(onRemove).toHaveBeenCalledWith('proj-004');
  });

  it('exposes the shareable URL in a read-only field', () => {
    renderModal();

    const field = screen.getByLabelText('Shareable comparison link');
    expect(field).toHaveValue(SHARE_URL);
    expect(field).toHaveAttribute('readonly');
  });

  it('copies the share link and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    expect(await screen.findByRole('button', { name: /link copied/i })).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(SHARE_URL);
  });

  it('tells the user when copying fails', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    renderModal();

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));

    expect(await screen.findByText(/could not copy the link/i)).toBeInTheDocument();
  });
});
