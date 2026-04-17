import { ProgressMessage, ProgressData } from '../types/UploadState';

export class WebSocketManager {
  private static instance: WebSocketManager;
  private webSocket: WebSocket | null = null;
  private runId: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private shouldReconnect = false;

  // Event callbacks
  private onProgressCallback?: (data: ProgressData) => void;
  private onConnectedCallback?: () => void;
  private onDisconnectedCallback?: () => void;
  private onErrorCallback?: (error: string) => void;

  private constructor() {}

  public static getInstance(): WebSocketManager {
    if (!WebSocketManager.instance) {
      WebSocketManager.instance = new WebSocketManager();
    }
    return WebSocketManager.instance;
  }

  public connect(runId: string): void {
    this.runId = runId;
    this.shouldReconnect = true;
    this.connectWebSocket();
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.webSocket) {
      this.webSocket.close();
      this.webSocket = null;
    }
    this.runId = null;
    this.reconnectAttempts = 0;
  }

  public onProgress(callback: (data: ProgressData) => void): void {
    this.onProgressCallback = callback;
  }

  public onConnected(callback: () => void): void {
    this.onConnectedCallback = callback;
  }

  public onDisconnected(callback: () => void): void {
    this.onDisconnectedCallback = callback;
  }

  public onError(callback: (error: string) => void): void {
    this.onErrorCallback = callback;
  }

  private connectWebSocket(): void {
    if (!this.runId) return;

    const baseUrl =
      import.meta.env.VITE_AUDITOR_BASE_URL ?? 'https://auditor-edge.18tyler-rosa1.workers.dev';
    const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/ws/run/${this.runId}`;
    
    try {
      this.webSocket = new WebSocket(wsUrl);

      this.webSocket.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.onConnectedCallback?.();
      };

      this.webSocket.onmessage = (event) => {
        try {
          const message: ProgressMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          this.onErrorCallback?.('Failed to parse message');
        }
      };

      this.webSocket.onclose = () => {
        console.log('WebSocket disconnected');
        this.onDisconnectedCallback?.();
        if (this.shouldReconnect) {
          this.attemptReconnect();
        }
      };

      this.webSocket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.onErrorCallback?.('WebSocket connection error');
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.onErrorCallback?.('Failed to create WebSocket connection');
    }
  }

  private handleMessage(message: ProgressMessage): void {
    switch (message.type) {
      case 'progress':
        this.onProgressCallback?.(message.data);
        break;
      case 'done':
        this.onProgressCallback?.({
          phase: 'Complete',
          percent: 100,
          lastMessage: 'Processing complete',
          lastUpdated: Date.now(),
        });
        break;
      case 'error':
        this.onErrorCallback?.(message.data.lastMessage);
        break;
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.runId) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connectWebSocket();
      }, this.reconnectDelay * this.reconnectAttempts);
    }
  }

  public isConnected(): boolean {
    return this.webSocket?.readyState === WebSocket.OPEN;
  }
}

