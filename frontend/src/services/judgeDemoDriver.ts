/**
 * NETRA — Judge Mode Demo Driver (Phase 3 frontend)
 *
 * Plays back the SAME full-journey scenario as
 * backend/app/demo_full_journey_demo.py (the verified 9-stage / 16-check
 * CLI journey), but triggered from the browser via a "Start Demo" button.
 *
 * IMPORTANT — this does NOT add any new backend endpoint and does NOT spawn
 * any backend process. It only POSTs telemetry to the EXISTING
 * POST /api/telemetry ingestion endpoint (app/api/telemetry.py), exactly
 * like a real ESP32/HEMM vehicle or the CLI demo script would. The real
 * backend blind-curve state machine (blind_curve_state_service.py) and V2V
 * engine (v2v_engine.py) compute every state transition — this file never
 * invents, guesses, or overrides a safety state. If this driver is never
 * used, the CLI script (`python app/demo_full_journey_demo.py`) still works
 * exactly as before and drives the same dashboard.
 *
 * Route landmark distances below are plain numbers taken from the frozen
 * route geometry in backend/app/services/route_projector.py
 * (BC01_START_DIST_M, BC01_END_DIST_M, BC02_APPROACH_DIST_M,
 * BC02_END_DIST_M) — duplicated here only to choreograph WHEN each POST is
 * sent. The backend independently recomputes and enforces every real
 * state transition from route_distance; nothing here is trusted as-is by
 * the safety logic.
 */

import { getApiBaseUrl } from './api';

const BC01_START_DIST_M = 133.71;
const BC01_END_DIST_M = 365.09;
const BC02_APPROACH_DIST_M = 566.64;
const BC02_END_DIST_M = 669.72;
const BC1_MID = (BC01_START_DIST_M + BC01_END_DIST_M) / 2;
const BC2_MID = (BC02_APPROACH_DIST_M + BC02_END_DIST_M) / 2;

interface VehicleUpdate {
  vehicleId: string;
  routeDistance: number;
  speed: number;
}

export interface JudgeDemoStage {
  /** Shown in the demo status line while/after this stage plays. */
  label: string;
  updates: VehicleUpdate[];
}

/** Mirrors backend/app/demo_full_journey_demo.py stage-for-stage. */
export const JUDGE_DEMO_STAGES: JudgeDemoStage[] = [
  {
    label: 'Parking HEMM-02 far away',
    updates: [{ vehicleId: 'HEMM-02', routeDistance: 1800.0, speed: 15.0 }],
  },
  {
    label: 'HEMM-01 far from Blind Curve 1 — SAFE',
    updates: [{ vehicleId: 'HEMM-01', routeDistance: 0.0, speed: 20.0 }],
  },
  {
    label: 'HEMM-01 approaching Blind Curve 1',
    updates: [{ vehicleId: 'HEMM-01', routeDistance: BC01_START_DIST_M - 60, speed: 20.0 }],
  },
  {
    label: 'HEMM-01 enters Blind Curve 1',
    updates: [{ vehicleId: 'HEMM-01', routeDistance: BC1_MID, speed: 20.0 }],
  },
  {
    label: 'HEMM-02 approaches inside Blind Curve 1',
    updates: [
      { vehicleId: 'HEMM-02', routeDistance: BC1_MID - 16.66, speed: 35.0 },
      { vehicleId: 'HEMM-01', routeDistance: BC1_MID, speed: 20.0 },
    ],
  },
  {
    label: 'HEMM-02 passes',
    updates: [
      { vehicleId: 'HEMM-02', routeDistance: 1800.0, speed: 35.0 },
      { vehicleId: 'HEMM-01', routeDistance: BC1_MID, speed: 20.0 },
    ],
  },
  {
    label: 'HEMM-01 leaves Blind Curve 1 — SAFE',
    updates: [{ vehicleId: 'HEMM-01', routeDistance: BC01_END_DIST_M + 80, speed: 20.0 }],
  },
  {
    label: 'HEMM-01 approaching Blind Curve 2',
    updates: [{ vehicleId: 'HEMM-01', routeDistance: BC02_APPROACH_DIST_M - 60, speed: 20.0 }],
  },
  {
    label: 'HEMM-01 enters Blind Curve 2 — no vehicle nearby',
    updates: [{ vehicleId: 'HEMM-01', routeDistance: BC2_MID, speed: 20.0 }],
  },
];

interface JudgeDemoTelemetryPayload {
  vehicle_id: string;
  vehicle_type: string;
  timestamp: string;
  position: { latitude: number; longitude: number; altitude: number };
  heading: number;
  speed: number;
  visibility_condition: string;
  sensor_health: { radar: string; thermal: string; gnss: string; imu: string };
  network_status: string;
  source_metadata: string;
  data_mode: string;
  object_detected: boolean;
  route_distance: number;
  section_id: string;
}

function buildPayload(update: VehicleUpdate): JudgeDemoTelemetryPayload {
  return {
    vehicle_id: update.vehicleId,
    vehicle_type: '100T DUMPER',
    timestamp: new Date().toISOString(),
    position: { latitude: 0.0, longitude: 0.0, altitude: 0 },
    heading: 90,
    speed: update.speed,
    visibility_condition: 'NORMAL',
    sensor_health: { radar: 'HEALTHY', thermal: 'HEALTHY', gnss: 'HEALTHY', imu: 'HEALTHY' },
    network_status: 'ONLINE',
    source_metadata: 'judge_demo_frontend',
    data_mode: 'LIVE',
    object_detected: false,
    route_distance: Math.round(update.routeDistance * 100) / 100,
    section_id: 'S01',
  };
}

async function postUpdate(update: VehicleUpdate): Promise<void> {
  const res = await fetch(`${getApiBaseUrl()}/api/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(update)),
  });
  if (!res.ok) {
    throw new Error(`Judge demo telemetry POST failed for ${update.vehicleId}: HTTP ${res.status}`);
  }
}

export interface JudgeDemoControls {
  /** Stops the playback after the in-flight stage finishes. */
  cancel: () => void;
}

/**
 * Starts playing the 9-stage journey in the background (fire-and-forget,
 * paced by stageDelayMs) by POSTing telemetry to the real backend. Returns
 * a handle immediately so the caller can cancel mid-playback.
 */
export function runJudgeDemo(
  onStage?: (index: number, stage: JudgeDemoStage) => void,
  onError?: (err: unknown) => void,
  stageDelayMs = 2200
): JudgeDemoControls {
  let cancelled = false;

  const play = async () => {
    for (let i = 0; i < JUDGE_DEMO_STAGES.length; i++) {
      if (cancelled) return;
      const stage = JUDGE_DEMO_STAGES[i];
      try {
        for (const update of stage.updates) {
          if (cancelled) return;
          await postUpdate(update);
        }
      } catch (err) {
        onError?.(err);
        return;
      }
      if (cancelled) return;
      onStage?.(i, stage);
      if (i < JUDGE_DEMO_STAGES.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, stageDelayMs));
      }
    }
  };

  void play();
  return {
    cancel: () => {
      cancelled = true;
    },
  };
}

/**
 * Re-parks both vehicles to their journey-start positions (stage 0 + 1
 * above), which drives HEMM-01 back to SAFE and HEMM-02 far away. This is
 * a real telemetry POST, not a database wipe — it does not require any new
 * backend endpoint.
 */
export async function resetJudgeDemo(): Promise<void> {
  await postUpdate(JUDGE_DEMO_STAGES[0].updates[0]);
  await postUpdate(JUDGE_DEMO_STAGES[1].updates[0]);
}
