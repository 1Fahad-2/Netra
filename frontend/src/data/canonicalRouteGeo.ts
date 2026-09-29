/**
 * MachineMind — Canonical Route and Hazard Geospatial Dataset
 * Checkpoint MAP-1: Continuous Haul Corridor, Route Sections, and Hazard Metadata.
 *
 * IMPORTANT LEGAL & OPERATIONAL DISCLAIMER:
 * The road geometry, route section names, turn radii, grades, recommended speeds,
 * and hazard thresholds in this file are strictly illustrative simulation/demo data
 * created for the SIH 2026 Mine Safety Command Center demonstration.
 * They are NOT official NMDC Ltd. or DGMS survey measurements, certified mine
 * cadastral maps, or official regulatory safety thresholds.
 *
 * Single Source of Truth:
 * All route sections and features reference the continuous SMOOTH_HAUL_CORRIDOR_PATH.
 */

import type {
  MineRoute,
  RouteSection,
  HazardFeature,
} from '../types/route';
import { SMOOTH_HAUL_CORRIDOR_PATH } from './bailadilaMineGeo';

// Precomputed route distance constants
const METERS_PER_DEG_LAT = 111000;
const METERS_PER_DEG_LNG = 105400;

export function calcDist(p1: [number, number], p2: [number, number]): number {
  const dx = (p2[0] - p1[0]) * METERS_PER_DEG_LNG;
  const dy = (p2[1] - p1[1]) * METERS_PER_DEG_LAT;
  return Math.sqrt(dx * dx + dy * dy);
}

// Slice polyline helper (inclusive)
function slicePath(startIdx: number, endIdx: number): [number, number][] {
  return SMOOTH_HAUL_CORRIDOR_PATH.slice(startIdx, endIdx + 1);
}

/**
 * 9 Contiguous Route Sections along the single continuous haul corridor
 * Derived from waypoints 00 to 36 of SMOOTH_HAUL_CORRIDOR_PATH.
 */
export const HAUL_ROUTE_SECTIONS: RouteSection[] = [
  {
    sectionId: 'SEC-01',
    routeId: 'ROUTE-HAUL-01',
    name: 'Loading Pad Exit',
    type: 'LOADING_ZONE',
    startDistanceMeters: 0.0,
    endDistanceMeters: 145.0,
    geometry: slicePath(0, 3),
    recommendedSpeed: 20,
    severity: 'LOW',
    metadata: {
      description: 'North-West pit extraction loading pad departure lane',
      advisoryNotice: 'Active shovel and loading machinery zone. Yield to loading units.',
      gradePercent: -1.5,
    },
  },
  {
    sectionId: 'SEC-02',
    routeId: 'ROUTE-HAUL-01',
    name: 'Highwall Sharp Curve',
    type: 'SHARP_CURVE',
    startDistanceMeters: 145.0,
    endDistanceMeters: 260.0,
    geometry: slicePath(3, 5),
    recommendedSpeed: 25,
    severity: 'MEDIUM',
    metadata: {
      description: 'Curving haul road sector sweeping along upper excavation highwall',
      advisoryNotice: 'Approaching blind curve threshold. Maintain radar proximity.',
      turnRadiusMeters: 48,
      gradePercent: -4.0,
    },
  },
  {
    sectionId: 'SEC-03',
    routeId: 'ROUTE-HAUL-01',
    name: 'Blind Curve Sector',
    type: 'BLIND_CURVE',
    startDistanceMeters: 260.0,
    endDistanceMeters: 410.0,
    geometry: slicePath(5, 8),
    recommendedSpeed: 18,
    severity: 'HIGH',
    metadata: {
      description: 'Mountain cut blind curve with obstructed line of sight along rocky highwall',
      advisoryNotice: 'CRITICAL HAZARD: Sight distance < 45m. Maintain minimum 60m vehicle headway.',
      sightDistanceMeters: 40,
      turnRadiusMeters: 38,
      gradePercent: -3.0,
    },
  },
  {
    sectionId: 'SEC-04',
    routeId: 'ROUTE-HAUL-01',
    name: 'Haul Descent Ramp',
    type: 'DOWNHILL',
    startDistanceMeters: 410.0,
    endDistanceMeters: 720.0,
    geometry: slicePath(8, 14),
    recommendedSpeed: 22,
    severity: 'HIGH',
    metadata: {
      description: 'Main pit haul ramp downgrade passing HEMM operational encounter',
      advisoryNotice: 'Moderate downgrade (-7.0%). Heavy retarder braking required.',
      gradePercent: -7.0,
    },
  },
  {
    sectionId: 'SEC-05',
    routeId: 'ROUTE-HAUL-01',
    name: 'Bench Transition Curve',
    type: 'SHARP_CURVE',
    startDistanceMeters: 720.0,
    endDistanceMeters: 890.0,
    geometry: slicePath(14, 17),
    recommendedSpeed: 25,
    severity: 'MEDIUM',
    metadata: {
      description: 'Intermediate bench descent curve transitioning towards pit terraces',
      advisoryNotice: 'Check vehicle headway before entering reverse curve.',
      turnRadiusMeters: 55,
      gradePercent: -4.0,
    },
  },
  {
    sectionId: 'SEC-06',
    routeId: 'ROUTE-HAUL-01',
    name: 'Lower S-Curve',
    type: 'S_CURVE',
    startDistanceMeters: 890.0,
    endDistanceMeters: 1850.0,
    geometry: slicePath(17, 34),
    recommendedSpeed: 28,
    severity: 'MEDIUM',
    metadata: {
      description: 'Double reverse curve along terrace terrain passing above pit basin',
      advisoryNotice: 'Alternating lateral force. Steer smoothly through counter-bend.',
      turnRadiusMeters: 62,
      gradePercent: -6.0,
    },
  },

];

/**
 * Single continuous canonical route object
 */
export const PRIMARY_HAUL_ROUTE: MineRoute = {
  routeId: 'ROUTE-HAUL-01',
  name: 'Deposit-14 Primary Haul Corridor (Loading to Dump)',
  geometry: SMOOTH_HAUL_CORRIDOR_PATH,
  totalLengthMeters: 1850.0,
  widthMeters: 28,
  sections: HAUL_ROUTE_SECTIONS,
  metadata: {
    surfaceType: 'Crushed ironstone compacted gravel',
    designPayloadTonnes: 100,
    maxGradePercent: 8.0,
    disclaimer:
      'Illustrative SIH demonstration road model. Not an official NMDC survey or DGMS geometric standard.',
  },
};

/**
 * Canonical Hazard Features along the route
 */
export const CANONICAL_MINE_HAZARDS: HazardFeature[] = [
  {
    featureId: 'HAZ-01',
    type: 'SHARP_CURVE',
    name: 'Highwall Sharp Curve',
    geometry: [81.234272, 18.620392], // Waypoint 03
    routeDistanceMeters: 210.0,
    severity: 'MEDIUM',
    recommendedSpeed: 25,
    active: true,
    warningLabel: 'CAUTION: SHARP CURVE',
    description: 'Reduced turning radius near upper highwall cut.',
  },
  {
    featureId: 'HAZ-02',
    type: 'BLIND_CURVE',
    name: 'Upper Highwall Blind Curve',
    geometry: [81.235351, 18.620107], // Waypoint 04 (Apex)
    routeDistanceMeters: 310.0,
    severity: 'HIGH',
    recommendedSpeed: 18,
    active: true,
    warningLabel: 'WARNING: BLIND CURVE',
    description: 'Rock face obstructs line of sight on descending haulers.',
  },
  {
    featureId: 'HAZ-03',
    type: 'STEEP_DOWNGRADE',
    name: 'Haul Ramp Downgrade',
    geometry: [81.233608, 18.617859], // Waypoint 09
    routeDistanceMeters: 550.0,
    severity: 'HIGH',
    recommendedSpeed: 22,
    active: true,
    warningLabel: 'DOWNHILL: -7% GRADE',
    description: 'Steep loaded descent requiring retarder engagement.',
  },
  {
    featureId: 'HAZ-04',
    type: 'S_CURVE',
    name: 'Lower Terrace S-Curve',
    geometry: [81.234444, 18.611764], // Waypoint 18
    routeDistanceMeters: 980.0,
    severity: 'MEDIUM',
    recommendedSpeed: 28,
    active: true,
    warningLabel: 'ADVISORY: S-CURVE',
    description: 'Double reverse curve along terrace terrain.',
  },
  {
    featureId: 'HAZ-05',
    type: 'HAIRPIN_CURVE',
    name: 'Pit Bottom Hairpin Switchback',
    geometry: [81.236691, 18.609165], // Waypoint 27
    routeDistanceMeters: 1480.0,
    severity: 'CRITICAL',
    recommendedSpeed: 15,
    active: true,
    warningLabel: 'CRITICAL: HAIRPIN SWITCHBACK',
    description: 'Sharp 180-degree turn winding around turquoise sump pond.',
  },
];
