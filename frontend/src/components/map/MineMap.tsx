import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { getImageCornerCoordinates } from '../../map/calibration/terrainCalibration';

import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapboxOverlay } from '@deck.gl/mapbox';

import type { 
  LayerVisibilityState, 
  MapCameraState, 
  MapVehicle 
} from '../../types/map';
import type { RiskLevel } from '../../types/contract';
// import type { Feature } from 'geojson'; // removed unused import
import { 
  DEFAULT_MAP_CAMERA, 
  SAFETY_SCENE_CAMERA 
} from '../../map/mapConfig';
import { 
  baseMapProvider, 
  type BasemapStatus 
} from '../../map/providers/GeographicBaseMapProvider';
import { LayerControl } from './LayerControl';
import { MapControls } from './MapControls';
import { createVehiclesLayers } from './layers/VehiclesLayer';
import { createHazardFeaturesLayers } from './layers/HazardFeaturesLayer';


// Active route + hazard source (derived from REAL_HAUL_CORRIDOR_PATH)
import { ACTIVE_HAUL_PATH, ACTIVE_HAUL_HAZARDS } from '../../data/activeHaulRoute';

// GeoJSON for the native (Mapbox) vehicle marker debug layer: follows live vehicle positions
const vehiclesToGeoJson = (list: MapVehicle[]) => ({
  type: 'FeatureCollection' as const,
  features: list.map((v) => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: v.coordinates },
    properties: { vehicle: v.id },
  })),
});


interface MineMapProps {
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string | null) => void;
  vehicles?: MapVehicle[];
  riskLevel?: RiskLevel;
  headwayMeters?: number;
  ttcSeconds?: number;
  relativeSpeedMs?: number;
  isPlaying?: boolean;
  onCameraChange?: (camera: MapCameraState) => void;
  /** Conflict corridor endpoints: [[hemm01_lng, hemm01_lat], [hemm02_lng, hemm02_lat]] */
  conflictLineCoordinates?: [[number, number], [number, number]] | null;
  /** Conflict lifecycle phase — corridor shown only when PREDICTED or ACTIVE */
  conflictPhase?: string;
}

// Default visibility matching the reference image
const DEFAULT_LAYER_VISIBILITY: LayerVisibilityState = {
  baseMap: true,
  deposit14Boundary: false, // Turn off boundary outline so generated mine map is clear
  publicRoads: false, // Unchecked in reference image
  benches: false, // Unchecked in reference image
  haulRoads: true, // Checked
  routeSections: true, // Checked
  hazardFeatures: true, // Checked
  loadingZones: false,
  dumpZones: false,
  restrictedZones: false,
  blindCurves: false,
  reducedVisibility: false, // Prohibited
  vehicles: true, // Checked
  riskHalos: true, // Checked
  vehicleTrails: false,
  alertPins: false,
  historicalIncidents: false,
};

export const MineMap: React.FC<MineMapProps> = ({
  selectedVehicleId,
  onSelectVehicle,
  vehicles: vehiclesProp,
  riskLevel = 'LOW',
  headwayMeters = 142,
  ttcSeconds = 8.7,
  relativeSpeedMs = 1.6,
  isPlaying = false,
  onCameraChange,
  conflictLineCoordinates = null,
  conflictPhase = 'IDLE',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  const overlayRef = useRef<MapboxOverlay | null>(null);
  // Latest deck.gl layers / vehicles, readable from the one-time map 'load' handler
  const deckLayersRef = useRef<any[]>([]);
  const vehiclesRef = useRef<MapVehicle[]>([]);
  // Track whether initial fitBounds has been performed
  const initialFitDoneRef = useRef(false);

  // Layer Visibility State
  const [layerVisibility, setLayerVisibility] = useState<LayerVisibilityState>(
    DEFAULT_LAYER_VISIBILITY
  );

  // Live Camera State for HUD
  const [cameraState, setCameraState] = useState<MapCameraState>(DEFAULT_MAP_CAMERA);

  // Basemap Tile Connectivity Status
  const [basemapStatus, setBasemapStatus] = useState<BasemapStatus>('CONNECTING');

  // Follow Selected Vehicle state
  const [isFollowing, setIsFollowing] = useState<boolean>(false);

  // Map style type: 'map' | 'satellite' | 'terrain'
  const [mapType, setMapType] = useState<'map' | 'satellite' | 'terrain'>('map');
  // ── TEMPORARY Road Coordinate Picker (DEV-only) ─────────────────────────
  const [pickerActive, setPickerActive] = useState(false);
  const [pickerPoints, setPickerPoints] = useState<[number, number][]>([]);
  const pickerMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const pickerActiveRef = useRef(false);  // readable from stable map-click closure
  // Keep ref in sync with state
  useEffect(() => { pickerActiveRef.current = pickerActive; }, [pickerActive]);
  // (legacy digitizationMode aliases removed — picker panel is fully replaced)

  // Layer Drawer visibility state
  const [showLayerDrawer, setShowLayerDrawer] = useState<boolean>(true);

  // Vehicles Data (live telemetry-derived positions; no legacy fallback route)
  const vehicles: MapVehicle[] = useMemo(() => {
    return vehiclesProp ?? [];
  }, [vehiclesProp]);

  // Keep the native debug vehicle markers on the live vehicle positions
  useEffect(() => {
    vehiclesRef.current = vehicles;
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      const src = map.getSource('debug-native-vehicles') as mapboxgl.GeoJSONSource | undefined;
      src?.setData(vehiclesToGeoJson(vehicles) as any);
    } catch {
      // style not ready yet; the load handler seeds the source from vehiclesRef
    }
  }, [vehicles]);

  // Follow Selected Vehicle camera updater
  useEffect(() => {
    if (!isFollowing || !selectedVehicleId || !mapInstanceRef.current) return;
    const target = vehicles.find((v) => v.id === selectedVehicleId);
    if (target) {
      mapInstanceRef.current.easeTo({
        center: target.coordinates,
        duration: 350,
      });
    }
  }, [isFollowing, selectedVehicleId, vehicles]);

  // Subscribe to basemap provider status
  useEffect(() => {
    const unsubscribe = baseMapProvider.subscribeStatus((status) => {
      setBasemapStatus(status);
    });
    return unsubscribe;
  }, []);

  // Layer Toggles
  const handleToggleLayer = useCallback((layerKey: keyof LayerVisibilityState) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerKey]: !prev[layerKey],
    }));
  }, []);

  // Dynamic Vehicle Layers (Matching reference visual: circular markers, callouts, headway chip)
  const vehicleLayers = useMemo(() => {
    return createVehiclesLayers({
      vehicles,
      selectedVehicleId,
      onSelectVehicle: (id) => onSelectVehicle(id),
      showVehicles: layerVisibility.vehicles,
      showHalos: layerVisibility.riskHalos,
      riskLevel,
      headwayMeters,
      ttcSeconds,
      relativeSpeedMs,
      currentZoom: cameraState.zoom,
    });
  }, [
    vehicles,
    selectedVehicleId,
    onSelectVehicle,
    layerVisibility.vehicles,
    layerVisibility.riskHalos,
    riskLevel,
    headwayMeters,
    ttcSeconds,
    relativeSpeedMs,
    cameraState.zoom,
  ]);

  // Composite deck.gl layer list
  // Hazard feature layers
  const hazardLayers = useMemo(() => {
    return createHazardFeaturesLayers({
      hazards: ACTIVE_HAUL_HAZARDS,
      visible: layerVisibility.hazardFeatures,
    });
  }, [layerVisibility.hazardFeatures]);

  // Composite deck.gl layer list includes static, vehicle, and hazard layers
  const deckLayers = useMemo(() => {
    return [...vehicleLayers, ...hazardLayers];
  }, [vehicleLayers, hazardLayers]);

  // Initialize Mapbox GL (or fallback to MapLibre) & Deck.gl MapboxOverlay
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const token = import.meta.env.VITE_MAPBOX_TOKEN?.trim();
    let map: any;

    if (token) {
      mapboxgl.accessToken = token;
      const styleUrl = 'mapbox://styles/mapbox/standard-satellite';
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: styleUrl,
        center: ACTIVE_HAUL_PATH[0],
        zoom: 16.2,
        minZoom: 5,
        maxZoom: 22,
        pitch: 0,
        minPitch: 0,
        maxPitch: 75,
        bearing: 0,
        attributionControl: false,
        // Removed restrictive maxBounds to allow regional view
      });
    } else {
      console.warn('Mapbox token missing; cannot initialize map');
      baseMapProvider.setStatus('OFFLINE', 'Missing Mapbox token');
      return;
    }

    (window as any).__mapInstance = map;

    map.on('error', (e: any) => {
      console.error('Map error:', e);
      const msg = e?.error?.message || (e as any)?.message || String(e);
      baseMapProvider.setStatus('OFFLINE', `Map error: ${msg}`);
    });

    map.on('load', () => {
      baseMapProvider.setStatus('ONLINE');
      // Add calibrated mine image source and raster layer
      map.addSource('mine-reference', {
        type: 'image',
        url: '/mine-map-reference.png',
        coordinates: getImageCornerCoordinates(),
      } as any);
      map.addLayer({
        id: 'mine-reference-layer',
        type: 'raster',
        source: 'mine-reference',
        paint: { 'raster-opacity': 0 },
      } as any);

// Initial image fitBounds removed – will fit to real haul road after route is added
// Initial fitBounds will be handled by top-level ref

        // Add blind curve route source and line layer
        const blindCurveGeojson = {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: ACTIVE_HAUL_PATH,
          },
        } as any;
        map.addSource('blind-curve-route', {
          type: 'geojson',
          data: blindCurveGeojson,
        });
        map.addLayer({
          id: 'blind-curve-route-line',
          type: 'line',
          source: 'blind-curve-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#ff9900', 'line-width': 3, 'line-opacity': 0.9 },
        });
        // Ensure the route line is rendered above other layers (e.g., reference raster)
        map.moveLayer('blind-curve-route-line');
// Native vehicle markers (debug aid): seeded from live vehicle positions and kept in sync
// by the [vehicles] effect above (no hardcoded coordinates).
map.addSource('debug-native-vehicles', {
  type: 'geojson',
  data: vehiclesToGeoJson(vehiclesRef.current),
});
map.addLayer({
  id: 'debug-native-vehicles-layer',
  type: 'circle',
  source: 'debug-native-vehicles',
  paint: {
    'circle-radius': 10,
    'circle-color': '#00ff00',
    'circle-stroke-color': '#ffffff',
    'circle-stroke-width': 3,
  },
});

        // ── Conflict corridor (Mapbox native GeoJSON source + dashed red line) ────
        // This is a live-updated source representing the predicted conflict path
        // between HEMM-01 and HEMM-02. It is NOT a physical sensor measurement.
        const emptyLineGeoJson = {
          type: 'Feature' as const,
          geometry: {
            type: 'LineString' as const,
            coordinates: [] as [number, number][],
          },
          properties: {},
        };
        map.addSource('conflict-corridor', {
          type: 'geojson',
          data: emptyLineGeoJson,
        });
        map.addLayer({
          id: 'conflict-corridor-line',
          type: 'line',
          source: 'conflict-corridor',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
            visibility: 'none',  // hidden by default; shown via setLayoutProperty
          },
          paint: {
            'line-color': '#ff2020',
            'line-width': 4,
            'line-opacity': 0.85,
            'line-dasharray': [4, 3],
          },
        });

        // Deck.gl overlay (vehicles + hazard layers). Non-interleaved: draws on its own canvas
        // above the basemap, so it is independent of the Mapbox style.
        const overlay = new MapboxOverlay({ interleaved: false, layers: deckLayersRef.current });
        map.addControl(overlay as any);
        overlayRef.current = overlay;

        // Fit map to the full blind‑curve route on first load
        if (!initialFitDoneRef.current) {
          const bounds = new mapboxgl.LngLatBounds();
          ACTIVE_HAUL_PATH.forEach(([lng, lat]) => {
            bounds.extend([lng, lat]);
          });
          console.log('[FitBounds] fitting to blind-curve route');
          map.fitBounds(bounds, { padding: 100, duration: 0, maxZoom: 17 });
          initialFitDoneRef.current = true;
        }

      // Section label markers removed (no longer applicable for blind curve route)
    });

    map.on('dragstart', () => {
      setIsFollowing(false);
    });



    const updateCameraHud = () => {
      const center = map.getCenter();
      const nextCam: MapCameraState = {
        longitude: center.lng,
        latitude: center.lat,
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      };
      setCameraState(nextCam);
      onCameraChange?.(nextCam);
    };
    map.on('move', updateCameraHud);

    mapInstanceRef.current = map;
    // deck.gl overlay is created in the map 'load' handler

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.off('move', updateCameraHud);
      map.remove();
      mapInstanceRef.current = null;
      overlayRef.current = null;
    };
  }, []); // end of map init effect

  // ── Keyboard toggle: press "P" to enable/disable picker ──────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'p' || e.key === 'P') {
        // Ignore if focus is inside an input / textarea
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
        setPickerActive((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── Picker click handler: captures map.unproject() coordinates ────────────
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const clickHandler = (e: mapboxgl.MapMouseEvent) => {
      if (!pickerActiveRef.current) return;
      // Use map.unproject for exact geographic coordinates
      const lngLat = map.unproject(e.point);
      const coord: [number, number] = [lngLat.lng, lngLat.lat];

      setPickerPoints((prev) => {
        const nextPoints = [...prev, coord];
        const pointIndex = nextPoints.length - 1;

        // Add a numbered DOM marker
        const el = document.createElement('div');
        el.style.cssText = [
          'width:22px', 'height:22px', 'border-radius:50%',
          'background:#ff3300', 'border:2px solid #fff',
          'display:flex', 'align-items:center', 'justify-content:center',
          'color:#fff', 'font-size:10px', 'font-weight:700',
          'font-family:monospace', 'box-shadow:0 1px 4px rgba(0,0,0,0.7)',
          'cursor:default', 'user-select:none',
        ].join(';');
        el.textContent = String(pointIndex);

        const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([coord[0], coord[1]])
          .addTo(map);
        pickerMarkersRef.current.push(marker);

        return nextPoints;
      });
    };

    map.on('click', clickHandler);
    return () => { map.off('click', clickHandler); };
  // Intentionally stable — the ref guards the active-check inside
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInstanceRef.current]);

  // ── Picker helpers ────────────────────────────────────────────────────────
  const handlePickerClear = useCallback(() => {
    pickerMarkersRef.current.forEach((m) => m.remove());
    pickerMarkersRef.current = [];
    setPickerPoints([]);
  }, []);

  const handlePickerClose = useCallback(() => {
    setPickerActive(false);
  }, []);

  const handlePickerCopy = useCallback(() => {
    const lines = pickerPoints
      .map(([lng, lat]) => `  [${lng.toFixed(8)}, ${lat.toFixed(8)}],`)
      .join('\n');
    const text = `const ROAD_CENTERLINE: [number, number][] = [\n${lines}\n];`;
    navigator.clipboard.writeText(text).catch(() => {
      // Fallback: create a temporary textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }, [pickerPoints]);

  // Change cursor to crosshair while picker is active
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (pickerActive) {
      map.getCanvas().style.cursor = 'crosshair';
    } else {
      map.getCanvas().style.cursor = '';
    }
  }, [pickerActive]);

  // Update Deck.gl overlay layers when layers change
  useEffect(() => {
    deckLayersRef.current = deckLayers;
    if (overlayRef.current) {
      overlayRef.current.setProps({
        layers: deckLayers,
      });
    }
  }, [deckLayers]);

  // ── Update conflict corridor source and visibility ──────────────────────────
  const corridorActive = conflictPhase === 'PREDICTED' || conflictPhase === 'ACTIVE';
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    try {
      const src = map.getSource('conflict-corridor') as mapboxgl.GeoJSONSource | undefined;
      if (!src) return;

      if (corridorActive && conflictLineCoordinates) {
        // Update the LineString with the current vehicle positions
        src.setData({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: conflictLineCoordinates,
          },
          properties: {},
        } as any);
        map.setLayoutProperty('conflict-corridor-line', 'visibility', 'visible');
      } else {
        // Hide corridor: clear coordinates and set invisible
        src.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [] },
          properties: {},
        } as any);
        map.setLayoutProperty('conflict-corridor-line', 'visibility', 'none');
      }
    } catch {
      // Map style not ready yet — safe to ignore
    }
  }, [corridorActive, conflictLineCoordinates]);

  // Camera Actions
  const handleResetView = useCallback(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo({
      center: [SAFETY_SCENE_CAMERA.longitude, SAFETY_SCENE_CAMERA.latitude],
      zoom: SAFETY_SCENE_CAMERA.zoom,
      pitch: SAFETY_SCENE_CAMERA.pitch,
      bearing: SAFETY_SCENE_CAMERA.bearing,
      duration: 1200,
    });
  }, []);

  const handleZoomIn = useCallback(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.zoomIn({ duration: 300 });
  }, []);

  const handleZoomOut = useCallback(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.zoomOut({ duration: 300 });
  }, []);

  const handleTogglePitch = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const currentPitch = mapInstanceRef.current.getPitch();
    mapInstanceRef.current.easeTo({
      pitch: currentPitch > 25 ? 0 : 54,
      duration: 600,
    });
  }, []);

  const handleFocusSafetyScene = useCallback(() => {
    if (!mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo({
      center: [SAFETY_SCENE_CAMERA.longitude, SAFETY_SCENE_CAMERA.latitude],
      zoom: SAFETY_SCENE_CAMERA.zoom,
      pitch: SAFETY_SCENE_CAMERA.pitch,
      bearing: SAFETY_SCENE_CAMERA.bearing,
      duration: 1000,
    });
  }, []);

  const handleToggleFollow = useCallback(() => {
    setIsFollowing((prev) => !prev);
  }, []);

  const handleSelectMapType = useCallback((type: 'map' | 'satellite' | 'terrain') => {
    setMapType(type);
    if (!mapInstanceRef.current) return;
    if (type === 'satellite') {
        mapInstanceRef.current.setStyle('mapbox://styles/mapbox/standard-satellite');
      } else {
        // Fallback to a basic Mapbox style; adjust as needed
        mapInstanceRef.current.setStyle('mapbox://styles/mapbox/standard');
      }
  }, []);

  return (
    <div style={styles.container}>
      {/* MapLibre DOM Node */}
      <div ref={mapContainerRef} style={styles.mapCanvas} tabIndex={0} />

      {/* Floating Layer Control Card (Matches reference image) */}
      {showLayerDrawer && (
        <LayerControl
          visibility={layerVisibility}
          onToggleLayer={handleToggleLayer}
        />
      )}

      {/* Interactive Map HUD & Toolbar (Compass, Scale Bar, Map Style, Zoom buttons) */}
      <MapControls
        camera={cameraState}
        onResetView={handleResetView}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onTogglePitch={handleTogglePitch}
        onFocusSafetyScene={handleFocusSafetyScene}
        selectedVehicleId={selectedVehicleId}
        onClearSelection={() => onSelectVehicle(null)}
        isFollowing={isFollowing}
        onToggleFollow={handleToggleFollow}
        basemapStatus={basemapStatus}
        attribution={baseMapProvider.getAttribution()}
        isSimulating={isPlaying}
        mapType={mapType}
        onSelectMapType={handleSelectMapType}
        onToggleLayers={() => setShowLayerDrawer((prev) => !prev)}
      />

      {/* ⚠ Conflict corridor overlay label — visible only while PREDICTED or ACTIVE */}
      {corridorActive && (
        <div style={styles.conflictCorridorLabel}>
          <span style={styles.conflictCorridorIcon}>⚠</span>
          <span> ONCOMING CONFLICT</span>
          <div style={styles.conflictCorridorSubLabel}>Predicted conflict corridor</div>
        </div>
      )}

{/* ── TEMPORARY ROAD COORDINATE PICKER (DEV-only) ────────────────────── */}
      {import.meta.env.DEV && pickerActive && (
        <div style={pickerStyles.panel}>
          {/* Warning header */}
          <div style={pickerStyles.header}>
            ⚠ TEMPORARY ROAD COORDINATE PICKER
          </div>
          <div style={pickerStyles.hint}>
            Press <kbd style={pickerStyles.kbd}>P</kbd> to toggle · Click road to capture
          </div>

          {/* Live point list */}
          <div style={pickerStyles.pointList}>
            {pickerPoints.length === 0 && (
              <div style={pickerStyles.empty}>No points yet — click on the road</div>
            )}
            {pickerPoints.map(([lng, lat], i) => (
              <div key={i} style={pickerStyles.pointRow}>
                <span style={pickerStyles.ptIndex}>#{i}</span>
                <span style={pickerStyles.ptCoord}>
                  [{lng.toFixed(8)}, {lat.toFixed(8)}]
                </span>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div style={pickerStyles.summary}>
            {pickerPoints.length} point{pickerPoints.length !== 1 ? 's' : ''} captured
          </div>

          {/* Actions */}
          <div style={pickerStyles.actions}>
            <button style={pickerStyles.btnCopy} onClick={handlePickerCopy}
              disabled={pickerPoints.length === 0}>
              COPY ALL POINTS
            </button>
            <button style={pickerStyles.btnClear} onClick={handlePickerClear}
              disabled={pickerPoints.length === 0}>
              CLEAR POINTS
            </button>
            <button style={pickerStyles.btnClose} onClick={handlePickerClose}>
              CLOSE PICKER
            </button>
          </div>
        </div>
      )}

      {/* Picker inactive hint (DEV only) */}
      {import.meta.env.DEV && !pickerActive && (
        <div style={pickerStyles.badge}>
          Press <kbd style={pickerStyles.kbd}>P</kbd> for Road Picker
        </div>
      )}
    </div>
  );
};

// ── Picker panel styles (all self-contained) ─────────────────────────────────
const pickerStyles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 320,
    maxHeight: '72vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(10, 14, 22, 0.96)',
    border: '1.5px solid #ff6600',
    borderRadius: 8,
    color: '#e8e8e8',
    fontFamily: 'monospace',
    fontSize: 12,
    zIndex: 9999,
    boxShadow: '0 4px 24px rgba(255,102,0,0.35)',
    overflow: 'hidden',
  },
  header: {
    background: 'rgba(255,80,0,0.22)',
    color: '#ff9933',
    fontWeight: 700,
    fontSize: 11,
    letterSpacing: '0.06em',
    padding: '7px 12px',
    borderBottom: '1px solid rgba(255,102,0,0.4)',
  },
  hint: {
    padding: '5px 12px',
    color: '#aaa',
    fontSize: 11,
    borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  kbd: {
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: 3,
    padding: '1px 5px',
    fontFamily: 'monospace',
    fontSize: 11,
    color: '#fff',
  },
  pointList: {
    overflowY: 'auto',
    flex: 1,
    padding: '4px 0',
    maxHeight: '46vh',
  },
  pointRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '3px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  ptIndex: {
    color: '#ff9933',
    minWidth: 28,
    fontWeight: 700,
  },
  ptCoord: {
    color: '#c8ffc8',
    fontSize: 11,
  },
  empty: {
    color: '#666',
    padding: '10px 12px',
    fontStyle: 'italic',
  },
  summary: {
    padding: '5px 12px',
    color: '#888',
    fontSize: 11,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  actions: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '8px 12px 10px',
    borderTop: '1px solid rgba(255,102,0,0.3)',
  },
  btnCopy: {
    background: '#ff6600',
    color: '#fff',
    border: 'none',
    borderRadius: 5,
    padding: '7px 0',
    fontWeight: 700,
    fontSize: 12,
    cursor: 'pointer',
    letterSpacing: '0.05em',
  },
  btnClear: {
    background: 'rgba(255,255,255,0.08)',
    color: '#ccc',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 5,
    padding: '6px 0',
    fontSize: 12,
    cursor: 'pointer',
  },
  btnClose: {
    background: 'transparent',
    color: '#888',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 5,
    padding: '5px 0',
    fontSize: 11,
    cursor: 'pointer',
  },
  badge: {
    position: 'absolute',
    bottom: 60,
    right: 14,
    background: 'rgba(10,14,22,0.82)',
    border: '1px solid rgba(255,102,0,0.4)',
    color: '#ff9933',
    fontFamily: 'monospace',
    fontSize: 11,
    borderRadius: 5,
    padding: '4px 10px',
    zIndex: 9998,
    pointerEvents: 'none',
  },
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#070B12',
    display: 'flex',
  },
  mapCanvas: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
  },
  conflictCorridorLabel: {
    position: 'absolute',
    top: 16,
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(200, 0, 0, 0.88)',
    color: '#fff',
    fontWeight: 700,
    fontSize: '13px',
    letterSpacing: '0.04em',
    padding: '6px 16px',
    borderRadius: '6px',
    zIndex: 20,
    pointerEvents: 'none',
    textAlign: 'center',
    boxShadow: '0 2px 12px rgba(200,0,0,0.5)',
    border: '1.5px solid rgba(255,80,80,0.7)',
    animation: 'pulseRed 1.2s ease-in-out infinite',
  },
  conflictCorridorIcon: {
    fontSize: '15px',
  },
  conflictCorridorSubLabel: {
    fontSize: '10px',
    fontWeight: 400,
    opacity: 0.85,
    marginTop: '2px',
  },
};
