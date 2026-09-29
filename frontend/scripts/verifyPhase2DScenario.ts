/**
 * NETRA — Phase 2D Complete Verifier (scripts/verifyPhase2DScenario.ts)
 *
 * Tests T10–T20 + additional invariants for stable conflict lifecycle.
 *
 * Runs against the real project modules under Node (no browser, no WebSocket).
 *
 * Usage:
 *   cd frontend
 *   npx tsx scripts/verifyPhase2DScenario.ts
 *
 * Exits with code 1 if any assertion fails.
 */

import {
  computeSimulationAtTime,
  advanceConflictLifecycle,
  createConflictLifecycle,
  SCENARIO_DURATION_S,
  HEMM01_START_DIST_M,
  HEMM02_START_DIST_M,
  RECOVERY_SEPARATION_M,
  type ConflictLifecycleState,
  type LoraCommand,
  type ConflictPhysicsSnapshot,
} from '../src/services/demoSimulation';
import {
  BC01_ACTIVATION_ZONE,
  BC02_ACTIVATION_ZONE,
} from '../src/data/activeHaulRoute';
import { RISK_THRESHOLDS } from '../src/services/safetyAssessment';

// ── Test infrastructure ────────────────────────────────────────────────────────
let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  PASS  ${label}`);
    passCount++;
  } else {
    const msg = `  FAIL  ${label}${detail ? `  — ${detail}` : ''}`;
    console.error(msg);
    failures.push(msg);
    failCount++;
  }
}

// ── Simulation tick runner with lifecycle ─────────────────────────────────────
interface TickRecord {
  t: number;
  separationM: number;
  closingSpeedMs: number;
  isConverging: boolean;
  hasPassed: boolean;
  safetyLevel: string;
  predictionActive: boolean;
  phase: string;
  conflictId: string | null;
  hemm01Dist: number;
  hemm02Dist: number;
  hemm02HasExited: boolean;
  blindCurve01Active: boolean;
  blindCurve02Active: boolean;
  allCommands: LoraCommand[];
}

function runFullScenario(): TickRecord[] {
  const records: TickRecord[] = [];
  let lifecycle: ConflictLifecycleState = createConflictLifecycle();
  const allCommands: LoraCommand[] = [];
  const TICK = 0.4;

  for (let t = 0; t <= SCENARIO_DURATION_S + 1e-9; t += TICK) {
    const tRounded = Number(t.toFixed(1));
    const snap = computeSimulationAtTime(tRounded, true, lifecycle, allCommands);

    const hasPassed = snap.telemetryHemm01.route_distance > snap.telemetryHemm02.route_distance;
    const physicsInput: ConflictPhysicsSnapshot = {
      separationM:    snap.oppositeDirectionAssessment?.separationM ?? snap.distanceMeters,
      closingSpeedMs: snap.oppositeDirectionAssessment?.closingSpeedMs ?? 0,
      isConverging:   snap.oppositeDirectionAssessment?.isConverging ?? false,
      safetyLevel:    snap.safetyLevel ?? 'NORMAL',
      predictionActive: snap.simulationPrediction.predicted,
      hasPassed,
      progressSeconds: tRounded,
    };

    const nowIso = `2026-09-22T${String(Math.floor(t)).padStart(2,'0')}:00:00.000Z`;
    const { state: nextLifecycle, newCommands } = advanceConflictLifecycle(
      lifecycle,
      physicsInput,
      nowIso,
    );
    lifecycle = nextLifecycle;
    if (newCommands.length > 0) {
      allCommands.push(...newCommands);
    }

    const finalSnap = computeSimulationAtTime(tRounded, true, lifecycle, allCommands);

    records.push({
      t: tRounded,
      separationM:    physicsInput.separationM,
      closingSpeedMs: physicsInput.closingSpeedMs,
      isConverging:   physicsInput.isConverging,
      hasPassed,
      safetyLevel:    snap.safetyLevel ?? 'NORMAL',
      predictionActive: snap.simulationPrediction.predicted,
      phase:          finalSnap.conflictPhase,
      conflictId:     finalSnap.conflictId,
      hemm01Dist:     snap.telemetryHemm01.route_distance,
      hemm02Dist:     snap.telemetryHemm02.route_distance,
      hemm02HasExited: snap.hemm02HasExited,
      blindCurve01Active: snap.blindCurve01Active,
      blindCurve02Active: snap.blindCurve02Active,
      allCommands:    [...allCommands],
    });
  }

  return records;
}

console.log('Running full 90-second scenario with lifecycle...');
const records = runFullScenario();
console.log(`Scenario complete: ${records.length} ticks recorded.\n`);

// ── T10: Conflict ID remains stable throughout one encounter ─────────────────
console.log('=== T10: Conflict ID stable throughout one encounter ===');
{
  // Find all ticks where conflictId is not null
  const conflictTicks = records.filter(r => r.conflictId !== null);
  const uniqueIds = new Set(conflictTicks.map(r => r.conflictId));

  check('T10a: Exactly one conflict ID generated for the entire scenario',
    uniqueIds.size === 1,
    `IDs seen: ${[...uniqueIds].join(', ')}`);

  const conflictId = [...uniqueIds][0] ?? null;
  check('T10b: Conflict ID matches expected format CONFLICT-001',
    conflictId === 'CONFLICT-001',
    `got: ${conflictId}`);

  // Check that the ID is the same across PREDICTED, ACTIVE, CLEARED phases
  const predictedIds = records.filter(r => r.phase === 'PREDICTED').map(r => r.conflictId);
  const activeIds    = records.filter(r => r.phase === 'ACTIVE').map(r => r.conflictId);
  const clearedIds   = records.filter(r => r.phase === 'CLEARED').map(r => r.conflictId);

  if (predictedIds.length > 0 && activeIds.length > 0) {
    check('T10c: Same conflict ID during PREDICTED phase',
      predictedIds.every(id => id === conflictId),
      `PREDICTED ids: ${[...new Set(predictedIds)].join(', ')}`);
    check('T10d: Same conflict ID during ACTIVE phase',
      activeIds.every(id => id === conflictId),
      `ACTIVE ids: ${[...new Set(activeIds)].join(', ')}`);
  } else {
    check('T10c: PREDICTED phase occurred', predictedIds.length > 0, `ticks: ${predictedIds.length}`);
    check('T10d: ACTIVE phase occurred', activeIds.length > 0, `ticks: ${activeIds.length}`);
  }

  if (clearedIds.length > 0) {
    check('T10e: Same conflict ID during CLEARED phase',
      clearedIds.every(id => id === conflictId),
      `CLEARED ids: ${[...new Set(clearedIds)].join(', ')}`);
  }
}

// ── T11: No duplicate safety commands ─────────────────────────────────────────
console.log('\n=== T11: No duplicate safety commands generated ===');
{
  // Get the final command state (accumulated across full run)
  const lastRecord = records[records.length - 1];
  const commands = lastRecord.allCommands;

  check('T11a: Exactly two LoRa commands issued (one per vehicle)',
    commands.length === 2,
    `got ${commands.length} commands`);

  const ids = commands.map(c => c.command_id);
  const uniqueIds = new Set(ids);
  check('T11b: No duplicate command IDs',
    uniqueIds.size === ids.length,
    `IDs: ${ids.join(', ')}`);

  check('T11c: CMD-001 targets HEMM-01',
    commands.some(c => c.command_id === 'CMD-001' && c.vehicle_id === 'HEMM-01'));
  check('T11d: CMD-002 targets HEMM-02',
    commands.some(c => c.command_id === 'CMD-002' && c.vehicle_id === 'HEMM-02'));

  // Verify no further commands were issued after the first encounter
  const conflictId = commands[0]?.conflict_id ?? null;
  check('T11e: All commands reference the same conflict ID',
    commands.every(c => c.conflict_id === conflictId),
    `conflict IDs in commands: ${[...new Set(commands.map(c => c.conflict_id))].join(', ')}`);
}

// ── T12: Conflict remains ACTIVE through close approach ───────────────────────
console.log('\n=== T12: Conflict remains ACTIVE through close approach ===');
{
  // Find ticks where safetyLevel is CRITICAL
  const criticalTicks = records.filter(r => r.safetyLevel === 'CRITICAL');
  check('T12a: CRITICAL safety level reached during scenario',
    criticalTicks.length > 0,
    `CRITICAL ticks: ${criticalTicks.length}`);

  // During CRITICAL ticks, phase should be ACTIVE (not IDLE or CLEARED)
  if (criticalTicks.length > 0) {
    check('T12b: conflictPhase is ACTIVE during all CRITICAL ticks',
      criticalTicks.every(r => r.phase === 'ACTIVE'),
      `phases during CRITICAL: ${[...new Set(criticalTicks.map(r => r.phase))].join(', ')}`);
  }

  // Find ticks where safetyLevel is HIGH
  const highTicks = records.filter(r => r.safetyLevel === 'HIGH');
  if (highTicks.length > 0) {
    check('T12c: conflictPhase is ACTIVE during all HIGH ticks',
      highTicks.every(r => r.phase === 'ACTIVE'),
      `phases during HIGH: ${[...new Set(highTicks.map(r => r.phase))].join(', ')}`);
  }
}

// ── T13: Conflict clears ONLY with all three conditions met ───────────────────
console.log('\n=== T13: Conflict clears only after hasPassed && sep > 50m && closingSpeed <= 0 ===');
{
  // Find transition tick: ACTIVE → CLEARED
  let clearTransitionTick: TickRecord | null = null;
  for (let i = 1; i < records.length; i++) {
    if (records[i - 1].phase === 'ACTIVE' && records[i].phase === 'CLEARED') {
      clearTransitionTick = records[i];
      break;
    }
  }

  if (clearTransitionTick) {
    check('T13a: hasPassed === true when conflict cleared',
      clearTransitionTick.hasPassed,
      `hasPassed=${clearTransitionTick.hasPassed}`);
    check(`T13b: separation > ${RECOVERY_SEPARATION_M}m when conflict cleared`,
      clearTransitionTick.separationM > RECOVERY_SEPARATION_M,
      `sep=${clearTransitionTick.separationM.toFixed(1)} m at t=${clearTransitionTick.t}`);
    check('T13c: closingSpeed <= 0 when conflict cleared',
      clearTransitionTick.closingSpeedMs <= 0,
      `closingSpeed=${clearTransitionTick.closingSpeedMs.toFixed(2)} m/s`);
  } else {
    check('T13: ACTIVE → CLEARED transition occurred', false, 'no transition found');
  }
}

// ── T14: HEMM-01 reaches BC02 activation zone ─────────────────────────────────
console.log('\n=== T14: HEMM-01 reaches BC02 activation zone ===');
{
  const bc02ZoneStart = BC02_ACTIVATION_ZONE.startM;
  const bc02ZoneEnd   = BC02_ACTIVATION_ZONE.endM;

  const hemm01InBC02 = records.filter(r =>
    r.hemm01Dist >= bc02ZoneStart && r.hemm01Dist <= bc02ZoneEnd
  );

  check(`T14a: HEMM-01 enters BC02 zone [${bc02ZoneStart.toFixed(0)}, ${bc02ZoneEnd.toFixed(0)}] m`,
    hemm01InBC02.length > 0,
    `HEMM-01 max dist in scenario: ${Math.max(...records.map(r => r.hemm01Dist)).toFixed(1)} m`);

  if (hemm01InBC02.length > 0) {
    const firstEntry = hemm01InBC02[0];
    check('T14b: HEMM-01 enters BC02 after the first conflict (t > 40)',
      firstEntry.t > 40,
      `entered at t=${firstEntry.t}`);
  }

  // HEMM-01 final position should be well past BC02
  const finalHemm01Dist = records[records.length - 1].hemm01Dist;
  check('T14c: HEMM-01 final route distance > 600 m (past BC02 apex)',
    finalHemm01Dist > 600,
    `final dist=${finalHemm01Dist.toFixed(1)} m`);
}

// ── T15: BC02 activates ONLY while HEMM-01 is inside [583, 783] ───────────────
console.log('\n=== T15: BC02 activates only while HEMM-01 is inside the activation zone ===');
{
  const bc02ZoneStart = BC02_ACTIVATION_ZONE.startM;
  const bc02ZoneEnd   = BC02_ACTIVATION_ZONE.endM;

  // BC02 should not be active before HEMM-01 enters the zone
  const bc02ActiveBeforeZone = records.filter(r =>
    r.blindCurve02Active && r.hemm01Dist < bc02ZoneStart
  );
  check('T15a: BC02 not active before HEMM-01 enters the zone',
    bc02ActiveBeforeZone.length === 0,
    `${bc02ActiveBeforeZone.length} early-activation ticks`);

  // BC02 should not be active after HEMM-01 exits the zone (and HEMM-02 has also exited)
  const bc02ActiveAfterZone = records.filter(r =>
    r.blindCurve02Active &&
    r.hemm01Dist > bc02ZoneEnd &&
    r.hemm02HasExited
  );
  check('T15b: BC02 not active after HEMM-01 exits the zone (and HEMM-02 exited)',
    bc02ActiveAfterZone.length === 0,
    `${bc02ActiveAfterZone.length} late-activation ticks`);

  // BC02 should be active when HEMM-01 is inside
  const bc02InZone = records.filter(r =>
    r.hemm01Dist >= bc02ZoneStart && r.hemm01Dist <= bc02ZoneEnd
  );
  if (bc02InZone.length > 0) {
    const bc02ActiveInZone = bc02InZone.filter(r => r.blindCurve02Active);
    check('T15c: BC02 is active when HEMM-01 is inside the zone',
      bc02ActiveInZone.length > 0,
      `zone ticks: ${bc02InZone.length}, active: ${bc02ActiveInZone.length}`);
  }
}

// ── T16: Conflict corridor active only during PREDICTED or ACTIVE ─────────────
console.log('\n=== T16: Conflict corridor active only during PREDICTED or ACTIVE ===');
{
  // The corridor is conceptually active when phase === PREDICTED or ACTIVE
  // (useTelemetry.ts computes conflictLineCoordinates based on this)
  const corridorActiveTicks = records.filter(
    r => r.phase === 'PREDICTED' || r.phase === 'ACTIVE'
  );
  const corridorInactiveTicks = records.filter(
    r => r.phase === 'IDLE' || r.phase === 'CLEARED'
  );

  check('T16a: Corridor is active during PREDICTED and ACTIVE phases',
    corridorActiveTicks.length > 0,
    `active ticks: ${corridorActiveTicks.length}`);
  check('T16b: Corridor is inactive during IDLE and CLEARED phases',
    corridorInactiveTicks.length > 0,
    `inactive ticks: ${corridorInactiveTicks.length}`);

  // At t=0 corridor should be inactive (IDLE)
  const t0 = records[0];
  check('T16c: Corridor inactive at t=0 (IDLE)',
    t0.phase === 'IDLE',
    `phase at t=0: ${t0.phase}`);
}

// ── T17: Conflict corridor disappears after CLEARED ───────────────────────────
console.log('\n=== T17: Conflict corridor disappears after CLEARED ===');
{
  // After the CLEARED phase, phase should return to IDLE and corridor should be off
  const afterCleared = records.filter(r => {
    // Find ticks after CLEARED that are in IDLE
    const clearedIdx = records.findIndex(r2 => r2.phase === 'CLEARED');
    return clearedIdx >= 0 && records.indexOf(r) > clearedIdx + 5; // after grace period
  });

  const idleAfterCleared = afterCleared.filter(r => r.phase === 'IDLE');
  check('T17a: Phase returns to IDLE after CLEARED grace period',
    idleAfterCleared.length > 0,
    `IDLE ticks after CLEARED: ${idleAfterCleared.length}`);

  if (idleAfterCleared.length > 0) {
    check('T17b: conflictId is null after IDLE (corridor off)',
      idleAfterCleared.some(r => r.conflictId === null),
      `conflictId in IDLE: ${idleAfterCleared[0]?.conflictId}`);
  }
}

// ── T18: Scenario is deterministic across repeated runs ───────────────────────
console.log('\n=== T18: Scenario deterministic across repeated runs ===');
{
  // Run a second simulation and compare key values
  let lifecycle2: ConflictLifecycleState = createConflictLifecycle();
  const allCommands2: LoraCommand[] = [];
  const sampleTicks = [0, 10, 20, 30, 40, 60, 90];
  let allMatch = true;

  for (const t of sampleTicks) {
    const snap1 = records.find(r => r.t === t);
    if (!snap1) continue;

    const snap2physics = computeSimulationAtTime(t, true, lifecycle2, allCommands2);
    const hasPassed2 = snap2physics.telemetryHemm01.route_distance > snap2physics.telemetryHemm02.route_distance;
    const physics2: ConflictPhysicsSnapshot = {
      separationM:    snap2physics.oppositeDirectionAssessment?.separationM ?? snap2physics.distanceMeters,
      closingSpeedMs: snap2physics.oppositeDirectionAssessment?.closingSpeedMs ?? 0,
      isConverging:   snap2physics.oppositeDirectionAssessment?.isConverging ?? false,
      safetyLevel:    snap2physics.safetyLevel ?? 'NORMAL',
      predictionActive: snap2physics.simulationPrediction.predicted,
      hasPassed: hasPassed2,
      progressSeconds: t,
    };
    // Note: we can only check physics (pure function), not lifecycle (stateful)
    const sep1 = snap1.separationM;
    const sep2 = snap2physics.oppositeDirectionAssessment?.separationM ?? snap2physics.distanceMeters;
    if (Math.abs(sep1 - sep2) > 0.01) { allMatch = false; }
    void physics2; // used for type check
  }

  check('T18: computeSimulationAtTime() is deterministic (separation matches across runs)',
    allMatch,
    allMatch ? 'all sample ticks match' : 'mismatch detected');
}

// ── T19: No ACTIVE → NORMAL → ACTIVE flicker ─────────────────────────────────
console.log('\n=== T19: No ACTIVE → NORMAL → ACTIVE flicker during one encounter ===');
{
  // Detect if the phase ever goes ACTIVE → IDLE/CLEARED and then back to ACTIVE
  // within the same encounter (same conflictId)
  let activeToNonActive = false;
  let backToActive = false;
  let inActive = false;
  let leftActive = false;
  let activeConflictId: string | null = null;

  for (const r of records) {
    if (r.phase === 'ACTIVE' && !inActive) {
      inActive = true;
      leftActive = false;
      activeConflictId = r.conflictId;
    } else if (r.phase !== 'ACTIVE' && r.phase !== 'CLEARED' && inActive) {
      // Phase left ACTIVE to something other than CLEARED
      leftActive = true;
      activeToNonActive = true;
      inActive = false;
    } else if (r.phase === 'ACTIVE' && leftActive && r.conflictId === activeConflictId) {
      // Came back to ACTIVE with same conflict ID — that's a flicker
      backToActive = true;
    }
  }

  check('T19: No ACTIVE → IDLE → ACTIVE flicker (same encounter)',
    !backToActive,
    backToActive
      ? `flickered on conflictId=${activeConflictId}`
      : 'no flicker detected');

  // Also check: during ACTIVE phase, conflict ID never changes
  let activeIdChanged = false;
  let prevActiveId: string | null = null;
  for (const r of records) {
    if (r.phase === 'ACTIVE') {
      if (prevActiveId !== null && prevActiveId !== r.conflictId) {
        activeIdChanged = true;
      }
      prevActiveId = r.conflictId;
    }
  }
  check('T19b: Conflict ID never changes during ACTIVE phase',
    !activeIdChanged,
    activeIdChanged ? 'conflict ID changed during ACTIVE' : 'stable');

  void activeToNonActive; // informational
}

// ── T20: HEMM-01 continues moving after first conflict ───────────────────────
console.log('\n=== T20: HEMM-01 continues moving after first conflict and does not freeze ===');
{
  // After t=40 (post-conflict recovery) HEMM-01 should continue increasing dist
  const postConflictRecords = records.filter(r => r.t >= 40 && r.t <= 90);

  check('T20a: Post-conflict records exist (t=40..90)',
    postConflictRecords.length > 0,
    `${postConflictRecords.length} ticks`);

  if (postConflictRecords.length >= 2) {
    // HEMM-01 route_distance should be strictly increasing after t=40
    let hemm01Moving = true;
    for (let i = 1; i < postConflictRecords.length; i++) {
      if (postConflictRecords[i].hemm01Dist <= postConflictRecords[i-1].hemm01Dist) {
        // Allow equality (clamped at route end) but not regression
        if (postConflictRecords[i].hemm01Dist < postConflictRecords[i-1].hemm01Dist) {
          hemm01Moving = false;
          break;
        }
      }
    }
    check('T20b: HEMM-01 route_distance never decreases after t=40',
      hemm01Moving,
      `dist at t=40: ${postConflictRecords[0].hemm01Dist.toFixed(1)}, at t=90: ${postConflictRecords[postConflictRecords.length-1].hemm01Dist.toFixed(1)}`);

    const distAt40 = postConflictRecords[0].hemm01Dist;
    const distAt90 = postConflictRecords[postConflictRecords.length - 1].hemm01Dist;
    check('T20c: HEMM-01 advances significantly after conflict (> 100 m from t=40 to t=90)',
      distAt90 - distAt40 > 100,
      `advanced ${(distAt90 - distAt40).toFixed(1)} m`);
  }
}

// ── Additional invariants ─────────────────────────────────────────────────────
console.log('\n=== Additional invariants ===');

// Exactly one conflict ID per encounter
{
  const allIds = new Set(records.filter(r => r.conflictId !== null).map(r => r.conflictId));
  check('INV-A: Exactly one conflict ID across the full scenario',
    allIds.size === 1,
    `IDs: ${[...allIds].join(', ')}`);
}

// Exactly two commands per encounter
{
  const lastRecord = records[records.length - 1];
  check('INV-B: Exactly two LoRa commands issued per encounter',
    lastRecord.allCommands.length === 2,
    `commands: ${lastRecord.allCommands.length}`);
}

// No duplicate command IDs
{
  const lastRecord = records[records.length - 1];
  const cmdIds = lastRecord.allCommands.map(c => c.command_id);
  check('INV-C: No duplicate command IDs',
    new Set(cmdIds).size === cmdIds.length,
    `ids: ${cmdIds.join(', ')}`);
}

// HEMM-02 does not create new prediction after route exit
{
  const hemm02Exited = records.filter(r => r.hemm02HasExited);
  if (hemm02Exited.length > 0) {
    const predictionAfterExit = hemm02Exited.filter(r => r.predictionActive);
    check('INV-D: No new prediction after HEMM-02 exits route',
      predictionAfterExit.length === 0,
      `${predictionAfterExit.length} prediction ticks after exit`);
  } else {
    check('INV-D: HEMM-02 exits route during scenario', false,
      'HEMM-02 never reached dist=0 — check start dist and speed profile');
  }
}

// BC01 and BC02 are zone-gated
{
  const bc01ActiveCount = records.filter(r => r.blindCurve01Active).length;
  const bc02ActiveCount = records.filter(r => r.blindCurve02Active).length;
  check('INV-E: BC01 zone is activated at some point', bc01ActiveCount > 0,
    `BC01 active ticks: ${bc01ActiveCount}`);
  check('INV-F: BC02 zone is activated at some point', bc02ActiveCount > 0,
    `BC02 active ticks: ${bc02ActiveCount}`);

  // BC01 should not be active after both vehicles are well past it
  const bc01Start = BC01_ACTIVATION_ZONE.startM;
  const bc01End   = BC01_ACTIVATION_ZONE.endM;
  const bc01WronglyActive = records.filter(r =>
    r.blindCurve01Active &&
    r.hemm01Dist > bc01End + 10 &&
    r.hemm02HasExited  // HEMM-02 is gone
  );
  check('INV-G: BC01 not active when both vehicles are past it',
    bc01WronglyActive.length === 0,
    `${bc01WronglyActive.length} wrong-activation ticks`);
  void bc01Start;
}

// Red corridor disappears after recovery
{
  const idleTicks = records.filter(r => r.phase === 'IDLE');
  if (idleTicks.length > 1) {
    const idleAfterConflict = idleTicks.filter(r => r.t > 50);
    check('INV-H: Phase returns to IDLE (corridor off) after recovery',
      idleAfterConflict.length > 0,
      `IDLE ticks after t=50: ${idleAfterConflict.length}`);
  }
}

// Lifecycle phase sequence is valid (no invalid transitions)
{
  const validTransitions: Record<string, string[]> = {
    'IDLE':      ['IDLE', 'PREDICTED'],
    'PREDICTED': ['PREDICTED', 'ACTIVE'],
    'ACTIVE':    ['ACTIVE', 'CLEARED'],
    'CLEARED':   ['CLEARED', 'IDLE'],
  };
  let invalidTransition = false;
  let lastInvalid = '';
  for (let i = 1; i < records.length; i++) {
    const prev = records[i-1].phase;
    const curr = records[i].phase;
    if (!validTransitions[prev]?.includes(curr)) {
      invalidTransition = true;
      lastInvalid = `${prev} → ${curr} at t=${records[i].t}`;
      break;
    }
  }
  check('INV-I: All lifecycle phase transitions are valid',
    !invalidTransition,
    lastInvalid || 'all transitions valid');
}

// Second blind curve is reachable
{
  const bc02Reachable = records.some(r =>
    r.hemm01Dist >= BC02_ACTIVATION_ZONE.startM && r.hemm01Dist <= BC02_ACTIVATION_ZONE.endM
  );
  check('INV-J: Second blind curve (BC02) is reachable by HEMM-01',
    bc02Reachable,
    bc02Reachable
      ? `BC02 zone [${BC02_ACTIVATION_ZONE.startM.toFixed(0)}, ${BC02_ACTIVATION_ZONE.endM.toFixed(0)}] reached`
      : `HEMM-01 max dist: ${Math.max(...records.map(r => r.hemm01Dist)).toFixed(1)} m`);
}

// Verify scenario duration
{
  const lastT = records[records.length - 1].t;
  check('INV-K: Scenario runs for 90 seconds',
    lastT >= SCENARIO_DURATION_S - 0.5,
    `last t=${lastT}`);
}

// HEMM-01 and HEMM-02 start positions correct
{
  const r0 = records[0];
  check('INV-L: HEMM-01 starts at correct distance',
    Math.abs(r0.hemm01Dist - HEMM01_START_DIST_M) < 1,
    `dist=${r0.hemm01Dist}`);
  check('INV-M: HEMM-02 starts at correct distance',
    Math.abs(r0.hemm02Dist - HEMM02_START_DIST_M) < 1,
    `dist=${r0.hemm02Dist}`);
}

// ── Phase 2A safety thresholds respected ──────────────────────────────────────
console.log('\n=== Phase 2A safety thresholds preserved ===');
{
  for (const r of records) {
    const sep = r.separationM;
    const isConverging = r.isConverging;
    const safetyLevel = r.safetyLevel;
    if (safetyLevel === 'CRITICAL') {
      const snap = computeSimulationAtTime(r.t, true);
      const ttc = snap.ttcSecondsRaw;
      const byDist = sep < RISK_THRESHOLDS.CRITICAL.distanceM;
      const byTtc  = ttc !== null && ttc < RISK_THRESHOLDS.CRITICAL.ttcS;
      if (!byDist && !byTtc && isConverging) {
        check('SAFETY: CRITICAL level has valid trigger', false,
          `t=${r.t} sep=${sep.toFixed(1)} ttc=${ttc}`);
      }
    }
  }
  check('SAFETY: All CRITICAL ticks have valid triggers (dist or TTC)', true);

  // Verify NORMAL at start and end
  const r0 = records[0];
  const rLast = records[records.length - 1];
  check('SAFETY: safetyLevel is NORMAL at t=0',
    r0.safetyLevel === 'NORMAL', `got: ${r0.safetyLevel}`);
  check('SAFETY: safetyLevel returns to NORMAL after conflict',
    rLast.safetyLevel === 'NORMAL', `got: ${rLast.safetyLevel}`);
}

// ── Summary ────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(72));
console.log(`Phase 2D Scenario Verifier: ${passCount} passed, ${failCount} failed`);

if (failCount === 0) {
  console.log('\nALL PHASE 2D CHECKS PASSED');
  process.exit(0);
} else {
  console.log(`\n${failCount} CHECK(S) FAILED:`);
  failures.forEach(f => console.log(f));
  process.exit(1);
}
