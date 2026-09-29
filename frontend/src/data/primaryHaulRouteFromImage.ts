// Primary haul route traced from pixel centerline and converted to geographic coordinates using existing calibration
import { pixelToGeo } from '../map/calibration/terrainCalibration';
import type { MineRoute } from '../types/route';

// Ordered pixel coordinates tracing the primary haul road (provided by user)
export const TRACED_PIXEL_ROUTE: [number, number][] = [
  [210,243],[198,258],[185,273],[171,284],[174,302],[188,316],[203,327],[219,336],[238,340],[257,343],[275,348],[292,353],[305,368],[313,385],[322,401],[334,416],[346,431],[357,446],[371,461],[386,473],[402,482],[420,488],[435,498],[451,510],[466,521],[481,532],[497,543],[512,554],[525,569],[540,580],[557,589],[571,602],[577,619],[582,637],[587,655],[593,673],[599,690],[610,705],[626,716],[642,727],[657,737],[673,747],[690,754],[707,763],[722,773],[739,780],[759,780],[777,776],[794,768],[809,758],[824,745],[839,733],[856,726],[875,726],[895,726],[912,733],[920,736]
];

// Convert pixel coordinates to geographic [lon, lat] using calibrated transformation
export const TRACED_GEO_ROUTE: [number, number][] = TRACED_PIXEL_ROUTE.map(([x, y]) => pixelToGeo(x, y));

// Section definitions (indices are inclusive start, inclusive end)
export const TRACED_ROUTE_SECTIONS = [
  { id: 'S1', name: 'Section 1', startIdx: 0, endIdx: 4 }, // [210,243] -> [171,284]
  { id: 'S2', name: 'Section 2', startIdx: 4, endIdx: 12 }, // [171,284] -> [275,348]
  { id: 'S3', name: 'Section 3', startIdx: 12, endIdx: 28 }, // [275,348] -> [525,569]
  { id: 'S4', name: 'Section 4', startIdx: 28, endIdx: 36 }, // [525,569] -> [599,690]
  { id: 'S5', name: 'Section 5', startIdx: 36, endIdx: 46 }, // [599,690] -> [739,780]
  { id: 'S6', name: 'Section 6', startIdx: 46, endIdx: 58 }, // [739,780] -> [920,736]
] as const;

// Export a canonical route object compatible with existing types
export const PRIMARY_HAUL_ROUTE_FROM_IMAGE: MineRoute = {
  routeId: 'ROUTE-HAUL-IMAGE-01',
  name: 'Primary Haul Road (traced from image)',
  geometry: TRACED_GEO_ROUTE,
  totalLengthMeters: 0, // Placeholder – can be computed later if needed
  widthMeters: 28,
  sections: TRACED_ROUTE_SECTIONS.map(sec => ({
    sectionId: sec.id,
    routeId: 'ROUTE-HAUL-IMAGE-01',
    name: sec.name,
    type: 'NORMAL',
    startDistanceMeters: 0,
    endDistanceMeters: 0,
    geometry: TRACED_GEO_ROUTE.slice(sec.startIdx, sec.endIdx + 1),
    recommendedSpeed: 20,
    severity: 'LOW',
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
  },
};
