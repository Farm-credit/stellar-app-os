import type { FireRiskLevel } from '@/lib/fire-risk';

const styles: Record<FireRiskLevel, string> = {
  Low: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  Medium: 'border-yellow-200 bg-yellow-50 text-yellow-900',
  High: 'border-orange-200 bg-orange-50 text-orange-900',
  Extreme: 'border-red-200 bg-red-50 text-red-900',
};

export function FireRiskIndicator({
  level,
  fwi,
  updatedAt,
}: {
  level: FireRiskLevel;
  fwi: number;
  updatedAt: string;
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${styles[level]}`}
      role="status"
      aria-label={`Forest fire risk: ${level}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">Forest fire risk: {level}</span>
        <span className="text-xs font-medium">FWI {fwi.toFixed(1)}</span>
      </div>
      <p className="mt-1 text-xs opacity-80">
        Updated{' '}
        {updatedAt === new Date(0).toISOString()
          ? 'pending daily update'
          : new Date(updatedAt).toLocaleDateString()}
      </p>
    </div>
  );
}
