/**
 * Minimal tests for the Control Room Sensor Health display helpers (Feature 8).
 * Run style matches src/services/compactEventAdapter.test.ts (ts-node script, no test framework).
 */

import {
  SENSOR_HEALTH_LABELS,
  SENSOR_HEALTH_STATUS_COLOR,
  isSensorHealthDegraded,
  getSensorHealthDisplayEntries,
  hasDegradedSensor,
} from './sensorHealthDisplay';
import { SENSOR_HEALTH_KEYS, type CompactSensorHealth } from '../types/compactEvent';

function fail(msg: string) {
  console.error(msg);
  process.exit(1);
}

function allOkHealth(): CompactSensorHealth {
  const result = {} as CompactSensorHealth;
  for (const key of SENSOR_HEALTH_KEYS) result[key] = 'OK';
  return result;
}

function runTests() {
  // 1. Every sensor key has a label
  for (const key of SENSOR_HEALTH_KEYS) {
    if (!SENSOR_HEALTH_LABELS[key]) fail(`missing display label for sensor key "${key}"`);
  }

  // 2. Every allowed status has a color
  for (const status of ['OK', 'WARNING', 'FAILED', 'UNKNOWN'] as const) {
    if (!SENSOR_HEALTH_STATUS_COLOR[status]) fail(`missing display color for status "${status}"`);
  }

  // 3. Degraded classification
  if (isSensorHealthDegraded('OK')) fail('OK should not be degraded');
  if (isSensorHealthDegraded('UNKNOWN')) fail('UNKNOWN should not be degraded');
  if (!isSensorHealthDegraded('WARNING')) fail('WARNING should be degraded');
  if (!isSensorHealthDegraded('FAILED')) fail('FAILED should be degraded');

  // 4. getSensorHealthDisplayEntries: all-OK map -> no degraded entries, all keys present, order preserved
  const ok = allOkHealth();
  const okEntries = getSensorHealthDisplayEntries(ok);
  if (okEntries.length !== SENSOR_HEALTH_KEYS.length) fail('expected one entry per sensor key');
  okEntries.forEach((entry, i) => {
    if (entry.key !== SENSOR_HEALTH_KEYS[i]) fail('entries should preserve SENSOR_HEALTH_KEYS order');
    if (entry.status !== 'OK') fail(`expected OK status for ${entry.key}`);
    if (entry.degraded) fail(`OK sensor ${entry.key} should not be flagged as degraded`);
    if (entry.color !== SENSOR_HEALTH_STATUS_COLOR.OK) fail(`expected OK color for ${entry.key}`);
  });
  if (hasDegradedSensor(ok)) fail('all-OK map should not report a degraded sensor');

  // 5. A single FAILED/WARNING sensor is surfaced without altering the rest
  const mixed: CompactSensorHealth = { ...ok, camera: 'FAILED', gnss: 'WARNING' };
  const mixedEntries = getSensorHealthDisplayEntries(mixed);
  const camera = mixedEntries.find((e) => e.key === 'camera');
  const gnss = mixedEntries.find((e) => e.key === 'gnss');
  const lidar = mixedEntries.find((e) => e.key === 'lidar');
  if (!camera || !camera.degraded || camera.status !== 'FAILED') fail('camera should be FAILED and degraded');
  if (!gnss || !gnss.degraded || gnss.status !== 'WARNING') fail('gnss should be WARNING and degraded');
  if (!lidar || lidar.degraded || lidar.status !== 'OK') fail('lidar should remain OK and not degraded');
  if (!hasDegradedSensor(mixed)) fail('expected hasDegradedSensor to detect the FAILED/WARNING sensors');

  // 6. UNKNOWN sensors are shown but not treated as degraded
  const withUnknown: CompactSensorHealth = { ...ok, mpu6050: 'UNKNOWN' };
  const unknownEntry = getSensorHealthDisplayEntries(withUnknown).find((e) => e.key === 'mpu6050');
  if (!unknownEntry || unknownEntry.degraded) fail('UNKNOWN sensor should be shown but not marked degraded');
  if (hasDegradedSensor(withUnknown)) fail('UNKNOWN-only map should not report a degraded sensor');

  // 7. Pure function: input map is never mutated
  const before = { ...mixed };
  getSensorHealthDisplayEntries(mixed);
  if (JSON.stringify(mixed) !== JSON.stringify(before)) fail('getSensorHealthDisplayEntries mutated its input');

  console.log('All sensor health display tests passed');
  process.exit(0);
}

runTests();
