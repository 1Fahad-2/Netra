/**
 * MachineMind — Map Visualization Types
 * Core abstractions for synthetic mine geometry, layer management, and camera state.
 */

export interface GeoPoint {
  longitude: number;
  latitude: number;
  elevation?: number;
}

export type GeoPolygon = [number, number][];

export interface MineBench {
  id: string;
  level: number; // 0 (pit floor) to 4 (rim)
  name: string;
  polygon: GeoPolygon;
  elevation: number;
  fillColor: [number, number, number, number];
  borderColor: [number, number, number, number];
}

export interface HaulRoadSegment {
  id: string;
  name: string;
  path: [number, number][];
  widthMeters: number;
  surfaceType: 'PRIMARY_HAUL' | 'RAMP_SWITCHBACK' | 'BENCH_ACCESS';
}

export interface MineZone {
  id: string;
  name: string;
  type: 'LOADING' | 'DUMP' | 'RESTRICTED';
  polygon: GeoPolygon;
  center: [number, number];
  color: [number, number, number, number];
  borderColor: [number, number, number, number];
  label: string;
}

export interface BlindCurveFeature {
  id: string;
  name: string;
  coordinates: [number, number];
  curvePath: [number, number][];
  radiusMeters: number;
  warningLabel: string;
}

export interface VisibilityRegion {
  id: string;
  name: string;
  polygon: GeoPolygon;
  center: [number, number];
  density: number; // 0.0 - 1.0
  condition: 'REDUCED' | 'POOR';
  label: string;
}

export interface MapVehicle {
  id: string; // "HEMM-01" | "HEMM-02"
  type: string;
  coordinates: [number, number];
  heading: number; // 0-359 degrees
  status: 'STANDBY' | 'NORMAL';
  dataProvenance: 'SIMULATION';
}

export interface MapCameraState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface LayerVisibilityState {
  // Geographic Context (Real Reference)
  baseMap: boolean;
  deposit14Boundary: boolean;
  publicRoads: boolean;

  // Simulated Mine Operations
  benches: boolean;
  haulRoads: boolean;
  routeSections: boolean;
  hazardFeatures: boolean;
  loadingZones: boolean;
  dumpZones: boolean;
  restrictedZones: boolean;
  blindCurves: boolean;

  // Safety Digital Twin Overlays
  vehicles: boolean;
  reducedVisibility: boolean;
  riskHalos: boolean;
  vehicleTrails: boolean;
  alertPins: boolean;
  historicalIncidents: boolean;
}

export * from './route';

export interface MineGeoDataProvider {
  getEnvironmentName(): string;
  getCenter(): [number, number];
  getDefaultCamera(): MapCameraState;
  getBenches(): MineBench[];
  getHaulRoads(): HaulRoadSegment[];
  getZones(): MineZone[];
  getBlindCurves(): BlindCurveFeature[];
  getVisibilityRegions(): VisibilityRegion[];
  getInitialVehicles(): MapVehicle[];
}
