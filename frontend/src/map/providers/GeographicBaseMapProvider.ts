/**
 * MachineMind — Geographic Base Map Provider
 * 
 * Responsibilities:
 * 1. Resolves configurable base map URL from VITE_MAP_BASE_URL.
 * 2. Provides authentic geographic raster tile configuration.
 * 3. Default provider: Keyless public ESRI World Imagery (satellite) or Dark Gray Canvas.
 * 4. Manages legal copyright attribution strings.
 * 5. Provides offline fallback styles so tile unreachability NEVER crashes the Command Center.
 * 6. Emits tile connectivity status (ONLINE, OFFLINE, DEGRADED).
 */

import type { StyleSpecification } from 'maplibre-gl';

export type BasemapStatus = 'CONNECTING' | 'ONLINE' | 'OFFLINE' | 'DISABLED';

export interface BasemapConfig {
  id: string;
  name: string;
  tileUrl: string;
  attribution: string;
  maxZoom: number;
  minZoom: number;
  tileSize: number;
}

// MachineMind — Generated Mine Map Visual Configuration (Zero External Satellite Network Calls)
export const GENERATED_MINE_MAP_URL = '/images/generated_mine_map.png';
export const MINE_MAP_ATTRIBUTION = 'NETRA Mine Safety Command Center • Generated Open-Cast Mine Map';

// Calibrated geographic bounds for the generated mine background image
export const GENERATED_MINE_MAP_COORDINATES: [[number, number], [number, number], [number, number], [number, number]] = [
  [81.2240, 18.6215], // Top-Left (North-West)
  [81.2425, 18.6215], // Top-Right (North-East)
  [81.2425, 18.6080], // Bottom-Right (South-East)
  [81.2240, 18.6080], // Bottom-Left (South-West)
];

export class GeographicBaseMapProvider {
  private attribution: string;
  private statusListeners: Set<(status: BasemapStatus, message?: string) => void> = new Set();
  private currentStatus: BasemapStatus = 'ONLINE';

  constructor() {
    this.attribution = MINE_MAP_ATTRIBUTION;
  }

  public getTileUrl(): string {
    return GENERATED_MINE_MAP_URL;
  }

  public getAttribution(): string {
    return this.attribution;
  }

  public getStatus(): BasemapStatus {
    return this.currentStatus;
  }

  public subscribeStatus(listener: (status: BasemapStatus, message?: string) => void): () => void {
    this.statusListeners.add(listener);
    listener(this.currentStatus);
    return () => this.statusListeners.delete(listener);
  }

  public setStatus(status: BasemapStatus, message?: string): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      for (const listener of this.statusListeners) {
        listener(status, message);
      }
    }
  }

  /**
   * Generates a MapLibre StyleSpecification for the Command Center.
   * Completely offline, zero satellite imagery requests.
   */
  public getMapLibreStyle(_enableMineBasemap = true): StyleSpecification {
    return {
      version: 8,
      name: 'MachineMind-Command-Center-Canvas',
      sources: {},
      layers: [
        {
          id: 'base-background',
          type: 'background',
          paint: {
            'background-color': '#080D16',
          },
        },
      ],
    };
  }

  /**
   * 100% Offline fallback canvas style.
   * Used when offline, when raster fails, or when basemap layer is toggled off.
   */
  public getOfflineCanvasStyle(): StyleSpecification {
    return {
      version: 8,
      name: 'MachineMind-Offline-Dark-Canvas',
      sources: {},
      layers: [
        {
          id: 'base-background',
          type: 'background',
          paint: {
            'background-color': '#0A0F1A',
          },
        },
      ],
    };
  }
}

export const baseMapProvider = new GeographicBaseMapProvider();
