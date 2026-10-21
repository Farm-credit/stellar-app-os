'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ReviewForm } from '@/app/components/reviews/ReviewForm';
import { ReviewCard } from '@/app/components/reviews/ReviewCard';
import { TeamReviewSummary } from '@/app/components/reviews/TeamReviewSummary';
import { type Review, type ReviewSummary } from '@/lib/types/review';
import { CarbonOffsetCalculator } from '@/components/organisms/CarbonOffsetCalculator/CarbonOffsetCalculator';
import { ProjectComparisonTool } from '@/components/ProjectComparisonTool';

interface OwnershipRecord {
  id: string;
  treeOrBatchId: string;
  fromUserId: string | null;
  toUserId: string;
  transactionHash: string;
  ledger: number;
  eventType: 'sponsorship' | 'transfer';
  timestamp: string;
}

interface TreeAgeMilestone {
  treeOrBatchId: string;
  plantedAt: string;
  ageInDays: number;
  nextMilestone: string | null;
  badges: string[];
}

export default function SponsorReviewsPage() {
  const params = useParams();
  const sponsorId = params.sponsorId as string;
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<ReviewSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showProjectSearch, setShowProjectSearch] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [ownershipHistory, setOwnershipHistory] = useState<OwnershipRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [transferToUserId, setTransferToUserId] = useState('');
  const [treeOrBatchId, setTreeOrBatchId] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [treeAges, setTreeAges] = useState<TreeAgeMilestone[]>([]);
  const [ageLoading, setAgeLoading] = useState(false);
  const [ageError, setAgeError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/reviews?sponsorId=${sponsorId}`);
      if (!response.ok) throw new Error('Failed to fetch reviews');

      const data = await response.json();
      setReviews(data.reviews);
      setSummary(data.summary);
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setLoading(false);
    }
  }, [sponsorId]);

  useEffect(() => {
    void fetchReviews();
  }, [fetchReviews]);

  const fetchTreeAges = async () => {
    try {
      setAgeLoading(true);
      setAgeError(null);
      const response = await fetch(`/api/trees/age?sponsorId=${encodeURIComponent(sponsorId)}`);
      if (!response.ok) throw new Error('Failed to fetch tree ages');
      const data = await response.json();
      setTreeAges(data.trees ?? []);
    } catch (error) {
      console.error('Error fetching tree ages:', error);
      setAgeError('Unable to load tree age milestones.');
    } finally {
      setAgeLoading(false);
    }
  };

  const fetchOwnershipHistory = async () => {
    try {
      setHistoryLoading(true);
      setHistoryError(null);
      const query = treeOrBatchId
        ? `treeOrBatchId=${encodeURIComponent(treeOrBatchId)}`
        : `sponsorId=${encodeURIComponent(sponsorId)}`;
      const response = await fetch(`/api/blockchain/ownership?${query}`);
      if (!response.ok) throw new Error('Failed to fetch ownership history');
      const data = await response.json();
      setOwnershipHistory(data.records ?? []);
    } catch (error) {
      console.error('Error fetching ownership history:', error);
      setHistoryError('Unable to load blockchain ownership history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleHistory = async () => {
    const next = !showHistory;
    setShowHistory(next);
    if (next && ownershipHistory.length === 0) {
      await fetchOwnershipHistory();
    }
  };

  const handleTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!treeOrBatchId || !transferToUserId) {
      setTransferError('Provide both the tree/batch ID and the recipient user ID.');
      return;
    }
    try {
      setTransferring(true);
      setTransferError(null);
      const response = await fetch('/api/blockchain/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          treeOrBatchId: treeOrBatchId.trim(),
          fromUserId: sponsorId,
          toUserId: transferToUserId.trim(),
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error ?? 'Failed to record transfer on Stellar');
      }
      setTransferToUserId('');
      await fetchOwnershipHistory();
    } catch (error) {
      console.error('Error recording transfer:', error);
      setTransferError((error as Error).message || 'Unable to record transfer.');
    } finally {
      setTransferring(false);
    }
  };

  const handleSubmit = async (data: any) => {
    try {
      setSubmitting(true);
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, sponsorId }),
      });

      if (!response.ok) throw new Error('Failed to submit review');

      setShowForm(false);
      await fetchReviews();
      await fetchTreeAges();
    } catch (error) {
      console.error('Error submitting review:', error);
      alert('Failed to submit review. Please try again');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Planting Team Reviews</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          {showForm ? 'Cancel' : 'Write Review'}
        </button>
      </div>

      <div className="flex justify-end gap-3 flex-wrap">
        <button
          onClick={fetchTreeAges}
          className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          {ageLoading ? 'Loading Ages...' : 'Refresh Tree Ages'}
        </button>
        <button
          onClick={handleToggleHistory}
          className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          {showHistory ? 'Hide Blockchain Ledger' : 'View Blockchain Ownership Ledger'}
        </button>
        <button
          onClick={() => setShowComparison(!showComparison)}
          className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          {showComparison ? 'Hide Project Comparison' : 'Compare Offset Projects'}
        </button>
        <button
          onClick={() => setShowProjectSearch(!showProjectSearch)}
          className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          {showProjectSearch ? 'Hide Project Search' : 'Search Offset Projects'}
        </button>
        <button
          onClick={() => setShowCalculator(!showCalculator)}
          className="px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          {showCalculator ? 'Hide Carbon Calculator' : 'Calculate My Carbon Offset'}
        </button>
      </div>

      {showHistory && (
        <section className="rounded-lg border border-gray-200 bg-white p-6 space-4">
          <div className="flex flex-col md:flex-row md:items-end gap-3">
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">Stellar Ownership Ledger</h2>
              <p className="text-sm text-gray-500">
                Immutable sponsorship and transfer records recorded on-chain.
              </p>
            </div>
            <div className="flex gap-2 items-end">
              <label className="text-sm text-gray-700" htmlFor="ownership-tree-id">
                Tree/Batch ID
              </label>
              <input
                id="ownership-tree-id"
                value={treeOrBatchId}
                onChange={(e) => setTreeOrBatchId(e.target.value)}
                placeholder="Filter by tree or batch"
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={fetchOwnershipHistory}
                className="rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                Refresh
              </button>
            </div>
          </div>

          {historyError && <p className="text-sm text-red-600">{historyError}</p>}

          {historyLoading ? (
            <p className="text-sm text-gray-500">Loading on-chain records...</p>
          ) : ownershipHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No blockchain records found yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                  <tr>
                    <th>Ledge</th>
                    <th>Event</th>
                    <th>Tree/Batch</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Transaction Hash</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {ownershipHistory.map((record) => (
                    <tr key={record.id} className="border-b border-gray-100">
                      <td className="py-2">{record.ledger}</td>
                      <td className="py-2 capitalize">{record.eventType}</td>
                      <td className="py-2 font-mono text-xs">{record.treeOrBatchId}</td>
                      <td className="py-2 font-mono text-xs">{record.fromUserId ?? '—'}</td>
                      <td className="py-2 font-mono text-xs">{record.toUserId}</td>
                      <td className="py-2 font-mono text-xs">
                        <a
                          className="text-green-700 hover:underline"
                          href={`https://stellar.org/explorer/tx/${record.transactionHash}`}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          {record.transactionHash}
                        </a>
                      </td>
                      <td className="py-2 text-xs text-gray-600">
                        {new Date(record.timestamp).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <form
            onSubmit={handleTransfer}
            className="flex flex-col md:flex-row md:items-end gap-3 border-t border-gray-200 pt-4"
          >
            <div className="flex-1">
              <label className="text-sm text-gray-700" htmlFor="transfer-tree-id">
                Tree/Batch ID
              </label>
              <input
                id="transfer-tree-id"
                value={treeOrBatchId}
                onChange={(e) => setTreeOrBatchId(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm text-gray-700" htmlFor="transfer-to-user">
                Recipient User ID
              </label>
              <input
                id="transfer-to-user"
                value={transferToUserId}
                onChange={(e) => setTransferToUserId(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={transferring}
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {transferring ? 'Recording...' : 'Record Transfer'}
            </button>
          </form>
          {transferError && <p className="text-sm text-red-600">{transferError}</p>}
        </section>
      )}

      {ageError && <p className="text-sm text-red-600">{ageError}</p>}

      {treeAges.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Tree Age & Milestones</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {treeAges.map((tree) => (
              <div key={tree.treeOrBatchId} className="rounded-md border border-gray-100 p-4">
                <p className="font-mono text-xs text-gray-500">{tree.treeOrBatchId}</p>
                <p className="text-sm text-gray-700">
                  Age: {tree.ageInDays} days (planted{' '}
                  {new Date(tree.plantedAt).toLocaleDateString()})
                </p>
                {tree.nextMilestone && (
                  <p className="text-sm text-green-700">Next milestone: {tree.nextMilestone}</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {tree.badges.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {showComparison && <ProjectComparisonTool />}

      {showProjectSearch && <ProjectComparisonTool />}

      {showCalculator && <CarbonOffsetCalculator />}

      {summary && <TeamReviewSummary summary={summary} />}

      {showForm && (
        <ReviewForm
          planterId=""
          onSubmit={handleSubmit}
          onCancel={() => setShowForm(false)}
          isSubmitting={submitting}
        />
      )}

      <div className="space-y-4">
        {treeAges.length === 0 && !ageLoading && (
          <p className="text-sm text-gray-500">No tree age data available yet.</p>
        )}
        {reviews.length === 0 ? (
          <p className="text-center text-gray-500 py-8">No reviews yet. Be the first to review!</p>
        ) : (
          reviews.map((review) => <ReviewCard key={review.id} review={review} />)
        )}
      </div>
    </div>
  );
}
