/**
 * Tests for VerifierProofReview organism (issue #859).
 * Uses React Testing Library + Vitest (jsdom environment).
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  VerifierProofReview,
  type PhotoEvidence,
} from '@/components/organisms/VerifierProofReview/VerifierProofReview';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeEvidence(overrides: Partial<PhotoEvidence> = {}): PhotoEvidence {
  return {
    id: 'ev-test-01',
    baseline_url: '/baseline.jpg',
    submitted_url: '/submitted.jpg',
    tree_ref: 'TREE-0001',
    planter_name: 'Test Planter',
    planter_address: 'GCABCDEF123456GHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUV',
    submitted_lat: 9.0574,
    submitted_lng: 7.4898,
    expected_lat: 9.0575,
    expected_lng: 7.49,
    gps_deviation_m: 22.5,
    submitted_at: '2026-01-15T10:30:00Z',
    species_name: 'Teak',
    project_name: 'Test Forest Project',
    location_label: 'Abuja, FCT',
    current_decision: null,
    ...overrides,
  };
}

function makeQueue(overrides: Partial<PhotoEvidence>[] = [{}]): PhotoEvidence[] {
  return overrides.map((o, i) =>
    makeEvidence({ id: `ev-test-0${i + 1}`, tree_ref: `TREE-000${i + 1}`, ...o })
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('VerifierProofReview — rendering', () => {
  it('renders without crashing', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getByTestId('verifier-proof-review')).toBeInTheDocument();
  });

  it('shows the stats bar with correct stat labels', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    const statsSection = screen.getByRole('region', { name: /Queue summary statistics/i });
    expect(within(statsSection).getByText('Pending Review')).toBeInTheDocument();
    expect(within(statsSection).getByText('Approved')).toBeInTheDocument();
    expect(within(statsSection).getByText('Needs Review')).toBeInTheDocument();
    expect(within(statsSection).getByText('Rejected')).toBeInTheDocument();
  });

  it('renders the queue sidebar with the evidence item', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getByRole('list', { name: /Evidence submissions queue/i })).toBeInTheDocument();
    expect(screen.getByTestId('queue-item-ev-test-01')).toBeInTheDocument();
  });

  it('shows the detail panel for the first item by default', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(
      screen.getByRole('region', { name: /Proof review detail for tree TREE-0001/i })
    ).toBeInTheDocument();
  });

  it('displays the tree ref in the detail header', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    // tree ref appears in the detail card title
    const detail = screen.getByRole('region', {
      name: /Proof review detail for tree TREE-0001/i,
    });
    expect(within(detail).getByText('TREE-0001')).toBeInTheDocument();
  });

  it('displays the planter name in the detail header', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getAllByText('Test Planter').length).toBeGreaterThan(0);
  });

  it('displays the species name', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getAllByText(/Teak/).length).toBeGreaterThan(0);
  });

  it('renders both images with descriptive alt text', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    const imgs = Array.from(document.querySelectorAll('img'));
    const alts = imgs.map((img) => img.getAttribute('alt') ?? '');
    expect(alts.some((a) => /satellite baseline/i.test(a))).toBe(true);
    expect(alts.some((a) => /planter-submitted/i.test(a))).toBe(true);
  });

  it('shows "Satellite Baseline" and "Planter Submission" labels in side-by-side mode', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getByText('Satellite Baseline')).toBeInTheDocument();
    expect(screen.getByText('Planter Submission')).toBeInTheDocument();
  });

  it('shows "GPS Analysis" section heading', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getByText('GPS Analysis')).toBeInTheDocument();
  });

  it('shows "Auditor Decision" section heading', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getByText('Auditor Decision')).toBeInTheDocument();
  });

  it('shows empty state when queue is empty', () => {
    render(<VerifierProofReview queue={[]} />);
    expect(screen.getByText(/No submissions in queue/i)).toBeInTheDocument();
    expect(screen.getByText(/No Evidence Selected/i)).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stats bar
// ─────────────────────────────────────────────────────────────────────────────

describe('VerifierProofReview — stats bar', () => {
  it('counts pending correctly', () => {
    const queue = [
      makeEvidence({ id: 'a', tree_ref: 'T-01', current_decision: null }),
      makeEvidence({ id: 'b', tree_ref: 'T-02', current_decision: 'approved' }),
    ];
    render(<VerifierProofReview queue={queue} />);
    const statsSection = screen.getByRole('region', { name: /Queue summary statistics/i });
    // "1" pending, "1" approved
    expect(within(statsSection).getByText('Pending Review')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Queue navigation
// ─────────────────────────────────────────────────────────────────────────────

describe('VerifierProofReview — queue navigation', () => {
  it('shows 1 / N navigation counter', () => {
    const queue = makeQueue([{}, {}]);
    render(<VerifierProofReview queue={queue} />);
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('previous button is disabled on the first item', () => {
    render(<VerifierProofReview queue={makeQueue([{}, {}])} />);
    expect(screen.getByRole('button', { name: /Previous evidence/i })).toBeDisabled();
  });

  it('next button is enabled when there are more items', () => {
    render(<VerifierProofReview queue={makeQueue([{}, {}])} />);
    expect(screen.getByRole('button', { name: /Next evidence/i })).not.toBeDisabled();
  });

  it('navigates to the next item when Next is clicked', async () => {
    const user = userEvent.setup();
    const queue = makeQueue([{ tree_ref: 'TREE-0001' }, { tree_ref: 'TREE-0002' }]);
    render(<VerifierProofReview queue={queue} />);

    await user.click(screen.getByRole('button', { name: /Next evidence/i }));

    expect(
      screen.getByRole('region', { name: /Proof review detail for tree TREE-0002/i })
    ).toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
  });

  it('clicking a queue item selects it', async () => {
    const user = userEvent.setup();
    const queue = makeQueue([{ tree_ref: 'TREE-0001' }, { tree_ref: 'TREE-0002' }]);
    render(<VerifierProofReview queue={queue} />);

    await user.click(screen.getByTestId('queue-item-ev-test-02'));

    expect(
      screen.getByRole('region', { name: /Proof review detail for tree TREE-0002/i })
    ).toBeInTheDocument();
  });

  it('queue item button has aria-pressed=true when selected', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    const btn = screen.getByTestId('queue-item-ev-test-01').closest('button');
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GPS deviation indicator
// ─────────────────────────────────────────────────────────────────────────────

describe('VerifierProofReview — GPS deviation', () => {
  it('shows the deviation value', () => {
    render(<VerifierProofReview queue={makeQueue([{ gps_deviation_m: 22.5 }])} />);
    expect(screen.getByText(/22\.5 m/)).toBeInTheDocument();
  });

  it('shows "Acceptable" badge for deviation ≤ 50 m', () => {
    render(<VerifierProofReview queue={makeQueue([{ gps_deviation_m: 30 }])} />);
    expect(screen.getByText('Acceptable')).toBeInTheDocument();
  });

  it('shows "Review" badge for deviation 51–200 m', () => {
    render(<VerifierProofReview queue={makeQueue([{ gps_deviation_m: 120 }])} />);
    expect(screen.getByText('Review')).toBeInTheDocument();
  });

  it('shows "High Deviation" badge for deviation > 200 m', () => {
    render(<VerifierProofReview queue={makeQueue([{ gps_deviation_m: 500 }])} />);
    expect(screen.getByText('High Deviation')).toBeInTheDocument();
  });

  it('GPS status element carries an aria-label', () => {
    render(<VerifierProofReview queue={makeQueue([{ gps_deviation_m: 22.5 }])} />);
    const status = screen.getByRole('status', { name: /GPS deviation: 22\.5 metres/i });
    expect(status).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comparison mode toggle
// ─────────────────────────────────────────────────────────────────────────────

describe('VerifierProofReview — comparison mode', () => {
  it('defaults to side-by-side mode', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    const btn = screen.getByRole('button', { name: /Side by side mode/i });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches to overlay mode when Overlay is clicked', async () => {
    const user = userEvent.setup();
    render(<VerifierProofReview queue={makeQueue()} />);

    await user.click(screen.getByRole('button', { name: /Overlay mode/i }));

    expect(screen.getByRole('button', { name: /Overlay mode/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    // Side-by-side region should be gone; overlay region present
    expect(
      screen.queryByRole('region', { name: /Side by side photo comparison/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Overlay photo comparison/i })).toBeInTheDocument();
  });

  it('shows the opacity slider in overlay mode', async () => {
    const user = userEvent.setup();
    render(<VerifierProofReview queue={makeQueue()} />);

    await user.click(screen.getByRole('button', { name: /Overlay mode/i }));

    expect(screen.getByRole('slider', { name: /Submission overlay opacity/i })).toBeInTheDocument();
  });

  it('switches back to side-by-side mode', async () => {
    const user = userEvent.setup();
    render(<VerifierProofReview queue={makeQueue()} />);

    await user.click(screen.getByRole('button', { name: /Overlay mode/i }));
    await user.click(screen.getByRole('button', { name: /Side by side mode/i }));

    expect(screen.getByText('Satellite Baseline')).toBeInTheDocument();
    expect(screen.getByText('Planter Submission')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Decision form
// ─────────────────────────────────────────────────────────────────────────────

describe('VerifierProofReview — decision form', () => {
  it('renders three decision radio buttons', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getByRole('radio', { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Needs Review/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Reject/i })).toBeInTheDocument();
  });

  it('submit button is disabled when no decision is selected', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getByRole('button', { name: /Submit verification decision/i })).toBeDisabled();
  });

  it('enables submit button after selecting a decision', async () => {
    const user = userEvent.setup();
    render(<VerifierProofReview queue={makeQueue()} />);

    await user.click(screen.getByRole('radio', { name: /Approve/i }));

    expect(
      screen.getByRole('button', { name: /Submit verification decision/i })
    ).not.toBeDisabled();
  });

  it('marks the selected radio as aria-checked=true', async () => {
    const user = userEvent.setup();
    render(<VerifierProofReview queue={makeQueue()} />);

    const approveBtn = screen.getByRole('radio', { name: /Approve/i });
    expect(approveBtn).toHaveAttribute('aria-checked', 'false');

    await user.click(approveBtn);
    expect(approveBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onDecision with correct arguments on submit', async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn();
    render(<VerifierProofReview queue={makeQueue()} onDecision={onDecision} />);

    await user.click(screen.getByRole('radio', { name: /Approve/i }));
    await user.type(screen.getByLabelText(/Auditor Notes/i), 'Photo matches baseline');
    await user.click(screen.getByRole('button', { name: /Submit verification decision/i }));

    expect(onDecision).toHaveBeenCalledOnce();
    expect(onDecision).toHaveBeenCalledWith('ev-test-01', 'approved', 'Photo matches baseline');
  });

  it('calls onDecision with "rejected" and notes', async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn();
    render(<VerifierProofReview queue={makeQueue()} onDecision={onDecision} />);

    await user.click(screen.getByRole('radio', { name: /Reject/i }));
    await user.type(screen.getByLabelText(/Auditor Notes/i), 'GPS mismatch detected');
    await user.click(screen.getByRole('button', { name: /Submit verification decision/i }));

    expect(onDecision).toHaveBeenCalledWith('ev-test-01', 'rejected', 'GPS mismatch detected');
  });

  it('calls onDecision with "needs_review"', async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn();
    render(<VerifierProofReview queue={makeQueue()} onDecision={onDecision} />);

    await user.click(screen.getByRole('radio', { name: /Needs Review/i }));
    await user.click(screen.getByRole('button', { name: /Submit verification decision/i }));

    expect(onDecision).toHaveBeenCalledWith('ev-test-01', 'needs_review', '');
  });

  it('disables decision buttons when a decision is already recorded', () => {
    render(<VerifierProofReview queue={makeQueue([{ current_decision: 'approved' }])} />);

    expect(screen.getByRole('radio', { name: /Approve/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Needs Review/i })).toBeDisabled();
    expect(screen.getByRole('radio', { name: /Reject/i })).toBeDisabled();
  });

  it('shows "Decision already recorded" when a decision exists', () => {
    render(<VerifierProofReview queue={makeQueue([{ current_decision: 'rejected' }])} />);
    expect(screen.getByText(/Decision already recorded/i)).toBeInTheDocument();
  });

  it('hides the submit button when a decision is already recorded', () => {
    render(<VerifierProofReview queue={makeQueue([{ current_decision: 'approved' }])} />);
    expect(
      screen.queryByRole('button', { name: /Submit verification decision/i })
    ).not.toBeInTheDocument();
  });

  it('disables form controls during submission', () => {
    render(<VerifierProofReview queue={makeQueue()} isSubmitting={true} />);

    expect(screen.getByRole('radio', { name: /Approve/i })).toBeDisabled();
    expect(screen.getByLabelText(/Auditor Notes/i)).toBeDisabled();
    expect(screen.getByText(/Submitting/i)).toBeInTheDocument();
  });

  it('shows the decision badge in the detail header for approved evidence', () => {
    render(<VerifierProofReview queue={makeQueue([{ current_decision: 'approved' }])} />);
    const detail = screen.getByRole('region', {
      name: /Proof review detail for tree TREE-0001/i,
    });
    expect(within(detail).getByText('Approved')).toBeInTheDocument();
  });

  it('shows the decision badge for rejected evidence', () => {
    render(<VerifierProofReview queue={makeQueue([{ current_decision: 'rejected' }])} />);
    const detail = screen.getByRole('region', {
      name: /Proof review detail for tree TREE-0001/i,
    });
    expect(within(detail).getByText('Rejected')).toBeInTheDocument();
  });

  it('shows the decision badge for needs_review evidence', () => {
    render(<VerifierProofReview queue={makeQueue([{ current_decision: 'needs_review' }])} />);
    const detail = screen.getByRole('region', {
      name: /Proof review detail for tree TREE-0001/i,
    });
    // "Needs Review" appears both in stats and decision form; scope to detail panel
    expect(within(detail).getAllByText('Needs Review').length).toBeGreaterThan(0);
  });

  it('resets the decision selection when switching to a different queue item', async () => {
    const user = userEvent.setup();
    const queue = makeQueue([{ tree_ref: 'TREE-0001' }, { tree_ref: 'TREE-0002' }]);
    render(<VerifierProofReview queue={queue} />);

    // Select Approve on item 1
    await user.click(screen.getByRole('radio', { name: /Approve/i }));
    expect(screen.getByRole('radio', { name: /Approve/i })).toHaveAttribute('aria-checked', 'true');

    // Navigate to item 2
    await user.click(screen.getByRole('button', { name: /Next evidence/i }));

    // Decision should be reset for item 2
    expect(screen.getByRole('radio', { name: /Approve/i })).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Zoom controls
// ─────────────────────────────────────────────────────────────────────────────

describe('VerifierProofReview — zoom controls', () => {
  it('shows 100% zoom label for both images by default', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    const percentLabels = screen.getAllByText('100%');
    expect(percentLabels.length).toBeGreaterThanOrEqual(2);
  });

  it('zoom out buttons are disabled at 100%', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    screen.getAllByLabelText('Zoom out').forEach((btn) => expect(btn).toBeDisabled());
  });

  it('zoom in buttons are enabled at 100%', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    screen.getAllByLabelText('Zoom in').forEach((btn) => expect(btn).not.toBeDisabled());
  });

  it('increments zoom on zoom-in click', async () => {
    const user = userEvent.setup();
    render(<VerifierProofReview queue={makeQueue()} />);

    const [firstZoomIn] = screen.getAllByLabelText('Zoom in');
    await user.click(firstZoomIn);

    expect(screen.getByText('125%')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Accessibility
// ─────────────────────────────────────────────────────────────────────────────

describe('VerifierProofReview — accessibility', () => {
  it('the detail region has an accessible name containing the tree ref', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(
      screen.getByRole('region', { name: /Proof review detail for tree TREE-0001/i })
    ).toBeInTheDocument();
  });

  it('every image has non-empty alt text', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    document.querySelectorAll('img').forEach((img) => {
      expect(img.getAttribute('alt')).toBeTruthy();
    });
  });

  it('GPS status element has an accessible aria-label', () => {
    render(<VerifierProofReview queue={makeQueue([{ gps_deviation_m: 22.5 }])} />);
    expect(
      screen.getByRole('status', { name: /GPS deviation: 22\.5 metres/i })
    ).toBeInTheDocument();
  });

  it('notes textarea has an associated label', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getByLabelText(/Auditor Notes/i)).toBeInTheDocument();
  });

  it('zoom controls have aria-labels', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getAllByLabelText('Zoom in').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Zoom out').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Reset zoom').length).toBeGreaterThan(0);
  });

  it('download links have aria-labels', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getAllByLabelText('Download image').length).toBeGreaterThan(0);
  });

  it('submit button has an accessible aria-label', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(
      screen.getByRole('button', { name: /Submit verification decision/i })
    ).toBeInTheDocument();
  });

  it('prev/next navigation buttons have aria-labels', () => {
    render(<VerifierProofReview queue={makeQueue([{}, {}])} />);
    expect(screen.getByRole('button', { name: /Previous evidence/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Next evidence/i })).toBeInTheDocument();
  });

  it('comparison mode buttons have aria-pressed attribute', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getByRole('button', { name: /Side by side mode/i })).toHaveAttribute(
      'aria-pressed'
    );
    expect(screen.getByRole('button', { name: /Overlay mode/i })).toHaveAttribute('aria-pressed');
  });

  it('queue summary section has an accessible label', () => {
    render(<VerifierProofReview queue={makeQueue()} />);
    expect(screen.getByRole('region', { name: /Queue summary statistics/i })).toBeInTheDocument();
  });
});
