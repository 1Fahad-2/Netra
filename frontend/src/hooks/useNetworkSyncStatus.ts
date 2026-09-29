/**
 * NETRA — useNetworkSyncStatus Hook (Feature 9)
 *
 * Polls the EXISTING backend network + Store-and-Forward endpoints
 * (see ../services/networkStatusApi.ts) and exposes minimal, display-ready
 * state for the Control Room UI. Does not implement or alter buffer/sync
 * logic — it only reads current status and can trigger the existing
 * POST /api/network/sync endpoint.
 *
 * When the backend is unreachable (fetch fails), link status is reported
 * as UNKNOWN rather than guessing ONLINE/OFFLINE.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchNetworkStatus,
  fetchBufferedEvents,
  fetchSyncStatus,
  triggerSync,
} from '../services/networkStatusApi';
import {
  summarizeBufferedByVehicle,
  type LinkStatus,
  type SyncStatusLike,
} from '../utils/networkSyncDisplay';

const POLL_INTERVAL_MS = 5000;

export interface UseNetworkSyncStatusReturn {
  linkStatus: LinkStatus;
  bufferedTotal: number;
  bufferedByVehicle: Record<string, number>;
  syncStatus: SyncStatusLike | null;
  syncing: boolean;
  /** Triggers the existing backend sync endpoint; no-op while already syncing. */
  triggerSyncNow: () => Promise<void>;
}

export function useNetworkSyncStatus(pollIntervalMs = POLL_INTERVAL_MS): UseNetworkSyncStatusReturn {
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('UNKNOWN');
  const [bufferedTotal, setBufferedTotal] = useState(0);
  const [bufferedByVehicle, setBufferedByVehicle] = useState<Record<string, number>>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatusLike | null>(null);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    // Skip a scheduled poll while a manual sync request is in flight, so
    // the two calls never race against the same backend state.
    if (syncingRef.current) return;

    const [statusRes, bufferRes, syncRes] = await Promise.all([
      fetchNetworkStatus(),
      fetchBufferedEvents(),
      fetchSyncStatus(),
    ]);

    setLinkStatus(statusRes ? statusRes.network_status : 'UNKNOWN');
    setBufferedTotal(statusRes ? statusRes.buffered_count : bufferRes?.count ?? 0);
    setBufferedByVehicle(bufferRes ? summarizeBufferedByVehicle(bufferRes.events) : {});
    setSyncStatus(syncRes ?? null);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, pollIntervalMs);
    return () => clearInterval(id);
  }, [refresh, pollIntervalMs]);

  const triggerSyncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await triggerSync();
      if (result) {
        setSyncStatus(result);
        setBufferedTotal(result.buffered_count);
      }
      // Refresh the per-vehicle breakdown against the buffer as it stands
      // right after the sync attempt (real data, not fabricated).
      const bufferRes = await fetchBufferedEvents();
      setBufferedByVehicle(bufferRes ? summarizeBufferedByVehicle(bufferRes.events) : {});
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, []);

  return { linkStatus, bufferedTotal, bufferedByVehicle, syncStatus, syncing, triggerSyncNow };
}
