/**
 * Minimal tests for the Compact Event adapter (Phase 2A add-on).
 * Run style matches src/map/calibration/terrainCalibration.test.ts (ts-node script, no test framework).
 */

import { toCompactEvent, classifyRiskType, toCompactEventsFromSnapshot } from './compactEventAdapter';
import { INITIAL_SIMULATION_STATE } from './demoSimulation';
import type { VehicleTelemetry } from '../types/contract';
import { SENSOR_HEALTH_KEYS } from '../types/compactEvent';
import { isCompactSensorHealth } from '../types/sensorHealth';

function fail(msg: string) {
  console.error(msg);
  process.exit(1);
}

function sampleTelemetry(overrides: Partial<VehicleTelemetry> = {}): VehicleTelemetry {
  return {
    vehicle_id: 'HEMM-01',
    vehicle_type: '100T DUMPER (FORWARD)',
    timestamp: '2026-01-01T00:00:00.000Z',
    position: { latitude: 18.61, longitude: 81.23, altitude: 1040 },
    heading: 90,
    speed: 25,
    visibility_condition: 'NORMAL',
    object_detected: true,
    object_type: 'HEMM-02',
    object_distance: 15,
    relative_speed: 5,
    ttc: 3,
    risk_score: 0.75,
    risk_level: 'HIGH',
    recommended_action: 'REDUCE SPEED',
    sensor_health: { radar: 'SIMULATED', thermal: 'NOT_CONNECTED', gnss: 'SIMULATED', imu: 'SIMULATED' },
    network_status: 'STANDBY',
    data_mode: 'SIMULATION',
    source_metadata: 'SIMULATED_DEMO_SCENARIO_PHASE2D',
    route_distance: 120,
    section_id: 'SEC-01',
    ...overrides,
  };
}

function runTests() {
  // 1. Core fields preserved, not recomputed
  const t = sampleTelemetry();
  const ce = toCompactEvent(t);
  if (ce.vehicle_id !== t.vehicle_id) fail('vehicle_id mismatch');
  if (ce.timestamp !== t.timestamp) fail('timestamp mismatch');
  if (ce.gps.lat !== t.position.latitude || ce.gps.lon !== t.position.longitude) fail('gps mismatch');
  if (ce.speed !== t.speed) fail('speed mismatch');
  if (ce.risk_level !== t.risk_level) fail('risk_level was recomputed/changed');
  if (ce.confidence !== t.risk_score) fail('confidence should mirror risk_score');
  if (ce.distance_m !== t.object_distance) fail('distance_m mismatch');
  if (ce.ttc_s !== t.ttc) fail('ttc_s mismatch');
  if (ce.recommended_action !== t.recommended_action) fail('recommended_action mismatch');

  // 2. Prototype-scoped constants
  if (!isCompactSensorHealth(ce.sensor_health)) fail('sensor_health should be a valid CompactSensorHealth map');
  for (const key of SENSOR_HEALTH_KEYS) {
    if (ce.sensor_health[key] !== 'OK') fail(`sensor_health.${key} should be simulated OK`);
  }
  if (ce.network_status !== 'LORA') fail('network_status should be simulated LORA');
  if (ce.edge_processed !== true) fail('edge_processed should be true');

  // 3. risk_type classification
  if (classifyRiskType(sampleTelemetry({ object_type: 'HEMM-02', object_detected: true })) !== 'V2V_HEAD_ON') {
    fail('expected V2V_HEAD_ON classification');
  }
  if (
    classifyRiskType(
      sampleTelemetry({ object_detected: false, object_type: null, risk_level: 'LOW', risk_score: 0.05 })
    ) !== 'NONE'
  ) {
    fail('expected NONE classification');
  }
  if (classifyRiskType(sampleTelemetry({ risk_level: 'UNKNOWN' })) !== 'UNKNOWN') {
    fail('expected UNKNOWN classification');
  }

  // 4. Fallback when confidence/action missing
  const ceNoScore = toCompactEvent(sampleTelemetry({ risk_score: null }));
  if (ceNoScore.confidence !== 0) fail('confidence should fall back to 0 when risk_score missing');

  // 5. Adapter does not mutate the source telemetry
  const before = { ...t };
  toCompactEvent(t);
  if (t.risk_level !== before.risk_level || t.risk_score !== before.risk_score) {
    fail('adapter mutated source telemetry');
  }

  // 6. Wires into the existing (unchanged) simulation state
  const fromSim = toCompactEventsFromSnapshot(INITIAL_SIMULATION_STATE);
  if (fromSim.hemm01.vehicle_id !== 'HEMM-01' || fromSim.hemm02.vehicle_id !== 'HEMM-02') {
    fail('snapshot adapter vehicle_id mismatch');
  }

  console.log('All compact event adapter tests passed');
  process.exit(0);
}

runTests();
