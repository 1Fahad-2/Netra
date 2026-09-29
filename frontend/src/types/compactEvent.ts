/**
 * NETRA — Compact Event Contract (Phase 2A add-on)
 *
 * A lightweight, edge/LoRa-oriented event representation derived from the
 * existing VehicleTelemetry contract (./contract.ts).
 *
 * Scope (deliberately small):
 *   - This is a data contract + adapter only (see ../services/compactEventAdapter.ts).
 *   - It does NOT change risk/safety logic, scoring, or thresholds.
 *   - It does NOT change route projection or any frozen route coordinates.
 *   - It does NOT implement real LoRa hardware or Store-and-Forward.
 *   - sensor_health / network_status / edge_processed are simulated
 *     constants for this prototype, as scoped by the feature request.
 *
 * Mirrors backend/app/schemas/compact_event.py — keep field names identical.
 */

import type { RiskLevel, RecommendedAction, SafetyLevel } from './contract';

export interface CompactGps {
  lat: number;
  lon: number;
}

/**
 * Sensor Health Validation (Feature 2 add-on).
 *
 * Allowed status values for any individual sensor in the Compact Event's
 * sensor_health structure. This does NOT change safety thresholds or risk
 * calculations — it is purely a health/status contract for edge sensors.
 */
export type SensorHealthStatus = 'OK' | 'WARNING' | 'FAILED' | 'UNKNOWN';

/** Runtime-checkable list of allowed sensor-health statuses. */
export const SENSOR_HEALTH_STATUSES: readonly SensorHealthStatus[] = [
  'OK',
  'WARNING',
  'FAILED',
  'UNKNOWN',
];

/**
 * The set of sensors tracked by the Compact Event's sensor_health structure.
 * Mirrors backend/app/schemas/compact_event.py::CompactSensorHealth field
 * names — keep identical on both sides.
 */
export type SensorHealthKey =
  | 'lidar'
  | 'ultrasonic'
  | 'camera'
  | 'bh1750'
  | 'mpu6050'
  | 'gnss'
  | 'lora';

/** Runtime-checkable list of the sensors above, in a stable order. */
export const SENSOR_HEALTH_KEYS: readonly SensorHealthKey[] = [
  'lidar',
  'ultrasonic',
  'camera',
  'bh1750',
  'mpu6050',
  'gnss',
  'lora',
];

/**
 * Per-sensor health map carried on the Compact Event. Every sensor listed in
 * SENSOR_HEALTH_KEYS must be present with a valid SensorHealthStatus.
 */
export type CompactSensorHealth = Record<SensorHealthKey, SensorHealthStatus>;

/**
 * Descriptive classification of the *kind* of risk behind an event.
 * Derived only from EXISTING telemetry fields — never written back into,
 * or used to recompute, risk_level / risk_score / thresholds.
 */
export type CompactRiskType = 'UNKNOWN' | 'NONE' | 'V2V_HEAD_ON' | 'OBJECT_PROXIMITY';

export interface CompactEvent {
  vehicle_id: string;
  timestamp: string;
  gps: CompactGps;
  speed: number;
  risk_level: RiskLevel;
  risk_type: CompactRiskType;
  /** Mirrors existing risk_score (0.0-1.0); not recomputed. */
  confidence: number;
  distance_m: number | null;
  ttc_s: number | null;
  recommended_action: RecommendedAction;
  /**
   * Simulated per-sensor health for this prototype. Current simulated values
   * report every sensor as "OK" — real hardware health reporting remains out
   * of scope (see sensorHealth.ts for validation helpers).
   */
  sensor_health: CompactSensorHealth;
  /** Simulated transport label for this prototype (e.g. "LORA"). */
  network_status: string;
  /** Simulated flag for this prototype. */
  edge_processed: boolean;
  /**
   * Fused final risk level (Feature 10 add-on). Mirrors the optional
   * `final_risk` field on backend/app/schemas/compact_event.py::CompactEvent
   * (Feature 7) — set by the existing RiskRecommendationIntegrationService,
   * never recomputed here. `undefined`/absent when not computed for this
   * event; existing CompactEvent construction sites are unaffected.
   */
  final_risk?: SafetyLevel;
}
