/**
 * ZKProofLoader — Organism
 *
 * Multi-step animated loader that visualises real-time progress while a
 * ZK location proof is generated in the browser.
 *
 * Steps:
 *   1. Acquiring GPS coordinates (browser Geolocation API)
 *   2. Hashing location commitment (MiMC / SHA-256)
 *   3. Building witness (circuit inputs)
 *   4. Running Groth16 prover (snarkjs WASM)
 *   5. Serialising proof for Soroban contract
 *   6. Verifying on-chain nullifier
 *
 * Usage:
 *   Controlled — pass `steps`, `overallProgress`, `status`, and handlers.
 *   Self-contained demo — pass `autoRun` to watch a simulated flow.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin,
  Hash,
  Database,
  Cpu,
  Package,
  ShieldCheck,
  RotateCcw,
  X,
  Terminal,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Text } from '@/components/atoms/Text';
import { Button } from '@/components/atoms/Button';
import { Spinner } from '@/components/atoms/Spinner';
import { ZKStepIndicator, type ZKStepStatus } from '@/components/atoms/ZKStepIndicator';
import { ZKProgressBar } from '@/components/atoms/ZKProgressBar';
import { ZKProofStatusBadge, type ZKProofStatus } from '@/components/atoms/ZKProofStatusBadge';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ZKProofStep {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ReactNode;
  status: ZKStepStatus;
  durationMs?: number;
}

export type ZKLoaderStatus = 'idle' | 'running' | 'success' | 'error';

export interface ZKProofLoaderProps {
  /** Controlled list of steps and their statuses */
  steps?: ZKProofStep[];
  /** Overall 0–100 progress value */
  overallProgress?: number;
  /** Overall loader status */
  status?: ZKLoaderStatus;
  /** Error message when status === 'error' */
  error?: string | null;
  /** Generated proof hash / commitment (shown on success) */
  proofCommitment?: string | null;
  /** Total proof generation time in ms */
  totalDurationMs?: number | null;
  /** Log lines emitted during generation */
  logs?: string[];
  /** Called when user clicks "Generate Proof" */
  onGenerate?: () => void;
  /** Called when user clicks "Reset" */
  onReset?: () => void;
  /** Called when user clicks "Cancel" */
  onCancel?: () => void;
  /** Run a simulated demo automatically */
  autoRun?: boolean;
  /** Additional class names for the root container */
  className?: string;
}

// ─── Default Steps ────────────────────────────────────────────────────────────

const defaultStepDefs: Array<{ id: string; label: string; sublabel: string; icon: React.ReactNode }> =
  [
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

function makeInitialSteps(): ZKProofStep[] {
  return defaultStepDefs.map((def) => ({ ...def, status: 'pending' as ZKStepStatus }));
}

// ─── Simulation helpers ───────────────────────────────────────────────────────

const STEP_DURATIONS = [600, 400, 300, 1800, 500, 700]; // ms per step (demo)

const DEMO_LOGS = [
  '[GPS] Requesting position fix…',
  '[GPS] Accuracy: 12m — accepted',
  '[COMMIT] lat=9.1021 lon=7.3673 scale=1e6',
  '[COMMIT] preimage_hex=0a3f…c91d',
  '[COMMIT] commitment=sha256:e4b1…9f23',
  '[WITNESS] wasm module loaded (circuit_location_v2.wasm)',
  '[WITNESS] Building witness vector…',
  '[PROVE] Initialising BN254 curve params',
  '[PROVE] Loading zkey from IPFS cache…',
  '[PROVE] Generating proof — phase 1/3',
  '[PROVE] Generating proof — phase 2/3',
  '[PROVE] Generating proof — phase 3/3',
  '[PROOF] pi_a: ["0x1a2b…","0xc3d4…","1"]',
  '[PROOF] pi_b: [["0xe5f6…","0x7a8b…"],…]',
  '[PROOF] pi_c: ["0x9c0d…","0x1e2f…","1"]',
  '[SERIAL] Encoding hex blobs for Soroban',
  '[NULLIFIER] Computing nullifier hash…',
  '[NULLIFIER] Checking on-chain registry…',
  '[NULLIFIER] OK — first submission for this nonce',
  '[DONE] Proof valid. Commitment: 0xe4b1…9f23',
];

// ─── Component ────────────────────────────────────────────────────────────────

export function ZKProofLoader({
  steps: controlledSteps,
  overallProgress: controlledProgress,
  status: controlledStatus,
  error: controlledError,
  proofCommitment: controlledCommitment,
  totalDurationMs: controlledDuration,
  logs: controlledLogs,
  onGenerate,
  onReset,
  onCancel,
  autoRun = false,
  className,
}: ZKProofLoaderProps) {
  // ── Internal simulation state (used when not fully controlled) ──────────────
  const [simSteps, setSimSteps] = useState<ZKProofStep[]>(makeInitialSteps);
  const [simProgress, setSimProgress] = useState(0);
  const [simStatus, setSimStatus] = useState<ZKLoaderStatus>('idle');
  const [simError, setSimError] = useState<string | null>(null);
  const [simCommitment, setSimCommitment] = useState<string | null>(null);
  const [simDuration, setSimDuration] = useState<number | null>(null);
  const [simLogs, setSimLogs] = useState<string[]>([]);

  const isControlled = controlledSteps !== undefined;

  const steps = isControlled ? controlledSteps : simSteps;
  const overallProgress = controlledProgress ?? simProgress;
  const status: ZKLoaderStatus = controlledStatus ?? simStatus;
  const error = controlledError ?? simError;
  const proofCommitment = controlledCommitment ?? simCommitment;
  const totalDurationMs = controlledDuration ?? simDuration;
  const logs = controlledLogs ?? simLogs;

  // ── UI State ────────────────────────────────────────────────────────────────
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);
  const startTimeRef = useRef<number>(0);

  // Auto-scroll logs
  useEffect(() => {
    if (showLogs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  // ── Simulation ──────────────────────────────────────────────────────────────
  const runSimulation = useCallback(async () => {
    if (isControlled) return;

    abortRef.current = false;
    startTimeRef.current = Date.now();

    setSimStatus('running');
    setSimError(null);
    setSimCommitment(null);
    setSimDuration(null);
    setSimLogs([]);
    setSimSteps(makeInitialSteps());
    setSimProgress(0);

    const totalProgress = STEP_DURATIONS.reduce((a, b) => a + b, 0);
    let elapsed = 0;
    let logIdx = 0;

    for (let i = 0; i < defaultStepDefs.length; i++) {
      if (abortRef.current) return;

      // Mark step active
      setSimSteps((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx === i ? 'active' : idx < i ? 'complete' : 'pending',
        }))
      );

      const stepDuration = STEP_DURATIONS[i];
      const ticks = 12;
      const tickMs = stepDuration / ticks;
      const stepStart = Date.now();

      // Advance progress and emit logs gradually over step duration
      for (let t = 0; t < ticks; t++) {
        if (abortRef.current) return;
        await sleep(tickMs);

        elapsed += tickMs;
        setSimProgress(Math.round((elapsed / totalProgress) * 100));

        // Drip in demo logs
        if (logIdx < DEMO_LOGS.length) {
          const timestamp = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          });
          setSimLogs((prev) => [...prev, `[${timestamp}] ${DEMO_LOGS[logIdx]}`]);
          logIdx++;
        }
      }

      const durationMs = Date.now() - stepStart;

      // Mark step complete
      setSimSteps((prev) =>
        prev.map((s, idx) => ({
          ...s,
          status: idx <= i ? 'complete' : 'pending',
          durationMs: idx === i ? durationMs : s.durationMs,
        }))
      );
    }

    if (!abortRef.current) {
      setSimProgress(100);
      setSimStatus('success');
      setSimDuration(Date.now() - startTimeRef.current);
      setSimCommitment('0xe4b1c2d3f4a5b6c7d8e9f0a1b2c3d4e5f6789012345678901234567890abcdef');
    }
  }, [isControlled]);

  // Auto-run on mount
  useEffect(() => {
    if (autoRun && simStatus === 'idle') {
      runSimulation();
    }
  }, [autoRun, runSimulation, simStatus]);

  const handleGenerate = () => {
    if (isControlled) {
      onGenerate?.();
    } else {
      runSimulation();
    }
  };

  const handleReset = () => {
    abortRef.current = true;
    if (isControlled) {
      onReset?.();
    } else {
      setSimStatus('idle');
      setSimProgress(0);
      setSimSteps(makeInitialSteps());
      setSimLogs([]);
      setSimCommitment(null);
      setSimDuration(null);
      setSimError(null);
    }
  };

  const handleCancel = () => {
    abortRef.current = true;
    if (isControlled) {
      onCancel?.();
    } else {
      setSimStatus('idle');
      setSimProgress(0);
      setSimSteps(makeInitialSteps());
      setSimLogs([]);
    }
  };

  const handleCopy = async () => {
    if (!proofCommitment) return;
    await navigator.clipboard.writeText(proofCommitment);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const proofStatus: ZKProofStatus =
    status === 'running' ? 'running' : status === 'success' ? 'success' : status === 'error' ? 'error' : 'idle';

  const completedCount = steps.filter((s) => s.status === 'complete').length;
  const activeStep = steps.find((s) => s.status === 'active');

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className={cn(
        'w-full overflow-hidden rounded-2xl border border-border bg-card shadow-lg',
        className
      )}
      role="region"
      aria-label="ZK Location Proof Generator"
      aria-live="polite"
      aria-atomic="false"
    >
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 border-b border-border bg-gradient-to-r from-stellar-navy/5 to-stellar-purple/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <motion.div
              animate={
                status === 'running'
                  ? { rotate: [0, 360] }
                  : {}
              }
              transition={
                status === 'running'
                  ? { duration: 3, repeat: Infinity, ease: 'linear' }
                  : {}
              }
              aria-hidden="true"
            >
              <ShieldCheck
                className={cn(
                  'h-5 w-5 transition-colors duration-300',
                  status === 'success' && 'text-stellar-green',
                  status === 'running' && 'text-stellar-purple',
                  status === 'error' && 'text-destructive',
                  status === 'idle' && 'text-muted-foreground'
                )}
              />
            </motion.div>
            <Text as="h3" variant="h4" className="text-base font-semibold">
              ZK Location Proof
            </Text>
          </div>
          <Text variant="muted" className="text-xs">
            Privacy-preserving GPS verification • Groth16 / BN254
          </Text>
        </div>

        <ZKProofStatusBadge status={proofStatus} />
      </div>

      {/* ── Progress Bar ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {status !== 'idle' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden px-5 pt-4"
          >
            <ZKProgressBar
              value={overallProgress}
              stepLabel={
                activeStep
                  ? `${completedCount + 1}/${steps.length} — ${activeStep.label}`
                  : status === 'success'
                    ? `All ${steps.length} steps complete`
                    : status === 'error'
                      ? 'Proof generation failed'
                      : undefined
              }
              indeterminate={status === 'running' && overallProgress === 0}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Steps list ─────────────────────────────────────────────────────── */}
      <div
        className="space-y-1.5 p-5"
        role="list"
        aria-label="Proof generation steps"
      >
        {steps.map((step, i) => (
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.04, duration: 0.2 }}
          >
            <ZKStepIndicator
              icon={step.icon}
              label={step.label}
              sublabel={step.sublabel}
              status={step.status}
              durationMs={step.durationMs}
            />
          </motion.div>
        ))}
      </div>

      {/* ── Success panel ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {status === 'success' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="mx-5 mb-4 overflow-hidden rounded-xl border border-stellar-green/30 bg-stellar-green/10 p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <Text className="text-sm font-semibold text-stellar-green">
                  Proof Generated Successfully
                </Text>
                <Text variant="muted" className="text-xs">
                  {totalDurationMs != null &&
                    `Total time: ${totalDurationMs < 1000 ? `${totalDurationMs}ms` : `${(totalDurationMs / 1000).toFixed(2)}s`}`}
                </Text>
              </div>
              <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-xs">
                {[
                  { label: 'Protocol', value: 'Groth16' },
                  { label: 'Curve', value: 'BN254' },
                  { label: 'Size', value: '~256 B' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex flex-col">
                    <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
                    <span className="font-mono text-xs font-medium">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Commitment hash */}
            {proofCommitment && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2">
                <span className="font-mono text-[10px] text-muted-foreground">COMMITMENT</span>
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-stellar-cyan">
                  {proofCommitment}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copy commitment hash"
                  className="flex-shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-stellar-cyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
                >
                  {copied ? (
                    <CheckCheck className="h-3.5 w-3.5 text-stellar-green" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error panel ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {status === 'error' && error && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            role="alert"
            className="mx-5 mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4"
          >
            <Text className="text-sm font-semibold text-destructive">Proof Generation Failed</Text>
            <Text variant="muted" className="mt-1 text-xs">
              {error}
            </Text>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Log console ────────────────────────────────────────────────────── */}
      {logs.length > 0 && (
        <div className="mx-5 mb-4">
          <button
            type="button"
            onClick={() => setShowLogs((v) => !v)}
            aria-expanded={showLogs}
            aria-controls="zk-log-console"
            className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue"
          >
            <Terminal className="h-3.5 w-3.5 text-stellar-purple" aria-hidden="true" />
            <span className="flex-1 font-mono">PROVER_STDOUT</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px]">
              {logs.length}
            </span>
            {showLogs ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>

          <AnimatePresence>
            {showLogs && (
              <motion.div
                id="zk-log-console"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div
                  className="mt-1.5 h-40 overflow-y-auto rounded-lg border border-border bg-black/50 p-3 font-mono text-[10px] text-slate-300"
                  role="log"
                  aria-label="Proof generation logs"
                  aria-live="polite"
                >
                  {logs.map((line, i) => (
                    <div key={i} className="flex gap-1.5 leading-5">
                      <span className="text-stellar-purple/70 select-none">›</span>
                      <span className="break-all">{line}</span>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Action buttons ─────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: context info */}
        <Text variant="muted" className="text-xs">
          {status === 'idle' && 'Click to start proof generation'}
          {status === 'running' &&
            `Step ${completedCount + 1} of ${steps.length}…`}
          {status === 'success' && `Proof ready • ${completedCount}/${steps.length} steps`}
          {status === 'error' && 'Proof failed — review error above'}
        </Text>

        {/* Right: CTA buttons */}
        <div className="flex items-center gap-2">
          {status === 'running' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              aria-label="Cancel proof generation"
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Cancel
            </Button>
          )}

          {(status === 'success' || status === 'error') && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              aria-label="Reset and generate new proof"
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Reset
            </Button>
          )}

          {status === 'idle' && (
            <Button
              type="button"
              stellar="accent"
              size="sm"
              onClick={handleGenerate}
              aria-label="Generate ZK location proof"
              className="gap-1.5"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Generate Proof
            </Button>
          )}

          {status === 'running' && (
            <Button
              type="button"
              stellar="accent"
              size="sm"
              disabled
              aria-label="Proof generation in progress"
              className="gap-1.5"
            >
              <Spinner size="sm" srText="" className="h-3.5 w-3.5" />
              Proving…
            </Button>
          )}

          {status === 'success' && (
            <Button
              type="button"
              stellar="success"
              size="sm"
              disabled
              aria-label="Proof generation complete"
              className="gap-1.5"
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Proof Ready
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
