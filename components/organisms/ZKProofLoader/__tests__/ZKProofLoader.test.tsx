import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { vi } from 'vitest';
import { MapPin, Hash, Database, Cpu, Package, ShieldCheck } from 'lucide-react';
import { ZKProofLoader, type ZKProofStep } from '@/components/organisms/ZKProofLoader/ZKProofLoader';

// ── Mock framer-motion to avoid jsdom animation issues ────────────────────────
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return {
    ...actual,
    motion: new Proxy(
      {},
      {
        get: (_target, tag: string) =>
          ({ children, ...props }: React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode }) => {
            const React = require('react');
            // Strip framer-specific props to avoid warnings
            const {
              initial, animate, exit, transition, whileHover, whileTap,
              variants, layout, layoutId, ...rest
            } = props as Record<string, unknown>;
            void initial; void animate; void exit; void transition;
            void whileHover; void whileTap; void variants; void layout; void layoutId;
            return React.createElement(tag, rest, children);
          },
      }
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

// ── Test Fixtures ─────────────────────────────────────────────────────────────

function makeSteps(overrides?: Partial<ZKProofStep>[]): ZKProofStep[] {
  const defs = [
    { id: 'gps', label: 'Acquiring GPS', icon: <MapPin />, status: 'pending' as const },
    { id: 'commit', label: 'Hashing Commitment', icon: <Hash />, status: 'pending' as const },
    { id: 'witness', label: 'Building Witness', icon: <Database />, status: 'pending' as const },
    { id: 'prove', label: 'Running ZK Prover', icon: <Cpu />, status: 'pending' as const },
    { id: 'serialize', label: 'Serialising Proof', icon: <Package />, status: 'pending' as const },
    { id: 'nullifier', label: 'Verifying Nullifier', icon: <ShieldCheck />, status: 'pending' as const },
  ];
  if (!overrides) return defs;
  return defs.map((d, i) => ({ ...d, ...(overrides[i] ?? {}) }));
}

// ─── Idle state ───────────────────────────────────────────────────────────────

describe('ZKProofLoader — idle state', () => {
  it('renders the component heading', () => {
    render(<ZKProofLoader />);
    expect(screen.getByRole('heading', { name: /ZK Location Proof/i })).toBeInTheDocument();
  });

  it('has region role with accessible label', () => {
    render(<ZKProofLoader />);
    expect(
      screen.getByRole('region', { name: /ZK Location Proof Generator/i })
    ).toBeInTheDocument();
  });

  it('shows "Generate Proof" button when idle', () => {
    render(<ZKProofLoader />);
    expect(
      screen.getByRole('button', { name: /Generate.*Proof/i })
    ).toBeInTheDocument();
  });

  it('"Generate Proof" button is not disabled in idle state', () => {
    render(<ZKProofLoader />);
    expect(
      screen.getByRole('button', { name: /Generate.*Proof/i })
    ).not.toBeDisabled();
  });

  it('renders all 6 default steps', () => {
    render(<ZKProofLoader />);
    const list = screen.getByRole('list', { name: /Proof generation steps/i });
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
  });

  it('shows ZK Proof Ready status badge', () => {
    render(<ZKProofLoader />);
    expect(screen.getByRole('status', { name: /ZK Proof Ready/i })).toBeInTheDocument();
  });

  it('does not show cancel or reset buttons in idle state', () => {
    render(<ZKProofLoader />);
    expect(screen.queryByRole('button', { name: /Cancel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reset/i })).not.toBeInTheDocument();
  });

  it('shows idle context message', () => {
    render(<ZKProofLoader />);
    expect(screen.getByText(/Click to start proof generation/i)).toBeInTheDocument();
  });
});

// ─── Running state (controlled) ───────────────────────────────────────────────

describe('ZKProofLoader — running state (controlled)', () => {
  const runningSteps = makeSteps([
    { status: 'complete', durationMs: 400 },
    { status: 'active' },
  ]);

  it('shows "Generating…" status badge', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={30}
        status="running"
        logs={[]}
      />
    );
    expect(screen.getByRole('status', { name: /Generating/i })).toBeInTheDocument();
  });

  it('shows disabled "Proving…" button when running', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={30}
        status="running"
        logs={[]}
      />
    );
    const btn = screen.getByRole('button', { name: /Proof generation in progress/i });
    expect(btn).toBeDisabled();
  });

  it('shows Cancel button when running', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={30}
        status="running"
        logs={[]}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Cancel proof generation/i })).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={30}
        status="running"
        logs={[]}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel proof generation/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders progressbar with correct value', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={47}
        status="running"
        logs={[]}
      />
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '47');
  });

  it('does not show Generate Proof button when running', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={30}
        status="running"
        logs={[]}
      />
    );
    expect(screen.queryByRole('button', { name: /Generate.*Proof/i })).not.toBeInTheDocument();
  });
});

// ─── Success state (controlled) ──────────────────────────────────────────────

describe('ZKProofLoader — success state (controlled)', () => {
  const successSteps = makeSteps(Array(6).fill({ status: 'complete', durationMs: 300 }));
  const commitment = '0xdeadbeef1234567890abcdef';

  it('shows "Proof Valid" status badge', () => {
    render(
      <ZKProofLoader
        steps={successSteps}
        overallProgress={100}
        status="success"
        proofCommitment={commitment}
        totalDurationMs={4200}
        logs={[]}
      />
    );
    expect(screen.getByRole('status', { name: /Proof Valid/i })).toBeInTheDocument();
  });

  it('displays success heading', () => {
    render(
      <ZKProofLoader
        steps={successSteps}
        overallProgress={100}
        status="success"
        proofCommitment={commitment}
        totalDurationMs={4200}
        logs={[]}
      />
    );
    expect(screen.getByText(/Proof Generated Successfully/i)).toBeInTheDocument();
  });

  it('displays total duration', () => {
    render(
      <ZKProofLoader
        steps={successSteps}
        overallProgress={100}
        status="success"
        proofCommitment={commitment}
        totalDurationMs={4200}
        logs={[]}
      />
    );
    expect(screen.getByText(/4\.20s/i)).toBeInTheDocument();
  });

  it('displays proof commitment hash', () => {
    render(
      <ZKProofLoader
        steps={successSteps}
        overallProgress={100}
        status="success"
        proofCommitment={commitment}
        totalDurationMs={4200}
        logs={[]}
      />
    );
    expect(screen.getByText(commitment)).toBeInTheDocument();
  });

  it('shows Reset button on success', () => {
    render(
      <ZKProofLoader
        steps={successSteps}
        overallProgress={100}
        status="success"
        proofCommitment={commitment}
        totalDurationMs={4200}
        logs={[]}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
  });

  it('calls onReset when Reset is clicked', () => {
    const onReset = vi.fn();
    render(
      <ZKProofLoader
        steps={successSteps}
        overallProgress={100}
        status="success"
        proofCommitment={commitment}
        totalDurationMs={4200}
        logs={[]}
        onReset={onReset}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Reset/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('shows disabled "Proof Ready" button on success', () => {
    render(
      <ZKProofLoader
        steps={successSteps}
        overallProgress={100}
        status="success"
        proofCommitment={commitment}
        totalDurationMs={4200}
        logs={[]}
      />
    );
    expect(screen.getByRole('button', { name: /Proof generation complete/i })).toBeDisabled();
  });

  it('shows progress at 100 on success', () => {
    render(
      <ZKProofLoader
        steps={successSteps}
        overallProgress={100}
        status="success"
        proofCommitment={commitment}
        totalDurationMs={4200}
        logs={[]}
      />
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });

  it('shows copy button for commitment', () => {
    render(
      <ZKProofLoader
        steps={successSteps}
        overallProgress={100}
        status="success"
        proofCommitment={commitment}
        totalDurationMs={4200}
        logs={[]}
      />
    );
    expect(screen.getByRole('button', { name: /Copy commitment hash/i })).toBeInTheDocument();
  });
});

// ─── Error state (controlled) ─────────────────────────────────────────────────

describe('ZKProofLoader — error state (controlled)', () => {
  const errorSteps = makeSteps([
    { status: 'complete', durationMs: 400 },
    { status: 'complete', durationMs: 300 },
    { status: 'error' },
  ]);

  it('shows "Proof Failed" status badge', () => {
    render(
      <ZKProofLoader
        steps={errorSteps}
        overallProgress={35}
        status="error"
        error="WASM memory allocation failed"
        logs={[]}
      />
    );
    expect(screen.getByRole('status', { name: /Proof Failed/i })).toBeInTheDocument();
  });

  it('renders error panel with role="alert"', () => {
    render(
      <ZKProofLoader
        steps={errorSteps}
        overallProgress={35}
        status="error"
        error="WASM memory allocation failed"
        logs={[]}
      />
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('displays the error message', () => {
    render(
      <ZKProofLoader
        steps={errorSteps}
        overallProgress={35}
        status="error"
        error="WASM memory allocation failed"
        logs={[]}
      />
    );
    expect(screen.getByText('WASM memory allocation failed')).toBeInTheDocument();
  });

  it('shows Reset button on error', () => {
    render(
      <ZKProofLoader
        steps={errorSteps}
        overallProgress={35}
        status="error"
        error="WASM memory allocation failed"
        logs={[]}
        onReset={vi.fn()}
      />
    );
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
  });
});

// ─── Log console ──────────────────────────────────────────────────────────────

describe('ZKProofLoader — log console', () => {
  const runningSteps = makeSteps([{ status: 'active' }]);
  const sampleLogs = [
    '[12:00:01] [GPS] Requesting position fix…',
    '[12:00:02] [GPS] Accuracy: 12m — accepted',
  ];

  it('shows log toggle button when logs exist', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={10}
        status="running"
        logs={sampleLogs}
      />
    );
    expect(screen.getByRole('button', { name: /PROVER_STDOUT/i })).toBeInTheDocument();
  });

  it('does not show log toggle when no logs', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={10}
        status="running"
        logs={[]}
      />
    );
    expect(screen.queryByRole('button', { name: /PROVER_STDOUT/i })).not.toBeInTheDocument();
  });

  it('shows log count in toggle button', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={10}
        status="running"
        logs={sampleLogs}
      />
    );
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('logs are hidden by default (aria-expanded=false)', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={10}
        status="running"
        logs={sampleLogs}
      />
    );
    expect(
      screen.getByRole('button', { name: /PROVER_STDOUT/i })
    ).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands log console on button click', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={10}
        status="running"
        logs={sampleLogs}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /PROVER_STDOUT/i }));
    expect(
      screen.getByRole('button', { name: /PROVER_STDOUT/i })
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders log lines when expanded', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={10}
        status="running"
        logs={sampleLogs}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /PROVER_STDOUT/i }));
    expect(screen.getByRole('log')).toBeInTheDocument();
    sampleLogs.forEach((line) => {
      expect(screen.getByText(line)).toBeInTheDocument();
    });
  });

  it('collapses log console on second click', () => {
    render(
      <ZKProofLoader
        steps={runningSteps}
        overallProgress={10}
        status="running"
        logs={sampleLogs}
      />
    );
    const btn = screen.getByRole('button', { name: /PROVER_STDOUT/i });
    fireEvent.click(btn); // open
    fireEvent.click(btn); // close
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });
});

// ─── Uncontrolled: onGenerate callback ───────────────────────────────────────

describe('ZKProofLoader — onGenerate callback (controlled mode)', () => {
  it('calls onGenerate when Generate Proof button is clicked (controlled mode)', () => {
    const onGenerate = vi.fn();
    const steps = makeSteps();
    render(
      <ZKProofLoader
        steps={steps}
        overallProgress={0}
        status="idle"
        logs={[]}
        onGenerate={onGenerate}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Generate.*Proof/i }));
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('ZKProofLoader — accessibility', () => {
  it('has aria-live="polite" on root region', () => {
    render(<ZKProofLoader />);
    const region = screen.getByRole('region', { name: /ZK Location Proof Generator/i });
    expect(region).toHaveAttribute('aria-live', 'polite');
  });

  it('has aria-atomic="false" on root region', () => {
    render(<ZKProofLoader />);
    const region = screen.getByRole('region', { name: /ZK Location Proof Generator/i });
    expect(region).toHaveAttribute('aria-atomic', 'false');
  });

  it('applies custom className to root element', () => {
    const { container } = render(<ZKProofLoader className="my-loader" />);
    expect(container.firstChild).toHaveClass('my-loader');
  });
});
