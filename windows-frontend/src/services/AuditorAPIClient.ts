import { UploadResponse, RunStatus, AuditorError, ReportUrlResponse } from '../types/UploadState';

export class AuditorAPIClient {
  private static instance: AuditorAPIClient;
  private readonly baseURL =
    import.meta.env.VITE_AUDITOR_BASE_URL ?? 'https://auditor-edge.evanhaque1.workers.dev';

  private constructor() {}

  public static getInstance(): AuditorAPIClient {
    if (!AuditorAPIClient.instance) {
      AuditorAPIClient.instance = new AuditorAPIClient();
    }
    return AuditorAPIClient.instance;
  }

  async createUpload(
    filename: string,
    contentType: string,
    tenantId: string = 'default_tenant'
  ): Promise<UploadResponse> {
    const response = await fetch(`${this.baseURL}/uploads/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filename,
        contentType,
        tenantId,
      }),
    });

    if (!response.ok) {
      throw new AuditorError(`Failed to create upload: ${response.statusText}`);
    }

    return response.json();
  }

  async uploadToR2(
    file: File,
    presignedURL: string,
    contentType: string
  ): Promise<void> {
    const isDirectWorkerUpload = presignedURL.includes('/uploads/direct/');
    const response = await fetch(presignedURL, {
      method: isDirectWorkerUpload ? 'POST' : 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: file,
    });

    if (!response.ok) {
      throw new AuditorError(`Failed to upload file: ${response.statusText}`);
    }
  }

  async enqueueRun(runId: string, r2Key: string): Promise<void> {
    const response = await fetch(`${this.baseURL}/runs/${runId}/enqueue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        r2Key,
      }),
    });

    if (!response.ok) {
      throw new AuditorError(`Failed to enqueue run: ${response.statusText}`);
    }
  }

  async getRunStatus(runId: string): Promise<RunStatus> {
    const response = await fetch(`${this.baseURL}/runs/${runId}/status`);

    if (!response.ok) {
      throw new AuditorError(`Failed to get run status: ${response.statusText}`);
    }

    return response.json();
  }

  async getReportUrl(runId: string): Promise<ReportUrlResponse> {
    const response = await fetch(`${this.baseURL}/runs/${runId}/report`);

    if (!response.ok) {
      throw new AuditorError(`Failed to get report URL: ${response.statusText}`);
    }

    return response.json();
  }
}

