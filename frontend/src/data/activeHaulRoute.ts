/**
 * NETRA — Active Haul Route (single source of truth)   [Phase 2D: Two-Blind-Curve Extension]
 *
 * Derives every route artefact from REAL_HAUL_CORRIDOR_PATH (src/data/realHaulRoad.ts).
 * Nothing is invented here — section boundaries, hazard positions, and activation zones are
 * all computed from the actual polyline vertex indices defined in realHaulRoad.ts.
 *
 * Route layout (two blind curves, HEMM-01 travels forward, HEMM-02 travels backward):
 *
 *   dist 0 ──► BC01_APPROACH ──► BLIND_CURVE_01 ──► BC01_EXIT / BC02_APPROACH ──► BLIND_CURVE_02 ──► BC02_EXIT ──► dist ~895 m
 *
 * HEMM-01 starts near dist=50 m, travels forward (increasing dist).
 * HEMM-02 starts near dist=ROUTE_LENGTH-50 m, travels backward (decreasing dist).
 * The two vehicles converge at Blind Curve 01 (≈ mid-route from each start).
 *
 * BLIND CURVE ACTIVATION ZONES (not warnings — see note below):
 *   BC01: activation zone = [BC01_apex - 100 m, BC01_apex + 100 m]
 *   BC02: activation zone = [BC02_apex - 100 m, BC02_apex + 100 m]
 *
 * NOTE: A vehicle entering an activation zone does NOT automatically generate a collision
 * alert. The zone is used only to determine eligibility for the predictive oncoming check.
 * A BLIND CURVE ACTIVE banner is shown as contextual route information, not an alert.
 *
 * Disclaimer: Illustrative SIH demonstration road model.
 * Not an official NMDC survey or DGMS geometric standard.
 */

import type { HazardFeature, MineRoute, RouteSection } from '../types/route';
import {
  REAL_HAUL_CORRIDOR_PATH,
  BC01_START_INDEX,
  BC01_APEX_INDEX,
  BC01_END_INDEX,
  BC02_APPROACH_INDEX,
  BC02_APEX_INDEX,
  BC02_END_INDEX,
} from './realHaulRoad';
import { calcDistanceMeters } from '../utils/routeIntelligence';

// ── Identifiers ────────────────────────────────────────────────────────────────

export const ACTIVE_ROUTE_ID            = 'REAL-HAUL-CORRIDOR-01';
export const BLIND_CURVE_HAZARD_ID      = 'BLIND_CURVE';       // legacy compat
export const BLIND_CURVE_01_HAZARD_ID   = 'BLIND_CURVE_01';
export const BLIND_CURVE_02_HAZARD_ID   = 'BLIND_CURVE_02';

export const SECTION_ID_APPROACH        = 'BLIND_CURVE_APPROACH';      // BC01 approach
export const SECTION_ID_BLIND_CURVE     = 'BLIND_CURVE';               // BC01 section (legacy compat)
export const SECTION_ID_BLIND_CURVE_01  = 'BLIND_CURVE';               // same as above
export const SECTION_ID_EXIT            = 'BLIND_CURVE_EXIT';          // legacy compat
export const SECTION_ID_BC01_EXIT       = 'BLIND_CURVE_EXIT';
export const SECTION_ID_BC02_APPROACH   = 'BC02_APPROACH';
export const SECTION_ID_BLIND_CURVE_02  = 'BLIND_CURVE_02';
export const SECTION_ID_BC02_EXIT       = 'BC02_EXIT';

/** The active route polyline: [longitude, latitude][] — same array as REAL_HAUL_CORRIDOR_PATH. */
export const ACTIVE_HAUL_PATH: [number, number][] = REAL_HAUL_CORRIDOR_PATH;

// ── Cumulative distances ───────────────────────────────────────────────────────

/** Cumulative distance (m) at every vertex of the active path. */
export const ACTIVE_ROUTE_CUMULATIVE_DISTANCES: number[] = (() => {
  const cum: number[] = [0];
  for (let i = 0; i < ACTIVE_HAUL_PATH.length - 1; i++) {
    cum.push(cum[i] + calcDistanceMeters(ACTIVE_HAUL_PATH[i], ACTIVE_HAUL_PATH[i + 1]));
  }
  return cum;
})();

/** Total length of the active route in metres. */
export const ACTIVE_ROUTE_LENGTH_METERS: number =
  ACTIVE_ROUTE_CUMULATIVE_DISTANCES[ACTIVE_ROUTE_CUMULATIVE_DISTANCES.length - 1];

const distAt = (idx: number): number => ACTIVE_ROUTE_CUMULATIVE_DISTANCES[idx];

// ── BC01 distances ─────────────────────────────────────────────────────────────

export const BC01_START_DIST_M  = distAt(BC01_START_INDEX);
export const BC01_APEX_DIST_M   = distAt(BC01_APEX_INDEX);
export const BC01_END_DIST_M    = distAt(BC01_END_INDEX);

// ── BC02 distances ─────────────────────────────────────────────────────────────

export const BC02_APPROACH_DIST_M = distAt(BC02_APPROACH_INDEX);
export const BC02_APEX_DIST_M     = distAt(BC02_APEX_INDEX);
export const BC02_END_DIST_M      = distAt(BC02_END_INDEX);

// ── Blind-curve activation zones ──────────────────────────────────────────────
// A vehicle is in an activation zone when its route_distance is within this window
// around the apex. This is used for:
//   1. Displaying "BLIND CURVE ACTIVE" contextual banner (NOT a collision alert).
//   2. Eligibility for the predictive oncoming-vehicle check in the backend.
// The zone does NOT independently trigger an alert.

export const BLIND_CURVE_ACTIVATION_HALF_WINDOW_M = 100; // metres either side of apex

export const BC01_ACTIVATION_ZONE = {
  startM: Math.max(0, BC01_APEX_DIST_M - BLIND_CURVE_ACTIVATION_HALF_WINDOW_M),
  endM:   BC01_APEX_DIST_M + BLIND_CURVE_ACTIVATION_HALF_WINDOW_M,
  apexM:  BC01_APEX_DIST_M,
  curveId: BLIND_CURVE_01_HAZARD_ID,
} as const;

export const BC02_ACTIVATION_ZONE = {
  startM: Math.max(0, BC02_APEX_DIST_M - BLIND_CURVE_ACTIVATION_HALF_WINDOW_M),
  endM:   Math.min(ACTIVE_ROUTE_LENGTH_METERS, BC02_APEX_DIST_M + BLIND_CURVE_ACTIVATION_HALF_WINDOW_M),
  apexM:  BC02_APEX_DIST_M,
  curveId: BLIND_CURVE_02_HAZARD_ID,
} as const;

export const BLIND_CURVE_ACTIVATION_ZONES = [BC01_ACTIVATION_ZONE, BC02_ACTIVATION_ZONE] as const;

/**
 * Returns the activation zone that a vehicle at `routeDistM` is currently inside,
 * or null if the vehicle is not in any blind-curve activation zone.
 */
export function getActiveBlindCurveZone(
  routeDistM: number
): typeof BC01_ACTIVATION_ZONE | typeof BC02_ACTIVATION_ZONE | null {
  for (const zone of BLIND_CURVE_ACTIVATION_ZONES) {
    if (routeDistM >= zone.startM && routeDistM <= zone.endM) return zone;
  }
  return null;
}

// ── Sections ───────────────────────────────────────────────────────────────────

const DISCLAIMER =
  'Illustrative SIH demonstration road model. Not an official NMDC survey or DGMS geometric standard.';

export const ACTIVE_ROUTE_SECTIONS: RouteSection[] = [
  {
    sectionId: SECTION_ID_APPROACH,
    routeId: ACTIVE_ROUTE_ID,
    name: 'Blind Curve 01 Approach',
    type: 'NORMAL',
    startDistanceMeters: 0,
    endDistanceMeters: BC01_START_DIST_M,
    geometry: ACTIVE_HAUL_PATH.slice(0, BC01_START_INDEX + 1),
    recommendedSpeed: 25,
    severity: 'LOW',
    metadata: { description: 'Straight haul road leading to Blind Curve 01.' },
  },
  {
    sectionId: SECTION_ID_BLIND_CURVE_01,
    routeId: ACTIVE_ROUTE_ID,
    name: 'Blind Curve 01',
    type: 'BLIND_CURVE',
    startDistanceMeters: BC01_START_DIST_M,
    endDistanceMeters: BC01_END_DIST_M,
    geometry: ACTIVE_HAUL_PATH.slice(BC01_START_INDEX, BC01_END_INDEX + 1),
    recommendedSpeed: 18,
    severity: 'HIGH',
    metadata: {
      description: 'Rock face obstructs line of sight. ~173° heading change.',
      advisoryNotice: 'WARNING: BLIND CURVE 01. Maintain safe headway and reduced speed.',
    },
  },
  {
    sectionId: SECTION_ID_BC01_EXIT,
    routeId: ACTIVE_ROUTE_ID,
    name: 'Blind Curve 01 Exit / BC02 Approach',
    type: 'NORMAL',
    startDistanceMeters: BC01_END_DIST_M,
    endDistanceMeters: BC02_APPROACH_DIST_M,
    geometry: ACTIVE_HAUL_PATH.slice(BC01_END_INDEX, BC02_APPROACH_INDEX + 1),
    recommendedSpeed: 25,
    severity: 'LOW',
    metadata: { description: 'Straight link road between the two blind curves.' },
  },
  {
    sectionId: SECTION_ID_BLIND_CURVE_02,
    routeId: ACTIVE_ROUTE_ID,
    name: 'Blind Curve 02',
    type: 'BLIND_CURVE',
    startDistanceMeters: BC02_APPROACH_DIST_M,
    endDistanceMeters: BC02_END_DIST_M,
    geometry: ACTIVE_HAUL_PATH.slice(BC02_APPROACH_INDEX, BC02_END_INDEX + 1),
    recommendedSpeed: 18,
    severity: 'HIGH',
    metadata: {
      description: 'Right-hand embankment obstructs line of sight. ~120° heading change.',
      advisoryNotice: 'WARNING: BLIND CURVE 02. Reduce speed and maintain headway.',
    },
  },
  {
    sectionId: SECTION_ID_BC02_EXIT,
    routeId: ACTIVE_ROUTE_ID,
    name: 'Blind Curve 02 Exit',
    type: 'NORMAL',
    startDistanceMeters: BC02_END_DIST_M,
    endDistanceMeters: ACTIVE_ROUTE_LENGTH_METERS,
    geometry: ACTIVE_HAUL_PATH.slice(BC02_END_INDEX),
    recommendedSpeed: 25,
    severity: 'LOW',
    metadata: { description: 'Haul road after Blind Curve 02 heading ESE toward dump zone.' },
  },
];

// ── Full route object ──────────────────────────────────────────────────────────

export const ACTIVE_HAUL_ROUTE: MineRoute = {
  routeId: ACTIVE_ROUTE_ID,
  name: 'Real Haul Corridor — Two Blind Curves (Phase 2D)',
  geometry: ACTIVE_HAUL_PATH,
  totalLengthMeters: ACTIVE_ROUTE_LENGTH_METERS,
  widthMeters: 28,
  sections: ACTIVE_ROUTE_SECTIONS,
  metadata: {
    surfaceType: 'Haul road (demo model)',
    disclaimer: DISCLAIMER,
    source: 'REAL_HAUL_CORRIDOR_PATH',
    coordinateOrder: '[lng, lat]',
    pointCount: ACTIVE_HAUL_PATH.length,
    blindCurves: 2,
  },
};

// ── Hazards ───────────────────────────────────────────────────────────────────

export const ACTIVE_HAUL_HAZARDS: HazardFeature[] = [
  {
    featureId: BLIND_CURVE_01_HAZARD_ID,
    type: 'BLIND_CURVE',
    name: 'Blind Curve 01',
    geometry: ACTIVE_HAUL_PATH[BC01_APEX_INDEX],
    routeDistanceMeters: BC01_APEX_DIST_M,
    severity: 'HIGH',
    recommendedSpeed: 18,
    active: true,
    warningLabel: 'BLIND CURVE 01',
    description: 'Rock face obstructs sightline on ~173° U-turn.',
    pathGeometry: ACTIVE_HAUL_PATH.slice(BC01_START_INDEX, BC01_END_INDEX + 1),
  },
  {
    featureId: BLIND_CURVE_02_HAZARD_ID,
    type: 'BLIND_CURVE',
    name: 'Blind Curve 02',
    geometry: ACTIVE_HAUL_PATH[BC02_APEX_INDEX],
    routeDistanceMeters: BC02_APEX_DIST_M,
    severity: 'HIGH',
    recommendedSpeed: 18,
    active: true,
    warningLabel: 'BLIND CURVE 02',
    description: 'Right-hand embankment obstructs sightline on ~120° right bend.',
    pathGeometry: ACTIVE_HAUL_PATH.slice(BC02_APPROACH_INDEX, BC02_END_INDEX + 1),
  },
];

// Legacy compat — the original single-hazard export still works.
export const ACTIVE_BLIND_CURVE_HAZARD: HazardFeature = ACTIVE_HAUL_HAZARDS[0];

// ── Bounds / centre ────────────────────────────────────────────────────────────

export const ACTIVE_ROUTE_BOUNDS = (() => {
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (const [lng, lat] of ACTIVE_HAUL_PATH) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, maxLng, minLat, maxLat };
})();

export const ACTIVE_ROUTE_CENTER: [number, number] = [
  (ACTIVE_ROUTE_BOUNDS.minLng + ACTIVE_ROUTE_BOUNDS.maxLng) / 2,
  (ACTIVE_ROUTE_BOUNDS.minLat + ACTIVE_ROUTE_BOUNDS.maxLat) / 2,
];

export function isNearActiveRoute(coord: [number, number], marginDegrees = 0.005): boolean {
  return (
    coord[0] >= ACTIVE_ROUTE_BOUNDS.minLng - marginDegrees &&
    coord[0] <= ACTIVE_ROUTE_BOUNDS.maxLng + marginDegrees &&
    coord[1] >= ACTIVE_ROUTE_BOUNDS.minLat - marginDegrees &&
    coord[1] <= ACTIVE_ROUTE_BOUNDS.maxLat + marginDegrees
  );
}

// ── Legacy helpers (kept for backward-compat with VehicleSnapshotShell etc.) ──

/**
 * Signed route distance (m) from a vehicle to BC01 apex.
 * > 0  : curve is ahead  (for a forward-traveling vehicle)
 * <= 0 : vehicle has already passed the apex
 */
export function routeDistanceToBlindCurve(vehicleRouteDistanceMeters: number): number {
  return BC01_APEX_DIST_M - vehicleRouteDistanceMeters;
}

/** UI label: "123 m", "Passed", or "--". */
export function formatDistanceToBlindCurve(
  vehicleRouteDistanceMeters: number | null | undefined
): string {
  if (vehicleRouteDistanceMeters === null || vehicleRouteDistanceMeters === undefined) return '--';
  const delta = routeDistanceToBlindCurve(vehicleRouteDistanceMeters);
  return delta > 0 ? `${Math.round(delta)} m` : 'Passed';
}
