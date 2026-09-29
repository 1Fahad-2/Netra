/**
 * MachineMind — Simulator Telemetry Producer (Phase 2D)
 *
 * Responsibilities:
 * 1. Owns the stateful ConflictLifecycleState across ticks.
 * 2. Calls advanceConflictLifecycle() once per tick to evolve the lifecycle.
 * 3. Passes the current lifecycle state into computeSimulationAtTime() (pure).
 * 4. Emits real VehicleTelemetry payloads to POST /api/telemetry over HTTP.
 * 5. Does NOT mutate React dashboard state directly.
 * 6. Supports START, PAUSE, and RESET controls.
 * 7. Tags all telemetry with data_mode: 'SIMULATION', source_metadata: 'SIMULATOR'.
 *
 * Lifecycle ownership:
 *   - computeSimulationAtTime() is PURE — no side effects, same input → same output.
 *   - ConflictLifecycleState lives HERE, advanced once per tick.
 *   - Accumulated LoRa commands are tracked here to prevent duplicate issuance.
 *
 * Phase 2D scenario duration: 90 seconds.
 */

import {
  computeSimulationAtTime,
  advanceConflictLifecycle,
  createConflictLifecycle,
  type ConflictLifecycleState,
  type LoraCommand,
  type ConflictPhysicsSnapshot,
} from './demoSimulation';
import type { VehicleTelemetry } from '../types/contract';
import type { SimulationTelemetrySnapshot } from './demoSimulation';

export type ProducerListener = (progressSeconds: number, isPlaying: boolean) => void;

class TelemetryProducer {
  private progressSeconds = 0;
  private isPlaying = false;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<ProducerListener> = new Set();
  private snapshotListeners: Set<(snapshot: SimulationTelemetrySnapshot) => void> = new Set();
  private apiUrl: string;
  private tickIntervalMs = 400; // ~2.5 Hz demo streaming rate
  private timeStepSec = 0.4;    // 0.4s scenario progression per tick
  private readonly maxScenarioDuration = 90.0; // Phase 2D: 90s scenario

  // ── Conflict lifecycle state (owned by TelemetryProducer) ─────────────────
  private lifecycleState: ConflictLifecycleState = createConflictLifecycle();
  /** Accumulated LoRa commands across the entire scenario (persistent, no duplicates). */
  private accumulatedCommands: LoraCommand[] = [];

  constructor() {
    // Prefer explicit VITE_API_URL if provided; fallback to hostname detection.
    const envUrl = (import.meta.env as any).VITE_API_URL;
    if (envUrl) {
      this.apiUrl = `${envUrl.replace(/\/+$/, '')}/api/telemetry`;
    } else {
      const isBrowser = typeof window !== 'undefined';
      const host = isBrowser ? window.location.hostname || '127.0.0.1' : '127.0.0.1';
      this.apiUrl = `http://${host}:8000/api/telemetry`;
    }
  }

  public setApiUrl(url: string): void {
    this.apiUrl = url;
  }

  public getProgress(): number {
    return this.progressSeconds;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public subscribe(listener: ProducerListener): () => void {
    this.listeners.add(listener);
    listener(this.progressSeconds, this.isPlaying);
    return () => this.listeners.delete(listener);
  }

  public subscribeSnapshot(
    listener: (snapshot: SimulationTelemetrySnapshot) => void
  ): () => void {
    this.snapshotListeners.add(listener);

    const current = computeSimulationAtTime(
      this.progressSeconds,
      this.isPlaying,
      this.lifecycleState,
      this.accumulatedCommands,
    );
    listener(current);

    return () => this.snapshotListeners.delete(listener);
  }

  public start(): void {
    if (this.isPlaying) return;

    if (this.progressSeconds >= this.maxScenarioDuration) {
      this.progressSeconds = 0;
      this.lifecycleState = createConflictLifecycle();
      this.accumulatedCommands = [];
    }

    this.isPlaying = true;
    this.notify();

    // Immediately transmit first tick
    this.transmitCurrentTick();

    // Run periodic producer timer
    this.timerId = setInterval(() => {
      this.progressSeconds = Math.min(
        this.progressSeconds + this.timeStepSec,
        this.maxScenarioDuration,
      );

      this.notify();
      this.transmitCurrentTick();

      // Auto-stop at scenario end
      if (this.progressSeconds >= this.maxScenarioDuration) {
        this.pause();
      }
    }, this.tickIntervalMs);
  }

  public pause(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.notify();
  }

  public reset(): void {
    this.pause();
    this.progressSeconds = 0;
    // Reset conflict lifecycle state on scenario reset
    this.lifecycleState = createConflictLifecycle();
    this.accumulatedCommands = [];
    this.notify();
    // Transmit baseline t=0 state through the pipeline
    this.transmitCurrentTick();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.progressSeconds, this.isPlaying);
      } catch (err) {
        console.error('[TelemetryProducer] Listener error:', err);
      }
    }
  }

  private transmitCurrentTick(): void {
    // ── 1. Compute pure physics snapshot at current time ──────────────────────
    const physicsSnap = computeSimulationAtTime(
      this.progressSeconds,
      this.isPlaying,
      this.lifecycleState,
      this.accumulatedCommands,
    );

    // ── 2. Build physics summary for lifecycle advancement ────────────────────
    const hasPassed =
      physicsSnap.telemetryHemm01.route_distance > physicsSnap.telemetryHemm02.route_distance;

    const physicsInput: ConflictPhysicsSnapshot = {
      separationM:    physicsSnap.oppositeDirectionAssessment?.separationM ?? physicsSnap.distanceMeters,
      closingSpeedMs: physicsSnap.oppositeDirectionAssessment?.closingSpeedMs ?? 0,
      isConverging:   physicsSnap.oppositeDirectionAssessment?.isConverging ?? false,
      safetyLevel:    physicsSnap.safetyLevel ?? 'NORMAL',
      predictionActive: physicsSnap.simulationPrediction.predicted,
      hasPassed,
      progressSeconds: this.progressSeconds,
    };

    // ── 3. Advance lifecycle state ────────────────────────────────────────────
    const nowIso = new Date().toISOString();
    const { state: nextLifecycle, newCommands } = advanceConflictLifecycle(
      this.lifecycleState,
      physicsInput,
      nowIso,
    );
    this.lifecycleState = nextLifecycle;

    // Accumulate commands (prevents duplicates: commands only emitted once per encounter)
    if (newCommands.length > 0) {
      this.accumulatedCommands = [...this.accumulatedCommands, ...newCommands];
      console.log(`[TelemetryProducer] LoRa commands issued: ${newCommands.map(c => c.command_id).join(', ')} for ${nextLifecycle.conflictId}`);
    }

    // ── 4. Produce final snapshot with updated lifecycle ──────────────────────
    const snapshot = computeSimulationAtTime(
      this.progressSeconds,
      this.isPlaying,
      this.lifecycleState,
      this.accumulatedCommands,
    );

    // ── 5. Emit to snapshot listeners ─────────────────────────────────────────
    for (const listener of this.snapshotListeners) {
      try {
        listener(snapshot);
      } catch (err) {
        console.error('[TelemetryProducer] Snapshot listener error:', err);
      }
    }

    // ── 6. POST telemetry to backend ──────────────────────────────────────────
    const hemm01: VehicleTelemetry = {
      ...snapshot.telemetryHemm01,
      data_mode: 'SIMULATION',
      source_metadata: 'SIMULATOR',
    };
    const hemm02: VehicleTelemetry = {
      ...snapshot.telemetryHemm02,
      data_mode: 'SIMULATION',
      source_metadata: 'SIMULATOR',
    };

    Promise.allSettled([
      this.postTelemetry(hemm01),
      this.postTelemetry(hemm02),
    ]).catch((err) => {
      console.warn('[TelemetryProducer] Error transmitting telemetry to API:', err);
    });
  }

  private async postTelemetry(telemetry: VehicleTelemetry): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
      const resp = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(telemetry),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!resp.ok) {
        console.warn(`[TelemetryProducer] Telemetry POST returned HTTP ${resp.status}`);
      }
    } catch (err) {
      // Network errors during POST (e.g. backend temporarily down)
      console.warn('[TelemetryProducer] Failed to send telemetry POST request:', err);
    }
  }
}

export const telemetryProducer = new TelemetryProducer();
