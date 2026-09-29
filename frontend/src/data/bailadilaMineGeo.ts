import type { 
  MineBench, 
  HaulRoadSegment, 
  MineZone, 
  BlindCurveFeature, 
  VisibilityRegion, 
  MapVehicle, 
  MapCameraState,
  MineGeoDataProvider 
} from '../types/map';

/**
 * MachineMind — Simulated Bailadila Open-Cast Mine Digital Twin Geometry
 * Strictly simulated/prototype geometry for SIH demonstration.
 * Geographically anchored within the Bailadila / Deposit-14 reference context.
 */

import { DEPOSIT_14_REFERENCE_CENTER } from './deposit14Geo';

// Geographic Anchor for the Simulated Digital Twin (Deposit-14 Reference Centroid)
const CENTER_LNG = DEPOSIT_14_REFERENCE_CENTER[0]; // 81.2335
const CENTER_LAT = DEPOSIT_14_REFERENCE_CENTER[1]; // 18.6148

export const DEFAULT_MAP_CAMERA: MapCameraState = {
  longitude: CENTER_LNG,
  latitude: CENTER_LAT,
  zoom: 14.5,
  pitch: 48.0,
  bearing: 18.0,
};

// 1. Continuous Smooth Simulated Haul Corridor Path (35 waypoints)
// Perfectly aligned with the open-cast mine haulage corridor shown in the attached mine image
export const SMOOTH_HAUL_CORRIDOR_PATH: [number, number][] = [
  [81.231622, 18.620317], // 00: Loading Pad exit (upper-left approach)
  [81.232356, 18.620372], // 01: Highwall approach lane
  [81.233116, 18.620414], // 02: Approaching blind curve entry
  [81.234272, 18.620392], // 03: Sharp curve threshold
  [81.235351, 18.620107], // 04: BLIND CURVE APEX (under warning callout)
  [81.234724, 18.619687], // 05: Exiting curve onto descent ramp
  [81.233816, 18.619422], // 06: Passing upper highwall cut
  [81.233002, 18.619258], // 07: Upper descent straight (HEMM-02 approach)
  [81.233274, 18.618652], // 08: Passing HEMM-02 trailing position
  [81.233608, 18.617859], // 09: Moderate downgrade (-7% retarder active)
  [81.233980, 18.616894], // 10: Mid-ramp straightaway (inter-vehicle gap)
  [81.234241, 18.616142], // 11: Headway vector approach
  [81.234469, 18.615407], // 12: HEMM-01 lead approach
  [81.234910, 18.614557], // 13: Passing HEMM-01 lead position
  [81.234829, 18.613992], // 14: Transitional descent curve
  [81.234732, 18.613435], // 15: Entering bench transition
  [81.234618, 18.612888], // 16: Curving toward lower terrace
  [81.234488, 18.612349], // 17: S-CURVE REVERSE THRESHOLD
  [81.234444, 18.611764], // 18: Alternating lateral bend
  [81.234470, 18.611293], // 19: Exiting S-curve
  [81.234572, 18.610780], // 20: Terrace straight corridor
  [81.234752, 18.610377], // 21: Switchback 1 entry
  [81.234979, 18.610040], // 22: Bench descent curve
  [81.235374, 18.609732], // 23: Curving east around rock face
  [81.236065, 18.609659], // 24: HAIRPIN SWITCHBACK 1 APEX
  [81.236800, 18.609715], // 25: Sweeping eastward towards flank
  [81.236894, 18.609420], // 26: HAIRPIN SWITCHBACK 2 APEX
  [81.236691, 18.609165], // 27: Hairpin turn around turquoise pond
  [81.236140, 18.609009], // 28: Pit Bottom pond bypass lane
  [81.235633, 18.608982], // 29: Lower sump drainage berm
  [81.235121, 18.609048], // 30: HAIRPIN SWITCHBACK 3 APEX (Pit Bottom)
  [81.234728, 18.609080], // 31: Lower floor approach ramp
  [81.234404, 18.609044], // 32: Shovel staging corridor
  [81.234136, 18.608977], // 33: Dump apron approach
  [81.233914, 18.608855], // 34: Dump Zone entry and reverse berm
];

// 2. Stepped Open-Pit Terraced Benches (5 concentric depth tiers)
export const SYNTHETIC_BENCHES: MineBench[] = [
  {
    id: 'BENCH-L4',
    level: 4,
    name: 'SIMULATED SURFACE RIM & UPPER COLLAR',
    elevation: 200,
    polygon: [
      [CENTER_LNG - 0.0075, CENTER_LAT + 0.0055],
      [CENTER_LNG - 0.0020, CENTER_LAT + 0.0068],
      [CENTER_LNG + 0.0045, CENTER_LAT + 0.0060],
      [CENTER_LNG + 0.0078, CENTER_LAT + 0.0035],
      [CENTER_LNG + 0.0082, CENTER_LAT - 0.0025],
      [CENTER_LNG + 0.0050, CENTER_LAT - 0.0065],
      [CENTER_LNG - 0.0010, CENTER_LAT - 0.0068],
      [CENTER_LNG - 0.0060, CENTER_LAT - 0.0050],
      [CENTER_LNG - 0.0080, CENTER_LAT - 0.0010],
      [CENTER_LNG - 0.0075, CENTER_LAT + 0.0055],
    ],
    fillColor: [22, 34, 53, 190],
    borderColor: [40, 58, 86, 240],
  },
  {
    id: 'BENCH-L3',
    level: 3,
    name: 'SIMULATED UPPER HAUL BENCH (TIER 03)',
    elevation: 150,
    polygon: [
      [CENTER_LNG - 0.0060, CENTER_LAT + 0.0042],
      [CENTER_LNG - 0.0015, CENTER_LAT + 0.0052],
      [CENTER_LNG + 0.0035, CENTER_LAT + 0.0046],
      [CENTER_LNG + 0.0062, CENTER_LAT + 0.0025],
      [CENTER_LNG + 0.0065, CENTER_LAT - 0.0020],
      [CENTER_LNG + 0.0038, CENTER_LAT - 0.0050],
      [CENTER_LNG - 0.0008, CENTER_LAT - 0.0052],
      [CENTER_LNG - 0.0048, CENTER_LAT - 0.0038],
      [CENTER_LNG - 0.0064, CENTER_LAT - 0.0008],
      [CENTER_LNG - 0.0060, CENTER_LAT + 0.0042],
    ],
    fillColor: [17, 26, 41, 200],
    borderColor: [45, 66, 98, 240],
  },
  {
    id: 'BENCH-L2',
    level: 2,
    name: 'SIMULATED INTERMEDIATE BENCH (TIER 02)',
    elevation: 100,
    polygon: [
      [CENTER_LNG - 0.0045, CENTER_LAT + 0.0030],
      [CENTER_LNG - 0.0010, CENTER_LAT + 0.0038],
      [CENTER_LNG + 0.0025, CENTER_LAT + 0.0032],
      [CENTER_LNG + 0.0046, CENTER_LAT + 0.0015],
      [CENTER_LNG + 0.0048, CENTER_LAT - 0.0015],
      [CENTER_LNG + 0.0026, CENTER_LAT - 0.0038],
      [CENTER_LNG - 0.0005, CENTER_LAT - 0.0039],
      [CENTER_LNG - 0.0036, CENTER_LAT - 0.0028],
      [CENTER_LNG - 0.0048, CENTER_LAT - 0.0005],
      [CENTER_LNG - 0.0045, CENTER_LAT + 0.0030],
    ],
    fillColor: [13, 20, 32, 210],
    borderColor: [52, 76, 112, 240],
  },
  {
    id: 'BENCH-L1',
    level: 1,
    name: 'SIMULATED LOWER EXCAVATION BENCH (TIER 01)',
    elevation: 50,
    polygon: [
      [CENTER_LNG - 0.0032, CENTER_LAT + 0.0020],
      [CENTER_LNG - 0.0006, CENTER_LAT + 0.0025],
      [CENTER_LNG + 0.0018, CENTER_LAT + 0.0020],
      [CENTER_LNG + 0.0032, CENTER_LAT + 0.0008],
      [CENTER_LNG + 0.0033, CENTER_LAT - 0.0010],
      [CENTER_LNG + 0.0016, CENTER_LAT - 0.0025],
      [CENTER_LNG - 0.0003, CENTER_LAT - 0.0026],
      [CENTER_LNG - 0.0025, CENTER_LAT - 0.0018],
      [CENTER_LNG - 0.0034, CENTER_LAT - 0.0003],
      [CENTER_LNG - 0.0032, CENTER_LAT + 0.0020],
    ],
    fillColor: [9, 15, 25, 220],
    borderColor: [58, 85, 126, 240],
  },
  {
    id: 'BENCH-L0',
    level: 0,
    name: 'SIMULATED PIT FLOOR / SUMP EXTRACTION',
    elevation: 15,
    polygon: [
      [CENTER_LNG - 0.0018, CENTER_LAT + 0.0010],
      [CENTER_LNG - 0.0002, CENTER_LAT + 0.0013],
      [CENTER_LNG + 0.0010, CENTER_LAT + 0.0009],
      [CENTER_LNG + 0.0018, CENTER_LAT + 0.0002],
      [CENTER_LNG + 0.0017, CENTER_LAT - 0.0008],
      [CENTER_LNG + 0.0007, CENTER_LAT - 0.0014],
      [CENTER_LNG - 0.0002, CENTER_LAT - 0.0014],
      [CENTER_LNG - 0.0014, CENTER_LAT - 0.0009],
      [CENTER_LNG - 0.0019, CENTER_LAT + 0.0000],
      [CENTER_LNG - 0.0018, CENTER_LAT + 0.0010],
    ],
    fillColor: [6, 10, 18, 230],
    borderColor: [40, 58, 86, 240],
  },
];

// 3. Simulated Haul-Road Network (Consistent 28m width corridor)
export const SYNTHETIC_HAUL_ROADS: HaulRoadSegment[] = [
  {
    id: 'HAUL-CORRIDOR-MAIN',
    name: 'SIMULATED HAUL CORRIDOR (LOADING TO DUMP)',
    widthMeters: 28,
    surfaceType: 'PRIMARY_HAUL',
    path: SMOOTH_HAUL_CORRIDOR_PATH,
  },
];

// 4. Operational Zones
export const SYNTHETIC_ZONES: MineZone[] = [
  {
    id: 'ZONE-LOADING',
    name: 'DEMO NORTH-WEST LOADING ZONE',
    type: 'LOADING',
    label: 'DEMO LOADING ZONE',
    center: [CENTER_LNG - 0.0022, CENTER_LAT + 0.0028],
    polygon: [
      [CENTER_LNG - 0.0032, CENTER_LAT + 0.0036],
      [CENTER_LNG - 0.0012, CENTER_LAT + 0.0040],
      [CENTER_LNG - 0.0010, CENTER_LAT + 0.0022],
      [CENTER_LNG - 0.0030, CENTER_LAT + 0.0019],
      [CENTER_LNG - 0.0032, CENTER_LAT + 0.0036],
    ],
    color: [47, 111, 240, 50],
    borderColor: [47, 111, 240, 220],
  },
  {
    id: 'ZONE-DUMP',
    name: 'DEMO SOUTH-EAST ORE DUMP',
    type: 'DUMP',
    label: 'DEMO DUMP ZONE',
    center: [CENTER_LNG + 0.0072, CENTER_LAT - 0.0020],
    polygon: [
      [CENTER_LNG + 0.0060, CENTER_LAT - 0.0010],
      [CENTER_LNG + 0.0084, CENTER_LAT - 0.0010],
      [CENTER_LNG + 0.0086, CENTER_LAT - 0.0032],
      [CENTER_LNG + 0.0062, CENTER_LAT - 0.0032],
      [CENTER_LNG + 0.0060, CENTER_LAT - 0.0010],
    ],
    color: [230, 169, 58, 45],
    borderColor: [230, 169, 58, 220],
  },
  {
    id: 'ZONE-RESTRICTED',
    name: 'DEMO BLAST CLEARING SECTOR',
    type: 'RESTRICTED',
    label: 'DEMO RESTRICTED AREA',
    center: [CENTER_LNG + 0.0048, CENTER_LAT + 0.0042],
    polygon: [
      [CENTER_LNG + 0.0035, CENTER_LAT + 0.0055],
      [CENTER_LNG + 0.0065, CENTER_LAT + 0.0052],
      [CENTER_LNG + 0.0062, CENTER_LAT + 0.0032],
      [CENTER_LNG + 0.0032, CENTER_LAT + 0.0035],
      [CENTER_LNG + 0.0035, CENTER_LAT + 0.0055],
    ],
    color: [229, 72, 77, 50],
    borderColor: [229, 72, 77, 230],
  },
];

// 5. Blind Curve Feature (Directly aligned with the hairpin apex of the simulated haul corridor)
export const SYNTHETIC_BLIND_CURVES: BlindCurveFeature[] = [
  {
    id: 'BLIND-CURVE-01',
    name: 'SIMULATED WEST HIGHWALL BLIND CURVE',
    warningLabel: 'SIMULATED BLIND CURVE',
    coordinates: [81.2282, 18.6140], // Exactly at apex waypoint (index 12 of SMOOTH_HAUL_CORRIDOR_PATH)
    radiusMeters: 40,
    curvePath: [
      [81.2287, 18.6146],     // index 09
      [81.228474, 18.614393], // index 10
      [81.228293, 18.614207], // index 11
      [81.2282, 18.6140],     // index 12: Apex
      [81.228219, 18.613744], // index 13
      [81.228326, 18.613467], // index 14
      [81.2285, 18.6132],     // index 15
    ],
  },
];

// 6. Reduced Visibility Region (Centred over the actual BC01/BC02 hairpin basin)
// Polygon covers the frozen haul-road blind-curve area (route vertices 7–49,
// lat ≈18.6490–18.6529, lng ≈81.2340–81.2355).
// The hexagonal envelope provides ~250 m coverage around both blind curves.
// Previous centroid [81.2284, 18.6142] was ~6 km SW — now corrected.
export const SYNTHETIC_VISIBILITY_REGIONS: VisibilityRegion[] = [
  {
    id: 'VIS-BASIN-01',
    name: 'SIMULATED VALLEY FOG ACCUMULATION',
    condition: 'REDUCED',
    density: 0.65,
    label: 'REDUCED VISIBILITY (SIMULATED)',
    center: [81.2347, 18.6508],   // centred on BC01/BC02 hairpin basin
    polygon: [
      [81.2320, 18.6530],   // NW
      [81.2375, 18.6530],   // NE
      [81.2395, 18.6508],   // E
      [81.2375, 18.6485],   // SE
      [81.2320, 18.6485],   // SW
      [81.2300, 18.6508],   // W
      [81.2320, 18.6530],   // close ring
    ],
  },
];

// 7. Exactly Two Prototype Vehicles (Static deterministic placement at t=0)
export const INITIAL_PROTOTYPE_VEHICLES: MapVehicle[] = [
  {
    id: 'HEMM-01',
    type: '100T DUMPER (FOLLOWING)',
    coordinates: [81.23456160513331, 18.651183210791743],
    heading: 224, // Traveling along corridor tangent toward the Blind Curve
    status: 'STANDBY',
    dataProvenance: 'SIMULATION',
  },
  {
    id: 'HEMM-02',
    type: '100T DUMPER (LEAD)',
    coordinates: [81.23456160513331, 18.651316585094904],
    heading: 226, // Ahead on corridor tangent
    status: 'STANDBY',
    dataProvenance: 'SIMULATION',
  },
];

/**
 * Concrete implementation of MineGeoDataProvider
 * Provides data abstraction allowing future live NMDC GIS injection.
 */
export class SyntheticBailadilaGeoProvider implements MineGeoDataProvider {
  getEnvironmentName(): string {
    return 'BAILADILA / DEP-14 • SIMULATED DIGITAL TWIN';
  }

  getCenter(): [number, number] {
    return [CENTER_LNG, CENTER_LAT];
  }

  getDefaultCamera(): MapCameraState {
    return DEFAULT_MAP_CAMERA;
  }

  getBenches(): MineBench[] {
    return SYNTHETIC_BENCHES;
  }

  getHaulRoads(): HaulRoadSegment[] {
    return SYNTHETIC_HAUL_ROADS;
  }

  getZones(): MineZone[] {
    return SYNTHETIC_ZONES;
  }

  getBlindCurves(): BlindCurveFeature[] {
    return SYNTHETIC_BLIND_CURVES;
  }

  getVisibilityRegions(): VisibilityRegion[] {
    return SYNTHETIC_VISIBILITY_REGIONS;
  }

  getInitialVehicles(): MapVehicle[] {
    return INITIAL_PROTOTYPE_VEHICLES;
  }
}

export const defaultMineGeoProvider = new SyntheticBailadilaGeoProvider();
