import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Planter Onboarding & Verification Guide | FarmCredit',
  description:
    'Step-by-step tree verification guide for planters covering photo standards, GPS accuracy requirements, and automated smart contract payouts.',
};

export default function PlanterGuidePage() {
  return (
    <main className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        {/* Header Hero */}
        <header className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              Planter Onboarding Guide
            </span>
            <Link
              href="/planter/register"
              className="text-xs font-medium text-stellar-blue hover:underline sm:text-sm"
            >
              Register as Planter &rarr;
            </Link>
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Step-by-Step Tree Verification Guide
          </h1>
          <p className="mt-3 text-base text-muted-foreground sm:text-lg">
            Complete guide for field planters to capture compliant tree photos, satisfy GPS accuracy
            thresholds, and receive automated Soroban smart contract payouts.
          </p>
        </header>

        {/* 4 Core Pillars Grid */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Pillar 1: Photo Requirements */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 font-bold">
                1
              </div>
              <h2 className="text-xl font-semibold text-foreground">Photo Requirements</h2>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">&#10003;</span>
                <span><strong>Close-Up Photo:</strong> Capture leaf detail, stem texture, and visible physical tree tag ID.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">&#10003;</span>
                <span><strong>Wide-Angle Photo:</strong> Capture surrounding landscape context within a 5-15m radius.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">&#10003;</span>
                <span><strong>EXIF Headers:</strong> Must preserve raw camera EXIF headers (GPS, Timestamp, Device Info).</span>
              </li>
            </ul>
          </div>

          {/* Pillar 2: GPS Accuracy */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 font-bold">
                2
              </div>
              <h2 className="text-xl font-semibold text-foreground">GPS Accuracy Standards</h2>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">&#10003;</span>
                <span><strong>Precision Threshold:</strong> Horizontal accuracy must be &lt; 5.0 meters (Ideal &lt; 2.5m).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">&#10003;</span>
                <span><strong>HDOP Limit:</strong> Dilution of precision (HDOP) must be &le; 2.0.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">&#10003;</span>
                <span><strong>Geofencing:</strong> Coordinates must lie within assigned parcel polygon boundaries.</span>
              </li>
            </ul>
          </div>

          {/* Pillar 3: ZK Proof & Security */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-600 font-bold">
                3
              </div>
              <h2 className="text-xl font-semibold text-foreground">Cryptographic Security</h2>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">&#10003;</span>
                <span><strong>Zero-Knowledge Proofs:</strong> Groth16 ZK location proof verifies location without exposing private data.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">&#10003;</span>
                <span><strong>Anti-Spoofing:</strong> Image perceptual hash prevents duplicate photo re-submissions.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">&#10003;</span>
                <span><strong>On-Chain Hash:</strong> Telemetry payload hash registered on Stellar Soroban ledger.</span>
              </li>
            </ul>
          </div>

          {/* Pillar 4: Milestone Payouts */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 font-bold">
                4
              </div>
              <h2 className="text-xl font-semibold text-foreground">Milestone Payouts</h2>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold">&#10003;</span>
                <span><strong>Multi-Stage Screening:</strong> AI image validation + NDVI satellite vegetation tracking.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold">&#10003;</span>
                <span><strong>Automated Payout:</strong> Smart contract releases USDC directly to planter Stellar wallet.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 font-bold">&#10003;</span>
                <span><strong>Impact NFT:</strong> Soul-bound tree asset NFT minted upon verification.</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Verification Pipeline Process Steps */}
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
          <h2 className="text-2xl font-bold text-foreground">6-Stage Verification Pipeline</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            From initial field capture to instant blockchain settlement.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border border-border p-4 bg-muted/20">
              <span className="text-xs font-semibold uppercase text-stellar-blue">Stage 1</span>
              <h3 className="mt-1 font-semibold text-foreground">Planter Registration</h3>
              <p className="mt-1 text-xs text-muted-foreground">Connect wallet and verify planter credentials.</p>
            </div>
            <div className="rounded-lg border border-border p-4 bg-muted/20">
              <span className="text-xs font-semibold uppercase text-stellar-blue">Stage 2</span>
              <h3 className="mt-1 font-semibold text-foreground">Project Allocation</h3>
              <p className="mt-1 text-xs text-muted-foreground">Select approved planting parcel & tree species.</p>
            </div>
            <div className="rounded-lg border border-border p-4 bg-muted/20">
              <span className="text-xs font-semibold uppercase text-stellar-blue">Stage 3</span>
              <h3 className="mt-1 font-semibold text-foreground">On-Site Capture</h3>
              <p className="mt-1 text-xs text-muted-foreground">Take close-up & wide photos with &lt;5m GPS precision.</p>
            </div>
            <div className="rounded-lg border border-border p-4 bg-muted/20">
              <span className="text-xs font-semibold uppercase text-stellar-blue">Stage 4</span>
              <h3 className="mt-1 font-semibold text-foreground">ZK Hash Proof</h3>
              <p className="mt-1 text-xs text-muted-foreground">Generate cryptographic proof and store hash on-chain.</p>
            </div>
            <div className="rounded-lg border border-border p-4 bg-muted/20">
              <span className="text-xs font-semibold uppercase text-stellar-blue">Stage 5</span>
              <h3 className="mt-1 font-semibold text-foreground">NDVI & AI Screening</h3>
              <p className="mt-1 text-xs text-muted-foreground">Satellite vegetation check and AI quality scoring.</p>
            </div>
            <div className="rounded-lg border border-border p-4 bg-muted/20">
              <span className="text-xs font-semibold uppercase text-stellar-blue">Stage 6</span>
              <h3 className="mt-1 font-semibold text-foreground">Soroban Payout</h3>
              <p className="mt-1 text-xs text-muted-foreground">Automated USDC release & tree asset minting.</p>
            </div>
          </div>
        </section>

        {/* Link to Full Documentation */}
        <div className="rounded-xl border border-stellar-blue/30 bg-stellar-blue/5 p-6 text-center">
          <h3 className="text-lg font-semibold text-foreground">Need full documentation?</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Read the full detailed markdown guide including camera EXIF calibration & technical matrix.
          </p>
          <a
            href="https://github.com/Farm-credit/stellar-app-os/blob/main/docs/PLANTER_ONBOARDING_GUIDE.md"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center rounded-lg bg-stellar-blue px-4 py-2 text-sm font-semibold text-white hover:bg-stellar-blue/90"
          >
            View Full Onboarding Guide &rarr;
          </a>
        </div>
      </div>
    </main>
  );
}
