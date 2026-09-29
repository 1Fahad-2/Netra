import { PathLayer } from '@deck.gl/layers';
import type { HaulRoadSegment } from '../../../types/map';

export function createHaulRoadsLayers(
  haulRoads: HaulRoadSegment[], 
  visible: boolean,
  _currentZoom = 14.5
) {
  if (!visible || haulRoads.length === 0) return [];

  // 1. Road embankment shoulder / outer casing
  const roadCasingLayer = new PathLayer<HaulRoadSegment>({
    id: 'layer-haul-roads-casing',
    data: haulRoads,
    pickable: false,
    widthUnits: 'meters',
    widthScale: 1,
    widthMinPixels: 6,
    getPath: (d) => d.path,
    getColor: [28, 35, 48, 210], // Dark charcoal embankment
    getWidth: (d) => d.widthMeters,
    capRounded: true,
    jointRounded: true,
  });

  // 2. Main paved haul road surface
  const roadSurfaceLayer = new PathLayer<HaulRoadSegment>({
    id: 'layer-haul-roads-surface',
    data: haulRoads,
    pickable: false,
    widthUnits: 'meters',
    widthScale: 1,
    widthMinPixels: 4,
    getPath: (d) => d.path,
    getColor: [18, 24, 34, 240], // Compact dark ironstone road surface
    getWidth: (d) => Math.max(d.widthMeters - 4, 18),
    capRounded: true,
    jointRounded: true,
  });

  // 3. Prominent Yellow/Orange GIS Route Centerline (matches reference screenshot)
  const roadCenterlineLayer = new PathLayer<HaulRoadSegment>({
    id: 'layer-haul-roads-centerline',
    data: haulRoads,
    pickable: false,
    widthUnits: 'pixels',
    widthMinPixels: 3.2,
    getPath: (d) => d.path,
    getColor: [245, 158, 11, 240], // Vibrant Gold/Yellow Route Line
    getWidth: 3.2,
    capRounded: true,
    jointRounded: true,
  });

  return [roadCasingLayer, roadSurfaceLayer, roadCenterlineLayer];
}
