/**
 * NETRA — Network + Store-and-Forward REST Client (Feature 9)
 *
 * Thin, typed fetch wrappers for the EXISTING backend endpoints
 * (app/api/network.py, unchanged):
 *   GET  /api/network/status
 *   GET  /api/network/buffer
 *   POST /api/network/sync
 *   GET  /api/network/sync/status
 *
 * Mirrors the existing pattern in ./api.ts (base URL helper, try/catch,
 * null on failure — never throws, never fabricates data). This is a
 * read/trigger-only adapter: it does not change network buffer logic or
 * sync logic, it only calls the endpoints that already implement them.
 */

import type { CompactEvent } from '../types/compactEvent';

/** Mirrors app/services/network_buffer.py::NetworkState (ONLINE / OFFLINE only). */
export type BackendNetworkState = 'ONLINE' | 'OFFLINE';

export interface NetworkStatusResponse {
  network_status: BackendNetworkState;
  buffered_count: number;
}

export interface BufferResponse {
  events: CompactEvent[];
  count: number;
}

export interface SyncStatusResponse {
  buffered_count: number;
  synced_count: number;
  failed_count: number;
  last_sync_time: string | null;
}

const getApiBaseUrl = (): string => {
  const isBrowser = typeof window !== 'undefined';
  const host = isBrowser ? window.location.hostname || '127.0.0.1' : '127.0.0.1';
  return `http://${host}:8000`;
};

export async function fetchNetworkStatus(): Promise<NetworkStatusResponse | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/network/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[NetworkStatusApi] Failed to fetch network status:', err);
    return null;
  }
}

export async function fetchBufferedEvents(): Promise<BufferResponse | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/network/buffer`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[NetworkStatusApi] Failed to fetch buffered events:', err);
    return null;
  }
}

export async function fetchSyncStatus(): Promise<SyncStatusResponse | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/network/sync/status`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[NetworkStatusApi] Failed to fetch sync status:', err);
    return null;
  }
}

/** Triggers the existing backend sync operation (POST /api/network/sync). */
export async function triggerSync(): Promise<SyncStatusResponse | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/network/sync`, { method: 'POST' });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[NetworkStatusApi] Failed to trigger sync:', err);
    return null;
  }
}
