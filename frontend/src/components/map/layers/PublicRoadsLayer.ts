/**
 * MachineMind — Public Mapped Road & Track Layer
 * 
 * Purpose:
 * Renders verified public OpenStreetMap (OSM) service tracks and roads
 * around the Bailadila / Deposit-14 mountain sector.
 * 
 * Visual Style:
 * - Subtle, thin slate-blue dashed/solid linework
 * - Distinctly subordinate to the active simulated haul corridor
 * - Explicitly labeled: "PUBLIC MAPPED ROAD / TRACK • REFERENCE ONLY"
 * 
 * Attribution:
 * © OpenStreetMap contributors
 */

import { PathLayer, TextLayer } from '@deck.gl/layers';
import { PUBLIC_MAPPED_ROADS, type PublicRoadFeature } from '../../../data/publicRoadGeo';

export function createPublicRoadsLayers(visible: boolean, currentZoom = 14.5) {
  if (!visible || PUBLIC_MAPPED_ROADS.length === 0) return [];

  // 1. Subtle public track casing / underlay
  const trackCasingLayer = new PathLayer<PublicRoadFeature>({
    id: 'layer-public-roads-casing',
    data: PUBLIC_MAPPED_ROADS,
    pickable: false,
    widthUnits: 'pixels',
    widthMinPixels: 2,
    getPath: (d) => d.coordinates,
    getColor: [15, 23, 42, 180], // Deep slate shadow
    getWidth: 2.5,
    capRounded: true,
    jointRounded: true,
  });

  // 2. Primary public track line
  const trackLineLayer = new PathLayer<PublicRoadFeature>({
    id: 'layer-public-roads-line',
    data: PUBLIC_MAPPED_ROADS,
    pickable: true,
    widthUnits: 'pixels',
    widthMinPixels: 1.2,
    getPath: (d) => d.coordinates,
    getColor: [94, 115, 148, 170], // Muted industrial slate gray
    getWidth: 1.5,
    capRounded: true,
    jointRounded: true,
  });

  // 3. Technical Reference Callout Label (Only visible at closer zoom to prevent clutter)
  const showLabels = currentZoom >= 14.0;
  const labelData = showLabels
    ? [
        {
          id: 'LABEL-PUBLIC-ROADS',
          text: 'PUBLIC MAPPED TRACK • REFERENCE ONLY (OSM)',
          coordinates: [81.2338, 18.6146] as [number, number],
        },
      ]
    : [];

  const labelLayer = new TextLayer({
    id: 'layer-public-roads-label',
    data: labelData,
    pickable: false,
    getPosition: (d: any) => d.coordinates,
    getText: (d: any) => d.text,
    getSize: 9,
    getColor: [148, 163, 184, 190],
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 600,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'bottom',
    sizeUnits: 'pixels',
    background: true,
    getBackgroundColor: [10, 15, 26, 200],
    backgroundPadding: [4, 2],
  });

  return [trackCasingLayer, trackLineLayer, labelLayer];
}
