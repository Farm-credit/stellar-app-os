'use client';

import React, { useMemo, useState } from 'react';

export type SeedBatchStatus =
  | 'collection'
  | 'storage'
  | 'distribution'
  | 'planting';

export interface SeedProvenanceEvent {
  id: string;
  date: string;
  location: string;
  actor: string;
  note?: string;
}

export interface SeedDistributionRecord {
  id: string;
  date: string;
  destination: string;
  quantity: number;
  recipient: string;
}

export interface SeedBatch {
  id: string;
  species: string;
  scientificName?: string;
  quantity: number;
  unit: string;
  status: SeedBatchStatus;
  collectedAt: string;
  collectionSite: string;
  seedBank: string;
  treeProfileId?: string;
  provenance: SeedProvenanceEvent[];
  distributionHistory: SeedDistributionRecord[];
}

export interface SeedBankCapacity {
  seedBank: string;
  capacity: number;
  used: number;
  unit: string;
}

export interface SeedBankInventoryProps {
  batches: SeedBatch[];
  capacities?: SeedBankCapacity[];
  className?: string;
  onSelectBatch?: (batch: SeedBatch) => void;
}

const STATUS_ORDER: SeedBatchStatus[] = [
  'collection',
  'storage',
  'distribution',
  'planting',
];

const STATUS_LABELS: Record<SeedBatchStatus, string> = {
  collection: 'Collection',
  storage: 'Storage',
  distribution: 'Distribution',
  planting: 'Planting',
};

const STATUS_COLORS: Record<SeedBatchStatus, string> = {
  collection: 'bg-amber-100 text-amber-800 border-amber-200',
  storage: 'bg-blue-100 text-blue-800 border-blue-200',
  distribution: 'bg-purple-100 text-purple-800 border-purple-200',
  planting: 'bg-green-100 text-green-800 border-green-200',
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function CapacityBar({ capacity }: { capacity: SeedBankCapacity }) {
  const ratio =
    capacity.capacity > 0
      ? Math.min(1, Math.max(0, capacity.used / capacity.capacity))
      : 0;
  const percent = Math.round(ratio * 100);
  const barColor =
    percent >= 90
      ? 'bg-red-500'
      : percent >= 70
        ? 'bg-amber-500'
        : 'bg-green-500';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-gray-900">
          {capacity.seedBank}
        </span>
        <span className="text-xs text-gray-500">
          {capacity.used.toLocaleString()} / {capacity.capacity.toLocaleString()}{' '}
          {capacity.unit}
        </span>
      </div>
      <div
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${capacity.seedBank} capacity used`}
      >
        <div
          className={`h-full rounded-full ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-gray-500">{percent}% capacity used</p>
    </div>
  );
}

function BatchCard({
  batch,
  onSelect,
}: {
  batch: SeedBatch;
  onSelect?: (batch: SeedBatch) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-gray-900">
            {batch.species}
            {batch.scientificName ? (
              <span className="ml-1 font-normal italic text-gray-500">
                ({batch.scientificName})
              </span>
            ) : null}
          </h4>
          <p className="mt-0.5 text-xs text-gray-500">
            Batch {batch.id} · {batch.quantity.toLocaleString()} {batch.unit}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[batch.status]}`}
        >
          {STATUS_LABELS[batch.status]}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <dt className="text-gray-500">Collected</dt>
          <dd className="text-gray-900">{formatDate(batch.collectedAt)}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Collection site</dt>
          <dd className="text-gray-900">{batch.collectionSite}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Seed bank</dt>
          <dd className="text-gray-900">{batch.seedBank}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Tree profile</dt>
          <dd className="text-gray-900">
            {batch.treeProfileId ? (
              <a
                href={`/trees/${batch.treeProfileId}`}
                className="text-green-700 underline hover:text-green-800"
              >
                {batch.treeProfileId}
              </a>
            ) : (
              <span className="text-gray-400">Not linked</span>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-xs font-medium text-green-700 hover:text-green-800"
          aria-expanded={expanded}
        >
          {expanded ? 'Hide provenance & distribution' : 'View provenance & distribution'}
        </button>
        {onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(batch)}
            className="text-xs font-medium text-gray-600 hover:text-gray-800"
          >
            Details
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-3 space-y-4 border-t border-gray-100 pt-3">
          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Provenance
            </h5>
            {batch.provenance.length === 0 ? (
              <p className="mt-1 text-xs text-gray-400">No provenance events.</p>
            ) : (
              <ol className="mt-2 space-y-2">
                {batch.provenance.map((event) => (
                  <li key={event.id} className="flex gap-2 text-xs">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-green-500" />
                    <div>
                      <p className="text-gray-900">
                        {formatDate(event.date)} · {event.location}
                      </p>
                      <p className="text-gray-500">
                        {event.actor}
                        {event.note ? ` — ${event.note}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Distribution history
            </h5>
            {batch.distributionHistory.length === 0 ? (
              <p className="mt-1 text-xs text-gray-400">
                No distributions recorded.
              </p>
            ) : (
              <ul className="mt-2 space-y-2">
                {batch.distributionHistory.map((record) => (
                  <li key={record.id} className="text-xs">
                    <p className="text-gray-900">
                      {formatDate(record.date)} · {record.destination}
                    </p>
                    <p className="text-gray-500">
                      {record.quantity.toLocaleString()} {batch.unit} to{' '}
                      {record.recipient}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function SeedBankInventory({
  batches,
  capacities = [],
  className = '',
  onSelectBatch,
}: SeedBankInventoryProps) {
  const [activeStatus, setActiveStatus] = useState<SeedBatchStatus | 'all'>(
    'all'
  );

  const counts = useMemo(() => {
    const result: Record<SeedBatchStatus, number> = {
      collection: 0,
      storage: 0,
      distribution: 0,
      planting: 0,
    };
    for (const batch of batches) {
      result[batch.status] += 1;
    }
    return result;
  }, [batches]);

  const filteredBatches = useMemo(() => {
    if (activeStatus === 'all') {
      return batches;
    }
    return batches.filter((batch) => batch.status === activeStatus);
  }, [batches, activeStatus]);

  const totalQuantity = useMemo(
    () => batches.reduce((sum, batch) => sum + batch.quantity, 0),
    [batches]
  );

  return (
    <section
      className={`rounded-xl border border-gray-200 bg-gray-50 p-4 ${className}`}
      aria-label="Seed bank inventory"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Seed Bank Inventory
          </h2>
          <p className="text-xs text-gray-500">
            {batches.length} batch{batches.length === 1 ? '' : 'es'} ·{' '}
            {totalQuantity.toLocaleString()} seeds tracked
          </p>
        </div>
      </header>

      {capacities.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Capacity
          </h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {capacities.map((capacity) => (
              <CapacityBar key={capacity.seedBank} capacity={capacity} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeStatus === 'all'}
          onClick={() => setActiveStatus('all')}
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            activeStatus === 'all'
              ? 'border-gray-900 bg-gray-900 text-white'
              : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
          }`}
        >
          All ({batches.length})
        </button>
        {STATUS_ORDER.map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            aria-selected={activeStatus === status}
            onClick={() => setActiveStatus(status)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              activeStatus === status
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {STATUS_LABELS[status]} ({counts[status]})
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {filteredBatches.length === 0 ? (
          <p className="col-span-full rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
            No seed batches in this stage.
          </p>
        ) : (
          filteredBatches.map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              onSelect={onSelectBatch}
            />
          ))
        )}
      </div>
    </section>
  );
}