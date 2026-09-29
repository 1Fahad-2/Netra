/**
 * MachineMind — Route Intelligence Utility Module
 * Checkpoint MAP-1: Spatial mapping, section lookup, and hazard proximity interfaces.
 *
 * This module establishes the structural foundation for future route intelligence,
 * vehicle-to-infrastructure (V2I) hazard detection, and corridor risk assessment.
 */

import type {
  MineRoute,
  RouteSection,
  HazardFeature,
  UpcomingHazard,
} from '../types/route';

const METERS_PER_DEG_LAT = 111000;
const METERS_PER_DEG_LNG = 105400;

export function calcDistanceMeters(p1: [number, number], p2: [number, number]): number {
  const dx = (p2[0] - p1[0]) * METERS_PER_DEG_LNG;
  const dy = (p2[1] - p1[1]) * METERS_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Finds the route distance (in meters from route origin) closest to a given [lng, lat] coordinate.
 */
export function findClosestRouteDistance(route: MineRoute, pos: [number, number]): number {
  const coords = route.geometry;
  if (coords.length === 0) return 0;

  let bestDistSq = Infinity;
  let bestRouteDist = 0;
  let accumulatedDist = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const segLen = calcDistanceMeters(p1, p2);

    // Vector from p1 to p2 in meters
    const vX = (p2[0] - p1[0]) * METERS_PER_DEG_LNG;
    const vY = (p2[1] - p1[1]) * METERS_PER_DEG_LAT;
    const vLenSq = vX * vX + vY * vY;

    // Vector from p1 to pos in meters
    const wX = (pos[0] - p1[0]) * METERS_PER_DEG_LNG;
    const wY = (pos[1] - p1[1]) * METERS_PER_DEG_LAT;

    let t = vLenSq > 0 ? (wX * vX + wY * vY) / vLenSq : 0;
    t = Math.max(0, Math.min(1, t));

    // Closest point on segment
    const projX = (p1[0] * METERS_PER_DEG_LNG) + t * vX;
    const projY = (p1[1] * METERS_PER_DEG_LAT) + t * vY;
    const currentX = pos[0] * METERS_PER_DEG_LNG;
    const currentY = pos[1] * METERS_PER_DEG_LAT;

    const distSq = (currentX - projX) ** 2 + (currentY - projY) ** 2;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestRouteDist = accumulatedDist + t * segLen;
    }

    accumulatedDist += segLen;
  }

  return bestRouteDist;
}

/**
 * Identifies the active RouteSection for a vehicle, given either its route distance
 * or its [longitude, latitude] coordinates.
 */
export function getCurrentSection(
  route: MineRoute,
  vehiclePosition: [number, number] | number
): RouteSection | null {
  const distanceMeters =
    typeof vehiclePosition === 'number'
      ? vehiclePosition
      : findClosestRouteDistance(route, vehiclePosition);

  // Search sections by range
  for (const section of route.sections) {
    if (
      distanceMeters >= section.startDistanceMeters &&
      distanceMeters <= section.endDistanceMeters
    ) {
      return section;
    }
  }

  // Edge cases: before start or past end
  if (route.sections.length > 0) {
    if (distanceMeters < route.sections[0].startDistanceMeters) {
      return route.sections[0];
    }
    return route.sections[route.sections.length - 1];
  }

  return null;
}

/**
 * Calculates the forward route distance from vehicle to a hazard feature.
 */
export function getRouteDistanceToFeature(
  route: MineRoute,
  vehiclePos: [number, number] | number,
  feature: HazardFeature
): number {
  const currentDist =
    typeof vehiclePos === 'number'
      ? vehiclePos
      : findClosestRouteDistance(route, vehiclePos);

  return feature.routeDistanceMeters - currentDist;
}

/**
 * Detects the next upcoming hazard ahead of the vehicle along its travel direction.
 * Returns null if no active hazard exists within the lookahead window.
 */
export function getUpcomingHazard(
  route: MineRoute,
  hazards: HazardFeature[],
  vehiclePos: [number, number] | number,
  _heading?: number,
  lookaheadMeters: number = 200
): UpcomingHazard | null {
  const currentDist =
    typeof vehiclePos === 'number'
      ? vehiclePos
      : findClosestRouteDistance(route, vehiclePos);

  let nearest: HazardFeature | null = null;
  let minGap = Infinity;

  for (const h of hazards) {
    if (!h.active) continue;
    const delta = h.routeDistanceMeters - currentDist;

    // Ahead of vehicle and within lookahead distance
    if (delta > 0 && delta <= lookaheadMeters && delta < minGap) {
      minGap = delta;
      nearest = h;
    }
  }

  if (!nearest) return null;

  return {
    featureId: nearest.featureId,
    vehicleId: '',
    distanceMeters: Math.round(minGap),
    routeDistanceMeters: nearest.routeDistanceMeters,
    direction: 'AHEAD',
    severity: nearest.severity,
    recommendedSpeed: nearest.recommendedSpeed,
    name: nearest.name,
    warningLabel: nearest.warningLabel,
  };
}

/**
 * Infrastructure Risk Calculation (Clean placeholder for MAP-2 / MAP-3)
 * Calculates a baseline risk score [0.0 - 1.0] based on vehicle speed relative
 * to the section or hazard's recommended speed.
 */
export function calculateInfrastructureRisk(
  vehicleSpeedKmh: number,
  recommendedSpeedKmh: number,
  severity: string
): number {
  if (recommendedSpeedKmh <= 0) return 0.1;
  const overspeed = Math.max(0, vehicleSpeedKmh - recommendedSpeedKmh);
  const ratio = overspeed / recommendedSpeedKmh;

  const severityBase: Record<string, number> = {
    LOW: 0.1,
    MEDIUM: 0.35,
    HIGH: 0.65,
    CRITICAL: 0.85,
  };

  const base = severityBase[severity] || 0.2;
  return Number(Math.min(1.0, base + ratio * 0.4).toFixed(2));
}
