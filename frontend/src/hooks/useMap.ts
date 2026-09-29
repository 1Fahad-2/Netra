/**
 * MachineMind — useMap Hook
 * Encapsulates map camera presets and layer visibility toggles.
 */

import { useState, useCallback } from 'react';
import type { LayerVisibilityState, MapCameraState } from '../types/map';
import { MAP_CONFIG } from '../map/mapConfig';

const DEFAULT_LAYER_VISIBILITY: LayerVisibilityState = {
  baseMap: true,
  deposit14Boundary: true,
  publicRoads: true,
  benches: true,
  haulRoads: true,
  routeSections: true,
  hazardFeatures: true,
  loadingZones: true,
  dumpZones: true,
  restrictedZones: true,
  blindCurves: true,
  reducedVisibility: true,
  vehicles: true,
  riskHalos: true,
  vehicleTrails: false,
  alertPins: false,
  historicalIncidents: false,
};

export interface UseMapReturn {
  cameraState: MapCameraState;
  setCameraState: (camera: MapCameraState) => void;
  resetCamera: () => void;
  layerVisibility: LayerVisibilityState;
  toggleLayer: (layerKey: keyof LayerVisibilityState) => void;
  toggleAllLayers: (enable: boolean) => void;
}

export function useMap(): UseMapReturn {
  const [cameraState, setCameraState] = useState<MapCameraState>(MAP_CONFIG.defaultCamera);
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibilityState>(DEFAULT_LAYER_VISIBILITY);

  const resetCamera = useCallback(() => {
    setCameraState(MAP_CONFIG.defaultCamera);
  }, []);

  const toggleLayer = useCallback((layerKey: keyof LayerVisibilityState) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerKey]: !prev[layerKey],
    }));
  }, []);

  const toggleAllLayers = useCallback((enable: boolean) => {
    setLayerVisibility({
      baseMap: enable,
      deposit14Boundary: enable,
      publicRoads: enable,
      benches: enable,
      haulRoads: enable,
      routeSections: enable,
      hazardFeatures: enable,
      loadingZones: enable,
      dumpZones: enable,
      restrictedZones: enable,
      blindCurves: enable,
      reducedVisibility: enable,
      vehicles: enable,
      riskHalos: enable,
      vehicleTrails: false,
      alertPins: false,
      historicalIncidents: false,
    });
  }, []);

  return {
    cameraState,
    setCameraState,
    resetCamera,
    layerVisibility,
    toggleLayer,
    toggleAllLayers,
  };
}
