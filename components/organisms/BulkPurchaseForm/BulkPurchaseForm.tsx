'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Text } from '@/components/atoms/Text';
import { Badge } from '@/components/atoms/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/molecules/Card';
import { getStellarExplorerUrl } from '@/lib/stellar/transaction';
import { useBulkPurchase } from '@/hooks/useBulkPurchase';
import { BULK_PURCHASE_MIN_QUANTITY } from '@/lib/types/carbon';
import type { CarbonProject } from '@/lib/types/carbon';
import type { MetadataStorageType } from '@/lib/types/carbon';
import { Building2, Leaf, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';

const PRICE_PER_TOKEN = 15; // USDC per carbon credit token

interface BulkPurchaseFormProps {
  projects: CarbonProject[];
}

export function BulkPurchaseForm({ projects }: BulkPurchaseFormProps) {
  const { state, submit, reset, isProcessing, wallet } = useBulkPurchase();

  // Order fields
  const [projectId, setProjectId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [quantityError, setQuantityError] = useState('');

  // Metadata fields
  const [storageType, setStorageType] = useState<MetadataStorageType>('none');
  const [companyName, setCompanyName] = useState('');
  const [initiativeDescription, setInitiativeDescription] = useState('');
  const [initiativeUrl, setInitiativeUrl] = useState('');

  const parsedQty = parseInt(quantity, 10);
  const isValidQty = !isNaN(parsedQty) && parsedQty >= BULK_PURCHASE_MIN_QUANTITY;
  const totalPrice = isValidQty ? parsedQty * PRICE_PER_TOKEN : 0;
  const selectedProject = projects.find((p) => p.id === projectId);

  const validateQuantity = useCallback((value: string) => {
    const n = parseInt(value, 10);
    if (!value) return setQuantityError('');
    if (isNaN(n) || n <= 0) return setQuantityError('Enter a valid number');
    if (n < BULK_PURCHASE_MIN_QUANTITY)
      return setQuantityError(`Minimum is ${BULK_PURCHASE_MIN_QUANTITY.toLocaleString()} tokens`);
    setQuantityError('');
  }, []);

  const metadataRequired = storageType !== 'none';
  const metadataValid =
    !metadataRequired || (companyName.trim().length > 0 && initiativeDescription.trim().length > 0);

  const canSubmit =
    !!wallet &&
    !!projectId &&
    isValidQty &&
    !quantityError &&
    metadataValid &&
    !isProcessing &&
    state.status !== 'success';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await submit(
      projectId,
      parsedQty,
      totalPrice,
      storageType !== 'none'
        ? {
            companyName: companyName.trim(),
            initiativeDescription: initiativeDescription.trim(),
            initiativeUrl: initiativeUrl.trim() || undefined,
            storageType,
          }
        : undefined
    );
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (state.status === 'success' && state.transactionHash) {
    const explorerUrl = wallet ? getStellarExplorerUrl(state.transactionHash, wallet.network) : '#';
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-stellar-green" aria-hidden="true" />
          <Text as="h2" size="xl" weight="semibold">
            Bulk purchase submitted!
          </Text>
          <Text size="sm" className="text-muted-foreground max-w-sm">
            Your transaction has been broadcast to the Stellar network.
          </Text>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-stellar-blue text-sm hover:underline"
          >
            View on Stellar Explorer <ExternalLink className="h-3.5 w-3.5" />
          </a>
          {state.buildResult?.ipfsCid && (
            <Text size="xs" className="text-muted-foreground">
              IPFS CID: <span className="font-mono">{state.buildResult.ipfsCid}</span>
            </Text>
          )}
          {state.buildResult?.memoValue && storageType === 'on-chain' && (
            <Text size="xs" className="text-muted-foreground">
              On-chain memo hash:{' '}
              <span className="font-mono break-all">{state.buildResult.memoValue}</span>
            </Text>
          )}
          <Button stellar="primary-outline" onClick={reset}>
            New purchase
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Order details ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Leaf className="h-4 w-4 text-stellar-green" aria-hidden="true" />
            Order details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Project selector */}
          <div className="space-y-1.5">
            <label htmlFor="project-select" className="text-sm font-medium">
              Carbon project
            </label>
            <select
              id="project-select"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue disabled:opacity-50"
              disabled={isProcessing}
              aria-required="true"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id} disabled={p.isOutOfStock}>
                  {p.name} — {p.location}
                  {p.isOutOfStock ? ' (out of stock)' : ''}
                </option>
              ))}
            </select>
            {selectedProject && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Badge variant="secondary">{selectedProject.type}</Badge>
                <Badge variant="secondary">{selectedProject.verificationStatus}</Badge>
                <Badge variant="secondary">Vintage {selectedProject.vintageYear}</Badge>
              </div>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label htmlFor="quantity-input" className="text-sm font-medium">
              Quantity (tokens / tons CO₂)
            </label>
            <Input
              id="quantity-input"
              type="number"
              min={BULK_PURCHASE_MIN_QUANTITY}
              step={100}
              placeholder={`Min. ${BULK_PURCHASE_MIN_QUANTITY.toLocaleString()}`}
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                validateQuantity(e.target.value);
              }}
              variant={quantityError ? 'destructive' : isValidQty ? 'success' : 'primary'}
              disabled={isProcessing}
              aria-describedby={quantityError ? 'qty-error' : undefined}
              aria-required="true"
            />
            {quantityError && (
              <Text id="qty-error" size="xs" className="text-destructive flex items-center gap-1">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {quantityError}
              </Text>
            )}
          </div>

          {/* Price summary */}
          {isValidQty && (
            <div className="rounded-lg bg-muted/50 px-4 py-3 flex justify-between items-center">
              <Text size="sm" className="text-muted-foreground">
                Total ({parsedQty.toLocaleString()} × ${PRICE_PER_TOKEN} USDC)
              </Text>
              <Text size="lg" weight="semibold" className="text-stellar-green">
                ${totalPrice.toLocaleString()} USDC
              </Text>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Corporate metadata ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-stellar-blue" aria-hidden="true" />
            Corporate metadata
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              Optional
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Storage type */}
          <div className="space-y-1.5">
            <Text size="sm" weight="medium">
              Metadata storage
            </Text>
            <div
              className="grid grid-cols-3 gap-2"
              role="radiogroup"
              aria-label="Metadata storage type"
            >
              {(
                [
                  { value: 'none', label: 'None' },
                  { value: 'on-chain', label: 'On-chain' },
                  { value: 'ipfs', label: 'IPFS' },
                ] as { value: MetadataStorageType; label: string }[]
              ).map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={storageType === value}
                  onClick={() => setStorageType(value)}
                  disabled={isProcessing}
                  className={`rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue ${
                    storageType === value
                      ? 'border-stellar-blue bg-stellar-blue/10 text-stellar-blue font-medium'
                      : 'border-input hover:border-stellar-blue/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {storageType === 'on-chain' && (
              <Text size="xs" className="text-muted-foreground">
                A SHA-256 hash of your metadata JSON is embedded as the transaction memo.
              </Text>
            )}
            {storageType === 'ipfs' && (
              <Text size="xs" className="text-muted-foreground">
                Your metadata is pinned to IPFS; the CID is referenced in the transaction memo.
              </Text>
            )}
          </div>

          {/* Metadata fields — shown when storage is selected */}
          {storageType !== 'none' && (
            <div className="space-y-3 pt-1">
              <div className="space-y-1.5">
                <label htmlFor="company-name" className="text-sm font-medium">
                  Company / initiative name <span aria-hidden="true">*</span>
                </label>
                <Input
                  id="company-name"
                  placeholder="Acme Corp — Reforestation 2026"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  variant="primary"
                  disabled={isProcessing}
                  aria-required="true"
                  maxLength={100}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="initiative-desc" className="text-sm font-medium">
                  Initiative description <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id="initiative-desc"
                  placeholder="Describe your planting initiative (max 200 characters)"
                  value={initiativeDescription}
                  onChange={(e) => setInitiativeDescription(e.target.value)}
                  disabled={isProcessing}
                  maxLength={200}
                  rows={3}
                  aria-required="true"
                  className="flex w-full rounded-lg border border-stellar-blue/30 bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stellar-blue disabled:opacity-50 resize-none"
                />
                <Text size="xs" className="text-muted-foreground text-right">
                  {initiativeDescription.length}/200
                </Text>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="initiative-url" className="text-sm font-medium">
                  Initiative URL{' '}
                  <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  id="initiative-url"
                  type="url"
                  placeholder="https://example.com/initiative"
                  value={initiativeUrl}
                  onChange={(e) => setInitiativeUrl(e.target.value)}
                  variant="primary"
                  disabled={isProcessing}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Wallet / error state ──────────────────────────────────────────── */}
      {!wallet && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Connect your Stellar wallet to proceed.
        </div>
      )}

      {state.status === 'error' && state.error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {state.error}
        </div>
      )}

      {/* ── Submit ────────────────────────────────────────────────────────── */}
      <Button
        stellar="primary"
        size="lg"
        width="full"
        onClick={handleSubmit}
        disabled={!canSubmit}
        aria-busy={isProcessing}
      >
        {isProcessing
          ? state.status === 'building'
            ? 'Building transaction…'
            : state.status === 'signing'
              ? 'Waiting for signature…'
              : 'Submitting…'
          : `Purchase ${isValidQty ? parsedQty.toLocaleString() : ''} tokens`}
      </Button>
    </div>
  );
}

BulkPurchaseForm.displayName = 'BulkPurchaseForm';
