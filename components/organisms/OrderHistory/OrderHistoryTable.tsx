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
import { Select } from '@/components/atoms/Select';
import { Text } from '@/components/atoms/Text';
import type { Order, OrderType, OrderStatus } from '@/lib/types/order';
import { fetchOrders } from '@/lib/api/mock/orders';
import { ExternalLink, Download, FileQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';

export function OrderHistoryTable() {
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [filter, setFilter] = React.useState<OrderType | 'all'>('all');

  const limit = 10;

  const loadOrders = React.useCallback(async () => {
    setLoading(true);
    try {
      const orderFilter = filter === 'all' ? undefined : filter;
      const result = await fetchOrders(page, limit, orderFilter);
      setOrders(result.data);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError('Failed to fetch order history.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  React.useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setFilter(e.target.value as OrderType | 'all');
    setPage(1); // Reset to first page on filter change
  };

  const exportToCSV = () => {
    if (orders.length === 0) return;

    const headers = [
      'Date',
      'Type',
      'Project',
      'Quantity',
      'Price',
      'Status',
      'TX Hash',
      'Network',
    ];
    const rows = orders.map((order) => [
      new Date(order.date).toLocaleDateString(),
      order.type.toUpperCase(),
      order.projectName,
      order.quantity,
      order.price.toFixed(2),
      order.status,
      order.txHash,
      order.network,
    ]);

    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `order_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusVariant = (status: OrderStatus) => {
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

  const getExplorerLink = (txHash: string, network: string) => {
    const baseUrl =
      network === 'testnet'
        ? 'https://stellar.expert/explorer/testnet/tx/'
        : 'https://stellar.expert/explorer/public/tx/';
    return `${baseUrl}${txHash}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Text variant="small" className="font-medium whitespace-nowrap">
            Filter by type:
          </Text>
          <Select value={filter} onChange={handleFilterChange} className="w-32" selectSize="sm">
            <option value="all">All</option>
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={exportToCSV}
          disabled={orders.length === 0 || loading}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Project</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={`loading-${i}`}>
                  <TableCell colSpan={7}>
                    <div className="h-10 w-full animate-pulse bg-muted rounded" />
                  </TableCell>
                </TableRow>
              ))
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-64 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                    <FileQuestion className="h-10 w-10 opacity-20" />
                    <Text variant="body">No orders found.</Text>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{new Date(order.date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge
                      variant={order.type === 'buy' ? 'default' : 'secondary'}
                      className="capitalize"
                    >
                      {order.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{order.projectName}</TableCell>
                  <TableCell className="text-right">{order.quantity}</TableCell>
                  <TableCell className="text-right">${order.price.toFixed(2)}</TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(order.status)} className="capitalize">
                      {order.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={getExplorerLink(order.txHash, order.network)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`View on Stellar Expert (${order.network})`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            Previous
          </Button>
          <div className="flex items-center px-4 text-sm font-medium">
            Page {page} of {totalPages}
          </div>
          <Button
            variant="outline"
            size="sm"
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
