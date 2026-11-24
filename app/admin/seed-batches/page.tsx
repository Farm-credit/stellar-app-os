'use client';

import React, { useMemo, useState } from 'react';
import { useSeedBatches } from '@/hooks/useSeedBatches';
import SeedBankInventory from '@/components/organisms/SeedBankInventory';
import type { SeedBatch, SeedBatchStage, CreateSeedBatchInput } from '@/hooks/useSeedBatches';

const STAGES: SeedBatchStage[] = ['collection', 'storage', 'distribution', 'planting'];

const STAGE_LABELS: Record<SeedBatchStage, string> = {
  collection: 'Collection',
  storage: 'Storage',
  distribution: 'Distribution',
  planting: 'Planting',
};

function nextStage(stage: SeedBatchStage): SeedBatchStage | null {
  const idx = STAGES.indexOf(stage);
  if (idx < 0 || idx >= STAGES.length - 1) return null;
  return STAGES[idx + 1];
}

export default function SeedBatchesPage() {
  const {
    batches,
    distributions,
    seedBanks,
    loading,
    error,
    createBatch,
    advanceBatch,
    linkTreeProfile,
  } = useSeedBatches();

  const [form, setForm] = useState<CreateSeedBatchInput>({
    species: '',
    collectionSite: '',
    quantity: 0,
    seedBankId: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [treeProfileInputs, setTreeProfileInputs] = useState<Record<string, string>>({});

  const activeSeedBankId = form.seedBankId || seedBanks[0]?.id || '';

  const partnerBatches = useMemo(() => {
    if (!activeSeedBankId) return batches;
    return batches.filter((b) => b.seedBankId === activeSeedBankId);
  }, [batches, activeSeedBankId]);

  const partnerDistributions = useMemo(() => {
    if (!activeSeedBankId) return distributions;
    return distributions.filter((d) => d.seedBankId === activeSeedBankId);
  }, [distributions, activeSeedBankId]);

  const activeSeedBank = useMemo(
    () => seedBanks.find((sb) => sb.id === activeSeedBankId) ?? null,
    [seedBanks, activeSeedBankId]
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.species.trim()) {
      setFormError('Species is required.');
      return;
    }
    if (!form.collectionSite.trim()) {
      setFormError('Collection site is required.');
      return;
    }
    if (!form.quantity || form.quantity <= 0) {
      setFormError('Quantity must be greater than zero.');
      return;
    }
    if (!form.seedBankId) {
      setFormError('Please select a seed bank.');
      return;
    }

    setSubmitting(true);
    try {
      await createBatch({
        species: form.species.trim(),
        collectionSite: form.collectionSite.trim(),
        quantity: form.quantity,
        seedBankId: form.seedBankId,
      });
      setForm({
        species: '',
        collectionSite: '',
        quantity: 0,
        seedBankId: form.seedBankId,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create seed batch.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAdvance(batch: SeedBatch) {
    const next = nextStage(batch.stage);
    if (!next) return;
    setAdvancingId(batch.id);
    try {
      await advanceBatch(batch.id, next);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to advance batch.');
    } finally {
      setAdvancingId(null);
    }
  }

  async function handleLinkTreeProfile(batch: SeedBatch) {
    const treeProfileId = (treeProfileInputs[batch.id] ?? '').trim();
    if (!treeProfileId) return;
    setAdvancingId(batch.id);
    try {
      await linkTreeProfile(batch.id, treeProfileId);
      setTreeProfileInputs((prev) => ({ ...prev, [batch.id]: '' }));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to link tree profile.');
    } finally {
      setAdvancingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Seed Bank Inventory</h1>
        <p className="mt-1 text-sm text-gray-600">
          Track native plant seed batches from collection through storage, distribution, and
          planting. Maintain provenance transparency by linking planted batches to tree profiles.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <section className="mb-8">
        <label htmlFor="seed-bank-select" className="mb-1 block text-sm font-medium text-gray-700">
          Seed bank
        </label>
        <select
          id="seed-bank-select"
          value={activeSeedBankId}
          onChange={(e) => setForm((prev) => ({ ...prev, seedBankId: e.target.value }))}
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
        >
          {seedBanks.length === 0 && <option value="">No seed banks</option>}
          {seedBanks.map((sb) => (
            <option key={sb.id} value={sb.id}>
              {sb.name}
            </option>
          ))}
        </select>
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Inventory</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Loading inventory…</p>
        ) : (
          <SeedBankInventory
            seedBank={activeSeedBank}
            batches={partnerBatches}
            distributions={partnerDistributions}
          />
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Create seed batch</h2>
        <form
          onSubmit={handleCreate}
          className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2"
        >
          <div>
            <label htmlFor="species" className="mb-1 block text-sm font-medium text-gray-700">
              Species
            </label>
            <input
              id="species"
              type="text"
              value={form.species}
              onChange={(e) => setForm((prev) => ({ ...prev, species: e.target.value }))}
              placeholder="e.g. Quercus robur"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label
              htmlFor="collectionSite"
              className="mb-1 block text-sm font-medium text-gray-700"
            >
              Collection site
            </label>
            <input
              id="collectionSite"
              type="text"
              value={form.collectionSite}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  collectionSite: e.target.value,
                }))
              }
              placeholder="e.g. Riverside Woodland"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label htmlFor="quantity" className="mb-1 block text-sm font-medium text-gray-700">
              Quantity (seeds)
            </label>
            <input
              id="quantity"
              type="number"
              min={1}
              value={form.quantity || ''}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  quantity: Number(e.target.value),
                }))
              }
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div>
            <label htmlFor="seedBankId" className="mb-1 block text-sm font-medium text-gray-700">
              Seed bank
            </label>
            <select
              id="seedBankId"
              value={form.seedBankId}
              onChange={(e) => setForm((prev) => ({ ...prev, seedBankId: e.target.value }))}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            >
              <option value="">Select a seed bank</option>
              {seedBanks.map((sb) => (
                <option key={sb.id} value={sb.id}>
                  {sb.name}
                </option>
              ))}
            </select>
          </div>

          {formError && <p className="sm:col-span-2 text-sm text-red-600">{formError}</p>}

          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create batch'}
            </button>
          </div>
        </form>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Batches &amp; lifecycle</h2>
        {loading ? (
          <p className="text-sm text-gray-500">Loading batches…</p>
        ) : partnerBatches.length === 0 ? (
          <p className="text-sm text-gray-500">No seed batches yet.</p>
        ) : (
          <ul className="space-y-4">
            {partnerBatches.map((batch) => {
              const next = nextStage(batch.stage);
              return (
                <li key={batch.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-gray-900">{batch.species}</p>
                      <p className="text-sm text-gray-600">
                        {batch.quantity} seeds · {batch.collectionSite}
                      </p>
                      {batch.treeProfileId && (
                        <p className="mt-1 text-xs text-green-700">
                          Linked tree profile: {batch.treeProfileId}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {STAGES.map((stage) => {
                        const reached = STAGES.indexOf(stage) <= STAGES.indexOf(batch.stage);
                        return (
                          <span
                            key={stage}
                            className={`rounded-full px-2 py-1 text-xs font-medium ${
                              reached ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {STAGE_LABELS[stage]}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    {next ? (
                      <button
                        type="button"
                        onClick={() => handleAdvance(batch)}
                        disabled={advancingId === batch.id}
                        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {advancingId === batch.id
                          ? 'Advancing…'
                          : `Advance to ${STAGE_LABELS[next]}`}
                      </button>
                    ) : (
                      <span className="text-sm text-gray-500">Fully planted</span>
                    )}

                    {batch.stage === 'planting' && !batch.treeProfileId && (
                      <div className="flex items-end gap-2">
                        <div>
                          <label
                            htmlFor={`tree-profile-${batch.id}`}
                            className="mb-1 block text-xs font-medium text-gray-700"
                          >
                            Tree profile ID
                          </label>
                          <input
                            id={`tree-profile-${batch.id}`}
                            type="text"
                            value={treeProfileInputs[batch.id] ?? ''}
                            onChange={(e) =>
                              setTreeProfileInputs((prev) => ({
                                ...prev,
                                [batch.id]: e.target.value,
                              }))
                            }
                            placeholder="tree-profile-id"
                            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleLinkTreeProfile(batch)}
                          disabled={
                            advancingId === batch.id || !(treeProfileInputs[batch.id] ?? '').trim()
                          }
                          className="rounded-md border border-green-600 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Link
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
