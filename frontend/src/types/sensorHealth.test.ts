/**
 * Minimal tests for Sensor Health Validation (Feature 2 add-on).
 * Run style matches src/services/compactEventAdapter.test.ts (ts-node script, no test framework).
 */

import {
  isSensorHealthStatus,
  isCompactSensorHealth,
  normalizeSensorHealth,
  buildSimulatedSensorHealth,
} from './sensorHealth';
import { SENSOR_HEALTH_KEYS } from './compactEvent';

function fail(msg: string) {
  console.error(msg);
  process.exit(1);
}

function validSensorHealth() {
  return {
    lidar: 'OK',
    ultrasonic: 'OK',
    camera: 'WARNING',
    bh1750: 'FAILED',
    mpu6050: 'OK',
    gnss: 'UNKNOWN',
    lora: 'OK',
  } as const;
}

function runTests() {
  // 1. Valid statuses are accepted
  for (const status of ['OK', 'WARNING', 'FAILED', 'UNKNOWN']) {
    if (!isSensorHealthStatus(status)) fail(`expected "${status}" to be a valid sensor-health status`);
  }

  // 2. Invalid statuses are rejected
  for (const bad of ['HEALTHY', 'ok', '', null, undefined, 42, {}]) {
    if (isSensorHealthStatus(bad)) fail(`expected ${JSON.stringify(bad)} to be rejected as an invalid status`);
  }

  // 3. A complete, valid sensor_health map passes the structural check
  const good = validSensorHealth();
  if (!isCompactSensorHealth(good)) fail('expected a fully valid sensor_health map to pass validation');

  // 4. Missing a required sensor key is rejected
  const missingKey: Record<string, string> = { ...good };
  delete missingKey.gnss;
  if (isCompactSensorHealth(missingKey)) fail('expected sensor_health missing "gnss" to be rejected');

  // 5. An invalid status value on one sensor is rejected
  const badStatus = { ...good, lora: 'BROKEN' };
  if (isCompactSensorHealth(badStatus)) fail('expected sensor_health with an invalid status to be rejected');

  // 6. Non-object input is rejected safely (no throw)
  for (const bad of [null, undefined, 'OK', 42, []]) {
    if (isCompactSensorHealth(bad)) fail(`expected ${JSON.stringify(bad)} to be rejected as sensor_health`);
  }

  // 7. normalizeSensorHealth never throws and fills gaps with UNKNOWN
  const normalizedFromGarbage = normalizeSensorHealth({ lidar: 'NOT_REAL', extra: 'ignored' });
  for (const key of SENSOR_HEALTH_KEYS) {
    if (!isSensorHealthStatus(normalizedFromGarbage[key])) {
      fail(`normalizeSensorHealth produced an invalid status for ${key}`);
    }
  }
  if (normalizedFromGarbage.lidar !== 'UNKNOWN') fail('invalid input status should normalize to UNKNOWN');
  if (normalizedFromGarbage.gnss !== 'UNKNOWN') fail('missing sensor should normalize to UNKNOWN');

  const normalizedFromNull = normalizeSensorHealth(null);
  if (!isCompactSensorHealth(normalizedFromNull)) fail('normalizeSensorHealth(null) should still produce a valid map');

  const normalizedFromGood = normalizeSensorHealth(good);
  if (JSON.stringify(normalizedFromGood) !== JSON.stringify(good)) {
    fail('normalizeSensorHealth should pass through an already-valid map unchanged');
  }

  // 8. buildSimulatedSensorHealth keeps the current simulated values working
  const simulated = buildSimulatedSensorHealth();
  if (!isCompactSensorHealth(simulated)) fail('simulated sensor_health should be structurally valid');
  for (const key of SENSOR_HEALTH_KEYS) {
    if (simulated[key] !== 'OK') fail(`simulated sensor_health.${key} should be OK`);
  }

  console.log('All sensor health validation tests passed');
  process.exit(0);
}

runTests();
