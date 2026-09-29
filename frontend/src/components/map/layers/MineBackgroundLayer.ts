import { BitmapLayer } from '@deck.gl/layers';

export interface MineBackgroundLayerProps {
  visible?: boolean;
  opacity?: number;
}

/**
 * MachineMind — Calibrated Geographic Anchoring for Generated Mine Map Background
 *
 * IMPORTANT LEGAL & OPERATIONAL DISCLAIMER:
 * The attached generated open-cast mine image is an illustrative demonstration background
 * for the SIH 2026 Mine Safety Command Center. It is not an official NMDC survey raster
 * or certified GIS dataset. It is anchored into the Deposit-14 spatial reference frame
 * so that simulated interactive HEMM vehicles, haul corridors, and hazard markers
 * align with the visual open-cast pit.
 *
 * Quad coordinates: [top-left, top-right, bottom-right, bottom-left]
 */
// Calibrated 4-point quad coordinates matching camera viewport [bl, tl, tr, br]
export const GENERATED_MINE_MAP_BOUNDS: [
  [number, number],
  [number, number],
  [number, number],
  [number, number]
] = [
  [81.22751, 18.61214], // p0: Bottom-Left
  [81.23019, 18.62552], // p1: Top-Left
  [81.24864, 18.61543], // p2: Top-Right
  [81.23571, 18.60766], // p3: Bottom-Right
];

// Preloaded HTMLImageElement for instant WebGL texture instantiation
let cachedMineImage: HTMLImageElement | null = null;
function getMineImage(): HTMLImageElement | string {
  if (typeof window === 'undefined') return '/images/generated_mine_map.png';
  if (!cachedMineImage) {
    cachedMineImage = new Image();
    cachedMineImage.crossOrigin = 'anonymous';
    cachedMineImage.src = '/images/generated_mine_map.png';
  }
  return cachedMineImage;
}

export function createMineBackgroundLayer(props: MineBackgroundLayerProps = {}) {
  const { visible = true, opacity = 1.0 } = props;
  if (!visible) return [];

  const bitmapLayer = new BitmapLayer({
    id: 'layer-generated-mine-map-bitmap',
    bounds: GENERATED_MINE_MAP_BOUNDS,
    image: getMineImage(),
    opacity,
    pickable: false,
    desaturate: 0,
    transparentColor: [0, 0, 0, 0],
  });

  return [bitmapLayer];
}
