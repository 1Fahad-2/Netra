// Geographic math utilities used by navigation and simulation
export const METERS_PER_DEG_LAT = 111000;
export const METERS_PER_DEG_LNG = 105400;
/**
 * Calculates planar distance in meters between two [lon, lat] points.
 * Uses simple approximations: 1° latitude ≈ 111km, 1° longitude ≈ 105.4km at ~18.6°N.
 */
export function calcDistMeters(p1: [number, number], p2: [number, number]): number {
  const dLng = (p2[0] - p1[0]) * METERS_PER_DEG_LNG;
  const dLat = (p2[1] - p1[1]) * METERS_PER_DEG_LAT;
  return Math.sqrt(dLng * dLng + dLat * dLat);
}
/**
 * Calculates heading (bearing) from p1 to p2 in degrees clockwise from north.
 */
export function calcHeading(p1: [number, number], p2: [number, number]): number {
  const dLng = (p2[0] - p1[0]) * METERS_PER_DEG_LNG;
  const dLat = (p2[1] - p1[1]) * METERS_PER_DEG_LAT;
  let angle = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  if (angle < 0) angle += 360;
  return Math.round(angle);
}
