import { UploadResponse, RunStatus, Finding, AuditorError } from '../types/UploadState';

export class AuditorAPIClient {
  private static instance: AuditorAPIClient;
  private readonly baseURL = 'https://auditor-edge.18tyler-rosa1.workers.dev';
  private readonly jwtSecret = 'cyZwlCFe8WIwvip6Lf5SMcb1eIYh7nqz9WUryMa5CtM';

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
    const response = await fetch(presignedURL, {
      method: 'PUT',
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

  async getFindings(runId: string): Promise<Finding[]> {
    const response = await fetch(`${this.baseURL}/runs/${runId}/findings`);

    if (!response.ok) {
      throw new AuditorError(`Failed to get findings: ${response.statusText}`);
    }

    return response.json();
  }
}

