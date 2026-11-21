export interface QueuedUpload {
  id: string;
  file: {
    name: string;
    type: string;
    size: number;
    data: string; // Base64 encoded file data
  };
  timestamp: number;
  status: 'pending' | 'uploading' | 'failed';
  error?: string;
  retryCount: number;
}

export interface OfflineUploadQueue {
  items: QueuedUpload[];
  lastSyncAttempt?: number;
}
