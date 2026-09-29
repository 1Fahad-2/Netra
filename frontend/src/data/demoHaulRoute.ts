import type { MineRoute } from '../types/route';

// Load the validated geographic route points (408 points) generated during STEP 10.
// The JSON file contains an array of objects with a 'geo' field: [lon, lat].
// We map these to a simple array of coordinate tuples.
import geographicRoute from './geographic_route.json';

const geometry: [number, number][] = (geographicRoute as any).map((p: { geo: [number, number] }) => p.geo);

// Section definitions based on the original landmark indices.
// These correspond to the START, CURVE1, CURVE2, CURVE3, END points in the source image.
// The indices were derived from the original pixel-based route and remain valid after geographic conversion.
const sections = [
  { id: 'S1', name: 'Section 1', startIdx: 0, endIdx: 4 },   // START ? CURVE1
  { id: 'S2', name: 'Section 2', startIdx: 4, endIdx: 12 },  // CURVE1 ? CURVE2
  { id: 'S3', name: 'Section 3', startIdx: 12, endIdx: 28 }, // CURVE2 ? CURVE3
  { id: 'S4', name: 'Section 4', startIdx: 28, endIdx: 36 }, // CURVE3 ? END (partial)
  { id: 'S5', name: 'Section 5', startIdx: 36, endIdx: 46 }, // continuation to END
  { id: 'S6', name: 'Section 6', startIdx: 46, endIdx: 58 }, // final stretch
];

export const DEMO_HAUL_ROUTE: MineRoute = {
  routeId: 'DEMO-HAUL-ROUTE-01',
  name: 'Demo Haul Route (geographic conversion)',
  geometry,
  totalLengthMeters: 1082.9016,
  widthMeters: 28,
  sections: sections.map(sec => ({
    sectionId: sec.id,
    routeId: 'DEMO-HAUL-ROUTE-01',
    name: sec.name,
    type: 'NORMAL' as const,
    startDistanceMeters: 0,
    endDistanceMeters: 0,
    geometry: geometry.slice(sec.startIdx, sec.endIdx + 1),
    recommendedSpeed: 20,
    severity: 'LOW' as const,
    metadata: {
      description: `Demo ${sec.name}`,
      gradePercent: 0,
    },
  })),
  metadata: {
    surfaceType: 'Demo surface',
    designPayloadTonnes: 100,
    maxGradePercent: 0,
    disclaimer: 'Route traced from image pixels using existing calibration. Not official survey data.',
    source: 'annotated route / validated geographic conversion',
    pointCount: 408,
    geographicLengthMeters: 1082.9016,
    calibrationStatus: 'conditional / absolute geodetic validation pending',
    coordinateOrder: '[lng, lat]',
    validationStatus: 'source geometry + reference projection verified',
  },
};
