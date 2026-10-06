'use client';

import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';

interface CarbonOffsetsSectionProps {
  report: BuyerComplianceReport;
}

export function CarbonOffsetsSection({ report }: CarbonOffsetsSectionProps) {
  const { carbonOffsets } = report;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Carbon Offset Purchases</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Real purchase history from verified carbon offset projects
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Total CO₂e</p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {carbonOffsets.totalTonnes.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">tonnes</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Active / Retired</p>
          <p className="mt-2 text-xl font-bold text-foreground">
            {carbonOffsets.activeTonnes.toLocaleString()} /{' '}
            <span className="text-stellar-blue">{carbonOffsets.retiredTonnes.toLocaleString()}</span>
          </p>
          <p className="text-xs text-muted-foreground">tonnes</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Total Cost</p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            ${carbonOffsets.totalCostUsd.toLocaleString()}
          </p>
          <p className="text-xs text-muted-foreground">USD</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Cost per Tonne</p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            ${carbonOffsets.costPerTonUsd}
          </p>
          <p className="text-xs text-muted-foreground">USD</p>
        </div>
      </div>

      {/* Line Items Table */}
      {carbonOffsets.lineItems.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">No carbon offset purchases yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-semibold text-foreground">Project</th>
                <th className="px-4 py-3 text-right font-semibold text-foreground">Tonnes</th>
                <th className="px-4 py-3 text-right font-semibold text-foreground">Cost</th>
                <th className="px-4 py-3 text-right font-semibold text-foreground">Cost/Ton</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-foreground">Verification</th>
              </tr>
            </thead>
            <tbody>
              {carbonOffsets.lineItems.map((item, idx) => (
                <tr key={`${item.projectId}-${idx}`} className="border-b border-border hover:bg-muted/30">
                  <td className="px-4 py-3 text-foreground">{item.projectName}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">
                    {item.tonnes.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">
                    ${item.costUsd.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-foreground">${item.costPerTonUsd}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-1 text-xs font-semibold ${
                        item.status === 'retired'
                          ? 'bg-green-100 text-green-900'
                          : item.status === 'active'
                            ? 'bg-blue-100 text-blue-900'
                            : 'bg-yellow-100 text-yellow-900'
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{item.verification}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
