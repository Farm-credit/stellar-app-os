'use client';

import { useState } from 'react';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Badge } from '@/components/atoms/Badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import { getTransparencyRecord, type FundAllocation } from '@/lib/transparency';

interface FundAllocationTransparencyProps {
  projectId?: string;
  compact?: boolean;
}

export function FundAllocationTransparency({
  projectId,
  compact = false,
}: FundAllocationTransparencyProps) {
  const record = getTransparencyRecord(projectId);
  const [activeCategory, setActiveCategory] = useState<FundAllocation['category'] | null>(null);
  const activeAllocation = record.allocations.find((item) => item.category === activeCategory);

  return (
    <Card className="border-stellar-blue/15" aria-labelledby="fund-allocation-title">
      <CardHeader className={compact ? 'p-5' : undefined}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle id="fund-allocation-title" className="flex items-center gap-2 text-xl">
              Fund allocation transparency
              <Badge variant="success">Live breakdown</Badge>
            </CardTitle>
            <CardDescription className="mt-2">
              Every sponsor payment is shown by the area it supports. Select a segment for details.
            </CardDescription>
          </div>
          <span className="text-xs text-muted-foreground">Updated {record.asOf}</span>
        </div>
      </CardHeader>
      <CardContent className={compact ? 'p-5 pt-0' : undefined}>
        <div className="grid gap-6 md:grid-cols-[minmax(240px,340px)_1fr] md:items-center">
          <div
            className="h-[260px]"
            role="img"
            aria-label="Interactive pie chart showing fund allocation percentages"
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={record.allocations}
                  dataKey="percentage"
                  nameKey="category"
                  innerRadius={62}
                  outerRadius={98}
                  paddingAngle={3}
                  onMouseEnter={(entry) => setActiveCategory(entry.category)}
                  onClick={(entry) => setActiveCategory(entry.category)}
                  className="cursor-pointer"
                >
                  {record.allocations.map((allocation) => (
                    <Cell
                      key={allocation.category}
                      fill={allocation.color}
                      stroke="var(--background)"
                      strokeWidth={activeCategory === allocation.category ? 4 : 2}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value}%`, 'Allocation']} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {record.allocations.map((allocation) => (
              <button
                key={allocation.category}
                type="button"
                onClick={() => setActiveCategory(allocation.category)}
                className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition hover:border-stellar-blue/60 ${activeCategory === allocation.category ? 'border-stellar-blue bg-stellar-blue/10' : 'border-border'}`}
                aria-pressed={activeCategory === allocation.category}
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: allocation.color }}
                    aria-hidden="true"
                  />
                  {allocation.category}
                </span>
                <span className="font-bold">{allocation.percentage}%</span>
              </button>
            ))}
            <p className="min-h-10 text-sm text-muted-foreground">
              {activeAllocation?.description ??
                'Hover or select a category to see how funds are used.'}
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-stellar-green" aria-hidden="true" /> Third-party
            audit completed annually
          </span>
          <a
            className="inline-flex items-center gap-1 font-semibold text-stellar-blue hover:underline"
            href={record.auditReportUrl}
          >
            View audit report <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Next quarterly update: {record.nextQuarterlyUpdate} · Annual audit:{' '}
          {record.annualAuditDate}
        </p>
      </CardContent>
    </Card>
  );
}
