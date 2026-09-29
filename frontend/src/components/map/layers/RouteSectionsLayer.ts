import { PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { RouteSection, RouteSectionType, HazardSeverity } from '../../../types/route';

interface RouteSectionsLayerProps {
  sections: RouteSection[];
  visible: boolean;
  currentZoom?: number;
}

function getSectionColor(type: RouteSectionType, severity: HazardSeverity): [number, number, number, number] {
  if (severity === 'CRITICAL') return [239, 68, 68, 160];
  if (severity === 'HIGH') return [245, 158, 11, 150];
  if (type === 'DOWNHILL') return [56, 189, 248, 140];
  if (type === 'UPHILL') return [168, 85, 247, 140];
  return [100, 116, 139, 100];
}

export function createRouteSectionsLayers({
  sections,
  visible,
  currentZoom = 14.5,
}: RouteSectionsLayerProps) {
  if (!visible || sections.length === 0) return [];

  // 1. Subtle section track
  const sectionTrackLayer = new PathLayer<RouteSection>({
    id: 'layer-route-sections-track',
    data: sections,
    pickable: true,
    widthUnits: 'meters',
    widthScale: 1,
    widthMinPixels: 2,
    getPath: (d) => d.geometry,
    getColor: (d) => getSectionColor(d.type, d.severity),
    getWidth: 3.5,
    capRounded: true,
    jointRounded: true,
  });

  // 2. Section Boundary Joint Markers
  const boundaryNodes = sections.map((s, idx) => ({
    id: `NODE-${s.sectionId}`,
    coordinates: s.geometry[0],
    isFirst: idx === 0,
  }));

  const boundaryNodesLayer = new ScatterplotLayer({
    id: 'layer-route-sections-nodes',
    data: boundaryNodes,
    pickable: false,
    radiusUnits: 'meters',
    radiusMinPixels: 2.5,
    getRadius: 4,
    getPosition: (d: any) => d.coordinates,
    getFillColor: [15, 23, 42, 240],
    getLineColor: [148, 163, 184, 200],
    stroked: true,
    lineWidthMinPixels: 1.5,
  });

  // 3. Slope Indicators & Section Badges (Zoom-gated at zoom >= 14.2)
  const showDetail = currentZoom >= 14.2;
  const labelsData = showDetail
    ? sections.map((s) => {
        const midIdx = Math.floor(s.geometry.length / 2);
        const coord = s.geometry[midIdx] || s.geometry[0];
        
        let badgeText = s.sectionId;
        if (s.metadata?.gradePercent) {
          const sign = s.metadata.gradePercent > 0 ? '↑ +' : '↓ ';
          badgeText = `${sign}${s.metadata.gradePercent}% GRADE`;
        } else if (currentZoom >= 15.2) {
          badgeText = `${s.sectionId} · ${s.name}`;
        }

        return {
          id: `SEC-LABEL-${s.sectionId}`,
          text: badgeText,
          coordinates: coord,
        };
      })
    : [];

  const sectionLabelsLayer = new TextLayer({
    id: 'layer-route-sections-labels',
    data: labelsData,
    pickable: false,
    getPosition: (d: any) => d.coordinates,
    getText: (d: any) => d.text,
    getSize: 8.5,
    getColor: [203, 213, 225, 210],
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 600,
    getTextAnchor: 'middle',
    getAlignmentBaseline: 'center',
    sizeUnits: 'pixels',
    backgroundColor: [15, 23, 42, 200],
    backgroundPadding: [4, 2],
  });

  return [sectionTrackLayer, boundaryNodesLayer, sectionLabelsLayer];
}
