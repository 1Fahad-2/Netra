/**
 * MachineMind — Synthetic Bailadila Geo Provider
 * 
 * Provider Boundary:
 * Wraps and abstracts representative Bailadila-inspired open-cast mine geometry.
 * Implements the MineGeoDataProvider interface so that future authorized GIS feeds
 * can replace synthetic geometry without altering MineMap or UI consumers.
 * 
 * NOTE: Strictly representative Bailadila-inspired open-pit geometry for prototype demonstration.
 */

import type {
  MineGeoDataProvider,
  MineBench,
  HaulRoadSegment,
  MineZone,
  BlindCurveFeature,
  VisibilityRegion,
  MapVehicle,
  MapCameraState,
} from '../../types/map';

import {
  SyntheticBailadilaGeoProvider as BaseSyntheticBailadilaGeoProvider,
  defaultMineGeoProvider as baseDefaultProvider,
  DEFAULT_MAP_CAMERA,
} from '../../data/bailadilaMineGeo';

export class SyntheticBailadilaGeoProvider implements MineGeoDataProvider {
  private baseProvider: BaseSyntheticBailadilaGeoProvider;

  constructor() {
    this.baseProvider = new BaseSyntheticBailadilaGeoProvider();
  }

  public getEnvironmentName(): string {
    return 'BAILADILA / DEP-14 • SIMULATED DIGITAL TWIN';
  }

  public getCenter(): [number, number] {
    return this.baseProvider.getCenter();
  }

  public getDefaultCamera(): MapCameraState {
    return DEFAULT_MAP_CAMERA;
  }

  public getBenches(): MineBench[] {
    return this.baseProvider.getBenches();
  }

  public getHaulRoads(): HaulRoadSegment[] {
    return this.baseProvider.getHaulRoads();
  }

  public getZones(): MineZone[] {
    return this.baseProvider.getZones();
  }

  public getBlindCurves(): BlindCurveFeature[] {
    return this.baseProvider.getBlindCurves();
  }

  public getVisibilityRegions(): VisibilityRegion[] {
    return this.baseProvider.getVisibilityRegions();
  }

  public getInitialVehicles(): MapVehicle[] {
    return this.baseProvider.getInitialVehicles();
  }
}

// Global default provider instance
export const geoDataProvider: MineGeoDataProvider = new SyntheticBailadilaGeoProvider();
export const defaultMineGeoProvider = baseDefaultProvider;
