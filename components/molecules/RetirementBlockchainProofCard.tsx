'use client';

import type { JSX } from 'react';
import type { BlockchainProofReceipt } from '@/lib/retirement/receipt';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/atoms/Card';
import { Badge } from '@/components/atoms/Badge';
import { Text } from '@/components/atoms/Text';

interface RetirementBlockchainProofCardProps {
  receipt: BlockchainProofReceipt;
}

export function RetirementBlockchainProofCard({
  receipt,
}: RetirementBlockchainProofCardProps): JSX.Element {
  const getCategoryBadgeClass = (category: string) => {
    switch (category) {
      case 'biodiversity':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'water':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'soil':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      default:
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'biodiversity':
        return '🌱';
      case 'water':
        return '💧';
      case 'soil':
        return '🌍';
      default:
        return '✨';
    }
  };

  return (
    <Card className="border-stellar-green/30 bg-card/60 backdrop-blur-sm shadow-md overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-b border-border/50 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🛡️</span>
              <CardTitle className="text-lg font-bold">
                Immutable Blockchain Retirement Proof (v2)
              </CardTitle>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Verified cryptographic receipt anchored to Stellar ledger
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30">
              ✓ Immutable Proof
            </Badge>
            <Badge variant="secondary" className="font-mono text-xs">
              {receipt.receiptId}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        {/* Core Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
            <span className="text-xs text-muted-foreground block">Credits Retired</span>
            <span className="text-xl font-bold text-foreground">
              {receipt.creditsRetired} <span className="text-xs font-normal text-muted-foreground">tonnes CO₂</span>
            </span>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
            <span className="text-xs text-muted-foreground block">Standard & Vintage</span>
            <span className="text-sm font-semibold text-foreground truncate block">
              {receipt.project.standard} ({receipt.project.vintageYear})
            </span>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
            <span className="text-xs text-muted-foreground block">Ledger Sequence</span>
            <span className="text-sm font-mono font-semibold text-foreground">
              #{receipt.ledgerSequence}
            </span>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/40">
            <span className="text-xs text-muted-foreground block">Retirement Timestamp</span>
            <span className="text-xs font-medium text-foreground block truncate">
              {new Date(receipt.timestamp).toLocaleString()}
            </span>
          </div>
        </div>

        {/* Project Details */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
          <Text variant="small" as="span" className="font-bold text-xs uppercase tracking-wider text-muted-foreground block mb-2">
            Project Details
          </Text>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="font-semibold text-base text-foreground">{receipt.project.name}</h4>
              <p className="text-xs text-muted-foreground">
                Location: {receipt.project.location} • Type: {receipt.project.type}
              </p>
            </div>
            <Badge variant="outline" className="self-start sm:self-auto font-mono text-xs">
              ID: {receipt.project.id}
            </Badge>
          </div>
        </div>

        {/* Co-Benefits Achieved */}
        <div>
          <Text variant="small" as="span" className="font-bold text-xs uppercase tracking-wider text-muted-foreground block mb-3">
            Co-Benefits Achieved Through This Retirement
          </Text>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {receipt.coBenefits.map((benefit) => (
              <div
                key={benefit.name}
                className="p-3.5 rounded-lg border border-border/60 bg-card hover:border-emerald-500/30 transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span>{getCategoryIcon(benefit.category)}</span>
                    <Badge variant="outline" className={`text-[11px] capitalize ${getCategoryBadgeClass(benefit.category)}`}>
                      {benefit.category}
                    </Badge>
                  </div>
                  <h5 className="font-semibold text-xs text-foreground mb-1">
                    {benefit.name}
                  </h5>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {benefit.description}
                  </p>
                </div>
                {benefit.impactMetric && (
                  <div className="mt-2 pt-2 border-t border-border/40 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                    Impact: {benefit.impactMetric}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Cryptographic Proof Digest and Explorer */}
        <div className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-border/40 text-xs space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="text-muted-foreground">Cryptographic SHA-256 Digest:</span>
            <span className="font-mono text-[11px] text-foreground break-all select-all">
              {receipt.cryptographicDigest}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-1 border-t border-border/30">
            <span className="text-muted-foreground">On-chain Transaction Hash:</span>
            <a
              href={receipt.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-stellar-blue hover:underline font-mono text-[11px] break-all"
            >
              {receipt.transactionHash} ↗
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
