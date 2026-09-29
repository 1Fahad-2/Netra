import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { BlindCurveFeature } from '../../../types/map';

export function createBlindCurvesLayers(
  blindCurves: BlindCurveFeature[], 
  visible: boolean,
  _currentZoom = 14.5
) {
  if (!visible || blindCurves.length === 0) return [];

  // 1. Accentuated hairpin curve path outline on the haul corridor
  const pathHighlightLayer = new PathLayer<BlindCurveFeature>({
    id: 'layer-blind-curves-path',
    data: blindCurves,
    pickable: false,
    widthUnits: 'meters',
    widthScale: 1,
    widthMinPixels: 4,
    getPath: (d) => d.curvePath,
    getColor: [230, 169, 58, 200], // Amber hazard chevron color
    getWidth: 20,
    capRounded: true,
    jointRounded: true,
  });

  // 2. Apex Warning Disc
  const apexDiscLayer = new ScatterplotLayer<BlindCurveFeature>({
    id: 'layer-blind-curves-apex',
    data: blindCurves,
    pickable: false,
    radiusUnits: 'meters',
    radiusMinPixels: 6,
    getRadius: 16,
    getPosition: (d) => [d.coordinates[0], d.coordinates[1]],
    getFillColor: [230, 169, 58, 50],
    getLineColor: [230, 169, 58, 240],
    stroked: true,
    lineWidthMinPixels: 2,
  });

  // 3. Technical Warning Label: "SIMULATED BLIND CURVE"
  const labelLayer = new TextLayer<BlindCurveFeature>({
    id: 'layer-blind-curves-label',
    data: blindCurves,
    pickable: false,
    getPosition: (d) => [d.coordinates[0], d.coordinates[1]],
    getText: (d) => `⚠ ${d.warningLabel}`,
    getSize: 10,
    getColor: [245, 158, 11, 255],
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 700,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom',
    sizeUnits: 'pixels',
    backgroundColor: [10, 15, 26, 220],
    backgroundPadding: [5, 3],
  });

  return [pathHighlightLayer, apexDiscLayer, labelLayer];
}
