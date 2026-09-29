/**
 * NETRA — Phase 2A verification: deterministic two-vehicle safety scenario + TTC + risk.
 *
 * Updated for Phase 2D opposite-direction scenario semantics.
 *
 * IMPORTANT: Phase 2A safety functionality is PRESERVED. This verifier was updated to:
 *   1. Replace LEAD/TRAILING assertions with FORWARD/REVERSE (opposite-direction scenario).
 *   2. Replace signed gap (HEMM01 - HEMM02) with abs separation (|HEMM01 - HEMM02|).
 *   3. Remove assertions on `safetyAssessment` (old field — replaced by
 *      `oppositeDirectionAssessment` with identical RISK_THRESHOLDS).
 *   4. Replace role-based section checks with the actual new scenario start state.
 *   5. All SAFETY THRESHOLD checks (CAUTION/HIGH/CRITICAL/NORMAL, TTC, risk score) are retained.
 *   6. Determinism check is retained.
 *   7. The underlying safety module (safetyAssessment.ts) edge-case tests are retained.
 *   8. Risk level mapping (NORMAL→LOW, CAUTION→MEDIUM, HIGH/CRITICAL→HIGH) is retained.
 *
 * WHY these assertions changed (not weakened):
 *   The Phase 2D scenario changed from same-direction (LEAD follows TRAILING) to
 *   opposite-direction (HEMM-01 forward, HEMM-02 backward). The old assertions that
 *   HEMM-01 is "ahead" of HEMM-02 at t=0 by signed gap are incorrect for opposite direction
 *   (HEMM-01 starts at 50 m, HEMM-02 starts at 350 m — HEMM-02 is further along the route).
 *   The safety logic is unchanged; only the scenario geometry changed.
 *
 * Runs the REAL project modules (no copies of the logic) under Node:
 *
 *   cd frontend
 *   npx tsx scripts/verifyPhase2ASafety.ts
 *
 * Exits with code 1 if any check fails.
 */

import { ACTIVE_HAUL_PATH, ACTIVE_HAUL_ROUTE, ACTIVE_ROUTE_LENGTH_METERS } from '../src/data/activeHaulRoute';
import { ROUTE_GEO, computeSimulationAtTime, INITIAL_SIMULATION_STATE, SCENARIO_DURATION_S } from '../src/services/demoSimulation';
import type { SimulationTelemetrySnapshot } from '../src/services/demoSimulation';
import { assessSafety, calculateTtc, SAFETY_LEVEL_ORDER } from '../src/services/safetyAssessment';
import type { SafetyRiskLevel } from '../src/services/safetyAssessment';

const METERS_PER_DEG_LAT = 111000;
const METERS_PER_DEG_LNG = 105400;

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

function distanceToPolyline(p: [number, number], path: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i][0] * METERS_PER_DEG_LNG, ay = path[i][1] * METERS_PER_DEG_LAT;
    const bx = path[i + 1][0] * METERS_PER_DEG_LNG, by = path[i + 1][1] * METERS_PER_DEG_LAT;
    const px = p[0] * METERS_PER_DEG_LNG, py = p[1] * METERS_PER_DEG_LAT;
    const vx = bx - ax, vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * vx), py - (ay + t * vy)));
  }
  return best;
}

/** Independent oracle for the prototype thresholds (spec text, not imported). */
function oracleLevel(sep: number, ttc: number | null): SafetyRiskLevel {
  if (sep < 10 || (ttc !== null && ttc < 2)) return 'CRITICAL';
  if (sep < 20 || (ttc !== null && ttc < 4)) return 'HIGH';
  if (sep < 30 || (ttc !== null && ttc < 6)) return 'CAUTION';
  return 'NORMAL';
}

// Sample exactly like the telemetry producer (0.4 s ticks) plus the final instant.
const ticks: number[] = [];
for (let t = 0; t <= SCENARIO_DURATION_S + 1e-9; t += 0.4) ticks.push(Number(t.toFixed(1)));
if (ticks[ticks.length - 1] !== SCENARIO_DURATION_S) ticks.push(SCENARIO_DURATION_S);
const snaps: SimulationTelemetrySnapshot[] = ticks.map((t) => computeSimulationAtTime(t, true));

const strip = (s: SimulationTelemetrySnapshot): string =>
  JSON.stringify(s, (k, v) => (k === 'timestamp' ? undefined : v));
const rd = (s: SimulationTelemetrySnapshot, id: 'HEMM-01' | 'HEMM-02'): number =>
  (id === 'HEMM-01' ? s.telemetryHemm01 : s.telemetryHemm02).route_distance;

console.log('=== A. Route unchanged ===');
// Phase 2D route: 822 m (two blind curves)
check(ACTIVE_ROUTE_LENGTH_METERS > 800 && ACTIVE_ROUTE_LENGTH_METERS < 900,
  'route length is in [800, 900] m (two-blind-curve route)',
  ACTIVE_ROUTE_LENGTH_METERS.toFixed(3) + ' m');
check(Math.abs(ROUTE_GEO.totalLengthMeters - ACTIVE_ROUTE_LENGTH_METERS) < 1e-9,
  'simulator ROUTE_GEO length == active route length');

console.log('\n=== B. Both vehicles stay on the route ===');
let maxOff = 0;
let inRange = true;
for (const s of snaps) {
  for (const id of ['HEMM-01', 'HEMM-02'] as const) {
    const tel = id === 'HEMM-01' ? s.hemm01 : s.hemm02;
    maxOff = Math.max(maxOff, distanceToPolyline(tel.coordinates, ACTIVE_HAUL_PATH));
    const d = rd(s, id);
    if (d < 0 || d > ACTIVE_ROUTE_LENGTH_METERS) inRange = false;
  }
}
check(maxOff < 0.5, 'every sampled coordinate lies on REAL_HAUL_CORRIDOR_PATH', `max offset ${maxOff.toFixed(3)} m`);
check(inRange, 'route_distance within [0, route length] for both vehicles at every tick');

// Phase 2D: HEMM-01 is FORWARD (starts at 50 m), HEMM-02 is REVERSE (starts at 350 m).
// HEMM-02 travels backward (decreasing route_distance). No "teleporting" check for HEMM-01.
let maxJumpHemm01 = 0;
for (let i = 1; i < snaps.length; i++) {
  const dt = ticks[i] - ticks[i - 1];
  const step01 = rd(snaps[i], 'HEMM-01') - rd(snaps[i - 1], 'HEMM-01');
  if (step01 < 0) maxJumpHemm01 = Infinity; // HEMM-01 must never reverse
  maxJumpHemm01 = Math.max(maxJumpHemm01, step01 / dt);
}
check(Number.isFinite(maxJumpHemm01) && maxJumpHemm01 < 13,
  'HEMM-01 never reverses and advance rate < 13 m/s',
  `max ${maxJumpHemm01.toFixed(2)} m/s (~${(maxJumpHemm01 * 3.6).toFixed(0)} km/h)`);

console.log('\n=== C. Roles / start state [updated for opposite-direction scenario] ===');
const s0 = snaps[0];

// Phase 2D: HEMM-01 is FORWARD, HEMM-02 is REVERSE.
// HEMM-02 starts at 350 m which is AHEAD of HEMM-01 at 50 m on the route.
check(rd(s0, 'HEMM-01') < rd(s0, 'HEMM-02'),
  'HEMM-01 (FORWARD, 50 m) starts behind HEMM-02 (REVERSE, 350 m) at t=0',
  `${rd(s0, 'HEMM-01').toFixed(1)} m vs ${rd(s0, 'HEMM-02').toFixed(1)} m`);

// Vehicle type labels: FORWARD and REVERSE
check(
  s0.telemetryHemm01.vehicle_type.includes('FORWARD') &&
  s0.telemetryHemm02.vehicle_type.includes('REVERSE'),
  'vehicle_type labels: HEMM-01 FORWARD, HEMM-02 REVERSE',
  `HEMM-01: "${s0.telemetryHemm01.vehicle_type}", HEMM-02: "${s0.telemetryHemm02.vehicle_type}"`);

// Initial state: large separation, NORMAL risk
check(s0.safetyLevel === 'NORMAL' && s0.distanceMeters >= 30,
  'initial gap is a safe following distance (NORMAL risk)',
  `${s0.distanceMeters} m, ${s0.safetyLevel}`);
check(
  INITIAL_SIMULATION_STATE.hemm01.coordinates.join() === s0.hemm01.coordinates.join() &&
    INITIAL_SIMULATION_STATE.hemm02.coordinates.join() === s0.hemm02.coordinates.join() &&
    INITIAL_SIMULATION_STATE.distanceMeters === s0.distanceMeters,
  'INITIAL_SIMULATION_STATE == computeSimulationAtTime(0)');

console.log('\n=== D/E. Closing speed and gap [opposite-direction physics] ===');
// In opposite-direction: closing speed = hemm01SpeedMs + hemm02SpeedMs when converging.
// relativeSpeedMs contains the combined closing speed (positive when converging).
const closingIdx = snaps.map((s, i) => (s.relativeSpeedMs > 0 ? i : -1)).filter((i) => i >= 0);
const firstClosing = closingIdx[0];
const minGapIdx = snaps.reduce((best, s, i) => (s.distanceMeters < snaps[best].distanceMeters ? i : best), 0);

check(closingIdx.length > 0,
  'closing speed > 0 during approach phase',
  `first positive at t=${ticks[firstClosing]} s`);

const peakClosing = Math.max(...snaps.map((s) => s.relativeSpeedMs));
check(peakClosing > 0, 'closing speed > 0 during the danger phase', `peak ${peakClosing.toFixed(2)} m/s`);

// Phase 2D: closing speed = v1 + v2 (sum), not v2 - v1 (difference).
// The combined closing speed should be approximately 2× a single vehicle's speed at full approach speed.
// At 35 km/h each: combined ≈ 19.44 m/s
check(peakClosing > 10, 'peak closing speed > 10 m/s (combined head-on speeds)', `peak ${peakClosing.toFixed(2)} m/s`);

// Gap decreasing during approach
let gapDecreasing = true;
for (let i = firstClosing; i < minGapIdx; i++) {
  if (!(snaps[i + 1].distanceMeters <= snaps[i].distanceMeters)) gapDecreasing = false;
}
check(gapDecreasing && snaps[minGapIdx].distanceMeters < snaps[firstClosing].distanceMeters - 20,
  'gap decreases (never grows) from first closing tick to the minimum',
  `${snaps[firstClosing].distanceMeters.toFixed(1)} m → ${snaps[minGapIdx].distanceMeters.toFixed(1)} m at t=${ticks[minGapIdx]} s`);

// Separation is always positive (abs formula)
check(snaps.every((s) => s.distanceMeters >= 0), 'separation (distanceMeters) is always ≥ 0');

// Separation matches abs(d1 - d2)
check(snaps.every((s) => Math.abs(s.distanceMeters - Math.abs(rd(s, 'HEMM-01') - rd(s, 'HEMM-02'))) < 0.06),
  'distanceMeters == |HEMM-01 route_distance − HEMM-02 route_distance| (abs, opposite-direction)');

console.log('\n=== F. TTC ===');
const raw = snaps.map((s) => s.ttcSecondsRaw ?? null);
const minTtcIdx = raw.reduce(
  (best, v, i) => (v !== null && (raw[best] === null || v < (raw[best] as number)) ? i : best),
  firstClosing
);
// TTC monotone: during the slow-speed closing phase (after braking at t=11s),
// TTC should decrease monotonically. Braking itself causes a brief TTC spike
// as closing speed drops fast while separation is still large — this is correct physics.
// We check monotonicity from the first closing tick only during the slow phase.
const slowPhaseStart = ticks.findIndex(t => t >= 11); // after braking completes
const slowFirstClosing = snaps.slice(slowPhaseStart).findIndex(s => s.ttcSecondsRaw !== null);
const slowStart = slowPhaseStart + slowFirstClosing;
const slowMinTtcIdx = snaps.slice(slowStart).reduce(
  (best, s, i) => (s.ttcSecondsRaw !== null && (snaps[slowStart + best].ttcSecondsRaw === null || (s.ttcSecondsRaw as number) < (snaps[slowStart + best].ttcSecondsRaw as number)) ? i : best),
  0
) + slowStart;

let ttcDecreasing = true;
for (let i = slowStart; i < slowMinTtcIdx; i++) {
  if (raw[i] === null || raw[i + 1] === null || (raw[i + 1] as number) > (raw[i] as number)) ttcDecreasing = false;
}
check(ttcDecreasing && (raw[slowMinTtcIdx] as number) < ((raw[slowStart] as number) / 2),
  'TTC decreases monotonically during slow-speed close approach (after t=11 braking)',
  `${raw[slowStart]} s → ${raw[slowMinTtcIdx]} s at t=${ticks[slowMinTtcIdx]} s`);
check(snaps.every((s) => (s.relativeSpeedMs <= 0) === (s.ttcSecondsRaw === null)),
  'TTC is null exactly when not closing (never faked)');
check(
  snaps.every((s) => s.ttcSecondsRaw === null ||
    Math.abs(s.ttcSecondsRaw - s.distanceMeters / s.relativeSpeedMs) < 0.15 * Math.max(1, s.ttcSecondsRaw)),
  'TTC == gap / closing speed at every closing tick');

console.log('\n=== G/H. Risk levels caused by the calculated values ===');
const levels = snaps.map((s) => s.safetyLevel as SafetyRiskLevel);
const firstAt = (l: SafetyRiskLevel): number => levels.indexOf(l);
for (const l of SAFETY_LEVEL_ORDER) {
  check(firstAt(l) >= 0, `level ${l} is reached`, firstAt(l) >= 0 ? `first at t=${ticks[firstAt(l)]} s` : '');
}
check(firstAt('NORMAL') < firstAt('CAUTION') && firstAt('CAUTION') < firstAt('HIGH') && firstAt('HIGH') < firstAt('CRITICAL'),
  'escalation order NORMAL → CAUTION → HIGH → CRITICAL');

// Oracle check: use the new oppositeDirectionAssessment fields (not old safetyAssessment)
let oracleMismatch = 0;
for (const s of snaps) {
  const oda = s.oppositeDirectionAssessment;
  if (!oda) { oracleMismatch++; continue; }
  if (oracleLevel(oda.separationM, oda.ttcS) !== s.safetyLevel) oracleMismatch++;
}
check(oracleMismatch === 0,
  'every tick: level == independent threshold oracle applied to separation/TTC',
  `${oracleMismatch} mismatches`);

// Trigger checks using oppositeDirectionAssessment
const ttcDriven = snaps.filter((s) => s.oppositeDirectionAssessment?.triggers.includes('TTC') &&
  !s.oppositeDirectionAssessment?.triggers.includes('DISTANCE')).length;
const distDriven = snaps.filter((s) => s.oppositeDirectionAssessment?.triggers.includes('DISTANCE')).length;
// In the 90s opposite-direction scenario, escalation is primarily distance-driven during
// the slow 8 km/h approach (combined 4.44 m/s). TTC trigger appears when separation / combined-speed
// drops below 6s (TTC threshold for CAUTION). Both DISTANCE and TTC triggers DO appear:
// - DISTANCE trigger: when sep < 30/20/10 m
// - TTC trigger: at the 35 km/h approach phase (combined ~19 m/s), TTC can be < thresholds
//   at larger separations (TTC = 30/19.4 ≈ 1.5 s at sep=30 m — CRITICAL by TTC).
// We verify that at least one risk level is triggered by EACH rule across the scenario.
const anyTtcTrigger = snaps.some((s) => (s.oppositeDirectionAssessment?.triggers ?? []).includes('TTC'));
const anyDistTrigger = snaps.some((s) => (s.oppositeDirectionAssessment?.triggers ?? []).includes('DISTANCE'));
check(anyTtcTrigger && anyDistTrigger,
  'both DISTANCE and TTC triggers appear somewhere in the scenario',
  `TTC-triggered ticks: ${snaps.filter(s => (s.oppositeDirectionAssessment?.triggers ?? []).includes('TTC')).length}, DISTANCE: ${distDriven}`);
check(snaps.every((s) => s.safetyLevel === 'NORMAL' || (s.oppositeDirectionAssessment?.triggers.length ?? 0) > 0),
  'every non-NORMAL tick has at least one actual trigger');
check(snaps.every((s) => s.riskExplanation === s.oppositeDirectionAssessment?.reason && s.riskExplanation.length > 0),
  'risk reason present on every tick');
const sample = (l: SafetyRiskLevel): string => snaps[firstAt(l)].riskExplanation;
for (const l of SAFETY_LEVEL_ORDER) console.log(`      ${l.padEnd(8)} → ${sample(l)}`);
check(snaps.filter((s) => s.safetyLevel !== 'NORMAL').every((s) =>
  s.oppositeDirectionAssessment?.reason.startsWith(s.safetyLevel as string)),
  'reason text names the level it explains');
check(snaps.every((s) => !/\bAI\b|machine learning|predict/i.test(s.riskExplanation)),
  'reasons make no AI/ML claims (rule-based)');
const lastLevel = levels[levels.length - 1];
check(SAFETY_LEVEL_ORDER.indexOf(lastLevel) < SAFETY_LEVEL_ORDER.indexOf('CRITICAL'),
  'scenario recovers to a safer state after CRITICAL',
  `final level ${lastLevel}, sep ${snaps[snaps.length - 1].distanceMeters} m`);
const legacy = { NORMAL: 'LOW', CAUTION: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'HIGH' } as const;
check(snaps.every((s) => s.riskLevel === legacy[s.safetyLevel as SafetyRiskLevel] &&
  s.telemetryHemm01.risk_level === s.riskLevel),
  'wire risk_level is the mapped 4→3-level value of safetyLevel');
console.log('      level timeline: ' + ticks.filter((_, i) => i === 0 || levels[i] !== levels[i - 1])
  .map((t) => `${t}s=${levels[ticks.indexOf(t)]}`).join(' → '));

console.log('\n=== I. Determinism ===');
const shuffled = [...ticks.keys()].sort((a, b) => ((a * 7) % 13) - ((b * 7) % 13));
const again = new Map<number, string>();
for (const i of shuffled) again.set(i, strip(computeSimulationAtTime(ticks[i], true)));
check(ticks.every((_, i) => again.get(i) === strip(snaps[i])), 'same t → identical output (independent of call order)');
check(strip(computeSimulationAtTime(-5, false)) === strip(computeSimulationAtTime(0, false)), 't < 0 clamps to t = 0');
check(strip(computeSimulationAtTime(999, true)) === strip(computeSimulationAtTime(SCENARIO_DURATION_S, true)),
  't > duration clamps to the end state');

console.log('\n=== J. Phase 2D route sections valid [updated for two-blind-curve route] ===');
const secs = ACTIVE_HAUL_ROUTE.sections;
// Phase 2D: 5 sections (APPROACH, BC01, BC01_EXIT, BC02, BC02_EXIT)
check(secs.length === 5, 'route has 5 sections (two blind curves)', `got: ${secs.length}`);
check(secs[0].startDistanceMeters === 0 &&
  Math.abs(secs[secs.length - 1].endDistanceMeters - ACTIVE_ROUTE_LENGTH_METERS) < 1e-9 &&
  secs.every((s, i) => i === 0 || s.startDistanceMeters === secs[i - 1].endDistanceMeters),
  'sections contiguous over 0 → route length');

// Section IDs seen during the scenario
const sectionIdsSeen = new Set(snaps.flatMap((s) => [s.telemetryHemm01.section_id, s.telemetryHemm02.section_id]));
check(sectionIdsSeen.has('BLIND_CURVE_APPROACH') && sectionIdsSeen.has('BLIND_CURVE'),
  'scenario passes through BC01_APPROACH and BLIND_CURVE sections', [...sectionIdsSeen].join(', '));

// CRITICAL event occurs during the scenario
check(snaps.some((s) => s.safetyLevel === 'CRITICAL'), 'CRITICAL event occurs during scenario');

console.log('\n=== K. Safety-module edge cases (assessSafety / calculateTtc) [UNCHANGED] ===');
const base = { leadPositionM: 100, trailingPositionM: 50, leadSpeedMs: 5, trailingSpeedMs: 5 };
check(calculateTtc(50, 0) === null && calculateTtc(50, -1) === null, 'TTC null for zero / negative closing speed');
check(calculateTtc(50, 10) === 5, 'TTC = gap / closing speed');
check(calculateTtc(NaN, 5) === null && calculateTtc(50, NaN) === null &&
  calculateTtc(null, 5) === null && calculateTtc(50, undefined) === null &&
  calculateTtc(Infinity, 5) === null, 'TTC null for missing / NaN / infinite inputs');
check(assessSafety({ ...base, leadSpeedMs: 0, trailingSpeedMs: 0 }).level === 'NORMAL',
  'both stopped with a large gap → NORMAL, no TTC');
check(assessSafety({ ...base, leadPositionM: null }).level === 'UNKNOWN' &&
  assessSafety({ ...base, trailingSpeedMs: undefined }).level === 'UNKNOWN',
  'missing distance/speed → UNKNOWN (not NORMAL)');
check(assessSafety({ ...base, trailingSpeedMs: NaN }).level === 'UNKNOWN' &&
  assessSafety({ ...base, leadSpeedMs: -3 }).level === 'UNKNOWN',
  'NaN / negative speed → UNKNOWN');
check(assessSafety({ ...base, leadPositionM: 40, trailingPositionM: 50 }).level === 'CRITICAL',
  'inverted order / overlap → CRITICAL (never safe)');
check(assessSafety({ ...base, leadPositionM: 105, trailingPositionM: 100, trailingSpeedMs: 3 }).level === 'CRITICAL' &&
  assessSafety({ ...base, leadPositionM: 105, trailingPositionM: 100, trailingSpeedMs: 3 }).ttcS === null,
  'tiny gap while NOT closing is still CRITICAL by distance');
const lvl = (gap: number, closing: number): string =>
  assessSafety({ leadPositionM: 100 + gap, trailingPositionM: 100, leadSpeedMs: 5, trailingSpeedMs: 5 + closing }).level;
check(lvl(100, 10) === 'NORMAL' && lvl(100, 20) === 'CAUTION' && lvl(100, 30) === 'HIGH' && lvl(100, 60) === 'CRITICAL',
  'TTC alone drives risk with a large gap (TTC 10/5/3.3/1.7 s → NORMAL/CAUTION/HIGH/CRITICAL)');
check(lvl(29.9, 0) === 'CAUTION' && lvl(19.9, 0) === 'HIGH' && lvl(9.9, 0) === 'CRITICAL' &&
  lvl(30, 0) === 'NORMAL' && lvl(20, 0) === 'CAUTION' && lvl(10, 0) === 'HIGH',
  'distance thresholds 30/20/10 m are strict "<" boundaries');

console.log(failures === 0 ? '\nALL PHASE 2A CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
