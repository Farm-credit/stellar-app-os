import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SyncStatusBanner } from '@/components/molecules/SyncStatusBanner';
import * as useOfflineSyncModule from '@/hooks/useOfflineSync';

// Mock the hook
vi.mock('@/hooks/useOfflineSync', () => ({
  useOfflineSync: vi.fn(),
}));

describe('SyncStatusBanner', () => {
  const mockRetrySync = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when online, queue is empty, and not syncing', () => {
    vi.spyOn(useOfflineSyncModule, 'useOfflineSync').mockReturnValue({
      isOnline: true,
      queue: [],
      isSyncing: false,
      syncError: null,
      retrySync: mockRetrySync,
      addToQueue: vi.fn(),
      removeFromQueue: vi.fn(),
      clearQueue: vi.fn(),
    });

    const { container } = render(<SyncStatusBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders offline message when disconnected', () => {
    vi.spyOn(useOfflineSyncModule, 'useOfflineSync').mockReturnValue({
      isOnline: false,
      queue: [{ id: '1', type: 'photo', payload: {}, createdAt: 1 }],
      isSyncing: false,
      syncError: null,
      retrySync: mockRetrySync,
      addToQueue: vi.fn(),
      removeFromQueue: vi.fn(),
      clearQueue: vi.fn(),
    });

    render(<SyncStatusBanner />);
    expect(screen.getByText('You are offline')).toBeInTheDocument();
    expect(screen.getByText('1 photo pending sync')).toBeInTheDocument();
  });

  it('renders syncing state', () => {
    vi.spyOn(useOfflineSyncModule, 'useOfflineSync').mockReturnValue({
      isOnline: true,
      queue: [{ id: '1', type: 'photo', payload: {}, createdAt: 1 }],
      isSyncing: true,
      syncError: null,
      retrySync: mockRetrySync,
      addToQueue: vi.fn(),
      removeFromQueue: vi.fn(),
      clearQueue: vi.fn(),
    });

    render(<SyncStatusBanner />);
    expect(screen.getByText('Syncing...')).toBeInTheDocument();
  });

  it('renders error state and handles manual retry', () => {
    vi.spyOn(useOfflineSyncModule, 'useOfflineSync').mockReturnValue({
      isOnline: true,
      queue: [{ id: '1', type: 'photo', payload: {}, createdAt: 1 }],
      isSyncing: false,
      syncError: 'Failed',
      retrySync: mockRetrySync,
      addToQueue: vi.fn(),
      removeFromQueue: vi.fn(),
      clearQueue: vi.fn(),
    });

    render(<SyncStatusBanner />);
    expect(screen.getByText('Sync failed')).toBeInTheDocument();
    
    const retryButton = screen.getByRole('button', { name: /Retry/i });
    expect(retryButton).toBeInTheDocument();
    
    fireEvent.click(retryButton);
    expect(mockRetrySync).toHaveBeenCalledTimes(1);
  });

  it('renders ready to sync state and handles sync now', () => {
    vi.spyOn(useOfflineSyncModule, 'useOfflineSync').mockReturnValue({
      isOnline: true,
      queue: [
        { id: '1', type: 'photo', payload: {}, createdAt: 1 },
        { id: '2', type: 'photo', payload: {}, createdAt: 2 },
      ],
      isSyncing: false,
      syncError: null,
      retrySync: mockRetrySync,
      addToQueue: vi.fn(),
      removeFromQueue: vi.fn(),
      clearQueue: vi.fn(),
    });

    render(<SyncStatusBanner />);
    expect(screen.getByText('Ready to sync')).toBeInTheDocument();
    expect(screen.getByText('2 photos pending sync')).toBeInTheDocument();
    
    const syncButton = screen.getByRole('button', { name: /Sync Now/i });
    expect(syncButton).toBeInTheDocument();
    
    fireEvent.click(syncButton);
    expect(mockRetrySync).toHaveBeenCalledTimes(1);
  });
});
