/**
 * NETRA — Control Room Sensor Health Display Helpers (Feature 8)
 *
 * Pure presentation mapping only: turns an existing Compact Event
 * sensor_health map (../types/compactEvent.ts) into a small, ordered list of
 * display entries (label + color + "needs attention" flag) that the Control
 * Room UI can render directly.
 *
 * Scope (deliberately small):
 *   - Presentation-only helpers — no dashboard layout, no data fetching.
 *   - Does NOT change risk/safety logic, scoring, or thresholds.
 *   - Does NOT generate or fabricate sensor data — the caller must pass in
 *     the existing simulated Compact Event sensor_health values.
 */

import {
  SENSOR_HEALTH_KEYS,
  type CompactSensorHealth,
  type SensorHealthKey,
  type SensorHealthStatus,
} from '../types/compactEvent';

/** Short, human-readable label for each Compact Event sensor key. */
export const SENSOR_HEALTH_LABELS: Record<SensorHealthKey, string> = {
  lidar: 'LiDAR',
  ultrasonic: 'Ultrasonic',
  camera: 'Camera',
  bh1750: 'BH1750',
  mpu6050: 'MPU6050',
  gnss: 'GNSS',
  lora: 'LoRa',
};

/** Display color for each allowed sensor-health status. */
export const SENSOR_HEALTH_STATUS_COLOR: Record<SensorHealthStatus, string> = {
  OK: '#22C55E',
  WARNING: '#F59E0B',
  FAILED: '#EF4444',
  UNKNOWN: '#64748B',
};

/** True for statuses that should be visually called out as needing attention. */
export function isSensorHealthDegraded(status: SensorHealthStatus): boolean {
  return status === 'WARNING' || status === 'FAILED';
}

export interface SensorHealthDisplayEntry {
  key: SensorHealthKey;
  label: string;
  status: SensorHealthStatus;
  color: string;
  degraded: boolean;
}

/**
 * Build an ordered (SENSOR_HEALTH_KEYS order), UI-ready list of sensor
 * health entries for one vehicle's existing Compact Event sensor_health map.
 * Pure function — does not mutate `health` and does not invent values for
 * any sensor beyond what is already present in the map.
 */
export function getSensorHealthDisplayEntries(
  health: CompactSensorHealth
): SensorHealthDisplayEntry[] {
  return SENSOR_HEALTH_KEYS.map((key) => {
    const status = health[key];
    return {
      key,
      label: SENSOR_HEALTH_LABELS[key],
      status,
      color: SENSOR_HEALTH_STATUS_COLOR[status],
      degraded: isSensorHealthDegraded(status),
    };
  });
}

/** True if any sensor in the map is WARNING or FAILED. */
export function hasDegradedSensor(health: CompactSensorHealth): boolean {
  return SENSOR_HEALTH_KEYS.some((key) => isSensorHealthDegraded(health[key]));
}
