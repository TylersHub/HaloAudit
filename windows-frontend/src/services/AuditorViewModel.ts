import { UploadState, UploadResponse, Finding, AuditorError } from '../types/UploadState';
import { AuditorAPIClient } from './AuditorAPIClient';
import { WebSocketManager } from './WebSocketManager';

export class AuditorViewModel {
  private static instance: AuditorViewModel;
  private apiClient: AuditorAPIClient;
  private webSocketManager: WebSocketManager;

  public uploadState: UploadState = UploadState.IDLE;
  public currentRun: UploadResponse | null = null;
  public findings: Finding[] = [];
  public statusMessage: string = 'Ready to upload';
  public progress: number = 0;
  public currentPhase: string = '';
  public reportUrl: string | null = null;
  public queuedFiles: string[] = [];

  // Event listeners
  private listeners: Map<string, Function[]> = new Map();

  private constructor() {
    this.apiClient = AuditorAPIClient.getInstance();
    this.webSocketManager = WebSocketManager.getInstance();
    this.setupWebSocketListeners();
  }

  public static getInstance(): AuditorViewModel {
    if (!AuditorViewModel.instance) {
      AuditorViewModel.instance = new AuditorViewModel();
    }
    return AuditorViewModel.instance;
  }

  private setupWebSocketListeners(): void {
    this.webSocketManager.onProgress((data) => {
      this.currentPhase = data.phase;
      this.progress = data.percent;
      this.statusMessage = data.lastMessage;
      this.emit('progress', data);
    });

    this.webSocketManager.onConnected(() => {
      this.emit('connected');
    });

    this.webSocketManager.onDisconnected(() => {
      this.emit('disconnected');
    });

    this.webSocketManager.onError((error) => {
      this.uploadState = UploadState.FAILED;
      this.statusMessage = `Error: ${error}`;
      this.emit('error', error);
    });
  }

  public async uploadFile(file: File, tenantId: string = 'default_tenant'): Promise<void> {
    try {
      this.queuedFiles = [file.name];

      // Validate file type
      const allowedTypes = ['application/pdf', 'text/csv'];
      if (!allowedTypes.includes(file.type)) {
        throw new AuditorError('Unsupported file type. Only PDF and CSV files are supported.');
      }

      // Update state
      this.updateState(UploadState.UPLOADING, 'Creating upload...', 0);

      // Step 1: Create upload and get signed URL
      const uploadResponse = await this.apiClient.createUpload(
        file.name,
        file.type,
        tenantId
      );

      this.currentRun = uploadResponse;
      this.updateState(UploadState.UPLOADING, 'Uploading file...', 30);

      // Step 2: Upload file to R2
      await this.apiClient.uploadToR2(file, uploadResponse.r2PutUrl, file.type);

      this.updateState(UploadState.UPLOADING, 'Queuing for processing...', 60);

      // Step 3: Enqueue for processing
      await this.apiClient.enqueueRun(uploadResponse.runId, uploadResponse.r2Key);

      this.updateState(UploadState.PROCESSING, 'Processing started...', 0);

      // Step 4: Connect WebSocket for real-time updates
      this.webSocketManager.connect(uploadResponse.runId);

      // Step 5: Poll for completion (backup to WebSocket)
      this.pollForCompletion(uploadResponse.runId);

    } catch (error) {
      this.updateState(UploadState.FAILED, `Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.emit('error', error);
    }
  }

  private async pollForCompletion(runId: string): Promise<void> {
    // Poll status every 5 seconds as backup to WebSocket
    for (let i = 0; i < 60; i++) { // Max 5 minutes
      await new Promise(resolve => setTimeout(resolve, 5000));

      try {
        const status = await this.apiClient.getRunStatus(runId);

        if (status.status === 'done') {
          this.updateState(UploadState.COMPLETED, 'Processing complete!');
          this.webSocketManager.disconnect();

          try {
            const report = await this.apiClient.getReportUrl(runId);
            this.reportUrl = report.reportUrl;
            this.emit('reportReady', report);
          } catch (error) {
            console.error('Failed to fetch report URL:', error);
          }
          return;
        } else if (status.status === 'error') {
          this.updateState(UploadState.FAILED, 'Processing error');
          this.webSocketManager.disconnect();
          return;
        }
      } catch (error) {
        console.error('Status poll error:', error);
      }
    }
  }

  public reset(): void {
    this.uploadState = UploadState.IDLE;
    this.currentRun = null;
    this.findings = [];
    this.statusMessage = 'Ready to upload';
    this.progress = 0;
    this.currentPhase = '';
    this.reportUrl = null;
    this.queuedFiles = [];
    this.webSocketManager.disconnect();
    this.emit('reset');
  }

  public async openReport(): Promise<void> {
    const runId = this.currentRun?.runId;
    if (!runId) {
      throw new AuditorError('No completed run is available yet.');
    }

    if (!this.reportUrl) {
      const report = await this.apiClient.getReportUrl(runId);
      this.reportUrl = report.reportUrl;
    }

    const reportUrl = this.reportUrl;
    if (!reportUrl) {
      throw new AuditorError('Report URL is not available yet.');
    }

    await window.electronAPI.openExternalUrl(reportUrl);
  }

  private updateState(state: UploadState, message: string, progress?: number): void {
    this.uploadState = state;
    this.statusMessage = message;
    if (progress !== undefined) {
      this.progress = progress;
    }
    this.emit('stateChange', {
      state,
      message,
      progress,
      queuedFiles: [...this.queuedFiles],
    });
  }

  // Event system
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  public off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }
}



