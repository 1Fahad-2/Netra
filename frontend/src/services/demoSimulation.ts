/**
 * NETRA — Deterministic Demo Simulation Service (Phase 2D: Two-Blind-Curve, Opposite-Direction)
 *
 * SCENARIO:
 *   HEMM-01: starts near the START of the route (dist ≈ 50 m), travels FORWARD (distance increases).
 *   HEMM-02: starts near the END of the route (dist ≈ 350 m), travels BACKWARD (distance decreases).
 *            The two vehicles approach each other and meet near Blind Curve 01.
 *            HEMM-02 reaches dist=0 and is clamped/exited after ~35-40 s.
 *
 * PHYSICS (opposite-direction):
 *   - Physical separation  = Math.abs(hemm01Dist − hemm02Dist)   [always positive]
 *   - Closing speed        = hemm01SpeedMs + hemm02SpeedMs        [when both moving toward each other]
 *   - TTC (head-on)        = separation / closingSpeedMs
 *   - safetyAssessment.ts is NOT called with a signed gap — an explicit opposite-direction
 *     assessment function (assessOppositeDirection) is used instead.
 *
 * CONFLICT LIFECYCLE (Phase 2D):
 *   - ConflictLifecycleState is STATEFUL and lives in TelemetryProducer, NOT in this pure function.
 *   - computeSimulationAtTime() is PURE: given (t, lifecycleState), always returns same result.
 *   - advanceConflictLifecycle() is the pure transition function that TelemetryProducer calls each tick.
 *
 * BLIND CURVE ACTIVATION (zone-triggered only):
 *   A "BLIND CURVE ACTIVE" banner is shown only when a vehicle's route_distance is within
 *   BLIND_CURVE_ACTIVATION_HALF_WINDOW_M of a curve apex. This does NOT automatically generate
 *   a collision alert — it is purely contextual route information.
 *
 * ONCOMING PREDICTION (backend-authoritative):
 *   The simulation computes a local prediction for the demo display only.
 *   The backend (oncoming_predictor.py) is the authoritative source.
 *   Frontend prediction is labelled SIMULATION_PREDICTION to keep sources distinct.
 *
 * HYSTERESIS: Preserved. De-escalation requires 2 ticks. Escalation is immediate.
 *
 * PROTOTYPE DISCLAIMER: Thresholds and speeds are DEMO values, not official DGMS/NMDC limits.
 */

import type { RiskLevel, RecommendedAction, VehicleTelemetry, VisibilityCondition } from '../types/contract';
import type { MapVehicle } from '../types/map';
import type { VehicleMapState, UpcomingHazard, RouteSection } from '../types/route';
import {
  ACTIVE_HAUL_ROUTE,
  ACTIVE_HAUL_HAZARDS,
  ACTIVE_HAUL_PATH,
  getActiveBlindCurveZone,
} from '../data/activeHaulRoute';
import { getCurrentSection, getUpcomingHazard } from '../utils/routeIntelligence';
import type { SafetyAssessmentLevel } from './safetyAssessment';
import { RISK_THRESHOLDS } from './safetyAssessment';

// ── Route waypoints: exact same ACTIVE haul route (REAL_HAUL_CORRIDOR_PATH) ──
export const SIMULATION_HAUL_ROUTE: [number, number][] = ACTIVE_HAUL_PATH;

// ── Distance helpers ───────────────────────────────────────────────────────────
const METERS_PER_DEG_LAT = 111000;
const METERS_PER_DEG_LNG = 105400;

export function calcDistMeters(p1: [number, number], p2: [number, number]): number {
  const dLng = (p2[0] - p1[0]) * METERS_PER_DEG_LNG;
  const dLat = (p2[1] - p1[1]) * METERS_PER_DEG_LAT;
  return Math.sqrt(dLng * dLng + dLat * dLat);
}

export function calcHeading(p1: [number, number], p2: [number, number]): number {
  const dLng = (p2[0] - p1[0]) * METERS_PER_DEG_LNG;
  const dLat = (p2[1] - p1[1]) * METERS_PER_DEG_LAT;
  let angle = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return Math.round(angle);
}

export interface RouteGeometry {
  totalLengthMeters: number;
  cumDistances: number[];
}

export function buildRouteGeometry(route: [number, number][]): RouteGeometry {
  const cumDistances = [0];
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    const dist = calcDistMeters(route[i], route[i + 1]);
    total += dist;
    cumDistances.push(total);
  }
  return { totalLengthMeters: total, cumDistances };
}

export const ROUTE_GEO = buildRouteGeometry(SIMULATION_HAUL_ROUTE);
export const ROUTE_LENGTH = ROUTE_GEO.totalLengthMeters;

// ── Prototype/demo visibility scenario ────────────────────────────────────────
// Maps scenario time (seconds) to a deterministic VisibilityCondition.
// Prototype/demo visibility scenario — NOT an official DGMS threshold.
//
//   0–14 s  : NORMAL    — open approach road, clear atmosphere
//  15–29 s  : DEGRADED  — vehicles enter valley fog basin approaching BC01
//  30–50 s  : POOR      — dense fog inside BC01/BC02 hairpin zone
//  51–64 s  : DEGRADED  — vehicles leaving the fog region post-conflict
//  65+ s    : NORMAL    — atmosphere clears after both vehicles pass the basin
//
// The function is PURE (no randomness, no side effects).
export function getDemoVisibilityCondition(t: number): VisibilityCondition {
  if (t < 15) return 'NORMAL';
  if (t < 30) return 'DEGRADED';
  if (t < 51) return 'POOR';
  if (t < 65) return 'DEGRADED';
  return 'NORMAL';
}



// ── Speed profile infrastructure ───────────────────────────────────────────────
type SpeedKeyframe = [timeSeconds: number, speedKmh: number];
const KMH_TO_MS = 1000 / 3600;

/** Speed (km/h) at time t by linear interpolation of the profile. */
function profileSpeedKmh(profile: SpeedKeyframe[], t: number): number {
  for (let i = 0; i < profile.length - 1; i++) {
    const [t0, v0] = profile[i];
    const [t1, v1] = profile[i + 1];
    if (t <= t1) return v0 + ((v1 - v0) * (Math.max(t, t0) - t0)) / (t1 - t0);
  }
  return profile[profile.length - 1][1];
}

/** Distance travelled (m) from t=0 to t: exact integral of the piecewise-linear speed profile. */
function profileDistanceMeters(profile: SpeedKeyframe[], t: number): number {
  let kmhSeconds = 0;
  for (let i = 0; i < profile.length - 1; i++) {
    const [t0, v0] = profile[i];
    const [t1, v1] = profile[i + 1];
    if (t <= t0) break;
    const te = Math.min(t, t1);
    const ve = v0 + ((v1 - v0) * (te - t0)) / (t1 - t0);
    kmhSeconds += ((v0 + ve) / 2) * (te - t0);
  }
  return kmhSeconds * KMH_TO_MS;
}

// ── Position lookup ────────────────────────────────────────────────────────────

/** Keeps a route distance inside [0, ROUTE_LENGTH]. */
const clampToRoute = (d: number): number => Math.max(0, Math.min(d, ROUTE_LENGTH));

/**
 * Returns interpolated [lng, lat] and heading along the route at a given distance in metres.
 * For HEMM-02 (backward-traveling), the heading is reversed by 180°.
 */
export function getPositionAtDistance(
  distanceMeters: number,
  route: [number, number][] = SIMULATION_HAUL_ROUTE,
  geo: RouteGeometry = ROUTE_GEO,
  reverseHeading = false,
): { coordinates: [number, number]; heading: number } {
  const clampedDist = Math.max(0, Math.min(distanceMeters, geo.totalLengthMeters));

  for (let i = 0; i < geo.cumDistances.length - 1; i++) {
    const startDist = geo.cumDistances[i];
    const endDist   = geo.cumDistances[i + 1];
    if (clampedDist >= startDist && clampedDist <= endDist) {
      const segLen = endDist - startDist;
      const tFrac  = segLen > 0 ? (clampedDist - startDist) / segLen : 0;
      const p1 = route[i];
      const p2 = route[i + 1];
      const lng = p1[0] + (p2[0] - p1[0]) * tFrac;
      const lat = p1[1] + (p2[1] - p1[1]) * tFrac;
      let heading = calcHeading(p1, p2);
      if (reverseHeading) heading = (heading + 180) % 360;
      return {
        coordinates: [Number(lng.toFixed(6)), Number(lat.toFixed(6))],
        heading,
      };
    }
  }
  // Fallback to end
  const last = route[route.length - 1];
  const secondLast = route[route.length - 2];
  let heading = calcHeading(secondLast, last);
  if (reverseHeading) heading = (heading + 180) % 360;
  return {
    coordinates: [Number(last[0].toFixed(6)), Number(last[1].toFixed(6))],
    heading,
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// PHASE 2D SCENARIO — Opposite-direction convergence at Blind Curve 01
//
// Route length ≈ 822 m, BC01 apex ≈ 197 m, BC02 apex ≈ 683 m.
//
// Start positions:
//   HEMM-01: dist = 50 m   (near start, forward)
//   HEMM-02: dist = 350 m  (mid-route, backward)
//   Initial separation: 300 m
//
// Timeline (90 s demo):
//
//  t=0-10s:   Both at 35 km/h = 9.72 m/s each. Combined closing = 19.44 m/s.
//             Sep drops from 300 m → ~106 m.
//
//  t=9s:      HEMM-01 at ~147 m, HEMM-02 at ~253 m. Both in BC01 zone (97–297 m).
//             Prediction fires. conflictPhase → PREDICTED.
//
//  t=9-11s:   Speed ramps 35→8 km/h over 2 seconds.
//
//  t=11-34s:  Both at 8 km/h (2.22 m/s ea, combined 4.44 m/s). Sep drops from ~106 m.
//             At t≈27: sep≈30 m → CAUTION. Phase → ACTIVE.
//             At t≈29: sep≈21 m → HIGH.
//             At t≈33: sep≈3 m → CRITICAL.
//
//  t=34s:     Vehicles pass each other (hemm01Dist > hemm02Dist). Recovery.
//
//  t=34-40s:  Speed 8→20→35 km/h recovery. Sep growing.
//
//  t=40-90s:  Both vehicles at 35 km/h (HEMM-01 forward, HEMM-02 clamped at 0).
//             HEMM-02 hits dist=0 at around t=40 s and stops advancing.
//             HEMM-01 continues forward, reaches BC02 zone [583–783 m] around t=72-82 s.
//
// ────────────────────────────────────────────────────────────────────────────────

export const SCENARIO_DURATION_S = 90;

/** HEMM-01: starts at dist=50 m (near start), travels FORWARD (increasing dist). */
export const HEMM01_START_DIST_M = 50;

/**
 * HEMM-02: starts at dist = 350 m, travels BACKWARD (decreasing dist).
 * Initial separation = 300 m. BC02 zone is [582–782 m], so HEMM-02 at 350 m
 * is OUTSIDE the BC02 zone at t=0. ✓
 */
export const HEMM02_START_DIST_M = 350;

/**
 * Recovery separation threshold: conflict clears only when separation > this value
 * after hasPassed === true AND closingSpeed <= 0.
 */
export const RECOVERY_SEPARATION_M = 50;

/**
 * HEMM-01 speed profile (km/h). Travels forward.
 * Extended to 90 s: continues at 35 km/h after the initial conflict encounter.
 * HEMM-01 will reach BC02 zone [583, 783] around t=72-82 s.
 */
const HEMM01_SPEED_PROFILE: SpeedKeyframe[] = [
  [0,  35],
  [9,  35],   // fast approach at 35 km/h until t=9
  [11,  8],   // sharp braking: 35→8 km/h over 2 seconds
  [34,  8],   // hold 8 km/h through crossing
  [36, 20],
  [40, 35],
  [60, 35],   // continue at 35 km/h through BC02
  [90, 35],   // maintain through end of scenario
];

/**
 * HEMM-02 speed profile (km/h). Travels backward — mirrors HEMM-01 braking profile.
 * HEMM-02 will reach dist=0 and clamp. After clamping it no longer qualifies for
 * new oncoming prediction — the lifecycle tracks this via hemm02HasExited flag.
 */
const HEMM02_SPEED_PROFILE: SpeedKeyframe[] = [
  [0,  35],
  [9,  35],
  [11,  8],
  [34,  8],
  [36, 20],
  [40, 35],
  [60, 35],
  [90, 35],
];

// ────────────────────────────────────────────────────────────────────────────────
// OPPOSITE-DIRECTION SAFETY ASSESSMENT
//
// safetyAssessment.ts (lead/trailing semantics) must NOT be used for head-on vehicles
// because it computes gap = leadPos − trailingPos which would be invalid here.
// This function applies the same RISK_THRESHOLDS but with correct opposite-direction physics.
// ────────────────────────────────────────────────────────────────────────────────

export type OppositeDirectionSafetyLevel = SafetyAssessmentLevel;

export interface OppositeDirectionAssessment {
  level: OppositeDirectionSafetyLevel;
  separationM: number;           // Math.abs(hemm01Dist - hemm02Dist) — always positive
  closingSpeedMs: number;        // hemm01SpeedMs + hemm02SpeedMs when converging
  ttcS: number | null;           // separationM / closingSpeedMs; null when not converging
  isConverging: boolean;
  triggers: ('DISTANCE' | 'TTC')[];
  reason: string;
  riskScore: number;
}

/** The exact same thresholds as safetyAssessment.ts — not duplicated, imported. */
const THR = RISK_THRESHOLDS;

function classifyOppositeRisk(
  separationM: number,
  ttcS: number | null
): { level: Exclude<OppositeDirectionSafetyLevel, 'UNKNOWN'>; triggers: ('DISTANCE' | 'TTC')[] } {
  const triggers: ('DISTANCE' | 'TTC')[] = [];
  const check = (distThresh: number, ttcThresh: number) => {
    const byDist = separationM < distThresh;
    const byTtc  = ttcS !== null && ttcS < ttcThresh;
    if (byDist)  triggers.push('DISTANCE');
    if (byTtc)   triggers.push('TTC');
    return byDist || byTtc;
  };

  if (check(THR.CRITICAL.distanceM, THR.CRITICAL.ttcS)) return { level: 'CRITICAL', triggers };
  triggers.length = 0;
  if (check(THR.HIGH.distanceM, THR.HIGH.ttcS))         return { level: 'HIGH',     triggers };
  triggers.length = 0;
  if (check(THR.CAUTION.distanceM, THR.CAUTION.ttcS))   return { level: 'CAUTION',  triggers };
  return { level: 'NORMAL', triggers: [] };
}

function riskScoreFor(level: OppositeDirectionSafetyLevel): number {
  return level === 'CRITICAL' ? 1.0 : level === 'HIGH' ? 0.75 : level === 'CAUTION' ? 0.45 : 0.05;
}

/**
 * Assess opposite-direction (head-on) vehicle safety.
 * Returns an OppositeDirectionAssessment with correct physics.
 */
export function assessOppositeDirection(
  hemm01DistM: number,
  hemm02DistM: number,
  hemm01SpeedMs: number,
  hemm02SpeedMs: number,
  context?: { inBlindCurveZone?: boolean; curveId?: string },
): OppositeDirectionAssessment {
  // Physical separation — always positive
  const separationM = Math.abs(hemm01DistM - hemm02DistM);

  // Vehicles are converging when they are traveling toward each other.
  // HEMM-01 increases its dist, HEMM-02 decreases its dist.
  // They are converging when hemm01Dist < hemm02Dist (haven't passed yet).
  const isConverging = hemm01DistM < hemm02DistM;

  // Combined closing speed: only meaningful when converging
  const closingSpeedMs = isConverging ? (hemm01SpeedMs + hemm02SpeedMs) : 0;

  // TTC: separation / closingSpeed; null when not converging or not moving
  const ttcS = (isConverging && closingSpeedMs > 0)
    ? separationM / closingSpeedMs
    : null;

  const { level, triggers } = classifyOppositeRisk(separationM, ttcS);

  const bcPhrase = context?.inBlindCurveZone
    ? ` Conflict zone: ${context.curveId ?? 'BLIND CURVE'}.`
    : '';

  let reason: string;
  if (level === 'NORMAL') {
    reason = `Safe separation ${separationM.toFixed(0)} m. ${isConverging ? `Closing at ${closingSpeedMs.toFixed(1)} m/s combined.` : 'Vehicles diverging.'} Opposite direction.${bcPhrase}`;
  } else {
    const ttcStr = ttcS !== null ? `TTC ${ttcS.toFixed(1)} s` : 'TTC N/A';
    reason = `${level}: Separation ${separationM.toFixed(0)} m, ${ttcStr}, combined closing speed ${closingSpeedMs.toFixed(1)} m/s. Head-on approach.${bcPhrase}`;
  }

  return {
    level,
    separationM,
    closingSpeedMs,
    ttcS,
    isConverging,
    triggers,
    reason,
    riskScore: riskScoreFor(level),
  };
}

// ────────────────────────────────────────────────────────────────────────────────
// SIMULATION PREDICTION (frontend only — for demo display of the local check)
// The authoritative prediction is from the backend (oncoming_predictor.py).
// ────────────────────────────────────────────────────────────────────────────────

export interface SimulationPrediction {
  predicted: boolean;
  detectionSource: 'SIMULATION_PREDICTION'; // clearly labelled — not backend, not sensor
  oncomingVehicleId: string | null;
  atBlindCurveId: string | null;
  estimatedTtcS: number | null;
  reason: string;
}

/**
 * Local simulation check for the demo display only.
 * Fires when: vehicles are converging, at least one is in an activation zone,
 * separation is above the physical TTC threshold, and estimated TTC < conflict window.
 *
 * Does NOT override or replace backend prediction.
 * Does NOT fire after HEMM-02 has exited the route (dist clamped at 0).
 */
function computeSimulationPrediction(
  hemm01DistM: number,
  hemm02DistM: number,
  hemm01SpeedMs: number,
  hemm02SpeedMs: number,
  separationM: number,
  isConverging: boolean,
  hemm02HasExited: boolean,
): SimulationPrediction {
  const CONFLICT_WINDOW_S = 35;
  const PHYSICAL_CAUTION_THRESHOLD_M = 40;

  // Once HEMM-02 has exited the route it can no longer qualify for new predictions
  if (hemm02HasExited) {
    return {
      predicted: false,
      detectionSource: 'SIMULATION_PREDICTION',
      oncomingVehicleId: null,
      atBlindCurveId: null,
      estimatedTtcS: null,
      reason: 'HEMM-02 has exited the route — no longer eligible for oncoming prediction.',
    };
  }

  if (!isConverging || hemm01SpeedMs < 0.1 || hemm02SpeedMs < 0.1) {
    return {
      predicted: false,
      detectionSource: 'SIMULATION_PREDICTION',
      oncomingVehicleId: null,
      atBlindCurveId: null,
      estimatedTtcS: null,
      reason: 'Vehicles not converging or below minimum speed.',
    };
  }
  if (separationM <= PHYSICAL_CAUTION_THRESHOLD_M) {
    return {
      predicted: false,
      detectionSource: 'SIMULATION_PREDICTION',
      oncomingVehicleId: null,
      atBlindCurveId: null,
      estimatedTtcS: null,
      reason: 'TTC engine now active — physical proximity threshold reached.',
    };
  }

  const zone01 = getActiveBlindCurveZone(hemm01DistM);
  const zone02 = getActiveBlindCurveZone(hemm02DistM);
  const activeZone = zone01 ?? zone02;

  if (!activeZone) {
    return {
      predicted: false,
      detectionSource: 'SIMULATION_PREDICTION',
      oncomingVehicleId: null,
      atBlindCurveId: null,
      estimatedTtcS: null,
      reason: 'No vehicle in blind-curve activation zone yet.',
    };
  }

  const combinedSpeedMs = hemm01SpeedMs + hemm02SpeedMs;
  const estimatedTtcS = separationM / combinedSpeedMs;

  if (estimatedTtcS > CONFLICT_WINDOW_S) {
    return {
      predicted: false,
      detectionSource: 'SIMULATION_PREDICTION',
      oncomingVehicleId: null,
      atBlindCurveId: null,
      estimatedTtcS,
      reason: `Estimated TTC ${estimatedTtcS.toFixed(1)} s > window ${CONFLICT_WINDOW_S} s.`,
    };
  }

  return {
    predicted: true,
    detectionSource: 'SIMULATION_PREDICTION',
    oncomingVehicleId: 'HEMM-02',
    atBlindCurveId: activeZone.curveId,
    estimatedTtcS: Number(estimatedTtcS.toFixed(1)),
    reason: `ONCOMING VEHICLE PREDICTED: HEMM-02 converging at ${activeZone.curveId}. `
      + `Separation=${separationM.toFixed(0)} m, combined closing speed=${combinedSpeedMs.toFixed(1)} m/s, `
      + `estimated TTC=${estimatedTtcS.toFixed(1)} s. Source: SIMULATION_PREDICTION.`,
  };
}

// ── Conflict phase (lifecycle) ──────────────────────────────────────────────────
//
// ConflictPhase is now a stable lifecycle state managed by TelemetryProducer.
// computeSimulationAtTime() receives the current lifecycle state and reflects it.
//
// 'IDLE'      — no encounter ongoing, no prediction active
// 'PREDICTED' — oncoming prediction detected, conflict not yet physically close
// 'ACTIVE'    — physical/route risk is CAUTION/HIGH/CRITICAL, or vehicles are still
//               inside recovery separation after passing
// 'CLEARED'   — encounter has resolved: hasPassed && sep > RECOVERY_SEPARATION_M && closingSpeed <= 0
//
// Note: 'OUTSIDE_ZONE', 'BLIND_CURVE_ACTIVE', 'ONCOMING_PREDICTED', 'CONFLICT_ACTIVE', 'CONFLICT_CLEARED'
// are the OLD phase names. They are superseded by the lifecycle state below.

export type ConflictPhase =
  | 'IDLE'
  | 'PREDICTED'
  | 'ACTIVE'
  | 'CLEARED';

// ── Conflict lifecycle state ────────────────────────────────────────────────────

export interface ConflictLifecycleState {
  phase: ConflictPhase;
  conflictId: string | null;
  activatedAt: number | null;
  clearedAt: number | null;
  commandsIssued: boolean;
  graceTicks: number;
  /** Counter for conflict ID generation (monotone, incremented once per encounter). */
  conflictCounter: number;
}

export interface LoraCommand {
  message_type: 'SAFETY_COMMAND';
  command_id: string;
  conflict_id: string;
  vehicle_id: string;
  safety_level: string;
  action: string;
  reason: string;
  timestamp: string;
  ttl_seconds: number;
  transport: 'LORA_SIMULATED';
}

/** Creates a fresh, IDLE lifecycle state for initialization or reset. */
export function createConflictLifecycle(): ConflictLifecycleState {
  return {
    phase: 'IDLE',
    conflictId: null,
    activatedAt: null,
    clearedAt: null,
    commandsIssued: false,
    graceTicks: 0,
    conflictCounter: 0,
  };
}

/**
 * Physics snapshot passed to advanceConflictLifecycle() each tick.
 * Derived from computeSimulationAtTime() output.
 */
export interface ConflictPhysicsSnapshot {
  separationM: number;
  closingSpeedMs: number;
  isConverging: boolean;
  safetyLevel: SafetyAssessmentLevel;
  predictionActive: boolean;   // current tick prediction condition
  hasPassed: boolean;          // hemm01Dist > hemm02Dist (vehicles have crossed)
  progressSeconds: number;
}

const GRACE_TICKS_AFTER_CLEARED = 3;

/**
 * Pure state-transition function for the conflict lifecycle.
 * Called once per tick by TelemetryProducer with the current physics snapshot.
 * Returns the new lifecycle state. Does NOT mutate the input.
 */
export function advanceConflictLifecycle(
  prev: ConflictLifecycleState,
  physics: ConflictPhysicsSnapshot,
  nowIso: string,
): { state: ConflictLifecycleState; newCommands: LoraCommand[] } {
  const { separationM, closingSpeedMs, safetyLevel, predictionActive, hasPassed } = physics;
  const isPhysicallyActive =
    safetyLevel === 'CAUTION' || safetyLevel === 'HIGH' || safetyLevel === 'CRITICAL';

  // Determine if currently within recovery window (passed but not far enough apart)
  const inRecovery = hasPassed && separationM <= RECOVERY_SEPARATION_M && closingSpeedMs <= 0;

  // Clear condition: passed AND separation > recovery threshold AND no longer closing
  const clearCondition =
    hasPassed &&
    separationM > RECOVERY_SEPARATION_M &&
    closingSpeedMs <= 0;

  let next = { ...prev };
  const newCommands: LoraCommand[] = [];

  switch (prev.phase) {
    case 'IDLE': {
      // Transition to PREDICTED when a genuine oncoming prediction is detected
      if (predictionActive) {
        const counter = prev.conflictCounter + 1;
        const conflictId = `CONFLICT-${String(counter).padStart(3, '0')}`;
        next = {
          ...next,
          phase: 'PREDICTED',
          conflictId,
          activatedAt: null,
          clearedAt: null,
          commandsIssued: false,
          graceTicks: 0,
          conflictCounter: counter,
        };
      }
      break;
    }

    case 'PREDICTED': {
      if (isPhysicallyActive) {
        // Transition PREDICTED → ACTIVE when risk becomes CAUTION/HIGH/CRITICAL
        next = { ...next, phase: 'ACTIVE', activatedAt: physics.progressSeconds };

        // Issue safety commands exactly once per conflict encounter
        if (!prev.commandsIssued && next.conflictId) {
          const cid = next.conflictId;
          const cmdBase = {
            message_type: 'SAFETY_COMMAND' as const,
            conflict_id: cid,
            safety_level: safetyLevel,
            reason: `Head-on conflict at ${cid}. Separation=${separationM.toFixed(0)} m.`,
            timestamp: nowIso,
            ttl_seconds: 60,
            transport: 'LORA_SIMULATED' as const,
          };
          newCommands.push({
            ...cmdBase,
            command_id: `CMD-001`,
            vehicle_id: 'HEMM-01',
            action: 'REDUCE_SPEED',
          });
          newCommands.push({
            ...cmdBase,
            command_id: `CMD-002`,
            vehicle_id: 'HEMM-02',
            action: 'REDUCE_SPEED',
          });
          next = { ...next, commandsIssued: true };
        }
      }
      // If prediction disappears but no physical risk, stay PREDICTED (lifecycle stable)
      // Only go back to IDLE if prediction disappears before any physical activation
      // (but don't go PREDICTED → IDLE once we have a conflictId — wait for clear)
      break;
    }

    case 'ACTIVE': {
      // Stay ACTIVE while:
      //   - vehicles are still converging (not passed) OR
      //   - vehicles have passed but are still inside recovery separation
      // Transition to CLEARED only when clearCondition is met
      if (clearCondition) {
        next = {
          ...next,
          phase: 'CLEARED',
          clearedAt: physics.progressSeconds,
          graceTicks: 0,
        };
      } else {
        // Keep ACTIVE — even if risk temporarily drops to NORMAL
        // This prevents ACTIVE → NORMAL → ACTIVE flicker
        next = { ...next };
        // If still physically active or in recovery, no state change needed
        void isPhysicallyActive; // acknowledged
        void inRecovery;         // acknowledged
      }
      break;
    }

    case 'CLEARED': {
      // Grace period: stay CLEARED for GRACE_TICKS_AFTER_CLEARED ticks
      const newGrace = prev.graceTicks + 1;
      if (newGrace >= GRACE_TICKS_AFTER_CLEARED) {
        // Return to IDLE only after grace period and if no new prediction is active
        // Also ensure separation is increasing (vehicles moving apart)
        if (!predictionActive && closingSpeedMs <= 0) {
          next = {
            phase: 'IDLE',
            conflictId: null,
            activatedAt: null,
            clearedAt: null,
            commandsIssued: false,
            graceTicks: 0,
            conflictCounter: prev.conflictCounter,
          };
        } else {
          next = { ...next, graceTicks: newGrace };
        }
      } else {
        next = { ...next, graceTicks: newGrace };
      }
      break;
    }
  }

  return { state: next, newCommands };
}

// ── Stable display level (hysteresis) ─────────────────────────────────────────

export interface HysteresisState {
  current: SafetyAssessmentLevel;
  deescalationTicks: number;
  pendingLevel: SafetyAssessmentLevel;
}

export function createHysteresisState(): HysteresisState {
  return { current: 'NORMAL', deescalationTicks: 0, pendingLevel: 'NORMAL' };
}

const LEVEL_ORDER: SafetyAssessmentLevel[] = ['NORMAL', 'CAUTION', 'HIGH', 'CRITICAL', 'UNKNOWN'];
const levelRank = (l: SafetyAssessmentLevel): number => LEVEL_ORDER.indexOf(l);

export function applyHysteresisStep(
  state: HysteresisState,
  rawLevel: SafetyAssessmentLevel,
  separationM: number | null,
  closingSpeedMs: number | null,
): HysteresisState {
  if (rawLevel === 'UNKNOWN') {
    return { current: 'UNKNOWN', deescalationTicks: 0, pendingLevel: 'UNKNOWN' };
  }
  const curRank = levelRank(state.current);
  const newRank = levelRank(rawLevel);
  if (newRank > curRank) return { current: rawLevel, deescalationTicks: 0, pendingLevel: rawLevel };
  if (newRank === curRank) return { current: rawLevel, deescalationTicks: 0, pendingLevel: rawLevel };

  // Fast de-escalation when vehicles have clearly passed each other
  const clearlySeparating =
    typeof separationM === 'number' && separationM > 40 &&
    typeof closingSpeedMs === 'number' && closingSpeedMs <= 0;
  if (clearlySeparating && rawLevel === 'NORMAL') {
    return { current: 'NORMAL', deescalationTicks: 0, pendingLevel: 'NORMAL' };
  }

  const samePending = state.pendingLevel === rawLevel;
  const newTicks = samePending ? state.deescalationTicks + 1 : 1;
  if (newTicks >= 2) return { current: rawLevel, deescalationTicks: 0, pendingLevel: rawLevel };
  return { current: state.current, deescalationTicks: newTicks, pendingLevel: rawLevel };
}

/** Single authoritative action label for the stable display level. */
export function stableRecommendedAction(level: SafetyAssessmentLevel): string {
  switch (level) {
    case 'NORMAL':   return 'PROCEED';
    case 'CAUTION':  return 'MAINTAIN CONTROLLED SPEED';
    case 'HIGH':     return 'REDUCE SPEED';
    case 'CRITICAL': return 'HOLD / STOP';
    default:         return 'NOT AVAILABLE';
  }
}

// ── Legacy helpers (used by safetyAssessment.ts callers) ─────────────────────

export function toLegacyRiskLevel(level: SafetyAssessmentLevel): RiskLevel {
  switch (level) {
    case 'NORMAL':   return 'LOW';
    case 'CAUTION':  return 'MEDIUM';
    case 'HIGH':
    case 'CRITICAL': return 'HIGH';
    default:         return 'UNKNOWN';
  }
}

export function recommendedActionFor(level: SafetyAssessmentLevel): RecommendedAction {
  switch (level) {
    case 'NORMAL':   return 'PROCEED';
    case 'CAUTION':
    case 'HIGH':     return 'REDUCE SPEED';
    case 'CRITICAL': return 'HOLD';
    default:         return 'NOT AVAILABLE';
  }
}

// ── Display sentinel ───────────────────────────────────────────────────────────
export const TTC_NOT_CLOSING_DISPLAY_S = 99.9;

// ── Snapshot type ──────────────────────────────────────────────────────────────

export interface SimulationTelemetrySnapshot {
  progressSeconds: number;
  isPlaying: boolean;
  /** Physical separation in metres (always positive for head-on vehicles). */
  distanceMeters: number;
  /** Combined closing speed in m/s (hemm01 + hemm02 when converging). */
  relativeSpeedMs: number;
  /** TTC in seconds (sentinel 99.9 when not converging). */
  ttcSeconds: number;
  /** Raw TTC; null when not converging. */
  ttcSecondsRaw: number | null;
  riskScore: number;
  riskLevel: RiskLevel;
  recommendedAction: RecommendedAction;
  riskExplanation: string;
  safetyLevel?: SafetyAssessmentLevel;
  // Phase 2D: full opposite-direction assessment
  oppositeDirectionAssessment?: OppositeDirectionAssessment;
  // Phase 2D: blind-curve state
  blindCurve01Active: boolean;
  blindCurve02Active: boolean;
  // Phase 2D: simulation-local prediction (frontend display only)
  simulationPrediction: SimulationPrediction;
  // Phase 2D: conflict lifecycle phase (stable, managed by TelemetryProducer)
  conflictPhase: ConflictPhase;
  // Phase 2D: stable conflict ID (null when IDLE)
  conflictId: string | null;
  // Phase 2D: LoRa commands issued for this encounter
  loraCommands: LoraCommand[];
  // Phase 2D: whether HEMM-02 has exited the route (dist clamped at 0)
  hemm02HasExited: boolean;
  telemetryHemm01: VehicleTelemetry;
  telemetryHemm02: VehicleTelemetry;
  hemm01: { speedKmh: number; heading: number; coordinates: [number, number] };
  hemm02: { speedKmh: number; heading: number; coordinates: [number, number] };
  vehicleMapStates?: VehicleMapState[];
  currentSectionHemm01?: RouteSection | null;
  currentSectionHemm02?: RouteSection | null;
  upcomingHazardHemm01?: UpcomingHazard | null;
  /** Phase 2D: active blind-curve zone ID for HEMM-01 (null if not in zone). */
  activeZoneIdHemm01: string | null;
  /** Phase 2D: active blind-curve zone ID for HEMM-02 (null if not in zone). */
  activeZoneIdHemm02: string | null;
}

// ── Core computation (PURE) ────────────────────────────────────────────────────
//
// computeSimulationAtTime() is PURE: same (t, lifecycle) always yields same output.
// It does NOT advance the lifecycle — that is TelemetryProducer's job.

export function computeSimulationAtTime(
  t: number,
  isPlaying: boolean,
  lifecycle?: ConflictLifecycleState,
  accumulatedCommands?: LoraCommand[],
): SimulationTelemetrySnapshot {
  const clampedT = Math.max(0, Math.min(Number.isFinite(t) ? t : 0, SCENARIO_DURATION_S));

  // Speeds (km/h) at this moment
  const hemm01SpeedKmh = profileSpeedKmh(HEMM01_SPEED_PROFILE, clampedT);
  const hemm02SpeedKmh = profileSpeedKmh(HEMM02_SPEED_PROFILE, clampedT);
  const hemm01SpeedMs  = hemm01SpeedKmh * KMH_TO_MS;
  const hemm02SpeedMs  = hemm02SpeedKmh * KMH_TO_MS;

  // Along-route positions:
  // HEMM-01: increases from HEMM01_START_DIST_M
  // HEMM-02: decreases from HEMM02_START_DIST_M (subtract distance traveled)
  const hemm01DistRaw = HEMM01_START_DIST_M + profileDistanceMeters(HEMM01_SPEED_PROFILE, clampedT);
  const hemm02DistRaw = HEMM02_START_DIST_M - profileDistanceMeters(HEMM02_SPEED_PROFILE, clampedT);
  const hemm01Dist = clampToRoute(hemm01DistRaw);
  const hemm02Dist = clampToRoute(hemm02DistRaw);

  // HEMM-02 has exited the route when its raw distance drops below 0
  // (i.e. it has traveled past the route start and is clamped)
  const hemm02HasExited = hemm02DistRaw <= 0;

  // Positions and headings from the polyline
  // HEMM-02 heading is reversed because it is traveling backward along the route
  const pos1 = getPositionAtDistance(hemm01Dist, SIMULATION_HAUL_ROUTE, ROUTE_GEO, false);
  const pos2 = getPositionAtDistance(hemm02Dist, SIMULATION_HAUL_ROUTE, ROUTE_GEO, true);

  // Route sections
  const currentSectionHemm01 = getCurrentSection(ACTIVE_HAUL_ROUTE, hemm01Dist);
  const currentSectionHemm02 = getCurrentSection(ACTIVE_HAUL_ROUTE, hemm02Dist);

  // Upcoming hazard for HEMM-01 (forward direction)
  const upcomingRaw = getUpcomingHazard(ACTIVE_HAUL_ROUTE, ACTIVE_HAUL_HAZARDS, hemm01Dist, pos1.heading);
  const upcomingHazardHemm01 = upcomingRaw ? { ...upcomingRaw, vehicleId: 'HEMM-01' } : null;

  // ── Blind-curve activation zones ────────────────────────────────────────────
  const zone01 = getActiveBlindCurveZone(hemm01Dist);
  const zone02 = getActiveBlindCurveZone(hemm02Dist);
  const blindCurve01Active = zone01?.curveId === 'BLIND_CURVE_01' || zone02?.curveId === 'BLIND_CURVE_01';

  // BC02 activation: ONLY when HEMM-01 is actually inside the BC02 zone.
  // HEMM-02 is clamped at dist=0 after exiting — it should not trigger BC02.
  const bc02Zone01 = zone01?.curveId === 'BLIND_CURVE_02';
  const bc02Zone02 = !hemm02HasExited && zone02?.curveId === 'BLIND_CURVE_02';
  const blindCurve02Active = bc02Zone01 || bc02Zone02;

  const activeZoneIdHemm01 = zone01?.curveId ?? null;
  const activeZoneIdHemm02 = zone02?.curveId ?? null;

  // ── Opposite-direction safety assessment (correct head-on physics) ───────────
  const inBlindCurveZone = blindCurve01Active || blindCurve02Active;
  const activeCurveId = (zone01 ?? zone02)?.curveId ?? undefined;
  const assessment = assessOppositeDirection(
    hemm01Dist,
    hemm02Dist,
    hemm01SpeedMs,
    hemm02SpeedMs,
    { inBlindCurveZone, curveId: activeCurveId },
  );

  const separationM    = assessment.separationM;
  const closingSpeedMs = assessment.isConverging ? assessment.closingSpeedMs : 0;
  const ttcSecondsRaw  = assessment.ttcS !== null ? Number(assessment.ttcS.toFixed(1)) : null;
  const ttcSeconds     = ttcSecondsRaw ?? TTC_NOT_CLOSING_DISPLAY_S;

  const riskLevel        = toLegacyRiskLevel(assessment.level);
  const recommendedAction = recommendedActionFor(assessment.level);

  // ── Simulation prediction (local, frontend display only) ─────────────────────
  const simulationPrediction = computeSimulationPrediction(
    hemm01Dist, hemm02Dist, hemm01SpeedMs, hemm02SpeedMs, separationM, assessment.isConverging,
    hemm02HasExited,
  );

  // ── Conflict phase from lifecycle (or fallback if no lifecycle provided) ─────
  // The lifecycle is managed externally by TelemetryProducer.
  // computeSimulationAtTime() just reflects the provided state.
  const conflictPhase: ConflictPhase = lifecycle?.phase ?? 'IDLE';
  const conflictId: string | null = lifecycle?.conflictId ?? null;
  const loraCommands: LoraCommand[] = accumulatedCommands ?? [];

  const nowIso = new Date().toISOString();

  // ── Telemetry records ─────────────────────────────────────────────────────────
  const sensorHealth = {
    radar: 'SIMULATED',
    thermal: 'NOT_CONNECTED',
    gnss: 'SIMULATED',
    imu: 'SIMULATED',
  } as const;

  // ── Prototype/demo visibility scenario ────────────────────────────────────────
  // Deterministic time-based visibility derived from scenario progress.
  // Prototype/demo visibility scenario — NOT an official DGMS threshold.
  //
  //   0–14 s  : NORMAL     — open road, clear conditions
  //  15–29 s  : DEGRADED   — vehicles enter the valley fog basin
  //  30–50 s  : POOR       — both vehicles inside the BC01/BC02 hairpin fog zone
  //  51–64 s  : DEGRADED   — vehicles leaving the fog region
  //  65+ s    : NORMAL     — clear again after passing through
  //
  // Uses scenario time (t) only — no random values.
  const demoVisibility = getDemoVisibilityCondition(t);

  const telemetryHemm01: VehicleTelemetry = {
    vehicle_id:   'HEMM-01',
    vehicle_type: '100T DUMPER (FORWARD)',
    timestamp:    nowIso,
    position: {
      latitude:  pos1.coordinates[1],
      longitude: pos1.coordinates[0],
      altitude:  1040,
    },
    heading:              pos1.heading,
    speed:                Math.round(hemm01SpeedKmh),
    visibility_condition: demoVisibility,
    object_detected:      assessment.level !== 'NORMAL',
    object_type:          'HEMM-02',
    object_distance:      Number(separationM.toFixed(1)),
    relative_speed:       Number(closingSpeedMs.toFixed(2)),
    ttc:                  ttcSecondsRaw,
    risk_score:           assessment.riskScore,
    risk_level:           riskLevel,
    recommended_action:   recommendedAction,
    sensor_health:        { ...sensorHealth },
    network_status:       'STANDBY',
    data_mode:            'SIMULATION',
    source_metadata:      'SIMULATED_DEMO_SCENARIO_PHASE2D',
    route_distance:       Number(hemm01Dist.toFixed(2)),
    section_id:           currentSectionHemm01?.sectionId ?? '',
  };

  const telemetryHemm02: VehicleTelemetry = {
    vehicle_id:   'HEMM-02',
    vehicle_type: '100T DUMPER (REVERSE)',
    timestamp:    nowIso,
    position: {
      latitude:  pos2.coordinates[1],
      longitude: pos2.coordinates[0],
      altitude:  1040,
    },
    heading:              pos2.heading,
    speed:                Math.round(hemm02SpeedKmh),
    visibility_condition: demoVisibility,
    object_detected:      assessment.level !== 'NORMAL',
    object_type:          'HEMM-01',
    object_distance:      Number(separationM.toFixed(1)),
    relative_speed:       Number(closingSpeedMs.toFixed(2)),
    ttc:                  ttcSecondsRaw,
    risk_score:           assessment.riskScore,
    risk_level:           riskLevel,
    recommended_action:   recommendedAction,
    sensor_health:        { ...sensorHealth },
    network_status:       'STANDBY',
    data_mode:            'SIMULATION',
    source_metadata:      'SIMULATED_DEMO_SCENARIO_PHASE2D',
    route_distance:       Number(hemm02Dist.toFixed(2)),
    section_id:           currentSectionHemm02?.sectionId ?? '',
  };

  const vehicleMapStates: VehicleMapState[] = [
    {
      vehicleId:  'HEMM-01',
      latitude:   pos1.coordinates[1],
      longitude:  pos1.coordinates[0],
      speed:      Math.round(hemm01SpeedKmh),
      heading:    pos1.heading,
      timestamp:  nowIso,
      routeId:    ACTIVE_HAUL_ROUTE.routeId,
      sectionId:  currentSectionHemm01?.sectionId ?? '',
    },
    {
      vehicleId:  'HEMM-02',
      latitude:   pos2.coordinates[1],
      longitude:  pos2.coordinates[0],
      speed:      Math.round(hemm02SpeedKmh),
      heading:    pos2.heading,
      timestamp:  nowIso,
      routeId:    ACTIVE_HAUL_ROUTE.routeId,
      sectionId:  currentSectionHemm02?.sectionId ?? '',
    },
  ];

  return {
    progressSeconds:     Number(clampedT.toFixed(1)),
    isPlaying,
    distanceMeters:      Number(separationM.toFixed(1)),
    relativeSpeedMs:     Number(closingSpeedMs.toFixed(2)),
    ttcSeconds,
    ttcSecondsRaw,
    riskScore:           assessment.riskScore,
    riskLevel,
    safetyLevel:         assessment.level,
    oppositeDirectionAssessment: assessment,
    recommendedAction,
    riskExplanation:     assessment.reason,
    blindCurve01Active,
    blindCurve02Active,
    simulationPrediction,
    conflictPhase,
    conflictId,
    loraCommands,
    hemm02HasExited,
    telemetryHemm01,
    telemetryHemm02,
    hemm01: {
      speedKmh:    Math.round(hemm01SpeedKmh),
      heading:     pos1.heading,
      coordinates: pos1.coordinates,
    },
    hemm02: {
      speedKmh:    Math.round(hemm02SpeedKmh),
      heading:     pos2.heading,
      coordinates: pos2.coordinates,
    },
    vehicleMapStates,
    currentSectionHemm01,
    currentSectionHemm02,
    upcomingHazardHemm01,
    activeZoneIdHemm01,
    activeZoneIdHemm02,
  };
}

// ── Initial state ──────────────────────────────────────────────────────────────
const INITIAL_TIMESTAMP = '2026-09-11T00:00:00.000Z';
const _t0 = computeSimulationAtTime(0, false, createConflictLifecycle(), []);
export const INITIAL_SIMULATION_STATE: SimulationTelemetrySnapshot = {
  ..._t0,
  telemetryHemm01: { ..._t0.telemetryHemm01, timestamp: INITIAL_TIMESTAMP },
  telemetryHemm02: { ..._t0.telemetryHemm02, timestamp: INITIAL_TIMESTAMP },
  vehicleMapStates: (_t0.vehicleMapStates ?? []).map((v) => ({ ...v, timestamp: INITIAL_TIMESTAMP })),
};

// ── Map helper ─────────────────────────────────────────────────────────────────

export function buildVehicleMapStates(
  snapshot: SimulationTelemetrySnapshot
): VehicleMapState[] {
  if (snapshot.vehicleMapStates && snapshot.vehicleMapStates.length > 0) {
    return snapshot.vehicleMapStates;
  }
  return [
    {
      vehicleId:  'HEMM-01',
      latitude:   snapshot.hemm01.coordinates[1],
      longitude:  snapshot.hemm01.coordinates[0],
      speed:      snapshot.hemm01.speedKmh,
      heading:    snapshot.hemm01.heading,
      timestamp:  snapshot.telemetryHemm01.timestamp,
      routeId:    ACTIVE_HAUL_ROUTE.routeId,
      sectionId:  snapshot.currentSectionHemm01?.sectionId ?? '',
    },
    {
      vehicleId:  'HEMM-02',
      latitude:   snapshot.hemm02.coordinates[1],
      longitude:  snapshot.hemm02.coordinates[0],
      speed:      snapshot.hemm02.speedKmh,
      heading:    snapshot.hemm02.heading,
      timestamp:  snapshot.telemetryHemm02.timestamp,
      routeId:    ACTIVE_HAUL_ROUTE.routeId,
      sectionId:  snapshot.currentSectionHemm02?.sectionId ?? '',
    },
  ];
}

export function buildMapVehiclesFromTelemetry(
  snapshot: SimulationTelemetrySnapshot
): MapVehicle[] {
  return [
    {
      id:            'HEMM-01',
      type:          '100T DUMPER (FORWARD)',
      coordinates:   snapshot.hemm01.coordinates,
      heading:       snapshot.hemm01.heading,
      status:        snapshot.riskLevel === 'HIGH' ? 'STANDBY' : 'NORMAL',
      dataProvenance: 'SIMULATION',
    },
    {
      id:            'HEMM-02',
      type:          '100T DUMPER (REVERSE)',
      coordinates:   snapshot.hemm02.coordinates,
      heading:       snapshot.hemm02.heading,
      status:        'NORMAL',
      dataProvenance: 'SIMULATION',
    },
  ];
}
