'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Globe2,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Trees,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';
import type { PlantingLocation } from '@/lib/db/schema';
import type {
  LocationMatchSuggestion,
  LocationRequestStatus,
  PlantingLocationRequest,
} from '@/lib/planting-location-requests/types';

interface AdminLocationRequestItem extends PlantingLocationRequest {
  suggestions: LocationMatchSuggestion[];
}

interface AdminLocationRequestsResponse {
  requests: AdminLocationRequestItem[];
  availableZones: PlantingLocation[];
  summary: {
    total: number;
    pending: number;
    confirmed: number;
    alternativeAssigned: number;
  };
}

interface DraftAssignment {
  locationId: number;
  resolution: 'confirmed' | 'alternative_assigned';
  adminNotes: string;
}

const STATUS_BADGE_MAP: Record<
  LocationRequestStatus,
  { label: string; variant: 'secondary' | 'success' | 'default' }
> = {
  pending: { label: 'Pending Review', variant: 'secondary' },
  confirmed: { label: 'Location Confirmed', variant: 'success' },
  alternative_assigned: { label: 'Alternative Assigned', variant: 'default' },
};

export default function AdminLocationRequestsPage() {
  const [requests, setRequests] = useState<AdminLocationRequestItem[]>([]);
  const [availableZones, setAvailableZones] = useState<PlantingLocation[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    confirmed: 0,
    alternativeAssigned: 0,
  });
  const [statusFilter, setStatusFilter] = useState<LocationRequestStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftAssignment>>({});

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (searchQuery.trim()) params.set('search', searchQuery.trim());

      const response = await fetch(`/api/admin/planting-location-requests?${params.toString()}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        const errBody = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error || `Request failed (${response.status})`);
      }

      const data = (await response.json()) as AdminLocationRequestsResponse;
      setRequests(data.requests);
      setAvailableZones(data.availableZones);
      setSummary(data.summary);

      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of data.requests) {
          if (!next[item.id]) {
            const topSuggestion = item.suggestions[0];
            next[item.id] = {
              locationId: item.assignedLocationId ?? topSuggestion?.location.id ?? 0,
              resolution:
                item.status === 'alternative_assigned'
                  ? 'alternative_assigned'
                  : topSuggestion?.isExactMatch
                    ? 'confirmed'
                    : 'alternative_assigned',
              adminNotes: item.adminNotes ?? '',
            };
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load location requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, searchQuery]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const updateDraft = (requestId: string, patch: Partial<DraftAssignment>) => {
    setDrafts((prev) => ({
      ...prev,
      [requestId]: {
        locationId: prev[requestId]?.locationId ?? 0,
        resolution: prev[requestId]?.resolution ?? 'confirmed',
        adminNotes: prev[requestId]?.adminNotes ?? '',
        ...patch,
      },
    }));
  };

  const handleAssignZone = async (item: AdminLocationRequestItem) => {
    const draft = drafts[item.id];
    if (!draft || !draft.locationId) {
      setError('Select an available planting zone before submitting.');
      return;
    }

    setSubmittingId(item.id);
    setError(null);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/planting-location-requests/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationId: draft.locationId,
          resolution: draft.resolution,
          adminNotes: draft.adminNotes.trim() || null,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(body.error || 'Failed to match planting zone');
      }

      setFeedback(body.message || 'Sponsor planting zone updated and notification sent.');
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign planting zone');
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Tree Planting Location Requests
          </h1>
          <p className="text-sm text-gray-600">
            Match sponsor geographic preferences to available planting zones and notify sponsors
            when their location is confirmed or an alternative is assigned.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadRequests()}
          disabled={loading}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Requests</CardDescription>
            <CardTitle className="text-2xl">{summary.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Review</CardDescription>
            <CardTitle className="text-2xl text-amber-600">{summary.pending}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Confirmed Matches</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">{summary.confirmed}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alternative Assigned</CardDescription>
            <CardTitle className="text-2xl text-blue-600">{summary.alternativeAssigned}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by sponsor name, email, region, or country..."
            className="pl-9"
            aria-label="Search location requests"
          />
        </div>

        <div className="flex items-center gap-2">
          {(['all', 'pending', 'confirmed', 'alternative_assigned'] as const).map((status) => (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={statusFilter === status ? 'default' : 'outline'}
              onClick={() => setStatusFilter(status)}
            >
              {status === 'all'
                ? 'All'
                : status === 'pending'
                  ? 'Pending'
                  : status === 'confirmed'
                    ? 'Confirmed'
                    : 'Alternative'}
            </Button>
          ))}
        </div>
      </div>

      {/* Feedback & Error Alerts */}
      {feedback && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{feedback}</span>
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* Request List */}
      {loading && requests.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading sponsor location requests...
        </div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          No planting location requests match the current filter.
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((item) => {
            const badge = STATUS_BADGE_MAP[item.status];
            const draft = drafts[item.id] ?? {
              locationId: item.suggestions[0]?.location.id ?? availableZones[0]?.id ?? 0,
              resolution: item.suggestions[0]?.isExactMatch ? 'confirmed' : 'alternative_assigned',
              adminNotes: item.adminNotes ?? '',
            };
            const selectedSuggestion = item.suggestions.find(
              (s) => s.location.id === draft.locationId
            );

            return (
              <Card key={item.id} data-testid={`location-request-card-${item.id}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{item.sponsorName || 'Sponsor'}</CardTitle>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        <Badge variant="outline" className="gap-1">
                          <Trees className="h-3 w-3" aria-hidden="true" />
                          {item.treeCount} {item.treeCount === 1 ? 'tree' : 'trees'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                          {item.sponsorEmail}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Globe2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                          Preferred:{' '}
                          <strong className="text-gray-800">
                            {item.preferredCountry
                              ? `${item.preferredCountry} (${item.preferredRegion})`
                              : item.preferredRegion}
                          </strong>
                        </span>
                        {item.transactionRef && (
                          <span className="font-mono">Ref: {item.transactionRef}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {item.preferenceNotes && (
                    <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                      <span className="font-semibold">Sponsor note:</span> {item.preferenceNotes}
                    </div>
                  )}

                  {item.status !== 'pending' && item.assignedZoneName && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900">
                      <div className="flex items-center gap-2 font-medium">
                        <MapPin className="h-4 w-4 text-emerald-600" aria-hidden="true" />
                        <span>
                          Assigned Zone: {item.assignedZoneName} ({item.assignedRegion})
                        </span>
                      </div>
                      {item.adminNotes && (
                        <p className="mt-1 text-xs text-emerald-800">Note: {item.adminNotes}</p>
                      )}
                      {item.notifiedAt && (
                        <p className="mt-1 text-xs text-emerald-700">
                          Sponsor notified on {new Date(item.notifiedAt).toLocaleString()}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Admin Matching Controls */}
                  <div className="grid gap-3 rounded-lg border border-gray-200 bg-gray-50/70 p-4 md:grid-cols-3">
                    <div className="space-y-1.5 md:col-span-2">
                      <label
                        htmlFor={`zone-select-${item.id}`}
                        className="flex items-center gap-1.5 text-xs font-semibold text-gray-700"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        Match to Available Planting Zone
                      </label>
                      <select
                        id={`zone-select-${item.id}`}
                        aria-label={`Select planting zone for ${item.sponsorName || item.sponsorEmail}`}
                        value={draft.locationId}
                        onChange={(e) => {
                          const locationId = Number(e.target.value);
                          const suggestion = item.suggestions.find(
                            (s) => s.location.id === locationId
                          );
                          updateDraft(item.id, {
                            locationId,
                            resolution: suggestion?.isExactMatch
                              ? 'confirmed'
                              : 'alternative_assigned',
                          });
                        }}
                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {item.suggestions.map((suggestion) => (
                          <option key={suggestion.location.id} value={suggestion.location.id}>
                            {suggestion.isExactMatch ? '[Match] ' : '[Alternative] '}
                            {suggestion.location.name} — {suggestion.location.region} (
                            {suggestion.location.availableCapacity.toLocaleString()} capacity)
                          </option>
                        ))}
                      </select>
                      {selectedSuggestion && (
                        <Text variant="small" className="text-xs text-gray-600">
                          {selectedSuggestion.matchReason}
                        </Text>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <label
                        htmlFor={`resolution-select-${item.id}`}
                        className="text-xs font-semibold text-gray-700"
                      >
                        Resolution Type
                      </label>
                      <select
                        id={`resolution-select-${item.id}`}
                        aria-label={`Resolution type for ${item.sponsorName || item.sponsorEmail}`}
                        value={draft.resolution}
                        onChange={(e) =>
                          updateDraft(item.id, {
                            resolution: e.target.value as 'confirmed' | 'alternative_assigned',
                          })
                        }
                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="confirmed">Confirm Matching Location</option>
                        <option value="alternative_assigned">Assign Alternative Zone</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 md:col-span-2">
                      <label
                        htmlFor={`admin-notes-${item.id}`}
                        className="text-xs font-semibold text-gray-700"
                      >
                        Message to Sponsor (optional)
                      </label>
                      <Input
                        id={`admin-notes-${item.id}`}
                        type="text"
                        placeholder="Explain zone match or why an alternative zone was selected..."
                        value={draft.adminNotes}
                        onChange={(e) => updateDraft(item.id, { adminNotes: e.target.value })}
                      />
                    </div>

                    <div className="flex items-end">
                      <Button
                        type="button"
                        className="w-full"
                        disabled={submittingId === item.id || !draft.locationId}
                        onClick={() => void handleAssignZone(item)}
                      >
                        <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                        {submittingId === item.id
                          ? 'Notifying...'
                          : draft.resolution === 'confirmed'
                            ? 'Confirm & Notify'
                            : 'Assign Alternative & Notify'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
