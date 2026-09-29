/**
 * NETRA — useEspSafetyState (Feature 11 frontend integration)
 *
 * Polls the REAL backend GET /api/esp/{vehicle_id}/safety-state endpoint
 * (the same endpoint the ESP32 hardware polls) and exposes it verbatim.
 *
 * This hook does NOT compute, guess, or invent any safety state — it is a
 * thin read-only mirror of the backend response, kept intentionally separate
 * from the existing local demo simulation (services/demoSimulation.ts +
 * telemetryProducer.ts) so neither system fabricates the other's data.
 */

import { useEffect, useRef, useState } from 'react';
import { fetchEspSafetyState, type EspSafetyState } from '../services/api';

const POLL_INTERVAL_MS = 1000; // 1 Hz — plenty for a demo/dashboard, avoids hammering the API

export interface UseEspSafetyStateReturn {
  /** Latest backend response, verbatim. Null until the first successful poll. */
  data: EspSafetyState | null;
  /** True once at least one successful poll has completed. */
  isConnected: boolean;
  /** True when the most recent poll attempt failed (backend unreachable). */
  isBackendUnavailable: boolean;
  /** ISO timestamp of the last successful poll, for a "stale data" indicator. */
  lastUpdatedAt: string | null;
}

export function useEspSafetyState(vehicleId: string | null): UseEspSafetyStateReturn {
  const [data, setData] = useState<EspSafetyState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isBackendUnavailable, setIsBackendUnavailable] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);

  // Avoids setting state after unmount / after the vehicleId changes mid-flight.
  const activeVehicleRef = useRef(vehicleId);
  activeVehicleRef.current = vehicleId;

  useEffect(() => {
    if (!vehicleId) {
      setData(null);
      setIsConnected(false);
      setIsBackendUnavailable(false);
      return;
    }

    let cancelled = false;

    const poll = async () => {
      const result = await fetchEspSafetyState(vehicleId);
      if (cancelled || activeVehicleRef.current !== vehicleId) return;

      if (result) {
        setData(result);
        setIsConnected(true);
        setIsBackendUnavailable(false);
        setLastUpdatedAt(new Date().toISOString());
      } else {
        // Backend unreachable or vehicle not found yet — keep showing the last
        // known state (don't flash to a blank/invented state) but flag it.
        setIsBackendUnavailable(true);
      }
    };

    poll(); // immediate first fetch, then interval
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [vehicleId]);

  return { data, isConnected, isBackendUnavailable, lastUpdatedAt };
}
