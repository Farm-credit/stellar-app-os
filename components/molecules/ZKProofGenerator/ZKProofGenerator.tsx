/**
 * ZK Proof Generator Component
 *
 * Displays the proof generation process with progress indicators,
 * logs, and technical details for transparency. When proof calculation
 * is running, it locks user interactions with a beautiful overlay.
 */

'use client';

import { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CheckCircle2, AlertCircle, Shield, Cpu, Lock, Terminal } from 'lucide-react';
import { Text } from '@/components/atoms/Text';
import type { AnonymousDonationStatus, ProverStep } from '@/hooks/useAnonymousDonation';

interface ZKProofGeneratorProps {
  status: AnonymousDonationStatus;
  proverStep?: ProverStep;
  proverProgress?: number;
  proverMessage?: string;
  proofGenerationTime: number | null;
  error: string | null;
  className?: string;
}

export function ZKProofGenerator({
  status,
  proverStep = 'idle',
  proverProgress = 0,
  proverMessage = '',
  proofGenerationTime,
  error,
  className = '',
}: ZKProofGeneratorProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll the terminal logs
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Keep a running stream of logs during proof generation
  useEffect(() => {
    if (status === 'generating-proof') {
      if (proverMessage) {
        const timestamp = new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        setLogs((prev) => {
          // Prevent duplicates
          if (prev.length > 0 && prev[prev.length - 1].includes(proverMessage)) {
            return prev;
          }
          return [...prev, `[${timestamp}] ${proverMessage}`];
        });
      }
    } else {
      setLogs([]);
    }
  }, [proverMessage, status]);

  // Prevent page scroll when the proof generation modal is overlaying
  useEffect(() => {
    if (status === 'generating-proof') {
      const originalStyle = window.getComputedStyle(document.body).overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalStyle;
      };
    }
  }, [status]);

  if (status === 'idle') {
    return null;
  }

  const isGenerating = status === 'generating-proof';
  const isGenerated = status === 'proof-generated';
  const hasError = status === 'error' && error;

  return (
    <>
      {/* 1. Modal Overlay for Active Proof Generation (Blocks Page Interaction) */}
      <AnimatePresence>
        {isGenerating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/85 backdrop-blur-xl p-4 overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="zk-proving-title"
          >
            {/* Ambient Background Glows */}
            <div className="absolute -top-40 -right-40 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600/10 rounded-full blur-[100px] pointer-events-none" />

            <motion.div
              initial={{ scale: 0.92, y: 15, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.92, y: 15, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="relative w-full max-w-md bg-gradient-to-b from-slate-900 to-slate-950 border border-purple-500/35 rounded-2xl p-6 md:p-8 shadow-[0_0_60px_-10px_rgba(168,85,247,0.45)] overflow-hidden"
            >
              {/* Top Graphic - Rotating Orbital Rings & Shield */}
              <div className="relative flex items-center justify-center w-24 h-24 mx-auto mb-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-0 rounded-full border-2 border-dashed border-purple-500/40"
                />
                <motion.div
                  animate={{ rotate: -360 }}
                  transition={{ duration: 7, repeat: Infinity, ease: 'linear' }}
                  className="absolute inset-2 rounded-full border border-double border-indigo-400/30"
                />
                <motion.div
                  animate={{ scale: [1, 1.08, 1], opacity: [0.25, 0.55, 0.25] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute w-14 h-14 rounded-full bg-purple-500/25 blur-md"
                />
                <Shield className="w-10 h-10 text-purple-400 relative z-10 animate-pulse" />
              </div>

              {/* Header Text */}
              <div className="text-center mb-6">
                <h3
                  id="zk-proving-title"
                  className="text-lg md:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-300 via-indigo-200 to-cyan-300"
                >
                  Calculating Cryptographic Proof
                </h3>
                <Text variant="muted" className="text-xs mt-1 font-mono">
                  BN254 Elliptic Curve • Groth16 Prover
                </Text>
              </div>

              {/* Progress Slider */}
              <div className="space-y-1.5 mb-6">
                <div className="flex justify-between text-xs font-mono text-purple-300/80">
                  <span>Proving State: {proverStep.toUpperCase()}</span>
                  <span className="font-semibold text-cyan-300">{proverProgress}%</span>
                </div>
                <div className="relative w-full h-2.5 bg-slate-950 border border-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-purple-500 via-indigo-500 to-cyan-400 rounded-full"
                    animate={{ width: `${proverProgress}%` }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_0%,rgba(255,255,255,0.15)_50%,transparent_100%)] w-1/2 animate-shimmer" />
                </div>
              </div>

              {/* Lifecycle Step Indicators */}
              <div className="space-y-3 mb-6 bg-slate-950/40 border border-slate-800/80 p-4 rounded-xl">
                <ProofStep
                  icon={<Cpu className="w-3.5 h-3.5" />}
                  label="Commitment Hashing (MiMC)"
                  status={
                    proverStep === 'proving' ||
                    proverStep === 'serializing' ||
                    proverStep === 'done'
                      ? 'complete'
                      : proverStep === 'hashing'
                        ? 'active'
                        : 'pending'
                  }
                />
                <ProofStep
                  icon={<Shield className="w-3.5 h-3.5" />}
                  label="ZK Proof Calculation (Groth16)"
                  status={
                    proverStep === 'serializing' || proverStep === 'done'
                      ? 'complete'
                      : proverStep === 'proving'
                        ? 'active'
                        : 'pending'
                  }
                />
                <ProofStep
                  icon={<Lock className="w-3.5 h-3.5" />}
                  label="Proof Serialization"
                  status={
                    proverStep === 'done'
                      ? 'complete'
                      : proverStep === 'serializing'
                        ? 'active'
                        : 'pending'
                  }
                />
              </div>

              {/* Cryptographic Log Stream Console */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                  <Terminal className="w-3 h-3 text-purple-400" />
                  <span>PROVER_STDOUT_STREAM</span>
                </div>
                <div className="bg-black/50 border border-slate-800/80 rounded-lg p-3 h-28 overflow-y-auto font-mono text-[10px] text-slate-300 space-y-1.5 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                  {logs.map((log, idx) => (
                    <div key={idx} className="flex gap-1.5">
                      <span className="text-purple-400 select-none">&gt;</span>
                      <span className="break-all">{log}</span>
                    </div>
                  ))}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Embedded Page Indicators for Completed / Errored States */}
      {!isGenerating && (
        <div
          className={`rounded-xl border border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800 p-6 space-y-4 ${className}`}
        >
          {/* Header */}
          <div className="flex items-center gap-3">
            {isGenerated && <CheckCircle2 className="w-6 h-6 text-green-500" aria-hidden="true" />}
            {hasError && <AlertCircle className="w-6 h-6 text-red-500" aria-hidden="true" />}

            <div>
              <Text className="font-semibold text-lg">
                {isGenerated && 'Proof Generated Successfully'}
                {hasError && 'Proof Generation Failed'}
              </Text>
              <Text variant="muted" className="text-sm">
                {isGenerated &&
                  proofGenerationTime &&
                  `Completed in ${Math.round(proofGenerationTime)}ms`}
                {hasError && error}
              </Text>
            </div>
          </div>

          {/* Technical Details */}
          {isGenerated && (
            <div className="pt-3 border-t border-purple-200 dark:border-purple-800">
              <Text variant="muted" className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Protocol:</span>
                  <span className="font-mono">Groth16</span>
                </div>
                <div className="flex justify-between">
                  <span>Curve:</span>
                  <span className="font-mono">BN254</span>
                </div>
                <div className="flex justify-between">
                  <span>Proof Size:</span>
                  <span className="font-mono">~256 bytes</span>
                </div>
              </Text>
            </div>
          )}

          {/* Privacy Notice */}
          {isGenerated && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <Shield className="w-4 h-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <Text className="text-xs text-green-700 dark:text-green-300">
                Your wallet address is now cryptographically hidden. The proof can verify your
                donation without revealing your identity.
              </Text>
            </div>
          )}
        </div>
      )}
    </>
  );
}

interface ProofStepProps {
  icon: React.ReactNode;
  label: string;
  status: 'pending' | 'active' | 'complete';
}

function ProofStep({ icon, label, status }: ProofStepProps) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-300 ${
          status === 'complete'
            ? 'bg-green-500 text-white shadow-[0_0_8px_rgba(34,197,94,0.4)]'
            : status === 'active'
              ? 'bg-purple-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.5)]'
              : 'bg-slate-900 border border-slate-800 text-slate-500'
        }`}
      >
        {status === 'complete' ? (
          <motion.div
            initial={{ scale: 0.6 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring' }}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-white" aria-hidden="true" />
          </motion.div>
        ) : status === 'active' ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
        ) : (
          icon
        )}
      </div>
      <Text
        className={`text-xs ${
          status === 'complete'
            ? 'text-green-400 font-medium'
            : status === 'active'
              ? 'text-purple-300 font-medium'
              : 'text-slate-500'
        }`}
      >
        {label}
      </Text>
    </div>
  );
}
