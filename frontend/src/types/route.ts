/**
 * MachineMind — Canonical Geospatial Mine Map Data Model
 * Checkpoint MAP-1: Route, Section, Hazard, and Vehicle Geospatial Types.
 *
 * NOTE: All coordinates MUST strictly use [number, number] = [longitude, latitude].
 * Altitude/elevation is optional and kept separate.
 */

export type RouteSectionType =
  | 'NORMAL'
  | 'SHARP_CURVE'
  | 'BLIND_CURVE'
  | 'S_CURVE'
  | 'HAIRPIN_CURVE'
  | 'UPHILL'
  | 'DOWNHILL'
  | 'LOADING_ZONE'
  | 'DUMP_ZONE';

export type HazardSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type HazardFeatureType =
  | 'BLIND_CURVE'
  | 'HAIRPIN_CURVE'
  | 'SHARP_CURVE'
  | 'S_CURVE'
  | 'STEEP_DOWNGRADE'
  | 'STEEP_UPGRADE'
  | 'INTERSECTION'
  | 'ROAD_NARROWING';

export interface RouteSectionMetadata {
  gradePercent?: number;
  turnRadiusMeters?: number;
  sightDistanceMeters?: number;
  description?: string;
  advisoryNotice?: string;
  [key: string]: unknown;
}

export interface RouteSection {
  sectionId: string;
  routeId: string;
  name: string;
  type: RouteSectionType;
  startDistanceMeters: number;
  endDistanceMeters: number;
  geometry: [number, number][]; // Slice of [longitude, latitude] coordinates along the route
  recommendedSpeed: number; // km/h
  severity: HazardSeverity;
  metadata?: RouteSectionMetadata;
}

export interface MineRouteMetadata {
  surfaceType: string;
  designPayloadTonnes?: number;
  disclaimer: string;
  maxGradePercent?: number;
  [key: string]: unknown;
}

export interface MineRoute {
  routeId: string;
  name: string;
  geometry: [number, number][]; // Continuous [longitude, latitude] coordinates
  totalLengthMeters: number;
  widthMeters: number;
  sections: RouteSection[];
  metadata?: MineRouteMetadata;
}

export interface HazardFeature {
  featureId: string;
  type: HazardFeatureType;
  name: string;
  geometry: [number, number]; // [longitude, latitude]
  routeDistanceMeters: number;
  severity: HazardSeverity;
  recommendedSpeed: number; // km/h
  active: boolean;
  warningLabel: string;
  description?: string;
  /**
   * Optional stretch of the route [longitude, latitude][] that the hazard covers
   * (e.g. the full bend of a blind curve). Used to highlight the hazard on the map.
   */
  pathGeometry?: [number, number][];
}

export interface VehicleMapState {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number; // degrees 0-359
  timestamp: string;
  routeId: string;
  sectionId: string;
}

export interface UpcomingHazard {
  featureId: string;
  vehicleId: string;
  distanceMeters: number;
  routeDistanceMeters: number;
  direction: 'AHEAD' | 'BEHIND' | 'ADJACENT';
  severity: HazardSeverity;
  recommendedSpeed: number;
  name: string;
  warningLabel: string;
}
