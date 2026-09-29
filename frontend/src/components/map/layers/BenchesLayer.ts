import { PolygonLayer, TextLayer } from '@deck.gl/layers';
import type { MineBench } from '../../../types/map';

export function createBenchesLayers(
  benches: MineBench[], 
  visible: boolean,
  currentZoom = 14.5
) {
  if (!visible) return [];

  const polygonLayer = new PolygonLayer<MineBench>({
    id: 'layer-benches-polygons',
    data: benches,
    pickable: false,
    stroked: true,
    filled: true,
    extruded: false,
    wireframe: false,
    lineWidthMinPixels: 1.5,
    getPolygon: (d) => d.polygon,
    getFillColor: (d) => d.fillColor,
    getLineColor: (d) => d.borderColor,
  });

  // Bench technical tier labels only appear at closer zoom to maintain a clean overview
  const showLabels = currentZoom >= 15.0;
  const textLayer = showLabels
    ? new TextLayer<MineBench>({
        id: 'layer-benches-labels',
        data: benches.filter((b) => b.level > 0 && b.level < 4),
        pickable: false,
        getPosition: (d) => [d.polygon[0][0], d.polygon[0][1], d.elevation + 2],
        getText: (d) => d.name,
        getSize: 9,
        getColor: [124, 138, 163, 180],
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 600,
        getTextAnchor: 'start',
        getAlignmentBaseline: 'center',
        sizeUnits: 'pixels',
        backgroundColor: [10, 15, 26, 190],
        backgroundPadding: [4, 2],
      })
    : null;

  return textLayer ? [polygonLayer, textLayer] : [polygonLayer];
}
