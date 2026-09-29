/**
 * NETRA — Compact Event Simulation Adapter (Phase 2A add-on)
 *
 * Adapts EXISTING telemetry (VehicleTelemetry / SimulationTelemetrySnapshot)
 * into the Compact Event contract (../types/compactEvent.ts).
 *
 * Pure functions only:
 *   - Do NOT change risk/safety logic, scoring, or thresholds.
 *   - Do NOT change route projection or any frozen route coordinates.
 *   - Do NOT mutate the telemetry passed in.
 *
 * Mirrors backend/app/schemas/compact_event.py::to_compact_event /
 * classify_risk_type — keep behavior identical on both sides.
 */

import type { VehicleTelemetry } from '../types/contract';
import type { CompactEvent, CompactRiskType } from '../types/compactEvent';
import { buildSimulatedSensorHealth } from '../types/sensorHealth';
import type { SimulationTelemetrySnapshot } from './demoSimulation';

/**
 * Derive a coarse, human-readable risk *type* label from EXISTING telemetry
 * fields only. Purely descriptive metadata for the compact event — never
 * used to recompute or override risk_level / risk_score.
 */
export function classifyRiskType(telemetry: VehicleTelemetry): CompactRiskType {
  if (!telemetry.risk_level || telemetry.risk_level === 'UNKNOWN') return 'UNKNOWN';
  if (!telemetry.object_detected) return 'NONE';
  if (telemetry.object_type && telemetry.object_type.toUpperCase().startsWith('HEMM')) {
    return 'V2V_HEAD_ON';
  }
  return 'OBJECT_PROXIMITY';
}

/**
 * Adapt a single existing VehicleTelemetry record into the Compact Event
 * contract. Pure function: reads `telemetry`, never mutates it, and never
 * recomputes risk/safety values.
 */
export function toCompactEvent(telemetry: VehicleTelemetry): CompactEvent {
  return {
    vehicle_id: telemetry.vehicle_id,
    timestamp: telemetry.timestamp,
    gps: {
      lat: telemetry.position.latitude,
      lon: telemetry.position.longitude,
    },
    speed: telemetry.speed,
    risk_level: telemetry.risk_level ?? 'UNKNOWN',
    risk_type: classifyRiskType(telemetry),
    confidence: telemetry.risk_score ?? 0,
    distance_m: telemetry.object_distance,
    ttc_s: telemetry.ttc,
    recommended_action: telemetry.recommended_action ?? 'NOT AVAILABLE',
    sensor_health: buildSimulatedSensorHealth(),
    network_status: 'LORA',
    edge_processed: true,
  };
}

/**
 * Convenience adapter for the existing demo simulation: converts both
 * vehicles' current telemetry (already produced by demoSimulation.ts /
 * TelemetryProducer, unchanged) into Compact Events.
 */
export function toCompactEventsFromSnapshot(
  snapshot: SimulationTelemetrySnapshot
): { hemm01: CompactEvent; hemm02: CompactEvent } {
  return {
    hemm01: toCompactEvent(snapshot.telemetryHemm01),
    hemm02: toCompactEvent(snapshot.telemetryHemm02),
  };
}
