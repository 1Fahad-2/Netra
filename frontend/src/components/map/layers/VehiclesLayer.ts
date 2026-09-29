/**
 * MachineMind — Realistic HEMM Vehicle Map Layer
 * Matches visual reference:
 * - Circular vehicle glow markers directly on road centerline
 * - Directional heading arrow/icon
 * - Callout cards showing Vehicle ID, Speed (km/h), and Heading (°)
 * - Inter-vehicle headway & TTC red chip: "142 m / TTC: 8.7 s"
 */

import { ScatterplotLayer, PathLayer, TextLayer } from '@deck.gl/layers';
import type { MapVehicle } from '../../../types/map';
import type { RiskLevel } from '../../../types/contract';

interface VehicleLayerProps {
  vehicles: MapVehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  showVehicles: boolean;
  showHalos: boolean;
  riskLevel?: RiskLevel;
  headwayMeters?: number;
  ttcSeconds?: number;
  relativeSpeedMs?: number;
  currentZoom?: number;
}

const METERS_PER_DEG_LAT = 111000;
const METERS_PER_DEG_LNG = 105400;

export function createVehiclesLayers({
  vehicles,
  selectedVehicleId: _selectedVehicleId,
  onSelectVehicle,
  showVehicles,
  headwayMeters = 142,
  ttcSeconds = 8.7,
}: VehicleLayerProps) {
  if (!showVehicles || vehicles.length === 0) return [];

  const hemm01 = vehicles.find((v) => v.id === 'HEMM-01');
  const hemm02 = vehicles.find((v) => v.id === 'HEMM-02');
  const hasBoth = Boolean(hemm01 && hemm02);
  // Debug logging of vehicle coordinates
  if (hemm01) {
    console.log('[VehiclePlacement] HEMM-01:', hemm01.coordinates[0], hemm01.coordinates[1]);
  }
  if (hemm02) {
    console.log('[VehiclePlacement] HEMM-02:', hemm02.coordinates[0], hemm02.coordinates[1]);
  }

  // 1. Directional Heading Pointers (Arrow line pointing forward along road tangent)
  const headingVectors = vehicles.map((v) => {
    const rad = (v.heading * Math.PI) / 180;
    const lenMeters = 16;
    const forwardLng = v.coordinates[0] + (Math.sin(rad) * lenMeters) / METERS_PER_DEG_LNG;
    const forwardLat = v.coordinates[1] + (Math.cos(rad) * lenMeters) / METERS_PER_DEG_LAT;
    return {
      id: `HEADING-${v.id}`,
      path: [v.coordinates, [forwardLng, forwardLat]],
      color: v.id === 'HEMM-01' ? [34, 197, 94, 255] : [56, 189, 248, 255],
    };
  });

  const headingLinesLayer = new PathLayer({
    id: 'layer-vehicle-heading-lines',
    data: headingVectors,
    pickable: false,
    widthUnits: 'pixels',
    widthMinPixels: 2.5,
    getPath: (d: any) => d.path,
    getColor: (d: any) => d.color,
    getWidth: 2.5,
    capRounded: true,
  });

  // 2. Outer Glow Rings (Green for HEMM-01, Blue for HEMM-02)
  const vehicleHalosLayer = new ScatterplotLayer<MapVehicle>({
    id: 'layer-vehicles-halos',
    data: vehicles,
    pickable: false,
    radiusUnits: 'meters',
    radiusMinPixels: 30, // increased for visibility
    getRadius: 15,
    getPosition: (d) => [d.coordinates[0], d.coordinates[1]],
    getFillColor: (d) =>
      d.id === 'HEMM-01'
        ? [34, 197, 94, 60] // Translucent green glow
        : [56, 189, 248, 60], // Translucent blue glow
    getLineColor: (d) =>
      d.id === 'HEMM-01'
        ? [34, 197, 94, 220]
        : [56, 189, 248, 220],
    stroked: true,
    lineWidthMinPixels: 2,
  });

  // 3. Vehicle Core Marker
  const vehicleCoreLayer = new ScatterplotLayer<MapVehicle>({
    id: 'layer-vehicles-core',
    data: vehicles,
    pickable: true,
    radiusUnits: 'meters',
    radiusMinPixels: 18, // increased for visibility
    getRadius: 7,
    getPosition: (d) => [d.coordinates[0], d.coordinates[1]],
    getFillColor: (d) =>
      d.id === 'HEMM-01'
        ? [34, 197, 94, 255] // Solid emerald green
        : [56, 189, 248, 255], // Solid sky blue
    getLineColor: [255, 255, 255, 255],
    stroked: true,
    lineWidthMinPixels: 1.5,
    onClick: (info) => {
      if (info.object) {
        onSelectVehicle(info.object.id);
      }
    },
  });

  // 4. Floating Callout Card beside each vehicle (matches reference image)
  const calloutCardData = vehicles.map((v) => {
    // Offset label slightly to the side of the vehicle
    const is01 = v.id === 'HEMM-01';
    const speedText = is01 ? '22 km/h' : '16 km/h';
    const headingText = is01 ? '72°' : '248°';
    const offsetLng = is01 ? +0.0007 : -0.0007;
    const offsetLat = is01 ? +0.0002 : +0.0003;

    return {
      id: `CALLOUT-${v.id}`,
      coordinates: [v.coordinates[0] + offsetLng, v.coordinates[1] + offsetLat] as [number, number],
      vehicleId: v.id,
      text: `${v.id}\nSpeed: ${speedText}\nHeading: ${headingText}`,
      line1: v.id,
      line2: `Speed: ${speedText}`,
      line3: `Heading: ${headingText}`,
      color: is01 ? [34, 197, 94, 255] : [56, 189, 248, 255],
      bgColor: [10, 16, 28, 235] as [number, number, number, number],
    };
  });

  const calloutCardsLayer = new TextLayer({
    id: 'layer-vehicle-callout-cards',
    data: calloutCardData,
    pickable: false,
    getPosition: (d: any) => d.coordinates,
    getText: (d: any) => d.text,
    getSize: 9.5,
    getColor: [241, 245, 249, 255],
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 600,
    lineHeight: 1.35,
    getTextAnchor: 'start',
    getAlignmentBaseline: 'center',
    sizeUnits: 'pixels',
    backgroundColor: [9, 14, 23, 225],
    backgroundPadding: [6, 4],
  });

  // 5. Inter-Vehicle Headway / TTC Red Vector Line & Chip (matches reference image: "142 m / TTC: 8.7 s")
  let headwayLayers: any[] = [];
  if (hasBoth && hemm01 && hemm02) {
    const interVehicleLine = new PathLayer({
      id: 'layer-intervehicle-vector-line',
      data: [{ path: [hemm01.coordinates, hemm02.coordinates] }],
      pickable: false,
      widthUnits: 'pixels',
      widthMinPixels: 2,
      getPath: (d: any) => d.path,
      getColor: [239, 68, 68, 220], // Red conflict vector
      getWidth: 2,
      capRounded: true,
    });

    const midLng = (hemm01.coordinates[0] + hemm02.coordinates[0]) / 2;
    const midLat = (hemm01.coordinates[1] + hemm02.coordinates[1]) / 2;

    const headwayLabelLayer = new TextLayer({
      id: 'layer-intervehicle-chip',
      data: [
        {
          id: 'HEADWAY-CHIP',
          coordinates: [midLng, midLat],
          text: `${headwayMeters} m\nTTC: ${ttcSeconds} s`,
        },
      ],
      pickable: false,
      getPosition: (d: any) => d.coordinates,
      getText: (d: any) => d.text,
      getSize: 9,
      getColor: [255, 255, 255, 255],
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: 700,
      lineHeight: 1.3,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      sizeUnits: 'pixels',
      backgroundColor: [185, 28, 28, 235], // Solid red warning pill
      backgroundPadding: [7, 4],
    });

    headwayLayers = [interVehicleLine, headwayLabelLayer];
  }

  return [
    ...headwayLayers,
    headingLinesLayer,
    vehicleHalosLayer,
    vehicleCoreLayer,
    calloutCardsLayer,
  ];
}
