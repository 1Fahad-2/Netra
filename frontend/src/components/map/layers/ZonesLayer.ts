import { PolygonLayer, TextLayer, ScatterplotLayer } from '@deck.gl/layers';
import type { MineZone } from '../../../types/map';

export function createZonesLayers(
  zones: MineZone[], 
  options: { loading: boolean; dump: boolean; restricted: boolean },
  _currentZoom = 14.5
) {
  const activeZones = zones.filter((z) => {
    if (z.type === 'LOADING') return options.loading;
    if (z.type === 'DUMP') return options.dump;
    if (z.type === 'RESTRICTED') return options.restricted;
    return false;
  });

  if (activeZones.length === 0) return [];

  // Zone perimeter boundaries and translucent fills
  const zonePolygonLayer = new PolygonLayer<MineZone>({
    id: 'layer-zones-polygons',
    data: activeZones,
    pickable: true,
    stroked: true,
    filled: true,
    wireframe: false,
    lineWidthMinPixels: 2,
    getPolygon: (d) => d.polygon,
    getFillColor: (d) => d.color,
    getLineColor: (d) => d.borderColor,
  });

  // Zone Center focal marker
  const zoneCenterLayer = new ScatterplotLayer<MineZone>({
    id: 'layer-zones-centers',
    data: activeZones,
    pickable: false,
    radiusUnits: 'meters',
    getRadius: 14,
    radiusMinPixels: 4,
    getPosition: (d) => [d.center[0], d.center[1]],
    getFillColor: (d) => d.borderColor,
    getLineColor: [10, 15, 26, 255],
    stroked: true,
    lineWidthMinPixels: 1.5,
  });

  // Zone Industrial Text Labels
  const zoneTextLayer = new TextLayer<MineZone>({
    id: 'layer-zones-labels',
    data: activeZones,
    pickable: false,
    getPosition: (d) => [d.center[0], d.center[1]],
    getText: (d) => d.label,
    getSize: 10,
    getColor: (d) => {
      if (d.type === 'RESTRICTED') return [239, 68, 68, 255];
      if (d.type === 'DUMP') return [245, 158, 11, 255];
      return [59, 130, 246, 255];
    },
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 700,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom',
    sizeUnits: 'pixels',
    backgroundColor: [10, 15, 26, 210],
    backgroundPadding: [5, 2],
  });

  return [zonePolygonLayer, zoneCenterLayer, zoneTextLayer];
}
