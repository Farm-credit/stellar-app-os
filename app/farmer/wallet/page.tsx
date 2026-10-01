/**
 * /farmer/wallet — Farmer multi-chain credit wallet (#1310).
 *
 * Lets a farmer see their carbon-credit holdings across Stellar, Polygon and
 * Ethereum in a unified view, compare live prices, and find the cheapest route
 * to buy or bridge credits between chains.
 */

import type { Metadata } from 'next';
import { MultiChainWalletPanel } from '@/components/organisms/MultiChainWalletPanel/MultiChainWalletPanel';
import type { CreditQuote, MultiChainWalletSnapshot } from '@/lib/types/multichain-wallet';
import { CHAIN_REGISTRY, SUPPORTED_CHAINS } from '@/lib/wallet/multichain';

export const metadata: Metadata = {
  title: 'Multi-Chain Wallet | FarmCredit',
  description:
    'Manage your carbon credits across Stellar, Polygon and Ethereum. Compare live prices and route transfers to minimise fees.',
};

// ---------------------------------------------------------------------------
// Demo / seed data — in production these would be fetched server-side from the
// price oracle and the farmer's on-chain balances.
// ---------------------------------------------------------------------------

const SEED_QUOTES: CreditQuote[] = [
  { chain: 'stellar', pricePerTonne: 42.5, availableTonnes: 500 },
  { chain: 'polygon', pricePerTonne: 41.2, availableTonnes: 320 },
  { chain: 'ethereum', pricePerTonne: 44.8, availableTonnes: 120 },
];

const DEMO_SNAPSHOT: MultiChainWalletSnapshot = {
  addresses: {
    stellar: 'GBZXN7PIRZGNMHGA72XZQGBG66AGDCKTHJNRQ6T6O4B37666U2N2C62Z',
    polygon: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
    ethereum: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
  },
  creditBalances: {
    stellar: 120,
    polygon: 45,
    ethereum: 0,
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function FarmerWalletPage() {
  return (
    <main className="min-h-screen bg-background">
      {/* Page header */}
      <div className="border-b border-border bg-stellar-navy/5">
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                Multi-Chain Wallet
              </h1>
              <p className="mt-1 text-sm text-muted-foreground max-w-xl">
                View and manage your carbon credits across{' '}
                {SUPPORTED_CHAINS.map((id) => CHAIN_REGISTRY[id].name).join(', ')}. The routing
                panel automatically finds the cheapest way to buy or bridge credits given live
                market prices and your existing holdings.
              </p>
            </div>

            {/* Chain legend */}
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_CHAINS.map((id) => (
                <div
                  key={id}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium"
                >
                  <span
                    className={
                      id === 'stellar'
                        ? 'h-2 w-2 rounded-full bg-stellar-blue'
                        : id === 'polygon'
                          ? 'h-2 w-2 rounded-full bg-stellar-purple'
                          : 'h-2 w-2 rounded-full bg-stellar-cyan'
                    }
                    aria-hidden="true"
                  />
                  {CHAIN_REGISTRY[id].name}
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{CHAIN_REGISTRY[id].nativeSymbol}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_380px] items-start">
          {/* Wallet panel (full-featured) */}
          <MultiChainWalletPanel
            initialBalances={DEMO_SNAPSHOT.creditBalances}
            initialAddresses={DEMO_SNAPSHOT.addresses}
            initialQuotes={SEED_QUOTES}
          />

          {/* Side info cards */}
          <aside className="space-y-4" aria-label="Wallet information">
            {/* Fee summary per chain */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-stellar-blue" aria-hidden="true" />
                Settlement costs
              </h2>
              <table className="w-full text-xs" aria-label="Typical settlement costs per chain">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-1 pr-2 font-medium">Chain</th>
                    <th className="py-1 pr-2 font-medium text-right">Gas (USD)</th>
                    <th className="py-1 pr-2 font-medium text-right">Bridge (bps)</th>
                    <th className="py-1 font-medium text-right">Finality</th>
                  </tr>
                </thead>
                <tbody>
                  {SUPPORTED_CHAINS.map((id) => {
                    const c = CHAIN_REGISTRY[id];
                    const secs = c.settlementSeconds;
                    const time =
                      secs < 60
                        ? `${secs}s`
                        : secs < 3600
                          ? `${Math.round(secs / 60)}m`
                          : `${(secs / 3600).toFixed(1)}h`;
                    return (
                      <tr key={id} className="border-t border-border/50">
                        <td className="py-1.5 pr-2 font-medium">{c.name}</td>
                        <td className="py-1.5 pr-2 text-right">${c.gasCostUsd.toFixed(4)}</td>
                        <td className="py-1.5 pr-2 text-right">{c.bridgeFeeBps} bps</td>
                        <td className="py-1.5 text-right text-muted-foreground">{time}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                Gas figures are working estimates. Actual costs vary with network congestion.
              </p>
            </div>

            {/* How routing works */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-sm font-semibold text-foreground mb-2">How routing works</h2>
              <ol className="space-y-2 text-xs text-muted-foreground list-decimal list-inside">
                <li>
                  Enter the quantity of credits you need and your preferred destination chain.
                </li>
                <li>
                  The router checks current market prices on all three chains and compares the
                  all-in cost (credit price + gas + bridge fee) for each option.
                </li>
                <li>
                  If you already hold credits on another chain, bridging them over is evaluated
                  against buying fresh — whichever is cheaper wins.
                </li>
                <li>
                  Routes are ranked cheapest first. Expand any route to see the cost breakdown.
                </li>
              </ol>
            </div>

            {/* API access note */}
            <div className="rounded-xl border border-stellar-blue/20 bg-stellar-blue/5 p-4">
              <h2 className="text-sm font-semibold text-stellar-blue mb-1.5">Developer API</h2>
              <p className="text-xs text-muted-foreground mb-2">
                The same routing engine is available via REST:
              </p>
              <code className="block rounded bg-muted px-2 py-1.5 text-xs font-mono text-foreground break-all">
                POST /api/wallet/multichain
              </code>
              <p className="mt-2 text-xs text-muted-foreground">
                See the{' '}
                <a
                  href="/api-docs"
                  className="text-stellar-blue hover:underline"
                  aria-label="Open API documentation"
                >
                  API docs
                </a>{' '}
                for request / response schemas and examples.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
