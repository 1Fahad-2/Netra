/**
 * MachineMind — WebSocket Live Telemetry Client
 * Checkpoint 7 & 8: Real-Time Telemetry Stream Ingestion
 * 
 * Establishes and maintains a persistent WebSocket connection to:
 * ws://127.0.0.1:8000/ws/telemetry
 * 
 * Guarantees:
 * - Reconnection with backoff
 * - Type-safe delivery of VehicleTelemetry events
 * - Status listeners for UI connection badges
 */

import type { VehicleTelemetry } from '../types/contract';

export type WebSocketStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

export interface TelemetryEnvelope {
  type: 'telemetry' | 'connection_ack' | 'pong' | 'alert' | 'oncoming_prediction' | string;
  data?: VehicleTelemetry;
  message?: string;
  vehicle_ids?: string[];
  [key: string]: unknown;
}

export type TelemetryCallback = (telemetry: VehicleTelemetry) => void;
export type StatusCallback = (status: WebSocketStatus) => void;

class TelemetryWebSocketService {
  private socket: WebSocket | null = null;
  private url: string;
  private alertListeners: Set<(alert: any) => void> = new Set();
  private genericListeners: Set<(msg: any) => void> = new Set();
  private status: WebSocketStatus = 'DISCONNECTED';
  private telemetryListeners: Set<TelemetryCallback> = new Set();
  private statusListeners: Set<StatusCallback> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectDelay = 5000;
  private isExplicitlyClosed = false;

  constructor() {
    // Prefer explicit VITE_WS_URL if provided; otherwise fallback to host detection.
    const envWs = (import.meta.env as any).VITE_WS_URL;
    if (envWs) {
      this.url = envWs;
    } else {
      const isBrowser = typeof window !== 'undefined';
      const host = isBrowser ? window.location.hostname || '127.0.0.1' : '127.0.0.1';
      this.url = `ws://${host}:8000/ws/telemetry`;
    }
  }

  public setUrl(url: string): void {
    this.url = url;
    if (this.socket) {
      this.disconnect();
      this.connect();
    }
  }

  public connect(): void {
    if (typeof window === 'undefined') return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.updateStatus('CONNECTING');

    try {
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.reconnectAttempts = 0;
        this.updateStatus('CONNECTED');
        console.log('[TelemetryWS] Connected to live stream:', this.url);
      };

      this.socket.onmessage = (event: MessageEvent) => {
        try {
          const envelope: TelemetryEnvelope = JSON.parse(event.data);
          if (envelope.type === 'telemetry' && envelope.data) {
            this.notifyTelemetry(envelope.data);
          } else if (envelope.type === 'alert' && envelope.data) {
            this.notifyAlert(envelope.data);
          } else if (envelope.type === 'connection_ack') {
            console.log('[TelemetryWS] Stream ack received:', envelope.message);
          } else {
            // Generic messages (e.g. oncoming_prediction)
            this.notifyGeneric(envelope);
          }
        } catch (err) {
          console.warn('[TelemetryWS] Failed to parse message:', event.data, err);
        }
      };

      this.socket.onclose = () => {
        this.socket = null;
        this.updateStatus('DISCONNECTED');
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };

      this.socket.onerror = (error) => {
        console.warn('[TelemetryWS] WebSocket error:', error);
        if (this.socket) {
          this.socket.close();
        }
      };
    } catch (err) {
      console.error('[TelemetryWS] Connection attempt failed:', err);
      this.scheduleReconnect();
    }
  }

  public disconnect(): void {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.updateStatus('DISCONNECTED');
  }

  public onTelemetry(callback: TelemetryCallback): () => void {
    this.telemetryListeners.add(callback);
    return () => this.telemetryListeners.delete(callback);
  }
  public onAlert(callback: (alert: any) => void): () => void {
    this.alertListeners.add(callback);
    return () => this.alertListeners.delete(callback);
  }

  /** Subscribe to all WebSocket messages (generic handler for Phase 2D prediction events). */
  public onMessage(callback: (msg: any) => void): () => void {
    this.genericListeners.add(callback);
    return () => this.genericListeners.delete(callback);
  }


  public onStatusChange(callback: StatusCallback): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  public getStatus(): WebSocketStatus {
    return this.status;
  }

  private updateStatus(newStatus: WebSocketStatus): void {
    this.status = newStatus;
    for (const listener of this.statusListeners) {
      try {
        listener(newStatus);
      } catch (err) {
        console.error('[TelemetryWS] Status listener error:', err);
      }
    }
  }

  private notifyTelemetry(telemetry: VehicleTelemetry): void {
    for (const listener of this.telemetryListeners) {
      try {
        listener(telemetry);
      } catch (err) {
        console.error('[TelemetryWS] Telemetry listener error:', err);
      }
    }
  }

  private notifyAlert(alert: any): void {
    for (const listener of this.alertListeners) {
      try {
        listener(alert);
      } catch (err) {
        console.error('[TelemetryWS] Alert listener error:', err);
      }
    }
  }

  private notifyGeneric(msg: any): void {
    for (const listener of this.genericListeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error('[TelemetryWS] Generic listener error:', err);
      }
    }
  }



  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed || this.reconnectTimer) return;
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    console.log(`[TelemetryWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export const telemetryWebSocket = new TelemetryWebSocketService();
