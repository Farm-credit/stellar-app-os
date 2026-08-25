import type { Metadata } from 'next';
import { PlanterRegistrationForm } from '@/components/organisms/PlanterRegistrationForm/PlanterRegistrationForm';
import { Leaf, TreePine, Globe, Wallet } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Planter Registration',
  description:
    'Register as a planter on FarmCredit. Connect your Stellar wallet, create your profile, select your operating regions, and start receiving tree-planting assignments and carbon credit payments.',
  robots: {
    index: false, // Registration pages should not be indexed
    follow: false,
  },
};

const FEATURE_HIGHLIGHTS = [
  {
    icon: Wallet,
    title: 'Wallet-native identity',
    body: 'Your Stellar wallet address is your identity — no username or password needed.',
  },
  {
    icon: TreePine,
    title: 'Real-world impact',
    body: 'Get assigned tree-planting projects and track your verified contribution.',
  },
  {
    icon: Globe,
    title: 'Global reach',
    body: 'Work across multiple regions and connect with international reforestation projects.',
  },
  {
    icon: Leaf,
    title: 'Carbon credit earnings',
    body: 'Receive USDC milestone payments direct to your wallet as trees are verified.',
  },
];

/**
 * /planter/register
 *
 * Standalone registration page for planters. The Header and Footer are
 * rendered by the root layout. The WalletProvider is also already provided
 * by the root layout via WalletProviderWrapper.
 */
export default function PlanterRegisterPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-stellar-navy via-stellar-navy/95 to-stellar-purple/30 border-b border-white/10">
        {/* Decorative rings */}
        <div
          className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full border border-stellar-blue/20"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-16 h-64 w-64 rounded-full border border-stellar-green/20"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <div className="flex items-center gap-2 mb-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-stellar-green/15 border border-stellar-green/30 px-3 py-1 text-xs font-semibold text-stellar-green">
              <Leaf className="h-3 w-3" />
              Planter Programme
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight max-w-2xl">
            Join the FarmCredit
            <br />
            <span className="text-stellar-green">Planter Network</span>
          </h1>
          <p className="mt-4 text-lg text-white/70 max-w-xl">
            Register your Stellar wallet, build your planter profile, and start receiving
            tree-planting assignments with on-chain USDC payments.
          </p>

          {/* Feature highlights */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURE_HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2 hover:bg-white/8 transition-colors"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-stellar-blue/20">
                  <Icon className="h-4 w-4 text-stellar-blue" />
                </div>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-white/60 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Registration form ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
        <div className="rounded-3xl border bg-card shadow-xl shadow-black/5 p-6 sm:p-10">
          <PlanterRegistrationForm />
        </div>

        {/* Already registered? */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already registered?{' '}
          <a href="/farmer" className="text-stellar-blue hover:underline font-medium">
            Go to your dashboard →
          </a>
        </p>
      </section>
    </div>
  );
}
