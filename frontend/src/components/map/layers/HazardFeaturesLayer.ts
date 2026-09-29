import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { HazardFeature } from '../../../types/route';

interface HazardFeaturesLayerProps {
  hazards: HazardFeature[];
  visible: boolean;
}

/**
 * Hazard rendering — fully data-driven.
 *
 * Every position and label comes from the HazardFeature objects passed in
 * (currently the single active hazard BLIND_CURVE from src/data/activeHaulRoute.ts).
 * No coordinates or hazard names are hardcoded in this file.
 */
export function createHazardFeaturesLayers({
  hazards,
  visible,
}: HazardFeaturesLayerProps) {
  const activeHazards = hazards.filter((h) => h.active);
  if (!visible || activeHazards.length === 0) return [];

  // 1. Translucent hazard road zone: the stretch of route each hazard covers
  const hazardPathHighlight = new PathLayer<{ id: string; path: [number, number][] }>({
    id: 'layer-hazard-road-highlight',
    data: activeHazards
      .filter((h) => h.pathGeometry && h.pathGeometry.length > 1)
      .map((h) => ({ id: h.featureId, path: h.pathGeometry as [number, number][] })),
    pickable: false,
    widthUnits: 'meters',
    widthScale: 1,
    widthMinPixels: 8,
    getPath: (d) => d.path,
    getColor: [239, 68, 68, 140], // Translucent red hazard road zone
    getWidth: 22,
    capRounded: true,
    jointRounded: true,
  });

  // 2. Circular hazard warning marker at each hazard position
  const hazardPointsLayer = new ScatterplotLayer<HazardFeature>({
    id: 'layer-hazard-points',
    data: activeHazards,
    pickable: true,
    radiusUnits: 'meters',
    radiusMinPixels: 6,
    getRadius: 10,
    getPosition: (d) => [d.geometry[0], d.geometry[1]],
    getFillColor: (d) => (d.severity === 'CRITICAL' ? [239, 68, 68, 180] : [245, 158, 11, 180]),
    getLineColor: [255, 255, 255, 220],
    stroked: true,
    lineWidthMinPixels: 1.5,
  });

  // 3. Floating callout chip above each hazard marker: "⚠ <hazard name> Ahead"
  //    (no distance text: the distance to a hazard is vehicle-specific, so it is not baked into the map label)
  const calloutData = activeHazards.map((h) => ({
    id: `CHIP-${h.featureId}`,
    coordinates: [h.geometry[0], h.geometry[1]] as [number, number],
    title: `⚠ ${h.name} Ahead`,
  }));

  const calloutTitleLayer = new TextLayer<{ id: string; coordinates: [number, number]; title: string }>({
    id: 'layer-hazard-callout-title',
    data: calloutData,
    pickable: false,
    getPosition: (d) => d.coordinates,
    getText: (d) => d.title,
    getSize: 10,
    getColor: [245, 158, 11, 255],
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 700,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom',
    getPixelOffset: [0, -14], // sit just above the marker
    sizeUnits: 'pixels',
    backgroundColor: [15, 23, 42, 230],
    backgroundPadding: [6, 2],
  });

  return [hazardPathHighlight, hazardPointsLayer, calloutTitleLayer];
}
