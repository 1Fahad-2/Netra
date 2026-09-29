/**
 * MachineMind — Deposit-14 Geographic Reference Layer
 * 
 * Purpose:
 * Renders the 4-point reference polygon (A11, A64, A71, A72) derived from official
 * NMDC/MoEFCC survey documentation for Bailadila Deposit-14.
 * 
 * Visual Style:
 * - Subtle slate/cyan perimeter line (width: 2px)
 * - Restrained translucent fill
 * - Reference label anchored at northern apex
 * - Professional industrial aesthetic; clearly labeled as reference-only.
 */

import { PolygonLayer } from '@deck.gl/layers';
import { TextLayer } from '@deck.gl/layers';
import * as TerrainCalibration from '../../../map/calibration/terrainCalibration';
import {
  deposit14ReferencePolygon,
  DEPOSIT_14_REFERENCE_CENTER,
  DEPOSIT_14_METADATA
} from '../../../data/deposit14Geo';

export function createDeposit14BoundaryLayers(visible: boolean) {
  if (!visible) return [];

  // 1. Reference Polygon Fill & Boundary Stroke
  const polygonLayer = new PolygonLayer({
    id: 'layer-deposit14-reference-boundary',
    data: [
      {
        id: 'DEP-14-POLY',
        polygon: deposit14ReferencePolygon,
        label: DEPOSIT_14_METADATA.label,
      },
    ],
    pickable: true,
    stroked: true,
    filled: true,
    wireframe: false,
    lineWidthMinPixels: 2,
    getPolygon: (d: any) => d.polygon,
    getFillColor: [20, 45, 75, 40],            // Deep navy subtle translucent tint
    getLineColor: [56, 189, 248, 190],         // Industrial slate-cyan boundary line
    getLineWidth: 2,
    updateTriggers: {
      getPolygon: [],
    },
  });

  // 2. Reference Pillar Markers & Coordinate Label
  const labelLayer = new TextLayer({
    id: 'layer-deposit14-reference-label',
    data: [
      {
        text: 'DEP-14 GEOGRAPHIC REFERENCE • 4 DOCUMENTED POINTS • REFERENCE ONLY',
        coordinates: [DEPOSIT_14_REFERENCE_CENTER[0], 18.6265], // Positioned above northern crest
      },
    ],
    pickable: false,
    getPosition: (d: any) => d.coordinates,
    getText: (d: any) => d.text,
    getSize: 10,
    getColor: [148, 163, 184, 230],            // Crisp slate silver
    getAngle: 0,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom',
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontWeight: 700,
    characterSet: 'auto',
    background: true,
    getBackgroundColor: [10, 15, 26, 210],
    backgroundPadding: [6, 3, 6, 3],
  });

  return [polygonLayer, labelLayer, ...createCoordinateGridLayers()];
}

// Helper to create subtle coordinate grid labels
function createCoordinateGridLayers() {
  // Use terrain calibration to get corner geographic coordinates
  const corners = TerrainCalibration.getImageCornerCoordinates(); // [NW, NE, SE, SW]
  const center = [(corners[0][0] + corners[2][0]) / 2, (corners[0][1] + corners[2][1]) / 2];
  // Prepare label data for corners and center
  const labelData = [
    { text: `${corners[0][0].toFixed(3)}, ${corners[0][1].toFixed(3)}`, coordinates: corners[0] }, // NW
    { text: `${corners[1][0].toFixed(3)}, ${corners[1][1].toFixed(3)}`, coordinates: corners[1] }, // NE
    { text: `${corners[2][0].toFixed(3)}, ${corners[2][1].toFixed(3)}`, coordinates: corners[2] }, // SE
    { text: `${corners[3][0].toFixed(3)}, ${corners[3][1].toFixed(3)}`, coordinates: corners[3] }, // SW
    { text: `${center[0].toFixed(3)}, ${center[1].toFixed(3)}`, coordinates: center }, // Center
  ];
  const textLayer = new TextLayer({
    id: 'layer-deposit14-coordinate-grid',
    data: labelData,
    pickable: false,
    getPosition: (d: any) => d.coordinates,
    getText: (d: any) => d.text,
    getSize: 9,
    getColor: [200, 200, 200, 150], // subtle grey
    getAngle: 0,
    // omit getTextAnchor / getAlignmentBaseline to avoid type issue
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontWeight: 400,
    characterSet: 'auto',
    background: false,
  });
  return [textLayer];
}

