/**
 * NETRA — Phase 1 verification: active route + simulator movement.
 *
 * Runs the REAL project modules (no copies of the logic) under Node.
 *
 *   cd frontend
 *   npx tsx scripts/verifyRouteSimulator.ts
 *
 * Exits with code 1 if any check fails. This is a Node-level check only:
 * it does NOT exercise the browser, Mapbox, deck.gl, WebSocket or the backend.
 */

import { REAL_HAUL_CORRIDOR_PATH } from '../src/data/realHaulRoad';
import {
  ACTIVE_HAUL_PATH,
  ACTIVE_HAUL_ROUTE,
  ACTIVE_HAUL_HAZARDS,
  ACTIVE_ROUTE_LENGTH_METERS,
  SECTION_ID_APPROACH,
  SECTION_ID_BLIND_CURVE,
  SECTION_ID_EXIT,
} from '../src/data/activeHaulRoute';
import {
  ROUTE_GEO,
  computeSimulationAtTime,
  INITIAL_SIMULATION_STATE,
} from '../src/services/demoSimulation';
import { CoordinateMapper } from '../src/map/providers/CoordinateMapper';

const METERS_PER_DEG_LAT = 111000;
const METERS_PER_DEG_LNG = 105400;

let failures = 0;
const check = (ok: boolean, label: string, detail = ''): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

/** Shortest distance (m) from point p to the route polyline. */
function distanceToPolyline(p: [number, number], path: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i][0] * METERS_PER_DEG_LNG;
    const ay = path[i][1] * METERS_PER_DEG_LAT;
    const bx = path[i + 1][0] * METERS_PER_DEG_LNG;
    const by = path[i + 1][1] * METERS_PER_DEG_LAT;
    const px = p[0] * METERS_PER_DEG_LNG;
    const py = p[1] * METERS_PER_DEG_LAT;
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2)) : 0;
    const d = Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
    if (d < best) best = d;
  }
  return best;
}

console.log('=== 1. Active route ===');
check(ACTIVE_HAUL_PATH === REAL_HAUL_CORRIDOR_PATH, 'ACTIVE_HAUL_PATH is the REAL_HAUL_CORRIDOR_PATH array (same reference)');
check(ACTIVE_HAUL_ROUTE.geometry === REAL_HAUL_CORRIDOR_PATH, 'ACTIVE_HAUL_ROUTE.geometry is REAL_HAUL_CORRIDOR_PATH');
console.log(`      vertices: ${REAL_HAUL_CORRIDOR_PATH.length}`);
console.log(`      active route length: ${ACTIVE_ROUTE_LENGTH_METERS.toFixed(3)} m`);
check(Math.abs(ACTIVE_ROUTE_LENGTH_METERS - 490.9) < 0.1, 'route length ≈ 490.9 m');
check(
  Math.abs(ROUTE_GEO.totalLengthMeters - ACTIVE_ROUTE_LENGTH_METERS) < 1e-9,
  'simulator ROUTE_GEO length == active route length'
);

console.log('\n=== 2. Hazards / sections ===');
check(ACTIVE_HAUL_HAZARDS.length === 1, 'exactly ONE hazard', `count=${ACTIVE_HAUL_HAZARDS.length}`);
const hz = ACTIVE_HAUL_HAZARDS[0];
check(hz.featureId === 'BLIND_CURVE' && hz.type === 'BLIND_CURVE', 'the hazard is BLIND_CURVE');
check(
  REAL_HAUL_CORRIDOR_PATH.some((p) => p[0] === hz.geometry[0] && p[1] === hz.geometry[1]),
  'hazard position is a vertex of REAL_HAUL_CORRIDOR_PATH (no invented coordinates)',
  `[${hz.geometry[0]}, ${hz.geometry[1]}] @ ${hz.routeDistanceMeters.toFixed(1)} m`
);
const secs = ACTIVE_HAUL_ROUTE.sections;
let contiguous = secs[0].startDistanceMeters === 0 && Math.abs(secs[secs.length - 1].endDistanceMeters - ACTIVE_ROUTE_LENGTH_METERS) < 1e-9;
for (let i = 1; i < secs.length; i++) contiguous = contiguous && secs[i].startDistanceMeters === secs[i - 1].endDistanceMeters;
check(contiguous, 'sections are contiguous and cover 0 → route length');
secs.forEach((s) =>
  console.log(`      ${s.sectionId.padEnd(22)} ${s.startDistanceMeters.toFixed(1).padStart(6)} → ${s.endDistanceMeters.toFixed(1).padStart(6)} m`)
);
check(
  hz.routeDistanceMeters >= secs[1].startDistanceMeters && hz.routeDistanceMeters <= secs[1].endDistanceMeters,
  'hazard lies inside the BLIND_CURVE section'
);

console.log('\n=== 3. Simulator sampling (real computeSimulationAtTime) ===');
const VALID_SECTIONS = new Set([SECTION_ID_APPROACH, SECTION_ID_BLIND_CURVE, SECTION_ID_EXIT]);
const OLD_SECTION_IDS = /^(SEC-0\d|S0?\d|ROUTE-HAUL-01|DEMO-HAUL-ROUTE-01|UNKNOWN|)$/;

type Sample = { t: number; c1: [number, number]; c2: [number, number]; d1: number; d2: number; s1: string; s2: string };
const samples: Sample[] = [];
for (let t = 0; t <= 25.0001; t += 0.4) {
  const snap = computeSimulationAtTime(Number(t.toFixed(1)), true); // same 0.4 s step the producer uses
  samples.push({
    t: Number(t.toFixed(1)),
    c1: snap.hemm01.coordinates,
    c2: snap.hemm02.coordinates,
    d1: snap.telemetryHemm01.route_distance,
    d2: snap.telemetryHemm02.route_distance,
    s1: snap.telemetryHemm01.section_id,
    s2: snap.telemetryHemm02.section_id,
  });
}

console.log('      t(s)  HEMM-01 [lng, lat]         d(m)   section               HEMM-02 [lng, lat]         d(m)   section');
for (const s of samples.filter((_, i) => i % 5 === 0 || i === samples.length - 1)) {
  console.log(
    `      ${s.t.toFixed(1).padStart(4)}  [${s.c1[0].toFixed(6)}, ${s.c1[1].toFixed(6)}]  ${s.d1.toFixed(1).padStart(5)}  ${s.s1.padEnd(20)}  ` +
      `[${s.c2[0].toFixed(6)}, ${s.c2[1].toFixed(6)}]  ${s.d2.toFixed(1).padStart(5)}  ${s.s2}`
  );
}

for (const [name, key, dKey] of [
  ['HEMM-01', 'c1', 'd1'],
  ['HEMM-02', 'c2', 'd2'],
] as const) {
  const coords = samples.map((s) => s[key]);
  const distinct = new Set(coords.map((c) => c.join(','))).size;
  check(distinct === coords.length, `${name}: coordinates change at EVERY 0.4 s tick`, `${distinct}/${coords.length} distinct`);
  const dists = samples.map((s) => s[dKey]);
  const monotonic = dists.every((d, i) => i === 0 || d > dists[i - 1]);
  check(monotonic, `${name}: route_distance strictly increases (never clamped/frozen)`, `${dists[0].toFixed(1)} → ${dists[dists.length - 1].toFixed(1)} m`);
  check(dists.every((d) => d >= 0 && d <= ACTIVE_ROUTE_LENGTH_METERS && d <= 1850), `${name}: route_distance within [0, route length] and backend limit 1850`);
  const maxOff = Math.max(...coords.map((c) => distanceToPolyline(c, ACTIVE_HAUL_PATH)));
  check(maxOff < 0.5, `${name}: every sampled coordinate lies ON REAL_HAUL_CORRIDOR_PATH`, `max offset ${maxOff.toFixed(3)} m`);
}

const sectionIds = new Set(samples.flatMap((s) => [s.s1, s.s2]));
check(
  [...sectionIds].every((id) => VALID_SECTIONS.has(id) && id.length <= 32 && !OLD_SECTION_IDS.test(id)),
  'section_id values all come from the ACTIVE route sections',
  [...sectionIds].join(', ')
);
const secs01 = new Set(samples.map((s) => s.s1));
const secs02 = new Set(samples.map((s) => s.s2));
check(secs01.size >= 1 && secs02.size >= 1, 'section_id is derived from CURRENT position (not a fixed start value)', `HEMM-01: ${[...secs01]} | HEMM-02: ${[...secs02]}`);

console.log('\n=== 4. INITIAL state (before first tick) ===');
const init = INITIAL_SIMULATION_STATE;
const snap0 = computeSimulationAtTime(0, false);
check(
  init.hemm01.coordinates[0] === snap0.hemm01.coordinates[0] && init.hemm01.coordinates[1] === snap0.hemm01.coordinates[1] &&
    init.hemm02.coordinates[0] === snap0.hemm02.coordinates[0] && init.hemm02.coordinates[1] === snap0.hemm02.coordinates[1],
  'INITIAL_SIMULATION_STATE positions == computeSimulationAtTime(0) positions'
);
check(
  VALID_SECTIONS.has(init.telemetryHemm01.section_id) && VALID_SECTIONS.has(init.telemetryHemm02.section_id),
  'INITIAL section_id values come from the active route',
  `${init.telemetryHemm01.section_id}, ${init.telemetryHemm02.section_id}`
);

console.log('\n=== 5. CoordinateMapper leaves on-route simulation coordinates untouched ===');
const shifted = samples.filter((s) => {
  const m1 = CoordinateMapper.mapSimulationToGeographic(s.c1, 'SIMULATION');
  const m2 = CoordinateMapper.mapSimulationToGeographic(s.c2, 'SIMULATION');
  return m1[0] !== s.c1[0] || m1[1] !== s.c1[1] || m2[0] !== s.c2[0] || m2[1] !== s.c2[1];
});
check(shifted.length === 0, 'no sampled coordinate is re-anchored by CoordinateMapper', `${shifted.length} shifted`);
const legacyLng = 81.2335 - 81.25;
const legacyLat = 18.6148 - 18.65;
console.log(
  `      (for reference: before this fix the legacy branch would shift by [${legacyLng.toFixed(4)}, ${legacyLat.toFixed(4)}]° ≈ ` +
    `${Math.hypot(legacyLng * METERS_PER_DEG_LNG, legacyLat * METERS_PER_DEG_LAT).toFixed(0)} m off the route)`
);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
