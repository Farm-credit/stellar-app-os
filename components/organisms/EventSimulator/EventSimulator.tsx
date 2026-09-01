'use client';

import { useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { Zap, X, TreePine, Briefcase, CheckCircle2, Coins } from 'lucide-react';

export function EventSimulator() {
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();

  const handleSimulateTreeSponsored = () => {
    toast.contract(
      'Tree Sponsored',
      ' Madagascar Reforestation Project has received a sponsorship for 150 new mangrove trees.',
      {
        label: 'View Project Registry',
        onClick: () => alert('Opening project registry batch details...'),
      }
    );
  };

  const handleSimulatePlanterAccepted = () => {
    toast.contract(
      'Planter Accepted Job',
      'Planter David K. accepted planting assignment #489 in Southern Zone.',
      {
        label: 'Track Job Progress',
        onClick: () => alert('Navigating to job tracking timeline...'),
      }
    );
  };

  const handleSimulateVerificationComplete = () => {
    toast.contract(
      'Verification Complete',
      'Project "Amazon Rainforest Carbon" passed VCS audit and verification.',
      {
        label: 'Download MRV Report',
        onClick: () => alert('Downloading measurement, reporting, and verification document...'),
      }
    );
  };

  const handleSimulatePaymentReceived = () => {
    toast.contract(
      'Payment Received',
      'Received payment of $450.00 USDC for Madagascar Reforestation Credits.',
      {
        label: 'View Block Explorer',
        onClick: () =>
          window.open('https://stellar.expert/explorer/testnet/tx/1a2b3c4d5e6f', '_blank'),
      }
    );
  };

  return (
    <div className="fixed bottom-4 left-4 z-40 pointer-events-auto">
      {isOpen ? (
        <div className="w-72 overflow-hidden rounded-2xl border border-white/20 dark:border-white/10 bg-white/70 dark:bg-slate-950/70 backdrop-blur-lg shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/50 dark:border-slate-800/50">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-stellar-blue animate-pulse" />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                Stellar Event Simulator
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg p-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Close simulator"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Simulate key Stellar smart contract events to test frontend toast notifications:
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleSimulateTreeSponsored}
              className="flex items-center gap-3 w-full text-left text-xs font-semibold p-2.5 rounded-xl border border-emerald-500/20 bg-emerald-50/20 hover:bg-emerald-50/40 dark:bg-emerald-950/10 dark:hover:bg-emerald-950/20 transition-all text-emerald-700 dark:text-emerald-300"
            >
              <TreePine className="h-4 w-4 shrink-0" />
              Tree Sponsored
            </button>

            <button
              onClick={handleSimulatePlanterAccepted}
              className="flex items-center gap-3 w-full text-left text-xs font-semibold p-2.5 rounded-xl border border-indigo-500/20 bg-indigo-50/20 hover:bg-indigo-50/40 dark:bg-indigo-950/10 dark:hover:bg-indigo-950/20 transition-all text-indigo-700 dark:text-indigo-300"
            >
              <Briefcase className="h-4 w-4 shrink-0" />
              Planter Accepted Job
            </button>

            <button
              onClick={handleSimulateVerificationComplete}
              className="flex items-center gap-3 w-full text-left text-xs font-semibold p-2.5 rounded-xl border border-sky-500/20 bg-sky-50/20 hover:bg-sky-50/40 dark:bg-sky-950/10 dark:hover:bg-sky-950/20 transition-all text-sky-700 dark:text-sky-300"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Verification Complete
            </button>

            <button
              onClick={handleSimulatePaymentReceived}
              className="flex items-center gap-3 w-full text-left text-xs font-semibold p-2.5 rounded-xl border border-amber-500/20 bg-amber-50/20 hover:bg-amber-50/40 dark:bg-amber-950/10 dark:hover:bg-amber-950/20 transition-all text-amber-700 dark:text-amber-300"
            >
              <Coins className="h-4 w-4 shrink-0" />
              Payment Received
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-stellar-blue/30 bg-stellar-blue/15 hover:bg-stellar-blue/25 backdrop-blur-md text-stellar-blue dark:text-stellar-cyan shadow-lg transition-all duration-300 font-semibold text-xs"
          aria-label="Open Stellar Event Simulator"
        >
          <Zap className="h-4 w-4" />
          <span>Simulate Events</span>
        </button>
      )}
    </div>
  );
}
