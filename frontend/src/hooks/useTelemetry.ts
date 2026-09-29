/**
 * MachineMind — useTelemetry Hook (Phase 2D)
 *
 * Phase 2D additions:
 *  - Listens for 'oncoming_prediction' WebSocket messages (backend-authoritative prediction).
 *  - Exposes conflictPhase (IDLE/PREDICTED/ACTIVE/CLEARED), conflictId, loraCommands,
 *    blindCurve01Active, blindCurve02Active, simulationPrediction, backendPrediction.
 *  - Exposes conflictLineCoordinates for the dynamic Mapbox conflict corridor.
 *  - hysteresis parameters updated to use oppositeDirectionAssessment fields.
 *
 * Source-of-truth hierarchy:
 *  1. Backend 'oncoming_prediction' message → backendPrediction (authoritative)
 *  2. simSnap.simulationPrediction → local demo display (SIMULATION_PREDICTION label)
 *  3. Physical sensor TTC/distance → existing V2V engine (unchanged)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { telemetryWebSocket } from '../services/telemetryWebSocket';
import { telemetryProducer } from '../services/telemetryProducer';
import {
  INITIAL_SIMULATION_STATE,
  createHysteresisState,
  applyHysteresisStep,
  stableRecommendedAction,
  type HysteresisState,
  type SimulationTelemetrySnapshot,
  type SimulationPrediction,
  type ConflictPhase,
  type LoraCommand,
} from '../services/demoSimulation';
import type { SafetyAssessmentLevel } from '../services/safetyAssessment';
import { CoordinateMapper } from '../map/providers/CoordinateMapper';
import { ACTIVE_HAUL_ROUTE, ACTIVE_HAUL_HAZARDS } from '../data/activeHaulRoute';
import { getCurrentSection, getUpcomingHazard } from '../utils/routeIntelligence';
import type { VehicleTelemetry, RiskLevel, RecommendedAction } from '../types/contract';
import type { MapVehicle } from '../types/map';

// ── Backend prediction type (received from WebSocket) ─────────────────────────

export interface BackendOncomingPrediction {
  predicted: boolean;
  eventId: string | null;
  conflictId: string | null;
  oncomingVehicleId: string | null;
  atBlindCurveId: string | null;
  estimatedTtcS: number | null;
  combinedClosingSpeedMs: number | null;
  routeSeparationM: number | null;
  detectionSource: 'TELEMETRY_PREDICTION';
  confidence: string | null;
  reason: string;
  transportStatus: string | null;
  /** Commands sent to HEMM-01 and HEMM-02 (LORA_SIMULATED). */
  commands: Array<{
    message_type: string;
    command_id: string;
    conflict_id: string;
    vehicle_id: string;
    safety_level: string;
    action: string;
    reason: string;
    timestamp: string;
    ttl_seconds: number;
    transport: string;
  }>;
}

export interface UseTelemetryReturn {
  selectedVehicleId: string | null;
  setSelectedVehicleId: (id: string | null) => void;
  telemetryMap: Record<string, VehicleTelemetry>;
  snapshot: SimulationTelemetrySnapshot;
  vehicles: MapVehicle[];
  isPlaying: boolean;
  progressSeconds: number;
  handleStart: () => void;
  handlePause: () => void;
  handleReset: () => void;
  alerts: any[];
  /** Hysteresis-stabilised safety level for UI display (avoids threshold oscillation). */
  stableLevel: SafetyAssessmentLevel;
  /** Single authoritative LoRa-ready action string derived from stableLevel. */
  stableAction: string;
  // Phase 2D additions
  /** Backend-authoritative oncoming prediction (received via WebSocket). */
  backendPrediction: BackendOncomingPrediction | null;
  /** Current stable conflict lifecycle phase (IDLE/PREDICTED/ACTIVE/CLEARED). */
  conflictPhase: ConflictPhase;
  /** Stable conflict ID for the current encounter (null when IDLE). */
  conflictId: string | null;
  /** LoRa safety commands issued for the current encounter. */
  loraCommands: LoraCommand[];
  /** True when at least one vehicle is in the BC01 activation zone. */
  blindCurve01Active: boolean;
  /** True when at least one vehicle is in the BC02 activation zone. */
  blindCurve02Active: boolean;
  /** Simulation-local prediction (frontend display; not authoritative). */
  simulationPrediction: SimulationPrediction | null;
  /** Optional telemetryMap prop override for BottomStrip. */
  telemetryMapForStrip: Record<string, VehicleTelemetry>;
  /**
   * Coordinates for the dynamic conflict corridor on the map.
   * [[hemm01_lng, hemm01_lat], [hemm02_lng, hemm02_lat]] when PREDICTED or ACTIVE.
   * null when IDLE or CLEARED.
   */
  conflictLineCoordinates: [[number, number], [number, number]] | null;
}

export function useTelemetry(): UseTelemetryReturn {
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>('HEMM-01');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [progressSeconds, setProgressSeconds] = useState<number>(0);

  // Real backend telemetry cache
  const [telemetryMap, setTelemetryMap] = useState<Record<string, VehicleTelemetry>>({
    'HEMM-01': INITIAL_SIMULATION_STATE.telemetryHemm01,
    'HEMM-02': INITIAL_SIMULATION_STATE.telemetryHemm02,
  });
  const [alerts, setAlerts] = useState<any[]>([]);

  // Phase 2D: backend-authoritative prediction received via WebSocket
  const [backendPrediction, setBackendPrediction] = useState<BackendOncomingPrediction | null>(null);

  /**
   * Phase 2C: tracks which vehicle IDs have received live hardware/physical
   * telemetry over WebSocket. Once in this set the simulation producer must NOT
   * overwrite that vehicle's telemetryMap entry.
   */
  const liveVehicles = useRef<Set<string>>(new Set());

  // Hysteresis state (Phase 2C/2D: preserved and updated for new opposite-direction assessment)
  const hysteresisRef = useRef<HysteresisState>(createHysteresisState());
  const [stableLevel, setStableLevel] = useState<SafetyAssessmentLevel>('NORMAL');
  const [stableAction, setStableAction] = useState<string>('PROCEED');

  // Full simulation snapshot (Phase 2A/2D)
  const [simSnap, setSimSnap] = useState<SimulationTelemetrySnapshot>(INITIAL_SIMULATION_STATE);

  useEffect(() => {
    telemetryWebSocket.connect();

    // ── Live hardware telemetry ───────────────────────────────────────────────
    const prevPosRef = { current: null as any };
    const unsubscribeWs = telemetryWebSocket.onTelemetry((telemetry: VehicleTelemetry) => {
      if (telemetry.vehicle_id === 'HEMM-01') {
        console.log('[LiveTelemetry] HEMM-01');
        console.log('[LiveTelemetry] previous position:', prevPosRef.current);
        const newPos = telemetry.position;
        console.log('[LiveTelemetry] new position:', newPos);
        prevPosRef.current = newPos;
      }

      // Phase 2C: promote to live if hardware/physical data
      if (telemetry.data_mode === 'PHYSICAL_TESTBED' || telemetry.data_mode === 'LIVE') {
        if (!liveVehicles.current.has(telemetry.vehicle_id)) {
          console.log(`[LiveTelemetry] Vehicle ${telemetry.vehicle_id} promoted to LIVE`);
          liveVehicles.current.add(telemetry.vehicle_id);
        }
      }
      setTelemetryMap((prev) => ({ ...prev, [telemetry.vehicle_id]: telemetry }));
    });

    // ── Alert messages ────────────────────────────────────────────────────────
    const unsubscribeAlert = telemetryWebSocket.onAlert((alert) => {
      setAlerts((prev) => [...prev, alert]);
    });

    // ── Phase 2D: backend oncoming prediction messages ────────────────────────
    // The backend broadcasts 'oncoming_prediction' type messages via WebSocket.
    // These are the authoritative source — the frontend simulation prediction is
    // for local display only.
    const unsubscribeGeneric = telemetryWebSocket.onMessage?.((msg: any) => {
      if (msg?.type === 'oncoming_prediction') {
        if (msg.predicted) {
          setBackendPrediction({
            predicted: true,
            eventId:              msg.event_id ?? null,
            conflictId:           msg.conflict_id ?? null,
            oncomingVehicleId:    msg.oncoming_vehicle_id ?? null,
            atBlindCurveId:       msg.at_blind_curve_id ?? null,
            estimatedTtcS:        msg.estimated_ttc_s ?? null,
            combinedClosingSpeedMs: msg.combined_closing_speed_ms ?? null,
            routeSeparationM:     msg.route_separation_m ?? null,
            detectionSource:      'TELEMETRY_PREDICTION',
            confidence:           msg.confidence ?? null,
            reason:               msg.reason ?? '',
            transportStatus:      msg.transport_status ?? null,
            commands:             msg.commands ?? [],
          });
        } else {
          // Prediction cleared by backend
          setBackendPrediction(null);
        }
      }
    });

    // ── Simulation producer ───────────────────────────────────────────────────
    const unsubscribeProducer = telemetryProducer.subscribe((prog, playing) => {
      setProgressSeconds(prog);
      setIsPlaying(playing);
    });

    const unsubscribeSnapshot = telemetryProducer.subscribeSnapshot((snapshot) => {
      const hem01Live = liveVehicles.current.has('HEMM-01');
      const hem02Live = liveVehicles.current.has('HEMM-02');
      if (!hem01Live || !hem02Live) {
        setSimSnap(snapshot);
      }

      // ── Phase 2D: hysteresis uses oppositeDirectionAssessment fields ──────
      const rawLevel = snapshot.safetyLevel ?? 'UNKNOWN';
      // Use separationM and closing speed from the opposite-direction assessment
      const separationM    = snapshot.oppositeDirectionAssessment?.separationM ?? null;
      const closingSpeedMs = snapshot.oppositeDirectionAssessment?.isConverging
        ? (snapshot.oppositeDirectionAssessment?.closingSpeedMs ?? null)
        : null;
      // De-escalation fast path: closing speed is negative when vehicles have passed
      const effectiveClosingMs = snapshot.oppositeDirectionAssessment?.isConverging
        ? closingSpeedMs
        : -1; // not converging → treat as opening gap for hysteresis fast-path
      const nextHys = applyHysteresisStep(hysteresisRef.current, rawLevel, separationM, effectiveClosingMs);
      hysteresisRef.current = nextHys;
      const nextStableLevel = nextHys.current;
      const nextStableAction = stableRecommendedAction(nextStableLevel);
      setStableLevel(nextStableLevel);
      setStableAction(nextStableAction);

      // Only overwrite entries for non-live vehicles
      setTelemetryMap((prev) => {
        const next = { ...prev };
        if (!hem01Live) next['HEMM-01'] = snapshot.telemetryHemm01;
        if (!hem02Live) next['HEMM-02'] = snapshot.telemetryHemm02;
        return next;
      });
    });

    return () => {
      unsubscribeWs();
      unsubscribeAlert();
      unsubscribeGeneric?.();
      unsubscribeProducer();
      unsubscribeSnapshot();
      telemetryWebSocket.disconnect();
    };
  }, []);

  // ── Derive snapshot ──────────────────────────────────────────────────────────
  const snapshot = useMemo<SimulationTelemetrySnapshot>(() => {
    const t1 = telemetryMap['HEMM-01'] ?? INITIAL_SIMULATION_STATE.telemetryHemm01;
    const t2 = telemetryMap['HEMM-02'] ?? INITIAL_SIMULATION_STATE.telemetryHemm02;

    const distanceMeters   = t1.object_distance ?? simSnap.distanceMeters ?? 0;
    const relativeSpeedMs  = t1.relative_speed  ?? simSnap.relativeSpeedMs ?? 0;
    const ttcSeconds       = t1.ttc             ?? simSnap.ttcSeconds ?? 99.9;
    const riskScore        = t1.risk_score       ?? simSnap.riskScore ?? 0;
    const riskLevel: RiskLevel       = t1.risk_level       ?? 'LOW';
    const recommendedAction: RecommendedAction = t1.recommended_action ?? 'PROCEED';

    // Use simulation engine's reason text (richer than generic fallback)
    const riskExplanation = simSnap.oppositeDirectionAssessment?.reason
      ?? simSnap.riskExplanation
      ?? `Separation ${distanceMeters} m.`;

    const upcoming = getUpcomingHazard(ACTIVE_HAUL_ROUTE, ACTIVE_HAUL_HAZARDS, t1.route_distance, t1.heading);

    const base: SimulationTelemetrySnapshot = {
      progressSeconds:     Number(progressSeconds.toFixed(1)),
      isPlaying,
      distanceMeters:      Number(distanceMeters.toFixed(1)),
      relativeSpeedMs:     Number(relativeSpeedMs.toFixed(2)),
      ttcSeconds,
      ttcSecondsRaw:       simSnap.ttcSecondsRaw,
      riskScore,
      riskLevel,
      recommendedAction,
      riskExplanation,
      telemetryHemm01:     t1,
      telemetryHemm02:     t2,
      currentSectionHemm01: getCurrentSection(ACTIVE_HAUL_ROUTE, t1.route_distance),
      currentSectionHemm02: getCurrentSection(ACTIVE_HAUL_ROUTE, t2.route_distance),
      upcomingHazardHemm01: upcoming ? { ...upcoming, vehicleId: 'HEMM-01' } : null,
      hemm01: {
        speedKmh:    Math.round(t1.speed),
        heading:     t1.heading,
        coordinates: CoordinateMapper.mapPosition3DToGeographic(t1.position, t1.data_mode),
      },
      hemm02: {
        speedKmh:    Math.round(t2.speed),
        heading:     t2.heading,
        coordinates: CoordinateMapper.mapPosition3DToGeographic(t2.position, t2.data_mode),
      },
      // Phase 2D fields from simSnap
      blindCurve01Active:  simSnap.blindCurve01Active  ?? false,
      blindCurve02Active:  simSnap.blindCurve02Active  ?? false,
      simulationPrediction: simSnap.simulationPrediction,
      conflictPhase:       simSnap.conflictPhase        ?? 'IDLE',
      conflictId:          simSnap.conflictId           ?? null,
      loraCommands:        simSnap.loraCommands         ?? [],
      hemm02HasExited:     simSnap.hemm02HasExited      ?? false,
      activeZoneIdHemm01:  simSnap.activeZoneIdHemm01  ?? null,
      activeZoneIdHemm02:  simSnap.activeZoneIdHemm02  ?? null,
      oppositeDirectionAssessment: simSnap.oppositeDirectionAssessment,
    };

    return {
      ...base,
      safetyLevel:    simSnap.safetyLevel,
      ttcSecondsRaw:  simSnap.ttcSecondsRaw,
      riskExplanation: simSnap.oppositeDirectionAssessment?.reason ?? base.riskExplanation,
    };
  }, [simSnap, telemetryMap, progressSeconds, isPlaying]);

  // ── Vehicle map states ────────────────────────────────────────────────────────
  const vehicles = useMemo<MapVehicle[]>(() => {
    const t1 = telemetryMap['HEMM-01'] ?? INITIAL_SIMULATION_STATE.telemetryHemm01;
    const t2 = telemetryMap['HEMM-02'] ?? INITIAL_SIMULATION_STATE.telemetryHemm02;
    const _mapSl = simSnap.safetyLevel ?? 'UNKNOWN';
    return [
      {
        id:            'HEMM-01',
        type:          t1.vehicle_type,
        coordinates:   CoordinateMapper.mapPosition3DToGeographic(t1.position, t1.data_mode),
        heading:       t1.heading,
        status:        (_mapSl === 'CRITICAL' || _mapSl === 'HIGH') ? 'STANDBY' : 'NORMAL',
        dataProvenance: 'SIMULATION',
      },
      {
        id:            'HEMM-02',
        type:          t2.vehicle_type,
        coordinates:   CoordinateMapper.mapPosition3DToGeographic(t2.position, t2.data_mode),
        heading:       t2.heading,
        status:        'NORMAL',
        dataProvenance: 'SIMULATION',
      },
    ];
  }, [telemetryMap, simSnap.safetyLevel]);

  // ── Derive conflict line coordinates ─────────────────────────────────────────
  // Show the corridor only when phase is PREDICTED or ACTIVE.
  const conflictLineCoordinates = useMemo<[[number, number], [number, number]] | null>(() => {
    const phase = simSnap.conflictPhase ?? 'IDLE';
    if (phase !== 'PREDICTED' && phase !== 'ACTIVE') return null;
    const h1 = snapshot.hemm01.coordinates;
    const h2 = snapshot.hemm02.coordinates;
    if (!h1 || !h2) return null;
    return [h1, h2];
  }, [simSnap.conflictPhase, snapshot.hemm01.coordinates, snapshot.hemm02.coordinates]);

  // ── Controls ──────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    if (!selectedVehicleId) setSelectedVehicleId('HEMM-01');
    telemetryProducer.start();
  }, [selectedVehicleId]);
  const handlePause = useCallback(() => { telemetryProducer.pause(); }, []);
  const handleReset = useCallback(() => { telemetryProducer.reset(); }, []);

  return {
    selectedVehicleId,
    setSelectedVehicleId,
    telemetryMap,
    snapshot,
    vehicles,
    isPlaying,
    progressSeconds,
    handleStart,
    handlePause,
    handleReset,
    alerts,
    stableLevel,
    stableAction,
    // Phase 2D
    backendPrediction,
    conflictPhase:        simSnap.conflictPhase ?? 'IDLE',
    conflictId:           simSnap.conflictId ?? null,
    loraCommands:         simSnap.loraCommands ?? [],
    blindCurve01Active:   simSnap.blindCurve01Active  ?? false,
    blindCurve02Active:   simSnap.blindCurve02Active  ?? false,
    simulationPrediction: simSnap.simulationPrediction ?? null,
    telemetryMapForStrip: telemetryMap,
    conflictLineCoordinates,
  };
}
