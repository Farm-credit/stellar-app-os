/**
 * Tests for AuditorSatelliteComparison organism.
 * Uses React Testing Library + vitest (jsdom environment).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  AuditorSatelliteComparison,
  type PhotoEvidence,
} from '@/components/organisms/AuditorSatelliteComparison/AuditorSatelliteComparison';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeEvidence(overrides: Partial<PhotoEvidence> = {}): PhotoEvidence {
  return {
    id: 'ev_001',
    baseline_url: '/baseline.jpg',
    submitted_url: '/submitted.jpg',
    tree_ref: 'TREE-0099',
    planter_name: 'Jane Farmer',
    planter_address: 'GCLEAR1ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789ABCDEF123456',
    submitted_lat: 9.0574,
    submitted_lng: 7.4898,
    expected_lat: 9.0575,
    expected_lng: 7.4900,
    gps_deviation_m: 22.5,
    submitted_at: '2026-01-15T10:30:00Z',
    species_name: 'Teak',
    current_decision: null,
    ...overrides,
  };
}

/** Helper: get the outer component container (the div with role="region"). */
function getContainer() {
  return screen.getByRole('region', {
    name: /Satellite photo comparison for tree TREE-0099/i,
  });
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('AuditorSatelliteComparison — rendering', () => {
  it('renders without crashing', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(getContainer()).toBeInTheDocument();
  });

  it('displays the tree ref in the header', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(screen.getByText('TREE-0099')).toBeInTheDocument();
  });

  it('displays the planter name', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(screen.getByText(/Jane Farmer/)).toBeInTheDocument();
  });

  it('displays the species name', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(screen.getByText(/Teak/)).toBeInTheDocument();
  });

  it('renders both images with correct alt text', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    // Use querySelectorAll to get only actual <img> elements (not role="img" divs)
    const imgs = Array.from(document.querySelectorAll('img'));
    const alts = imgs.map((img) => img.getAttribute('alt') ?? '');
    expect(alts.some((a) => a.includes('Satellite baseline image'))).toBe(true);
    expect(alts.some((a) => a.includes('Planter-submitted photo'))).toBe(true);
  });

  it('shows "Satellite Baseline" and "Planter Submission" labels', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(screen.getByText('Satellite Baseline')).toBeInTheDocument();
    expect(screen.getByText('Planter Submission')).toBeInTheDocument();
  });

  it('shows GPS analysis section', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(screen.getByText('GPS Analysis')).toBeInTheDocument();
  });

  it('shows GPS deviation value', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence({ gps_deviation_m: 22.5 })} />);
    expect(screen.getByText(/22\.5 m/)).toBeInTheDocument();
  });
});

// ── GPS deviation indicator ───────────────────────────────────────────────────

describe('AuditorSatelliteComparison — GPS deviation indicator', () => {
  it('shows "Acceptable" badge for deviation ≤ 50m', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence({ gps_deviation_m: 30 })} />);
    expect(screen.getByText('Acceptable')).toBeInTheDocument();
  });

  it('shows "Review" badge for deviation between 51m and 200m', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence({ gps_deviation_m: 100 })} />);
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('shows "High Deviation" badge for deviation > 200m', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence({ gps_deviation_m: 350 })} />);
    expect(screen.getByText('High Deviation')).toBeInTheDocument();
  });
});

// ── Decision form ─────────────────────────────────────────────────────────────

describe('AuditorSatelliteComparison — decision form', () => {
  it('renders the three decision buttons', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(screen.getByRole('radio', { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Needs Review/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Reject/i })).toBeInTheDocument();
  });

  it('submit button is disabled when no decision selected', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    // Button has aria-label="Submit verification decision"
    const submitBtn = screen.getByRole('button', {
      name: /Submit verification decision/i,
    });
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit button after selecting a decision', async () => {
    const user = userEvent.setup();
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);

    await user.click(screen.getByRole('radio', { name: /Approve/i }));

    const submitBtn = screen.getByRole('button', {
      name: /Submit verification decision/i,
    });
    expect(submitBtn).not.toBeDisabled();
  });

  it('marks the selected radio as aria-checked=true', async () => {
    const user = userEvent.setup();
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);

    const approveBtn = screen.getByRole('radio', { name: /Approve/i });
    expect(approveBtn).toHaveAttribute('aria-checked', 'false');

    await user.click(approveBtn);
    expect(approveBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onDecision with correct arguments when submitted', async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn();
    render(
      <AuditorSatelliteComparison evidence={makeEvidence()} onDecision={onDecision} />
    );

    await user.click(screen.getByRole('radio', { name: /Approve/i }));
    await user.type(screen.getByLabelText(/Auditor Notes/i), 'Looks good');
    await user.click(
      screen.getByRole('button', { name: /Submit verification decision/i })
    );

    expect(onDecision).toHaveBeenCalledOnce();
    expect(onDecision).toHaveBeenCalledWith('ev_001', 'approved', 'Looks good');
  });

  it('calls onDecision with "rejected" and notes', async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn();
    render(
      <AuditorSatelliteComparison evidence={makeEvidence()} onDecision={onDecision} />
    );

    await user.click(screen.getByRole('radio', { name: /Reject/i }));
    await user.type(screen.getByLabelText(/Auditor Notes/i), 'GPS mismatch');
    await user.click(
      screen.getByRole('button', { name: /Submit verification decision/i })
    );

    expect(onDecision).toHaveBeenCalledWith('ev_001', 'rejected', 'GPS mismatch');
  });

  it('disables decision buttons when a decision is already recorded', () => {
    render(
      <AuditorSatelliteComparison
        evidence={makeEvidence({ current_decision: 'approved' })}
      />
    );

    expect(screen.getByRole('radio', { name: /Approve/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Needs Review/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Reject/i })).toBeDisabled();
  });

  it('shows "Decision already recorded" message when decision exists', () => {
    render(
      <AuditorSatelliteComparison
        evidence={makeEvidence({ current_decision: 'rejected' })}
      />
    );
    expect(screen.getByText(/Decision already recorded/i)).toBeInTheDocument();
  });

  it('hides submit button and shows existing decision text when already decided', () => {
    render(
      <AuditorSatelliteComparison
        evidence={makeEvidence({ current_decision: 'approved' })}
      />
    );
    // No submit button when already decided
    expect(
      screen.queryByRole('button', { name: /Submit verification decision/i })
    ).not.toBeInTheDocument();
  });

  it('disables all inputs during submission', () => {
    render(
      <AuditorSatelliteComparison
        evidence={makeEvidence()}
        isSubmitting={true}
      />
    );

    expect(screen.getByRole('radio', { name: /Approve/i })).toBeDisabled();
    expect(screen.getByLabelText(/Auditor Notes/i)).toBeDisabled();
    // Button label changes to "Submitting…"
    expect(screen.getByText(/Submitting/i)).toBeInTheDocument();
  });

  it('shows decision badge in header for approved decision', () => {
    render(
      <AuditorSatelliteComparison
        evidence={makeEvidence({ current_decision: 'approved' })}
      />
    );
    // The header div (first child of the region) contains the badge
    const container = getContainer();
    const headerDiv = container.firstElementChild as HTMLElement;
    expect(within(headerDiv).getByText('Approved')).toBeInTheDocument();
  });

  it('shows decision badge in header for rejected decision', () => {
    render(
      <AuditorSatelliteComparison
        evidence={makeEvidence({ current_decision: 'rejected' })}
      />
    );
    const container = getContainer();
    const headerDiv = container.firstElementChild as HTMLElement;
    expect(within(headerDiv).getByText('Rejected')).toBeInTheDocument();
  });

  it('shows decision badge in header for needs_review decision', () => {
    render(
      <AuditorSatelliteComparison
        evidence={makeEvidence({ current_decision: 'needs_review' })}
      />
    );
    const container = getContainer();
    const headerDiv = container.firstElementChild as HTMLElement;
    expect(within(headerDiv).getByText('Needs Review')).toBeInTheDocument();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('AuditorSatelliteComparison — accessibility', () => {
  it('has a region landmark with an accessible name containing the tree ref', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(
      screen.getByRole('region', {
        name: /Satellite photo comparison for tree TREE-0099/i,
      })
    ).toBeInTheDocument();
  });

  it('images have non-empty alt text', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    const imgs = Array.from(document.querySelectorAll('img'));
    imgs.forEach((img) => {
      expect(img.getAttribute('alt')).toBeTruthy();
    });
  });

  it('GPS status element has an aria-label', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-label');
  });

  it('notes textarea has an associated label', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(screen.getByLabelText(/Auditor Notes/i)).toBeInTheDocument();
  });

  it('zoom control buttons have aria-labels', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(screen.getAllByLabelText('Zoom in').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Zoom out').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Reset zoom').length).toBeGreaterThan(0);
  });

  it('download links have aria-labels', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(screen.getAllByLabelText('Download image').length).toBeGreaterThan(0);
  });

  it('submit button has an accessible aria-label', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    expect(
      screen.getByRole('button', { name: /Submit verification decision/i })
    ).toBeInTheDocument();
  });
});

// ── Zoom controls ─────────────────────────────────────────────────────────────

describe('AuditorSatelliteComparison — zoom controls', () => {
  it('zoom out button is disabled at 100%', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    screen.getAllByLabelText('Zoom out').forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it('zoom in button is enabled at 100%', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    screen.getAllByLabelText('Zoom in').forEach((btn) => {
      expect(btn).not.toBeDisabled();
    });
  });

  it('shows 100% zoom level by default for both images', () => {
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);
    const percentLabels = screen.getAllByText('100%');
    expect(percentLabels.length).toBeGreaterThanOrEqual(2);
  });

  it('increments zoom level when zoom in is clicked', async () => {
    const user = userEvent.setup();
    render(<AuditorSatelliteComparison evidence={makeEvidence()} />);

    const [firstZoomIn] = screen.getAllByLabelText('Zoom in');
    await user.click(firstZoomIn);

    expect(screen.getByText('125%')).toBeInTheDocument();
  });
});
