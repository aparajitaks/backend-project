/**
 * Shared types used across controllers, services, and routes.
 */

// ---------------------------------------------------------------------------
// API envelope
// ---------------------------------------------------------------------------

/**
 * All HTTP responses are wrapped in this envelope for consistency.
 *
 * @template T  - Shape of the `data` payload when the request succeeds.
 */
export interface ApiResponse<T = undefined> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Upload domain
// ---------------------------------------------------------------------------

export interface UploadSuccessData {
  jobId: string;
  status: string;
  filename: string;
  fileSize: number;
  uploadedAt: string;
}

// ---------------------------------------------------------------------------
// Job domain
// ---------------------------------------------------------------------------

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface JobStatusData {
  jobId: string;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobListItem {
  id: string;
  originalFilename: string;
  storedFilename: string;
  mimeType: string;
  fileSize: number;
  status: JobStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface JobListData {
  jobs: JobListItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

export interface JobListQuery {
  status?: JobStatus;
  limit: number;
  offset: number;
  sortBy: 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
}

export interface JobResultData {
  jobId: string;
  status: string;
  imageHash: string | null;
  overallPassed: boolean;
  overallConfidence: number;
  isDuplicate: boolean;
  duplicateOfJobId: string | null;
  checks: unknown;
  processedAt: Date;
}

// ---------------------------------------------------------------------------
// Health domain
// ---------------------------------------------------------------------------

export interface HealthData {
  status: 'ok' | 'degraded';
  db: 'connected' | 'disconnected';
  uptime: number;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

export interface StoredFile {
  originalFilename: string;
  storedFilename: string;
  storedPath: string;
  mimeType: string;
  fileSize: number;
}
