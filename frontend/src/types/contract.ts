/**
 * MachineMind — Common Data Contract
 * Derived from MACHINEMIND_README.md (§13) & MachineMind_CommandCenter_Blueprint.md (§2).
 *
 * Strict typing for vehicle telemetry, alert states, sensor health, and system metadata.
 *
 * TWO risk types exist by design:
 *   RiskLevel   — 3-level backend/wire contract (LOW / MEDIUM / HIGH / UNKNOWN)
 *   SafetyLevel — 4-level Phase 2A frontend resolution (NORMAL / CAUTION / HIGH / CRITICAL / UNKNOWN)
 *                 produced by safetyAssessment.ts and exposed on SimulationTelemetrySnapshot.safetyLevel
 */

/** 3-level wire contract. Used in VehicleTelemetry, WebSocket payloads, and all backend responses. */
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';

/**
 * Full-resolution 4-level Phase 2A safety level.
 * Source of truth: frontend/src/services/safetyAssessment.ts
 * Available on SimulationTelemetrySnapshot as `safetyLevel`.
 * UI components must use this (not RiskLevel) for CRITICAL vs HIGH distinction.
 */
export type SafetyLevel = 'NORMAL' | 'CAUTION' | 'HIGH' | 'CRITICAL' | 'UNKNOWN';

export type RecommendedAction = 'PROCEED' | 'REDUCE SPEED' | 'HOLD' | 'NOT AVAILABLE';

export type SensorState = 'HEALTHY' | 'WARNING' | 'FAILED' | 'NOT_CONNECTED' | 'SIMULATED';

export type VisibilityCondition = 'NORMAL' | 'DEGRADED' | 'POOR' | 'UNKNOWN';

export type NetworkStatus = 'ONLINE' | 'OFFLINE' | 'STANDBY';

export type DataMode = 'SIMULATION' | 'PHYSICAL_TESTBED' | 'LIVE';

export interface SensorHealthRecord {
  radar: SensorState;
  thermal: SensorState;
  gnss: SensorState;
  imu: SensorState;
}

export interface Position3D {
  latitude: number;
  longitude: number;
  altitude?: number;
}

export interface VehicleTelemetry {
  vehicle_id: string; // e.g. "HEMM-01", "HEMM-02"
  vehicle_type: string; // e.g. "DUMPER (100T)", "EXCAVATOR"
  timestamp: string;
  position: Position3D;
  heading: number; // 0-359 degrees
  speed: number; // km/h
  visibility_condition: VisibilityCondition;
  object_detected: boolean;
  object_type: string | null;
  object_distance: number | null; // meters
  relative_speed: number | null; // m/s
  ttc: number | null; // seconds
  risk_score: number | null; // 0.0 - 1.0
  risk_level: RiskLevel;
  recommended_action: RecommendedAction;
  sensor_health: SensorHealthRecord;
  network_status: NetworkStatus;
  data_mode: DataMode;
  source_metadata: string;
  route_distance: number; // meters along canonical route
  section_id: string; // route section identifier
}

export interface AlertItem {
  id: string;
  vehicle_id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  reason: string;
  timestamp: string;
  relative_time: string;
  lat?: number;
  lon?: number;
}

export interface SystemStatus {
  active_vehicle_count: number;
  registered_vehicles: string[];
  worst_risk_level: RiskLevel;
  critical_alert_count: number;
  active_alert_count: number;
  mine_visibility_state: VisibilityCondition;
  network_status: NetworkStatus;
  data_mode: DataMode;
  last_sync_timestamp: string | null;
}
