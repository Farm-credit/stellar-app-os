'use client';

/**
 * MultiChainWalletPanel — Farmer multi-chain credit wallet.
 *
 * Panels:
 *  1. Portfolio view  — credit balances per chain, mark-to-market valuation.
 *  2. Credit routing  — enter quantity + destination, get ranked buy/bridge routes.
 *  3. Price comparison — see which chain is cheapest to buy on right now.
 */

import React, { useCallback, useId, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  Loader2,
  RefreshCw,
  TrendingDown,
  Wallet,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/atoms/Button';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import type {
  ChainId,
  CreditQuote,
  CreditTransferRequest,
  RouteOption,
  RoutingResult,
} from '@/lib/types/multichain-wallet';
import { CHAIN_REGISTRY, SUPPORTED_CHAINS } from '@/lib/wallet/multichain';
import {
  type MultiChainWalletState,
  type WalletValuation,
  useMultiChainWallet,
} from '@/hooks/useMultiChainWallet';

// ─── helpers ──────────────────────────────────────────────────────────────────

function usd(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtTonnes(n: number): string {
  if (n === 0) return '0';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
}

function fmtSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
}

const CHAIN_COLORS: Record<ChainId, string> = {
  stellar: 'bg-stellar-blue',
  polygon: 'bg-stellar-purple',
  ethereum: 'bg-stellar-cyan',
};

const CHAIN_TEXT_COLORS: Record<ChainId, string> = {
  stellar: 'text-stellar-blue',
  polygon: 'text-stellar-purple',
  ethereum: 'text-stellar-cyan',
};

const CHAIN_BORDER_COLORS: Record<ChainId, string> = {
  stellar: 'border-stellar-blue/30',
  polygon: 'border-stellar-purple/30',
  ethereum: 'border-stellar-cyan/30',
};

// ─── sub-components ───────────────────────────────────────────────────────────

function ChainDot({ chain }: { chain: ChainId }) {
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full flex-shrink-0', CHAIN_COLORS[chain])}
      aria-hidden="true"
    />
  );
}

function ChainLabel({ chain }: { chain: ChainId }) {
  return (
    <span className="flex items-center gap-1.5">
      <ChainDot chain={chain} />
      <span className={cn('font-medium', CHAIN_TEXT_COLORS[chain])}>
        {CHAIN_REGISTRY[chain].name}
      </span>
    </span>
  );
}

// ─── Portfolio panel ──────────────────────────────────────────────────────────

interface PortfolioPanelProps {
  valuation: WalletValuation | null;
  quotes: CreditQuote[];
  onRefreshQuotes: () => void;
  isLoading: boolean;
}

function PortfolioPanel({ valuation, quotes, onRefreshQuotes, isLoading }: PortfolioPanelProps) {
  const hasBalances = valuation && valuation.totalTonnes > 0;

  return (
    <section aria-labelledby="portfolio-heading">
      <div className="flex items-center justify-between mb-4">
        <h2
          id="portfolio-heading"
          className="flex items-center gap-2 text-base font-semibold text-foreground"
        >
          <Coins className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
          Credit Portfolio
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefreshQuotes}
          disabled={isLoading}
          aria-label="Refresh market quotes"
          className="gap-1.5"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')}
            aria-hidden="true"
          />
          <span className="sr-only sm:not-sr-only">Refresh</span>
        </Button>
      </div>

      {/* Totals row */}
      {valuation && (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <Text variant="small" className="text-muted-foreground mb-0.5">
              Total Credits
            </Text>
            <p className="text-xl font-bold text-foreground">
              {fmtTonnes(valuation.totalTonnes)}
              <span className="text-xs text-muted-foreground font-normal ml-1">tCO₂e</span>
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <Text variant="small" className="text-muted-foreground mb-0.5">
              Total Value
            </Text>
            <p className="text-xl font-bold text-stellar-green">{usd(valuation.totalValueUsd)}</p>
          </div>
        </div>
      )}

      {/* Per-chain breakdown */}
      <div className="space-y-2">
        {SUPPORTED_CHAINS.map((chainId) => {
          const entry = valuation?.perChain.find((e) => e.chain === chainId);
          const quote = quotes.find((q) => q.chain === chainId);
          const tonnes = entry?.tonnes ?? 0;
          const valueUsd = entry?.valueUsd ?? 0;
          const price = quote?.pricePerTonne ?? 0;

          return (
            <div
              key={chainId}
              className={cn(
                'flex items-center justify-between rounded-lg border bg-card px-3 py-2.5 gap-2',
                CHAIN_BORDER_COLORS[chainId]
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ChainLabel chain={chainId} />
                {price > 0 && (
                  <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
                    {usd(price)}/t
                  </Badge>
                )}
              </div>
              <div className="text-right flex-shrink-0">
                <p className={cn('font-semibold text-sm', tonnes === 0 && 'text-muted-foreground')}>
                  {fmtTonnes(tonnes)} tCO₂e
                </p>
                {tonnes > 0 && <p className="text-xs text-muted-foreground">{usd(valueUsd)}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {!hasBalances && (
        <p className="text-sm text-muted-foreground mt-3 text-center">
          No credits held yet. Use the routing panel below to acquire credits on the cheapest chain.
        </p>
      )}

      {/* Market prices quick view */}
      <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
        <Text variant="small" className="text-muted-foreground mb-2 font-medium">
          Live Market Prices
        </Text>
        <div className="flex flex-wrap gap-2">
          {quotes.map((quote) => (
            <div key={quote.chain} className="flex items-center gap-1.5 text-xs">
              <ChainDot chain={quote.chain} />
              <span className="text-muted-foreground">{CHAIN_REGISTRY[quote.chain].name}:</span>
              <span className="font-semibold text-foreground">{usd(quote.pricePerTonne)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Route card ───────────────────────────────────────────────────────────────

interface RouteCardProps {
  route: RouteOption;
  isRecommended?: boolean;
  rank: number;
}

function RouteCard({ route, isRecommended, rank }: RouteCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={cn(
        'rounded-lg border bg-card transition-colors',
        isRecommended ? 'border-stellar-green ring-1 ring-stellar-green/30' : 'border-border'
      )}
      role="article"
      aria-label={`Route ${rank}: ${route.strategy} on ${route.sourceChain}`}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Rank */}
        <span
          className={cn(
            'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
            isRecommended ? 'bg-stellar-green text-white' : 'bg-muted text-muted-foreground'
          )}
          aria-hidden="true"
        >
          {rank}
        </span>

        {/* Strategy + chains */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            {route.strategy === 'bridge' ? (
              <>
                <ChainLabel chain={route.sourceChain} />
                <ArrowLeftRight
                  className="h-3 w-3 text-muted-foreground flex-shrink-0"
                  aria-hidden="true"
                />
                <ChainLabel chain={route.destinationChain} />
                <Badge variant="secondary" className="text-xs capitalize">
                  Bridge
                </Badge>
              </>
            ) : (
              <>
                <ChainLabel chain={route.sourceChain} />
                <Badge variant="secondary" className="text-xs capitalize">
                  Buy
                </Badge>
              </>
            )}
            {isRecommended && (
              <Badge className="text-xs bg-stellar-green text-white border-stellar-green gap-1">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Best
              </Badge>
            )}
          </div>
          {/* Settlement time */}
          <div className="flex items-center gap-1 mt-0.5">
            <Zap className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <Text variant="small" className="text-muted-foreground">
              ~{fmtSeconds(route.estimatedSettlementSeconds)} settlement
            </Text>
          </div>
        </div>

        {/* Total cost */}
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-sm text-foreground">{usd(route.totalCostUsd)}</p>
          <p className="text-xs text-muted-foreground">{usd(route.effectivePricePerTonne)}/t</p>
        </div>

        {/* Expand toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 flex-shrink-0"
          onClick={() => setExpanded((prev) => !prev)}
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {/* Expanded cost breakdown */}
      {expanded && (
        <div className="border-t border-border px-3 py-2.5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {route.creditCostUsd > 0 && (
              <>
                <dt className="text-muted-foreground">Credit cost</dt>
                <dd className="text-right font-medium">{usd(route.creditCostUsd)}</dd>
              </>
            )}
            {route.bridgeFeeUsd > 0 && (
              <>
                <dt className="text-muted-foreground">Bridge fee</dt>
                <dd className="text-right font-medium">{usd(route.bridgeFeeUsd)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Gas cost</dt>
            <dd className="text-right font-medium">{usd(route.gasCostUsd)}</dd>
            <dt className="text-muted-foreground">Quantity</dt>
            <dd className="text-right font-medium">{fmtTonnes(route.quantityTonnes)} tCO₂e</dd>
            <dt className="text-muted-foreground font-semibold border-t border-border pt-1">
              Total
            </dt>
            <dd className="text-right font-bold border-t border-border pt-1">
              {usd(route.totalCostUsd)}
            </dd>
          </dl>
        </div>
      )}
    </div>
  );
}

// ─── Routing panel ────────────────────────────────────────────────────────────

interface RoutingPanelProps {
  quotes: CreditQuote[];
  snapshot: MultiChainWalletState['snapshot'];
  routingResult: RoutingResult | null;
  isLoading: boolean;
  error: string | null;
  onPlanTransfer: (req: CreditTransferRequest) => void;
  onClearResult: () => void;
}

function RoutingPanel({
  quotes,
  snapshot,
  routingResult,
  isLoading,
  error,
  onPlanTransfer,
  onClearResult,
}: RoutingPanelProps) {
  const formId = useId();
  const [quantity, setQuantity] = useState('');
  const [destination, setDestination] = useState<ChainId | ''>('stellar');
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFormError(null);

      const qty = parseFloat(quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setFormError('Enter a quantity greater than zero.');
        return;
      }

      const request: CreditTransferRequest = {
        quantityTonnes: qty,
        quotes,
        balances: snapshot.creditBalances,
        destinationChain: destination || undefined,
      };
      onPlanTransfer(request);
    },
    [quantity, destination, quotes, snapshot, onPlanTransfer]
  );

  return (
    <section aria-labelledby="routing-heading">
      <h2
        id="routing-heading"
        className="flex items-center gap-2 text-base font-semibold text-foreground mb-4"
      >
        <ArrowLeftRight className="h-4 w-4 text-stellar-purple" aria-hidden="true" />
        Credit Routing
      </h2>

      {/* Routing form */}
      <form id={formId} onSubmit={handleSubmit} noValidate className="space-y-3 mb-5">
        <div>
          <label
            htmlFor={`${formId}-qty`}
            className="block text-sm font-medium text-foreground mb-1"
          >
            Quantity (tCO₂e)
          </label>
          <input
            id={`${formId}-qty`}
            type="number"
            min="0.01"
            step="any"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              setFormError(null);
              if (routingResult) onClearResult();
            }}
            placeholder="e.g. 25"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-stellar-blue/50 disabled:opacity-50"
            aria-describedby={formError ? `${formId}-qty-err` : undefined}
          />
          {formError && (
            <p id={`${formId}-qty-err`} role="alert" className="mt-1 text-xs text-destructive">
              {formError}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={`${formId}-dest`}
            className="block text-sm font-medium text-foreground mb-1"
          >
            Destination chain
          </label>
          <select
            id={`${formId}-dest`}
            value={destination}
            onChange={(e) => setDestination(e.target.value as ChainId | '')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-stellar-blue/50"
          >
            <option value="">Auto (cheapest)</option>
            {SUPPORTED_CHAINS.map((id) => (
              <option key={id} value={id}>
                {CHAIN_REGISTRY[id].name} ({CHAIN_REGISTRY[id].nativeSymbol})
              </option>
            ))}
          </select>
        </div>

        <Button
          type="submit"
          disabled={isLoading || !quantity}
          className="w-full gap-2 bg-stellar-purple hover:bg-stellar-purple/90 text-white"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <TrendingDown className="h-4 w-4" aria-hidden="true" />
          )}
          {isLoading ? 'Calculating…' : 'Find Best Route'}
        </Button>
      </form>

      {/* Error */}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4"
        >
          {error}
        </div>
      )}

      {/* Results */}
      {routingResult && (
        <div>
          {/* Savings banner */}
          {routingResult.savingsVsMostExpensiveUsd > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-stellar-green/30 bg-stellar-green/10 px-3 py-2 text-sm text-stellar-green">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>
                Best route saves you <strong>{usd(routingResult.savingsVsMostExpensiveUsd)}</strong>{' '}
                vs. the most expensive option.
              </span>
            </div>
          )}

          {/* Route list */}
          <div className="space-y-2">
            {routingResult.alternatives.map((route, i) => (
              <RouteCard
                key={`${route.strategy}-${route.sourceChain}-${route.destinationChain}-${i}`}
                route={route}
                isRecommended={i === 0}
                rank={i + 1}
              />
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={onClearResult}
            className="mt-3 w-full text-muted-foreground"
          >
            Clear results
          </Button>
        </div>
      )}
    </section>
  );
}

// ─── Price comparison panel ───────────────────────────────────────────────────

interface PricePanelProps {
  quotes: CreditQuote[];
  isLoading: boolean;
  onCompare: (qty: number) => void;
}

function PriceComparisonPanel({ quotes, isLoading, onCompare }: PricePanelProps) {
  // Sort quotes cheapest first for display.
  const sorted = [...quotes].sort((a, b) => a.pricePerTonne - b.pricePerTonne);
  const cheapest = sorted[0];
  const spread =
    sorted.length > 1 ? sorted[sorted.length - 1].pricePerTonne - cheapest.pricePerTonne : 0;

  return (
    <section aria-labelledby="prices-heading">
      <div className="flex items-center justify-between mb-3">
        <h2
          id="prices-heading"
          className="flex items-center gap-2 text-base font-semibold text-foreground"
        >
          <BarChart3 className="h-4 w-4 text-stellar-cyan" aria-hidden="true" />
          Chain Prices
        </h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={isLoading}
          onClick={() => onCompare(1)}
          aria-label="Refresh price comparison"
          className="gap-1.5"
        >
          <RefreshCw
            className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')}
            aria-hidden="true"
          />
          <span className="sr-only sm:not-sr-only text-xs">Compare</span>
        </Button>
      </div>

      {spread > 0 && (
        <p className="text-xs text-muted-foreground mb-3">
          Price spread across chains:{' '}
          <strong className="text-stellar-green">{usd(spread)}/t</strong> — routing can save you up
          to this per tonne.
        </p>
      )}

      {/* Bar chart (relative widths) */}
      <div className="space-y-2" role="list" aria-label="Carbon credit prices by chain">
        {sorted.map((quote, i) => {
          const maxPrice = sorted[sorted.length - 1].pricePerTonne;
          const widthPct = maxPrice > 0 ? Math.round((quote.pricePerTonne / maxPrice) * 100) : 100;
          const chain = CHAIN_REGISTRY[quote.chain];

          return (
            <div
              key={quote.chain}
              role="listitem"
              aria-label={`${chain.name}: ${usd(quote.pricePerTonne)} per tonne`}
            >
              <div className="flex items-center justify-between text-xs mb-0.5">
                <ChainLabel chain={quote.chain} />
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    {fmtTonnes(quote.availableTonnes)}t available
                  </span>
                  <span className="font-semibold text-foreground">{usd(quote.pricePerTonne)}</span>
                  {i === 0 && (
                    <Badge className="text-xs bg-stellar-green text-white border-stellar-green">
                      Cheapest
                    </Badge>
                  )}
                </div>
              </div>
              <div
                className="h-1.5 rounded-full bg-muted overflow-hidden"
                role="presentation"
                aria-hidden="true"
              >
                <div
                  className={cn('h-full rounded-full transition-all', CHAIN_COLORS[quote.chain])}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Gas & bridge fee table */}
      <details className="mt-4">
        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none">
          Show gas &amp; bridge fees
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs" aria-label="Gas and bridge fees per chain">
            <thead>
              <tr className="text-muted-foreground">
                <th className="text-left py-1 pr-3 font-medium">Chain</th>
                <th className="text-right py-1 pr-3 font-medium">Gas</th>
                <th className="text-right py-1 font-medium">Bridge fee</th>
              </tr>
            </thead>
            <tbody>
              {SUPPORTED_CHAINS.map((id) => {
                const c = CHAIN_REGISTRY[id];
                return (
                  <tr key={id} className="border-t border-border/50">
                    <td className="py-1 pr-3">
                      <ChainLabel chain={id} />
                    </td>
                    <td className="text-right py-1 pr-3">{usd(c.gasCostUsd)}</td>
                    <td className="text-right py-1">{c.bridgeFeeBps} bps</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export type MultiChainWalletPanelTab = 'portfolio' | 'routing' | 'prices';

export interface MultiChainWalletPanelProps {
  /** Initial credit balances (tonnes per chain). Optional. */
  initialBalances?: Partial<Record<ChainId, number>>;
  /** Initial wallet addresses. Optional. */
  initialAddresses?: Partial<Record<ChainId, string>>;
  /** Pre-populated live quotes. Defaults to demo prices. */
  initialQuotes?: CreditQuote[];
  className?: string;
}

export function MultiChainWalletPanel({
  initialBalances,
  initialAddresses,
  initialQuotes,
  className,
}: MultiChainWalletPanelProps) {
  const {
    quotes,
    snapshot,
    valuation,
    routingResult,
    isLoading,
    error,
    updateSnapshot,
    updateQuotes,
    planTransfer,
    compareChains,
    clearResult,
  } = useMultiChainWallet();

  // Apply props on first render.
  const didInit = React.useRef(false);
  React.useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const snap = {
      addresses: initialAddresses ?? {},
      creditBalances: initialBalances ?? {},
    };
    updateSnapshot(snap);
    if (initialQuotes) updateQuotes(initialQuotes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activeTab, setActiveTab] = useState<MultiChainWalletPanelTab>('portfolio');

  const handleRefreshQuotes = useCallback(() => {
    // In a production app this would call an oracle API. For now re-apply the
    // existing quotes to trigger the valuation recompute.
    updateQuotes([...quotes]);
  }, [quotes, updateQuotes]);

  const handleCompare = useCallback(
    (qty: number) => {
      void compareChains(quotes, qty);
    },
    [quotes, compareChains]
  );

  const tabs: Array<{ id: MultiChainWalletPanelTab; label: string; icon: React.ReactNode }> = [
    {
      id: 'portfolio',
      label: 'Portfolio',
      icon: <Wallet className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'routing',
      label: 'Route',
      icon: <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />,
    },
    { id: 'prices', label: 'Prices', icon: <BarChart3 className="h-4 w-4" aria-hidden="true" /> },
  ];

  return (
    <Card
      className={cn('w-full', className)}
      role="region"
      aria-label="Multi-chain carbon credit wallet"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-5 w-5 text-stellar-blue" aria-hidden="true" />
          Multi-Chain Wallet
          <Badge variant="secondary" className="ml-auto text-xs font-normal">
            Stellar · Polygon · Ethereum
          </Badge>
        </CardTitle>
      </CardHeader>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label="Wallet sections"
        className="flex border-b border-border mx-4 mb-4 gap-0.5"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tab-panel-${tab.id}`}
            id={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
              activeTab === tab.id
                ? 'border-stellar-blue text-stellar-blue'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <CardContent>
        <div
          id="tab-panel-portfolio"
          role="tabpanel"
          aria-labelledby="tab-portfolio"
          hidden={activeTab !== 'portfolio'}
        >
          <PortfolioPanel
            valuation={valuation}
            quotes={quotes}
            onRefreshQuotes={handleRefreshQuotes}
            isLoading={isLoading}
          />
        </div>

        <div
          id="tab-panel-routing"
          role="tabpanel"
          aria-labelledby="tab-routing"
          hidden={activeTab !== 'routing'}
        >
          <RoutingPanel
            quotes={quotes}
            snapshot={snapshot}
            routingResult={routingResult}
            isLoading={isLoading}
            error={error}
            onPlanTransfer={planTransfer}
            onClearResult={clearResult}
          />
        </div>

        <div
          id="tab-panel-prices"
          role="tabpanel"
          aria-labelledby="tab-prices"
          hidden={activeTab !== 'prices'}
        >
          <PriceComparisonPanel quotes={quotes} isLoading={isLoading} onCompare={handleCompare} />
        </div>
      </CardContent>
    </Card>
  );
}

MultiChainWalletPanel.displayName = 'MultiChainWalletPanel';
