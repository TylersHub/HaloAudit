export enum UploadState {
  IDLE = 'idle',
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface UploadResponse {
  runId: string;
  r2PutUrl: string;
  r2Key: string;
}

export interface RunStatus {
  runId: string;
  tenantId: string;
  status: string;
  createdAt?: string;
  summary?: string;
  realtime?: RealtimeState;
}

export interface RealtimeState {
  phase: string;
  percent: number;
  lastMessage: string;
  lastUpdated?: number;
}

export interface Finding {
  id: string;
  runId: string;
  code: string;
  severity: string;
  title: string;
  detail?: string;
  createdAt?: string;
}

export interface ProgressMessage {
  type: string;
  data: ProgressData;
  timestamp: number;
}

export interface ProgressData {
  phase: string;
  percent: number;
  lastMessage: string;
  lastUpdated?: number;
}

export interface ReportUrlResponse {
  reportUrl: string;
  reportKey: string;
}

export class AuditorError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'AuditorError';
  }
}

