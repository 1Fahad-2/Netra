import { PolygonLayer, TextLayer } from '@deck.gl/layers';
import type { VisibilityRegion } from '../../../types/map';

export function createVisibilityLayers(
  regions: VisibilityRegion[], 
  visible: boolean,
  _currentZoom = 14.5
) {
  if (!visible || regions.length === 0) return [];

  // Subtle translucent atmospheric fog overlay (keeps vehicles clearly visible underneath)
  const fogPolygonLayer = new PolygonLayer<VisibilityRegion>({
    id: 'layer-visibility-fog',
    data: regions,
    pickable: false,
    stroked: true,
    filled: true,
    extruded: false,
    wireframe: false,
    lineWidthMinPixels: 1.2,
    getPolygon: (d) => d.polygon,
    getFillColor: [140, 165, 200, 35], // Subtle translucent blue-gray atmospheric fog
    getLineColor: [160, 190, 230, 90],
  });

  // Environmental Label: "REDUCED VISIBILITY (SIMULATED)"
  const fogLabelLayer = new TextLayer<VisibilityRegion>({
    id: 'layer-visibility-label',
    data: regions,
    pickable: false,
    getPosition: (d) => [d.center[0], d.center[1]],
    getText: (d) => `☁ ${d.label}`,
    getSize: 9,
    getColor: [180, 205, 240, 210],
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 600,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    sizeUnits: 'pixels',
    backgroundColor: [10, 15, 26, 200],
    backgroundPadding: [5, 2],
  });

  return [fogPolygonLayer, fogLabelLayer];
}
