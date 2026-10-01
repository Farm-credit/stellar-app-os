'use client';

import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import type { BuyerComplianceReport, SupplyChainProject } from '@/lib/esg-reporting-v2';

interface SupplyCh ainSectionProps {
  report: BuyerComplianceReport;
}

function SupplyChainProjectCard({ project }: { project: SupplyChainProject }) {
  const [expanded, setExpanded] = useState(false);

  const stages = project.stages;
  const completedStages = stages.filter((s) => s.status === 'complete').length;

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-4 text-left hover:bg-muted/30"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h4 className="font-semibold text-foreground">{project.projectName}</h4>
            <p className="text-xs text-muted-foreground">
              {project.platform} • {project.assetType}
            </p>
            <div className="mt-2 flex gap-4 text-sm">
              <span className="text-foreground">
                {project.tonnes.toLocaleString()} t CO₂e
              </span>
              <span className="text-stellar-blue">
                ${project.costPerTonUsd}/t
              </span>
              {project.retiredTonnes > 0 && (
                <span className="text-green-600">
                  {project.retiredTonnes.toLocaleString()} t retired
                </span>
              )}
            </div>
          </div>
          <ChevronDown
            className={`mt-1 h-5 w-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* Co-Benefits */}
          {project.coBenefits.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-foreground">Co-Benefits</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {project.coBenefits.map((benefit) => (
                  <span key={benefit} className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-900">
                    {benefit}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Supply Chain Stages */}
          <div>
            <p className="text-sm font-semibold text-foreground">Supply Chain Progression</p>
            <div className="mt-3 space-y-2">
              {stages.map((stage) => (
                <div key={stage.stage} className="flex items-start gap-3">
                  <div className="mt-1 h-4 w-4 flex-shrink-0 rounded-full border-2"
                    style={{
                      borderColor: stage.status === 'complete' ? '#14B6E7' : '#CBD5E1',
                      backgroundColor: stage.status === 'complete' ? '#14B6E7' : 'transparent',
                    }}
                  />
                  <div className="flex-1 py-0.5">
                    <p className="text-sm font-medium capitalize text-foreground">{stage.stage}</p>
                    <p className="text-xs text-muted-foreground">
                      {stage.detail}
                    </p>
                    {stage.at && (
                      <p className="text-xs text-muted-foreground">
                        {new Date(stage.at).toLocaleDateString('en-US')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Details */}
          <div className="grid gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Purchase Count:</span>
              <span className="font-medium text-foreground">{project.purchaseCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">First Purchased:</span>
              <span className="font-medium text-foreground">
                {new Date(project.firstPurchasedAt).toLocaleDateString('en-US')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last Purchased:</span>
              <span className="font-medium text-foreground">
                {new Date(project.lastPurchasedAt).toLocaleDateString('en-US')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SupplyChainSection({ report }: SupplyCh ainSectionProps) {
  const { supplyChain } = report;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Supply Chain Impact</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Chain of custody for each project from origination through retirement
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Projects</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{supplyChain.projectCount}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Retirement Rate</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{supplyChain.retirementRate}%</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Avg Days to Retirement</p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {supplyChain.avgDaysToRetirement !== null ? supplyChain.avgDaysToRetirement : 'N/A'}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">Origination Complete</p>
          <p className="mt-2 text-2xl font-bold text-foreground">
            {supplyChain.stageCompletionSummary.origination}%
          </p>
        </div>
      </div>

      {/* Stage Completion Summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-semibold text-foreground">Stage Completion by Project</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground">Origination</p>
            <p className="text-lg font-bold text-foreground">
              {supplyChain.stageCompletionSummary.origination}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground">Verification</p>
            <p className="text-lg font-bold text-foreground">
              {supplyChain.stageCompletionSummary.verification}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground">Issuance</p>
            <p className="text-lg font-bold text-foreground">
              {supplyChain.stageCompletionSummary.issuance}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground">Purchase</p>
            <p className="text-lg font-bold text-foreground">
              {supplyChain.stageCompletionSummary.purchase}%
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs uppercase text-muted-foreground">Retirement</p>
            <p className="text-lg font-bold text-foreground">
              {supplyChain.stageCompletionSummary.retirement}%
            </p>
          </div>
        </div>
      </div>

      {/* Projects List */}
      {supplyChain.projects.length === 0 ? (
        <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">No supply chain data available</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">
            Projects ({supplyChain.projects.length})
          </h3>
          <div className="space-y-2">
            {supplyChain.projects.map((project) => (
              <SupplyChainProjectCard key={project.projectId} project={project} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
