/**
 * NETRA — Sensor Health Validation (Feature 2 add-on)
 *
 * Lightweight runtime validation/type helpers for the Compact Event's
 * sensor_health structure (../types/compactEvent.ts). TypeScript types are
 * erased at runtime, so any sensor_health payload arriving from outside this
 * process (e.g. a future network/hardware source) needs a real runtime check
 * before it is trusted. These helpers exist so invalid statuses are rejected
 * or safely coerced to UNKNOWN rather than silently propagating bad data.
 *
 * Scope (deliberately small):
 *   - Validation/type helpers only — no dashboard, no hardware detection.
 *   - Does NOT change risk/safety logic, scoring, or thresholds.
 *   - Mirrors backend/app/schemas/compact_event.py::CompactSensorHealth —
 *     keep the sensor keys and allowed statuses identical on both sides.
 */

import {
  SENSOR_HEALTH_KEYS,
  SENSOR_HEALTH_STATUSES,
  type CompactSensorHealth,
  type SensorHealthKey,
  type SensorHealthStatus,
} from './compactEvent';

/** Type guard: is `value` one of the allowed sensor-health statuses? */
export function isSensorHealthStatus(value: unknown): value is SensorHealthStatus {
  return typeof value === 'string' && (SENSOR_HEALTH_STATUSES as readonly string[]).includes(value);
}

/**
 * Type guard: is `value` a complete, valid CompactSensorHealth map?
 * Requires every known sensor key to be present with a valid status.
 * Unknown/extra keys are ignored (forward-compatible, not rejected).
 */
export function isCompactSensorHealth(value: unknown): value is CompactSensorHealth {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return SENSOR_HEALTH_KEYS.every((key) => isSensorHealthStatus(record[key]));
}

/**
 * Safely normalize an arbitrary/unknown sensor_health payload into a valid
 * CompactSensorHealth map. Any missing sensor or invalid status value is
 * handled safely by falling back to 'UNKNOWN' for that sensor only — this
 * never throws, so it's safe to use on untrusted input (e.g. a malformed
 * upstream/hardware payload).
 */
export function normalizeSensorHealth(value: unknown): CompactSensorHealth {
  const record = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const result = {} as Record<SensorHealthKey, SensorHealthStatus>;
  for (const key of SENSOR_HEALTH_KEYS) {
    const candidate = record[key];
    result[key] = isSensorHealthStatus(candidate) ? candidate : 'UNKNOWN';
  }
  return result as CompactSensorHealth;
}

/**
 * Build the simulated, all-healthy sensor_health map used by this prototype.
 * Keeps the current simulated behavior (every sensor "OK") working while
 * giving it a proper, validated shape.
 */
export function buildSimulatedSensorHealth(): CompactSensorHealth {
  const result = {} as Record<SensorHealthKey, SensorHealthStatus>;
  for (const key of SENSOR_HEALTH_KEYS) {
    result[key] = 'OK';
  }
  return result as CompactSensorHealth;
}
