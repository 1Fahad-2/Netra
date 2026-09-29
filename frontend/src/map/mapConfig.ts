/**
 * MachineMind — Map Configuration & Geographic Camera Perspectives
 * 
 * Anchored to the Bailadila Deposit-14 geographic reference context.
 * UI Labels:
 * - "BAILADILA / DEP-14" (Real Geographic Context)
 * - "SIMULATED DIGITAL TWIN" (Operational Safety Simulation)
 */

import type { MapCameraState } from '../types/map';
import { DEPOSIT_14_REFERENCE_CENTER } from '../data/deposit14Geo';
import { ACTIVE_ROUTE_CENTER } from '../data/activeHaulRoute';

// Centred on the ACTIVE haul route (REAL_HAUL_CORRIDOR_PATH) — see data/activeHaulRoute.ts
export const DEFAULT_MAP_CAMERA: MapCameraState = {
  longitude: ACTIVE_ROUTE_CENTER[0],
  latitude: ACTIVE_ROUTE_CENTER[1],
  zoom: 16.2,
  pitch: 0,
  bearing: 0,
};

// Wide perspective covering the broader Bailadila mountain ridge (Bacheli to Kirandul)
export const BAILADILA_OVERVIEW_CAMERA: MapCameraState = {
  longitude: 81.2335,
  latitude: 18.6350,
  zoom: 12.8,
  pitch: 35.0,
  bearing: 15.0,
};

// Focused perspective centered directly on the Deposit-14 reference area
export const DEP14_FOCUS_CAMERA: MapCameraState = {
  longitude: DEPOSIT_14_REFERENCE_CENTER[0],
  latitude: DEPOSIT_14_REFERENCE_CENTER[1],
  zoom: 15.2,
  pitch: 52.0,
  bearing: 18.0,
};

// Safety Scene perspective framing HEMM vehicles, blind curve, and proximity interaction
// (centred on the ACTIVE haul route so Reset View / Focus Safety Scene land on the route)
export const SAFETY_SCENE_CAMERA: MapCameraState = {
  longitude: ACTIVE_ROUTE_CENTER[0],
  latitude: ACTIVE_ROUTE_CENTER[1],
  zoom: 16.2,
  pitch: 45.0,
  bearing: 30.0,
};

export const MAP_CONFIG = {
  defaultCamera: DEFAULT_MAP_CAMERA,
  overviewCamera: BAILADILA_OVERVIEW_CAMERA,
  focusCamera: DEP14_FOCUS_CAMERA,
  safetySceneCamera: SAFETY_SCENE_CAMERA,
  minZoom: 5,
  maxZoom: 22,
  maxPitch: 70,
  minPitch: 0,
  contextName: 'BAILADILA / DEP-14',
  operationsMode: 'SIMULATED DIGITAL TWIN',
  provenanceNotice: 'REAL GEOGRAPHIC CONTEXT • SIMULATED DIGITAL TWIN',
} as const;

export type { MapCameraState };
