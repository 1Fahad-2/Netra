/**
 * MachineMind — Coordinate Mapping Layer
 * 
 * Architecture:
 * SIMULATION SPACE / LOCAL ROUTE
 *         ↓
 * NORMALIZED ROUTE / LOCAL POSITION
 *         ↓
 * GEOGRAPHIC MAPPER (This module)
 *         ↓
 * LONGITUDE / LATITUDE
 *         ↓
 * MapLibre + deck.gl
 * 
 * Invariants:
 * 1. Simulation mathematics (distance in meters, closing speed m/s, TTC in seconds,
 *    risk score 0.0-1.0, recommended action) are calculated strictly in simulation space.
 * 2. TTC is NEVER calculated using longitude/latitude.
 * 3. This mapper translates simulated positions into real geographic Bailadila / Deposit-14
 *    display coordinates.
 * 4. When future physical testbed inputs provide real GNSS/GPS coordinates (data_mode === 'PHYSICAL_TESTBED'
 *    or 'LIVE'), they bypass the simulation offset and pass directly into the map without requiring
 *    any frontend redesign.
 */

import type { Position3D, DataMode } from '../../types/contract';
import { DEPOSIT_14_REFERENCE_CENTER } from '../../data/deposit14Geo';
import { isNearActiveRoute } from '../../data/activeHaulRoute';

// Synthetic simulation anchor used by deterministic scenario generator
export const SIMULATION_ORIGIN_LNG = 81.2500;
export const SIMULATION_ORIGIN_LAT = 18.6500;

// Real geographic Bailadila / Deposit-14 map anchor
export const GEOGRAPHIC_DISPLAY_CENTER_LNG = DEPOSIT_14_REFERENCE_CENTER[0]; // 81.2335
export const GEOGRAPHIC_DISPLAY_CENTER_LAT = DEPOSIT_14_REFERENCE_CENTER[1]; // 18.6148

// Offset from simulation reference frame to Deposit-14 geographic reference frame
const OFFSET_LNG = GEOGRAPHIC_DISPLAY_CENTER_LNG - SIMULATION_ORIGIN_LNG; // -0.0165
const OFFSET_LAT = GEOGRAPHIC_DISPLAY_CENTER_LAT - SIMULATION_ORIGIN_LAT; // -0.0352

export class CoordinateMapper {
  /**
   * Maps a simulation coordinate [lng, lat] to a geographic display coordinate [lng, lat]
   * inside the Bailadila Deposit-14 context.
   */
  public static mapSimulationToGeographic(
    coord: [number, number],
    dataMode: DataMode = 'SIMULATION'
  ): [number, number] {
    // If physical testbed or live GNSS data is provided, pass through raw real-world coordinates directly
    if (dataMode === 'PHYSICAL_TESTBED' || dataMode === 'LIVE') {
      return [coord[0], coord[1]];
    }

    const [simLng, simLat] = coord;

    // Coordinates on/near the ACTIVE haul route (REAL_HAUL_CORRIDOR_PATH) are already real
    // geographic positions. They must NOT be re-anchored: the active route sits within 0.02°
    // of the legacy simulation origin, so without this guard the legacy offset below would
    // shift the vehicles ~4.3 km off the route.
    if (isNearActiveRoute(coord)) {
      return [simLng, simLat];
    }

    // Check if the coordinate is already anchored around Deposit-14 (~81.2335, ~18.6148)
    const isAlreadyDeposit14 =
      Math.abs(simLng - GEOGRAPHIC_DISPLAY_CENTER_LNG) < 0.02 &&
      Math.abs(simLat - GEOGRAPHIC_DISPLAY_CENTER_LAT) < 0.02;

    if (isAlreadyDeposit14) {
      return [simLng, simLat];
    }

    // Check if the coordinate is anchored around legacy simulation origin (~81.2500, ~18.6500)
    const isLegacySimOrigin =
      Math.abs(simLng - SIMULATION_ORIGIN_LNG) < 0.02 &&
      Math.abs(simLat - SIMULATION_ORIGIN_LAT) < 0.02;

    if (isLegacySimOrigin) {
      return [simLng + OFFSET_LNG, simLat + OFFSET_LAT];
    }

    // Default: treat as local delta offset from geographic anchor
    return [simLng + OFFSET_LNG, simLat + OFFSET_LAT];
  }

  /**
   * Maps a Position3D contract object to a [lng, lat] tuple for deck.gl / MapLibre.
   */
  public static mapPosition3DToGeographic(
    position: Position3D,
    dataMode: DataMode = 'SIMULATION'
  ): [number, number] {
    return this.mapSimulationToGeographic([position.longitude, position.latitude], dataMode);
  }

  /**
   * Maps a full polyline path (e.g. haul route) from simulation space into geographic space.
   */
  public static mapPolylineToGeographic(
    path: [number, number][],
    dataMode: DataMode = 'SIMULATION'
  ): [number, number][] {
    return path.map((pt) => this.mapSimulationToGeographic(pt, dataMode));
  }

  /**
   * Maps a polygon (e.g. bench or zone) from simulation space into geographic space.
   */
  public static mapPolygonToGeographic(
    polygon: [number, number][],
    dataMode: DataMode = 'SIMULATION'
  ): [number, number][] {
    return polygon.map((pt) => this.mapSimulationToGeographic(pt, dataMode));
  }
}
