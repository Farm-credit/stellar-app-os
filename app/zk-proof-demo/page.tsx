'use client';

/**
 * /zk-proof-demo
 *
 * Interactive demo page for the ZKProofLoader organism.
 * Shows both the self-contained (auto-simulation) and
 * the controlled (manual step-by-step) variants.
 */

import { useState, type JSX } from 'react';
import { MapPin, Hash, Database, Cpu, Package, ShieldCheck } from 'lucide-react';
import { ZKProofLoader, type ZKLoaderStatus, type ZKProofStep } from '@/components/organisms/ZKProofLoader/ZKProofLoader';
import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';

// ─── Controlled demo helpers ──────────────────────────────────────────────────

const STEP_DEFS: Array<{ id: string; label: string; sublabel: string; icon: JSX.Element }> = [
  {
    id: 'gps',
    label: 'Acquiring GPS Coordinates',
    sublabel: 'navigator.geolocation.getCurrentPosition()',
    icon: <MapPin className="h-3.5 w-3.5" />,
  },
  {
    id: 'commit',
    label: 'Hashing Location Commitment',
    sublabel: 'SHA-256(lat || lon || farmerId || nonce)',
    icon: <Hash className="h-3.5 w-3.5" />,
  },
  {
    id: 'witness',
    label: 'Building Circuit Witness',
    sublabel: 'Preparing Groth16 private inputs',
    icon: <Database className="h-3.5 w-3.5" />,
  },
  {
    id: 'prove',
    label: 'Running ZK Prover',
    sublabel: 'snarkjs.groth16.fullProve() — BN254',
    icon: <Cpu className="h-3.5 w-3.5" />,
  },
  {
    id: 'serialize',
    label: 'Serialising Proof',
    sublabel: 'Encoding a, b, c for Soroban contract',
    icon: <Package className="h-3.5 w-3.5" />,
  },
  {
    id: 'nullifier',
    label: 'Verifying Nullifier',
    sublabel: 'Checking registry for double-submission',
    icon: <ShieldCheck className="h-3.5 w-3.5" />,
  },
];

const STEP_DURATIONS = [500, 400, 300, 1500, 450, 600];

function makeSteps(activeIdx: number, doneIdx: number): ZKProofStep[] {
  return STEP_DEFS.map((def, i) => ({
    ...def,
    status:
      i < doneIdx
        ? 'complete'
        : i === activeIdx
          ? 'active'
          : 'pending',
    durationMs: i < doneIdx ? STEP_DURATIONS[i] : undefined,
  }));
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ZKProofDemoPage(): JSX.Element {
  // ── Controlled variant state ────────────────────────────────────────────────
  const [ctrlStatus, setCtrlStatus] = useState<ZKLoaderStatus>('idle');
  const [ctrlSteps, setCtrlSteps] = useState<ZKProofStep[]>(makeSteps(-1, 0));
  const [ctrlProgress, setCtrlProgress] = useState(0);
  const [ctrlLogs, setCtrlLogs] = useState<string[]>([]);
  const [ctrlCommitment, setCtrlCommitment] = useState<string | null>(null);
  const [ctrlDuration, setCtrlDuration] = useState<number | null>(null);
  const [ctrlError, setCtrlError] = useState<string | null>(null);

  async function handleControlledGenerate() {
    setCtrlStatus('running');
    setCtrlProgress(0);
    setCtrlLogs([]);
    setCtrlCommitment(null);
    setCtrlDuration(null);
    setCtrlError(null);
    setCtrlSteps(makeSteps(0, 0));

    const totalMs = STEP_DURATIONS.reduce((a, b) => a + b, 0);
    const start = Date.now();
    let acc = 0;

    for (let i = 0; i < STEP_DEFS.length; i++) {
      setCtrlSteps(makeSteps(i, i));
      const ts = new Date().toLocaleTimeString();
      setCtrlLogs((p) => [...p, `[${ts}] Starting: ${STEP_DEFS[i].label}`]);

      await sleep(STEP_DURATIONS[i]);

      acc += STEP_DURATIONS[i];
      setCtrlProgress(Math.round((acc / totalMs) * 100));
      setCtrlSteps(makeSteps(i + 1, i + 1));
      setCtrlLogs((p) => [...p, `[${ts}] Done: ${STEP_DEFS[i].label}`]);
    }

    setCtrlProgress(100);
    setCtrlStatus('success');
    setCtrlDuration(Date.now() - start);
    setCtrlCommitment('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890');
  }

  function handleControlledReset() {
    setCtrlStatus('idle');
    setCtrlProgress(0);
    setCtrlSteps(makeSteps(-1, 0));
    setCtrlLogs([]);
    setCtrlCommitment(null);
    setCtrlDuration(null);
    setCtrlError(null);
  }

  return (
    <main className="min-h-screen bg-background px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-16">
        {/* Page header */}
        <div className="space-y-2 text-center">
          <Text as="h1" variant="h1" className="bg-gradient-to-r from-stellar-purple via-stellar-blue to-stellar-cyan bg-clip-text text-transparent">
            ZK Location Proof Loader
          </Text>
          <Text variant="muted" className="mx-auto max-w-xl">
            Multi-step animated UI that visualises real-time progress while a
            Groth16 ZK location proof is generated in-browser using snarkjs.
          </Text>
        </div>

        {/* ─── Demo 1: Self-contained simulation ───────────────────────────── */}
        <section className="space-y-4" aria-labelledby="demo-auto">
          <div className="space-y-1">
            <Text as="h2" variant="h3" id="demo-auto">
              Demo 1 — Self-contained Simulation
            </Text>
            <Text variant="muted" className="text-sm">
              The component manages its own state and runs a realistic multi-step
              simulation when you click <strong>Generate Proof</strong>.
            </Text>
          </div>

          <ZKProofLoader className="max-w-lg" />
        </section>

        {/* ─── Demo 2: Controlled mode ──────────────────────────────────────── */}
        <section className="space-y-4" aria-labelledby="demo-controlled">
          <div className="space-y-1">
            <Text as="h2" variant="h3" id="demo-controlled">
              Demo 2 — Controlled Mode
            </Text>
            <Text variant="muted" className="text-sm">
              Steps, progress, and status are driven from the parent. Click the
              button below to advance through the proof generation externally.
            </Text>
          </div>

          <div className="space-y-4">
            {ctrlStatus === 'idle' && (
              <Button
                stellar="primary"
                onClick={handleControlledGenerate}
                className="w-full max-w-lg"
              >
                Start Controlled Proof Generation
              </Button>
            )}

            <ZKProofLoader
              steps={ctrlSteps}
              overallProgress={ctrlProgress}
              status={ctrlStatus}
              error={ctrlError}
              proofCommitment={ctrlCommitment}
              totalDurationMs={ctrlDuration}
              logs={ctrlLogs}
              onReset={handleControlledReset}
              className="max-w-lg"
            />
          </div>
        </section>

        {/* ─── Demo 3: Error state ──────────────────────────────────────────── */}
        <section className="space-y-4" aria-labelledby="demo-error">
          <div className="space-y-1">
            <Text as="h2" variant="h3" id="demo-error">
              Demo 3 — Error State
            </Text>
            <Text variant="muted" className="text-sm">
              Snapshot of the error panel shown when proof generation fails.
            </Text>
          </div>

          <ZKProofLoader
            steps={[
              ...makeSteps(-1, 3).slice(0, 3),
              { ...STEP_DEFS[3], status: 'error', durationMs: undefined },
              ...makeSteps(-1, 0).slice(4),
            ]}
            overallProgress={55}
            status="error"
            error="WASM memory allocation failed — circuit too large for this device. Try on a desktop browser."
            className="max-w-lg"
            onReset={() => {}}
          />
        </section>

        {/* ─── Demo 4: Auto-run on mount ─────────────────────────────────────── */}
        <section className="space-y-4" aria-labelledby="demo-autorun">
          <div className="space-y-1">
            <Text as="h2" variant="h3" id="demo-autorun">
              Demo 4 — Auto-run on Mount
            </Text>
            <Text variant="muted" className="text-sm">
              Pass <code className="rounded bg-muted px-1 font-mono text-xs">autoRun</code> to
              start the simulation immediately (useful in modals or step wizards).
            </Text>
          </div>

          <ZKProofLoader autoRun className="max-w-lg" />
        </section>
      </div>
    </main>
  );
}
