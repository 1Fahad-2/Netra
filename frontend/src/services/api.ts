/**
 * MachineMind — REST API Client Service
 * Lightweight typed fetch helpers for backend query endpoints.
 */

import type { VehicleTelemetry, AlertItem } from '../types/contract';

export interface VehicleMetadata {
  vehicle_id: string;
  vehicle_type: string;
  status: string;
  data_provenance: string;
  registered_at: string;
}

export interface SystemHealthResponse {
  status: string;
  service: string;
  version: string;
  checkpoint: string;
  storage: string;
  database: string;
  active_fleet_count: number;
  supported_vehicles: string[];
}

export const getApiBaseUrl = (): string => {
  // Prefer explicit VITE_API_URL (same precedence as services/telemetryProducer.ts)
  // so this client points at whichever port the backend is actually running on.
  const envUrl = (import.meta.env as any)?.VITE_API_URL;
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const isBrowser = typeof window !== 'undefined';
  const host = isBrowser ? window.location.hostname || '127.0.0.1' : '127.0.0.1';
  return `http://${host}:8000`;
};

export async function fetchHealth(): Promise<SystemHealthResponse | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/health`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[API] Failed to fetch health status:', err);
    return null;
  }
}

export async function fetchVehicles(): Promise<VehicleMetadata[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/vehicles`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[API] Failed to fetch registered vehicles:', err);
    return [];
  }
}

export async function fetchVehicleById(vehicleId: string): Promise<VehicleMetadata | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/vehicles/${vehicleId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[API] Failed to fetch vehicle ${vehicleId}:`, err);
    return null;
  }
}

export async function fetchLatestTelemetry(vehicleId: string): Promise<VehicleTelemetry | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/telemetry/${vehicleId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[API] Failed to fetch latest telemetry for ${vehicleId}:`, err);
    return null;
  }
}

export async function fetchTelemetryHistory(vehicleId: string, limit = 50): Promise<VehicleTelemetry[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/telemetry/${vehicleId}/history?limit=${limit}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn(`[API] Failed to fetch telemetry history for ${vehicleId}:`, err);
    return [];
  }
}

// ── Feature 11: ESP32 safety-state (blind-curve + V2V vehicle_alert) ────────
// Thin, read-only mirror of GET /api/esp/{vehicle_id}/safety-state
// (app/api/esp.py). This is the SAME backend state the ESP32 hardware polls —
// the frontend does not compute or invent any of these fields.

export interface EspVehicleAlert {
  vehicle_id: string;
  distance: number | null;
  ttc: number | null;
  risk: string;
  action: string | null;
}

export interface EspSafetyState {
  vehicle_id: string;
  state: string; // SAFE | UPCOMING_BLIND_CURVE | BLIND_CURVE_ACTIVE
  curve_id: string | null;
  distance_to_curve: number | null;
  vehicle_alert: EspVehicleAlert | null;
  hazard_state: string; // combined human-readable label, e.g. "UPCOMING VEHICLE"
  timestamp: string;
}

export async function fetchEspSafetyState(vehicleId: string): Promise<EspSafetyState | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/esp/${vehicleId}/safety-state`);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn(`[API] Failed to fetch ESP safety-state for ${vehicleId}:`, err);
    return null;
  }
}

export async function fetchActiveAlerts(): Promise<AlertItem[]> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/api/alerts`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[API] Failed to fetch active alerts:', err);
    return [];
  }
}
