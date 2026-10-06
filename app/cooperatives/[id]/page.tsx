'use client';

import { use, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { useCooperative } from '@/hooks/useCooperative';

/**
 * Cooperative workspace — Issue #1431
 *
 * Shows the cooperative's collective bargaining position and exposes the
 * pooling + negotiation actions: add members, pool projects, open a bargaining
 * round, record a buyer offer and vote on it.
 */
export default function CooperativeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const {
    cooperative,
    terms,
    isLoading,
    error,
    addMember,
    poolProject,
    startRound,
    submitOffer,
    vote,
    finalizeRound,
  } = useCooperative(id);

  const [memberId, setMemberId] = useState('');
  const [project, setProject] = useState({ projectId: '', quantityTons: '' });
  const [offer, setOffer] = useState({ buyerId: '', pricePerTon: '', quantityTons: '' });
  const [voterId, setVoterId] = useState('');

  async function handleAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memberId.trim()) return;
    await addMember({ userId: memberId.trim() });
    setMemberId('');
  }

  async function handlePool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!project.projectId.trim()) return;
    await poolProject({
      projectId: project.projectId.trim(),
      contributorId: cooperative?.founderId ?? '',
      quantityTons: Number(project.quantityTons),
    });
    setProject({ projectId: '', quantityTons: '' });
  }

  async function handleOffer(event: FormEvent<HTMLFormElement>, roundId: string) {
    event.preventDefault();
    await submitOffer(roundId, {
      buyerId: offer.buyerId.trim(),
      pricePerTon: Number(offer.pricePerTon),
      quantityTons: Number(offer.quantityTons),
    });
    setOffer({ buyerId: '', pricePerTon: '', quantityTons: '' });
  }

  if (isLoading) return <p className="p-10 text-gray-500">Loading cooperative…</p>;
  if (!cooperative || !terms) {
    return <p className="p-10 text-red-600">{error ?? 'Cooperative not found'}</p>;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">{cooperative.name}</h1>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase tracking-wide text-gray-600">
            {cooperative.status}
          </span>
        </div>
        <p className="mt-1 text-gray-600">
          {cooperative.region} · founder {cooperative.founderId}
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </header>

      <section className="mb-8 grid gap-4 rounded-lg border border-gray-200 p-6 sm:grid-cols-4">
        <div>
          <p className="text-sm text-gray-500">Pooled volume</p>
          <p className="text-2xl font-semibold text-gray-900">{terms.pooledQuantityTons} t</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Collective discount</p>
          <p className="text-2xl font-semibold text-gray-900">{terms.discountPercent}%</p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Effective price</p>
          <p className="text-2xl font-semibold text-gray-900">
            ${terms.effectivePricePerTon}/t
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-500">Next tier</p>
          <p className="text-2xl font-semibold text-gray-900">
            {terms.missingTonsForNextTier === null ? 'Max' : `${terms.missingTonsForNextTier} t`}
          </p>
        </div>
        <p className="sm:col-span-4 text-sm text-gray-600">
          {terms.meetsMemberMinimum
            ? `Bargaining unlocked · estimated value $${terms.estimatedTotal.toLocaleString()} (saves $${terms.estimatedSavings.toLocaleString()})`
            : `Add ${terms.minMembersToBargain - terms.memberCount} more member(s) to unlock bargaining`}
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section className="rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Members ({cooperative.members.length})
          </h2>
          <ul className="mt-4 space-y-2">
            {cooperative.members.map((member) => (
              <li key={member.userId} className="flex justify-between text-sm">
                <span className="font-medium text-gray-900">
                  {member.name} <span className="text-gray-500">({member.role})</span>
                </span>
                <span className="text-gray-600">{member.contributedTons} t pooled</span>
              </li>
            ))}
          </ul>

          <form className="mt-4 flex gap-2" onSubmit={handleAddMember}>
            <input
              value={memberId}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setMemberId(event.target.value)}
              placeholder="farmer ID to invite"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded bg-green-700 px-3 py-2 text-sm text-white">
              Invite
            </button>
          </form>
        </section>

        <section className="rounded-lg border border-gray-200 p-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Pooled projects ({cooperative.pooledProjects.length})
          </h2>
          <ul className="mt-4 space-y-2">
            {cooperative.pooledProjects.map((item) => (
              <li key={item.id} className="flex justify-between text-sm">
                <span className="font-medium text-gray-900">{item.projectName}</span>
                <span className="text-gray-600">
                  {item.quantityTons} t @ ${item.pricePerTon}
                </span>
              </li>
            ))}
            {cooperative.pooledProjects.length === 0 && (
              <li className="text-sm text-gray-500">Nothing pooled yet.</li>
            )}
          </ul>

          <form className="mt-4 flex gap-2" onSubmit={handlePool}>
            <input
              value={project.projectId}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setProject({ ...project, projectId: event.target.value })}
              placeholder="project id (e.g. proj-001)"
              className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={project.quantityTons}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setProject({ ...project, quantityTons: event.target.value })}
              placeholder="tonnes"
              className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button type="submit" className="rounded bg-green-700 px-3 py-2 text-sm text-white">
              Pool
            </button>
          </form>
        </section>
      </div>

      <section className="mt-8 rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Collective bargaining</h2>
          <button
            type="button"
            disabled={!terms.meetsMemberMinimum || terms.pooledQuantityTons <= 0}
            onClick={() => void startRound({})}
            className="rounded bg-green-700 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            Open round
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {cooperative.bargainingRounds.length === 0 && (
            <p className="text-sm text-gray-500">No bargaining rounds yet.</p>
          )}

          {cooperative.bargainingRounds.map((round) => (
            <article key={round.id} className="rounded border border-gray-200 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-gray-900">
                  Round {round.id} · target {round.targetQuantityTons} t
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs uppercase text-gray-600">
                  {round.status}
                </span>
              </div>

              {round.offer ? (
                <p className="mt-2 text-sm text-gray-700">
                  Offer from {round.offer.buyerName}: ${round.offer.pricePerTon}/t for{' '}
                  {round.offer.quantityTons} t ({round.votes.length} vote
                  {round.votes.length === 1 ? '' : 's'})
                </p>
              ) : (
                <form
                  className="mt-3 flex flex-wrap gap-2"
                  onSubmit={(event: FormEvent<HTMLFormElement>) => void handleOffer(event, round.id)}
                >
                  <input
                    value={offer.buyerId}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setOffer({ ...offer, buyerId: event.target.value })}
                    placeholder="buyer ID"
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={offer.pricePerTon}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setOffer({ ...offer, pricePerTon: event.target.value })}
                    placeholder="$ / t"
                    className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={offer.quantityTons}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setOffer({ ...offer, quantityTons: event.target.value })}
                    placeholder="tonnes"
                    className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button type="submit" className="rounded bg-green-700 px-3 py-2 text-sm text-white">
                    Record offer
                  </button>
                </form>
              )}

              {round.offer && round.status !== 'accepted' && round.status !== 'rejected' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={voterId}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setVoterId(event.target.value)}
                    placeholder="your farmer ID"
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => void vote(round.id, voterId.trim(), 'accept')}
                    className="rounded bg-green-700 px-3 py-2 text-sm text-white"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void vote(round.id, voterId.trim(), 'reject')}
                    className="rounded bg-red-600 px-3 py-2 text-sm text-white"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => void finalizeRound(round.id)}
                    className="rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    Close with quorum
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
