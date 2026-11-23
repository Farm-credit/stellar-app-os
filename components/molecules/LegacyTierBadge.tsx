import { TreePine } from 'lucide-react';
import { getLegacyStatus } from '@/lib/legacy-programme';

export function LegacyTierBadge({
  sponsorName,
  commitmentYears = 10,
  compact = false,
}: {
  sponsorName?: string;
  commitmentYears?: number;
  compact?: boolean;
}) {
  if (!sponsorName || !getLegacyStatus(sponsorName, commitmentYears).eligible) return null;
  const groveName = getLegacyStatus(sponsorName, commitmentYears).groveName;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900"
      title={`Named grove: ${groveName}`}
    >
      <TreePine className="h-3.5 w-3.5" aria-hidden="true" />
      {compact ? 'Legacy' : `Legacy sponsor · ${groveName}`}
    </span>
  );
}
