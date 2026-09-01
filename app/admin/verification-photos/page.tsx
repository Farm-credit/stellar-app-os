'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  MapPin,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { Text } from '@/components/atoms/Text';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/molecules/Card';

interface VerificationPhoto {
  id: number;
  treeId: number;
  treeRef: string;
  updateType: string;
  mediaUrl: string;
  ipfsCid: string;
  lat: string;
  lng: string;
  metadata: Record<string, unknown>;
  submittedBy: string;
  createdAt: string;
  treeStatus: string;
  planterName: string;
  species: string;
  region: string;
  photoHash: string | null;
  duplicateOf: number | null;
  hammingDistance: number | null;
}

interface PhotosResponse {
  photos: VerificationPhoto[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  filters: {
    regions: string[];
    species: string[];
  };
}

interface ConflictResolution {
  photoId: number;
  treeRef: string;
  conflictType: 'duplicate' | 'status_mismatch';
  resolution: string;
}

interface BatchResponse {
  success: boolean;
  processed: number;
  conflicts: ConflictResolution[];
  action: string;
  message: string;
}

export default function VerificationPhotosPage(): React.ReactNode {
  const [photos, setPhotos] = useState<VerificationPhoto[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
  const [filters, setFilters] = useState({
    status: 'pending',
    region: 'all',
    species: 'all',
    duplicatesOnly: false,
  });
  const [filterOptions, setFilterOptions] = useState<{
    regions: string[];
    species: string[];
  }>({
    regions: [],
    species: [],
  });
  const [conflictResolution, setConflictResolution] = useState<
    'keep_newest' | 'keep_oldest' | 'manual'
  >('keep_newest');
  const [actionReason, setActionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [lastAction, setLastAction] = useState<BatchResponse | null>(null);

  const fetchPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '50',
        status: filters.status,
        region: filters.region,
        species: filters.species,
        duplicatesOnly: filters.duplicatesOnly.toString(),
      });

      const response = await fetch(`/api/admin/verification/photos?${params}`);
      if (!response.ok) throw new Error('Failed to fetch photos');

      const data: PhotosResponse = await response.json();
      setPhotos(data.photos);
      setTotalCount(data.totalCount);
      setTotalPages(data.totalPages);
      setFilterOptions(data.filters);
    } catch (error) {
      console.error('Error fetching photos:', error);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const togglePhotoSelection = (photoId: number) => {
    setSelectedPhotos((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPhotos.size === photos.length) {
      setSelectedPhotos(new Set());
    } else {
      setSelectedPhotos(new Set(photos.map((p) => p.id)));
    }
  };

  const handleBatchAction = async (action: 'approve' | 'reject') => {
    if (selectedPhotos.size === 0) {
      alert('Please select at least one photo');
      return;
    }

    const confirmMessage = `Are you sure you want to ${action} ${selectedPhotos.size} photo(s)?${
      conflictResolution === 'manual'
        ? '\n\nNote: Manual conflict resolution is selected. Conflicts will need manual review.'
        : ''
    }`;

    if (!confirm(confirmMessage)) return;

    setActionLoading(true);
    try {
      const response = await fetch('/api/admin/verification/photos/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoIds: Array.from(selectedPhotos),
          action,
          reason: actionReason || undefined,
          resolveConflicts: conflictResolution,
        }),
      });

      if (!response.ok) throw new Error('Batch action failed');

      const result: BatchResponse = await response.json();
      setLastAction(result);
      setSelectedPhotos(new Set());
      setActionReason('');
      
      // Refresh the list
      await fetchPhotos();
      
      alert(result.message);
    } catch (error) {
      console.error('Error performing batch action:', error);
      alert('Failed to perform batch action');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDuplicateBadgeColor = (distance: number | null) => {
    if (distance === null) return 'default';
    if (distance <= 3) return 'destructive';
    if (distance <= 8) return 'warning';
    return 'secondary';
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tree Verification Photos</h1>
          <Text className="text-muted-foreground">
            Batch approve or reject tree planting verification photos
          </Text>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchPhotos()}
          disabled={loading}
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Select
            value={filters.status}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, status: e.target.value }))
            }
          >
            <option value="pending">Pending</option>
            <option value="all">All</option>
            <option value="planted">Planted</option>
            <option value="verified">Verified</option>
            <option value="failed">Failed</option>
          </Select>

          <Select
            value={filters.region}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, region: e.target.value }))
            }
          >
            <option value="all">All Regions</option>
            {filterOptions.regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </Select>

          <Select
            value={filters.species}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, species: e.target.value }))
            }
          >
            <option value="all">All Species</option>
            {filterOptions.species.map((species) => (
              <option key={species} value={species}>
                {species}
              </option>
            ))}
          </Select>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.duplicatesOnly}
              onChange={(e) =>
                setFilters((prev) => ({
                  ...prev,
                  duplicatesOnly: e.target.checked,
                }))
              }
              className="w-4 h-4"
            />
            <Text>Duplicates Only</Text>
          </label>

          <Button
            variant="secondary"
            onClick={() => {
              setFilters({
                status: 'pending',
                region: 'all',
                species: 'all',
                duplicatesOnly: false,
              });
              setPage(1);
            }}
          >
            Reset Filters
          </Button>
        </CardContent>
      </Card>

      {/* Batch Actions */}
      {selectedPhotos.size > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader>
            <CardTitle>
              Batch Actions ({selectedPhotos.size} selected)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select
                value={conflictResolution}
                onChange={(e) =>
                  setConflictResolution(
                    e.target.value as 'keep_newest' | 'keep_oldest' | 'manual'
                  )
                }
              >
                <option value="keep_newest">Keep Newest (Auto-resolve)</option>
                <option value="keep_oldest">Keep Oldest (Auto-resolve)</option>
                <option value="manual">Manual Resolution</option>
              </Select>

              <Input
                placeholder="Optional: Reason for action"
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => handleBatchAction('approve')}
                disabled={actionLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="mr-2 w-4 h-4" />
                Approve Selected
              </Button>
              <Button
                onClick={() => handleBatchAction('reject')}
                disabled={actionLoading}
                variant="destructive"
              >
                <XCircle className="mr-2 w-4 h-4" />
                Reject Selected
              </Button>
              <Button
                onClick={() => setSelectedPhotos(new Set())}
                variant="outline"
                disabled={actionLoading}
              >
                Clear Selection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last Action Summary */}
      {lastAction && (
        <Card className="bg-green-50 border-green-200">
          <CardHeader>
            <CardTitle className="text-green-800">Last Action Result</CardTitle>
          </CardHeader>
          <CardContent>
            <Text>{lastAction.message}</Text>
            {lastAction.conflicts.length > 0 && (
              <div className="mt-2">
                <Text className="font-semibold">
                  Conflicts ({lastAction.conflicts.length}):
                </Text>
                <ul className="list-disc list-inside text-sm">
                  {lastAction.conflicts.slice(0, 5).map((conflict) => (
                    <li key={conflict.photoId}>
                      Photo #{conflict.photoId} - {conflict.treeRef}:{' '}
                      {conflict.conflictType} - {conflict.resolution}
                    </li>
                  ))}
                  {lastAction.conflicts.length > 5 && (
                    <li>... and {lastAction.conflicts.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Photos</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-2xl font-bold">{totalCount}</Text>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Selected</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-2xl font-bold">{selectedPhotos.size}</Text>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Current Page</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-2xl font-bold">
              {page} / {totalPages}
            </Text>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Duplicates</CardTitle>
          </CardHeader>
          <CardContent>
            <Text className="text-2xl font-bold">
              {photos.filter((p) => p.duplicateOf !== null).length}
            </Text>
          </CardContent>
        </Card>
      </div>

      {/* Photos Grid */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Verification Photos</CardTitle>
            <CardDescription>
              {loading ? 'Loading...' : `Showing ${photos.length} photos`}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={toggleSelectAll}>
            {selectedPhotos.size === photos.length ? 'Deselect All' : 'Select All'}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="animate-spin mx-auto mb-4" />
              <Text>Loading photos...</Text>
            </div>
          ) : photos.length === 0 ? (
            <div className="text-center py-12">
              <Text className="text-muted-foreground">
                No photos found matching the current filters
              </Text>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {photos.map((photo) => (
                <Card
                  key={photo.id}
                  className={`cursor-pointer transition-all ${
                    selectedPhotos.has(photo.id)
                      ? 'ring-2 ring-blue-500 bg-blue-50'
                      : 'hover:shadow-lg'
                  }`}
                  onClick={() => togglePhotoSelection(photo.id)}
                >
                  <CardContent className="p-0">
                    <div className="relative aspect-square">
                      <Image
                        src={photo.mediaUrl || '/placeholder.jpg'}
                        alt={`Tree ${photo.treeRef}`}
                        fill
                        className="object-cover rounded-t-lg"
                      />
                      {photo.duplicateOf && (
                        <Badge
                          className="absolute top-2 right-2"
                          variant={getDuplicateBadgeColor(photo.hammingDistance)}
                        >
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Duplicate ({photo.hammingDistance} bits)
                        </Badge>
                      )}
                      {selectedPhotos.has(photo.id) && (
                        <div className="absolute inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center">
                          <CheckCircle2 className="w-12 h-12 text-blue-600" />
                        </div>
                      )}
                    </div>
                    <div className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <Text className="font-semibold">{photo.treeRef}</Text>
                        <Badge variant="secondary">{photo.treeStatus}</Badge>
                      </div>
                      <div className="space-y-1 text-sm">
                        <Text className="text-muted-foreground">
                          {photo.species} • {photo.region}
                        </Text>
                        <Text className="text-muted-foreground">
                          Planter: {photo.planterName || 'Unknown'}
                        </Text>
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          <Text className="text-xs">
                            {parseFloat(photo.lat).toFixed(4)},{' '}
                            {parseFloat(photo.lng).toFixed(4)}
                          </Text>
                        </div>
                        <Text className="text-xs text-muted-foreground">
                          {formatDate(photo.createdAt)}
                        </Text>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            Previous
          </Button>
          <Text>
            Page {page} of {totalPages}
          </Text>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
