'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Text } from '@/components/atoms/Text';
import { type Donation, type DonationStatus } from '@/lib/types/donation';
import { fetchDonations } from '@/lib/api/mock/donations';
import { Download, FileQuestion, FileDown, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DonationsTableProps {
  className?: string;
}

const pageSize = 20;

export function DonationsTable({ className }: DonationsTableProps) {
  const [donations, setDonations] = React.useState<Donation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [statusFilter, setStatusFilter] = React.useState<DonationStatus | 'all'>('all');
  const [startDate, setStartDate] = React.useState<Date | undefined>();
  const [endDate, setEndDate] = React.useState<Date | undefined>();

  const loadDonations = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchDonations(page, pageSize, startDate, endDate, statusFilter);
      setDonations(result.data);
      setTotalPages(result.totalPages);
      setError(null);
    } catch (err) {
      setError('Failed to fetch donations.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, startDate, endDate, statusFilter]);

  React.useEffect(() => {
    loadDonations();
  }, [loadDonations]);

  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value as DonationStatus | 'all');
    setPage(1);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(e.target.value ? new Date(e.target.value) : undefined);
    setPage(1);
  };

  const handleEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEndDate(e.target.value ? new Date(e.target.value) : undefined);
    setPage(1);
  };

  const exportToCSV = () => {
    if (donations.length === 0) return;

    const headers = ['Date', 'Project', 'Amount ($)', 'Trees', 'Status', 'TX Hash'];
    const rows = donations.map((donation) => [
      new Date(donation.date).toLocaleDateString(),
      donation.projectName,
      donation.amount.toFixed(2),
      donation.trees.toString(),
      donation.status,
      donation.txHash,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `donations_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusVariant = (
    status: DonationStatus
  ): 'default' | 'secondary' | 'destructive' | 'success' | 'outline' => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'pending':
        return 'outline';
      case 'failed':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const downloadCertificate = (donation: Donation) => {
    if (!donation.certificateUrl) return;
    window.open(donation.certificateUrl, '_blank');
  };

  return (
    <div className={cn('space-y-6', className)}>
      {/* Filters */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="start-date" className="block text-sm font-medium text-foreground mb-2">
              Start Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="start-date"
                type="date"
                onChange={handleStartDateChange}
                className="pl-10"
                aria-label="Start date filter"
              />
            </div>
          </div>

          <div>
            <label htmlFor="end-date" className="block text-sm font-medium text-foreground mb-2">
              End Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-3 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                id="end-date"
                type="date"
                onChange={handleEndDateChange}
                className="pl-10"
                aria-label="End date filter"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="status-filter"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Status
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={handleStatusFilterChange}
              className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Status filter"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="flex items-end">
            <Button
              variant="outline"
              size="sm"
              onClick={exportToCSV}
              disabled={donations.length === 0 || loading}
              className="w-full flex items-center justify-center gap-2"
              aria-label="Export donations to CSV"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">Export</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Project</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Trees</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`loading-${i}`}>
                    <TableCell colSpan={6}>
                      <div className="h-10 w-full animate-pulse bg-muted rounded" />
                    </TableCell>
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center justify-center text-destructive gap-2">
                      <FileQuestion className="h-10 w-10 opacity-50" />
                      <Text variant="body">{error}</Text>
                    </div>
                  </TableCell>
                </TableRow>
              ) : donations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                      <FileQuestion className="h-10 w-10 opacity-20" />
                      <Text variant="body">No donations found.</Text>
                      <Text variant="small" className="text-xs">
                        Adjust your filters or make your first donation!
                      </Text>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                donations.map((donation) => (
                  <TableRow key={donation.id}>
                    <TableCell className="font-medium">
                      {new Date(donation.date).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="max-w-xs truncate" title={donation.projectName}>
                      {donation.projectName}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      ${donation.amount.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">{donation.trees}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusVariant(donation.status)} className="capitalize">
                        {donation.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {donation.status === 'completed' && donation.certificateUrl ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => downloadCertificate(donation)}
                          title="Download donation certificate"
                          aria-label={`Download certificate for ${donation.projectName}`}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Text variant="small" className="text-muted-foreground">
                          -
                        </Text>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && !loading && donations.length > 0 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
            aria-label="Previous page"
          >
            Previous
          </Button>

          <div className="flex items-center gap-2">
            {Array.from({ length: totalPages }).map((_, idx) => {
              const pageNum = idx + 1;
              const isActive = pageNum === page;
              const isVisible =
                Math.abs(pageNum - page) <= 1 || pageNum === 1 || pageNum === totalPages;

              if (!isVisible && Math.abs(pageNum - page) === 2) {
                return <span key={`ellipsis-${idx}`}>...</span>;
              }

              if (!isVisible) return null;

              return (
                <Button
                  key={pageNum}
                  variant={isActive ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setPage(pageNum)}
                  className={isActive ? 'bg-stellar-blue text-white' : ''}
                  aria-label={`Go to page ${pageNum}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
            disabled={page === totalPages}
            aria-label="Next page"
          >
            Next
          </Button>
        </div>
      )}

      {/* Summary */}
      {!loading && donations.length > 0 && (
        <div className="flex items-center justify-between border-t pt-4">
          <Text variant="small" className="text-muted-foreground">
            Showing {(page - 1) * pageSize + 1} to{' '}
            {Math.min(page * pageSize, totalPages * pageSize)} donations
          </Text>
          <Text variant="small" className="text-muted-foreground">
            Page {page} of {totalPages}
          </Text>
        </div>
      )}
    </div>
  );
}
