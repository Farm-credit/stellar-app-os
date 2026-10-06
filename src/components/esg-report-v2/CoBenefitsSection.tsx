'use client';

import type { BuyerComplianceReport } from '@/lib/esg-reporting-v2';

interface CoBenefitsSectionProps {
  report: BuyerComplianceReport;
}

export function CoBenefitsSection({ report }: CoBenefitsSectionProps) {
  const { coBenefits } = report;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Co-Benefits Achieved</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Beyond carbon reduction: additional environmental and social impact from your purchases
        </p>
      </div>

      {/* Summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-semibold text-foreground">
          {coBenefits.allBenefits.length} unique co-benefits across{' '}
          <span className="text-stellar-blue">{coBenefits.totalBenefitInstances}</span> project instances
        </p>
      </div>

      {/* Top Benefits */}
      {coBenefits.topBenefits.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">No co-benefits data available</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Top 5 Co-Benefits</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {coBenefits.topBenefits.map((benefit) => (
              <div
                key={benefit.name}
                className="rounded-lg border border-border bg-card p-3 hover:shadow-sm"
              >
                <p className="text-xs uppercase text-muted-foreground">
                  {benefit.name}
                </p>
                <div className="mt-2 space-y-1">
                  <p className="text-lg font-bold text-foreground">{benefit.tonnes.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">t CO₂e equivalent</p>
                  <p className="text-xs font-medium text-stellar-blue">{benefit.sharePercentage}% of total</p>
                  <p className="text-xs text-muted-foreground">{benefit.projectCount} project(s)</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Benefits Table */}
      {coBenefits.allBenefits.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">All Co-Benefits</h3>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-foreground">Co-Benefit</th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground">Projects</th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground">Tonnes</th>
                  <th className="px-4 py-3 text-right font-semibold text-foreground">% of Total</th>
                </tr>
              </thead>
              <tbody>
                {coBenefits.allBenefits.map((benefit) => (
                  <tr key={benefit.name} className="border-b border-border hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{benefit.name}</td>
                    <td className="px-4 py-3 text-right text-foreground">{benefit.projectCount}</td>
                    <td className="px-4 py-3 text-right text-foreground">
                      {benefit.tonnes.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-foreground">{benefit.sharePercentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
