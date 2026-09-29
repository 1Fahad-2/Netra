import React from 'react';
import { 
  Compass, 
  Plus, 
  Minus, 
  Box, 
  Layers
} from 'lucide-react';
import type { MapCameraState } from '../../types/map';
import type { BasemapStatus } from '../../map/providers/GeographicBaseMapProvider';

interface MapControlsProps {
  camera: MapCameraState;
  onResetView: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onTogglePitch: () => void;
  onFocusBailadila?: () => void;
  onFocusDeposit14?: () => void;
  onFocusSafetyScene?: () => void;
  selectedVehicleId?: string | null;
  onClearSelection?: () => void;
  isFollowing?: boolean;
  onToggleFollow?: () => void;
  basemapStatus?: BasemapStatus;
  attribution?: string;
  isSimulating?: boolean;
  mapType?: 'map' | 'satellite' | 'terrain';
  onSelectMapType?: (type: 'map' | 'satellite' | 'terrain') => void;
  onToggleLayers?: () => void;
}

export const MapControls: React.FC<MapControlsProps> = ({
  camera,
  onZoomIn,
  onZoomOut,
  onTogglePitch,
  attribution = 'NETRA Mine Safety Command Center • Generated Open-Cast Mine Map',
  mapType = 'satellite',
  onSelectMapType,
  onToggleLayers,
}) => {
  return (
    <>
      {/* Top Right: Map Style Selector Pill (Map | Satellite | Terrain) */}
      <div style={styles.topRightControls}>
        <div style={styles.stylePillContainer}>
          <button
            style={{
              ...styles.stylePillBtn,
              ...(mapType === 'map' ? styles.stylePillBtnActive : {}),
            }}
            onClick={() => onSelectMapType?.('map')}
          >
            Map
          </button>
          <button
            style={{
              ...styles.stylePillBtn,
              ...(mapType === 'satellite' ? styles.stylePillBtnActive : {}),
            }}
            onClick={() => onSelectMapType?.('satellite')}
          >
            Satellite
          </button>
          <button
            style={{
              ...styles.stylePillBtn,
              ...(mapType === 'terrain' ? styles.stylePillBtnActive : {}),
            }}
            onClick={() => onSelectMapType?.('terrain')}
          >
            Terrain
          </button>
        </div>
      </div>

      {/* Bottom Left: Circular Compass & Scale Bar */}
      <div style={styles.bottomLeftControls}>
        <div style={styles.compassCircle} title={`Bearing: ${Math.round(camera.bearing)}°`}>
          <Compass 
            size={18} 
            color="#38BDF8" 
            style={{ transform: `rotate(${-camera.bearing}deg)`, transition: 'transform 0.1s linear' }} 
          />
          <span style={styles.compassNorthText}>N</span>
        </div>

        {/* Scale Bar */}
        <div style={styles.scaleBarContainer}>
          <div style={styles.scaleBarLine}>
            <div style={styles.scaleTickLeft} />
            <div style={styles.scaleTickMid1} />
            <div style={styles.scaleTickMid2} />
            <div style={styles.scaleTickRight} />
          </div>
          <div style={styles.scaleLabels}>
            <span>0</span>
            <span>100</span>
            <span>200</span>
            <span>300 m</span>
          </div>
        </div>
      </div>

      {/* Bottom Right: GIS Floating Controls Toolbar */}
      <div style={styles.bottomRightToolbar}>
        <button 
          style={styles.toolBtn} 
          onClick={onZoomIn} 
          title="Zoom In" 
          aria-label="Zoom In"
        >
          <Plus size={15} color="#F1F5F9" />
        </button>

        <button 
          style={styles.toolBtn} 
          onClick={onZoomOut} 
          title="Zoom Out" 
          aria-label="Zoom Out"
        >
          <Minus size={15} color="#F1F5F9" />
        </button>

        <button 
          style={styles.toolBtn} 
          onClick={onTogglePitch} 
          title="Toggle 3D Perspective" 
          aria-label="Toggle 3D"
        >
          <Box size={14} color="#F1F5F9" />
        </button>

        {onToggleLayers && (
          <button 
            style={styles.toolBtn} 
            onClick={onToggleLayers} 
            title="Toggle Map Layers" 
            aria-label="Toggle Layers"
          >
            <Layers size={14} color="#F1F5F9" />
          </button>
        )}
      </div>

      {/* Discreet Tile Attribution */}
      <div style={styles.attributionBadge}>
        <span>{attribution}</span>
      </div>
    </>
  );
};

const styles: Record<string, React.CSSProperties> = {
  topRightControls: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    zIndex: 15,
  },
  stylePillContainer: {
    display: 'flex',
    alignItems: 'center',
    backgroundColor: 'rgba(9, 14, 23, 0.88)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '8px',
    padding: '3px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
  },
  stylePillBtn: {
    backgroundColor: 'transparent',
    border: 'none',
    color: '#94A3B8',
    padding: '5px 12px',
    fontSize: '11px',
    fontWeight: 600,
    fontFamily: 'Inter, system-ui, sans-serif',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  stylePillBtnActive: {
    backgroundColor: '#2563EB',
    color: '#FFFFFF',
    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.4)',
  },
  bottomLeftControls: {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    zIndex: 15,
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  compassCircle: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'rgba(9, 14, 23, 0.88)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
    position: 'relative',
  },
  compassNorthText: {
    fontSize: '8px',
    fontWeight: 700,
    color: '#38BDF8',
    position: 'absolute',
    top: '2px',
  },
  scaleBarContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    backgroundColor: 'rgba(9, 14, 23, 0.75)',
    backdropFilter: 'blur(8px)',
    padding: '4px 8px',
    borderRadius: '4px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
  },
  scaleBarLine: {
    width: '100px',
    height: '2px',
    backgroundColor: '#FFFFFF',
    position: 'relative',
    marginTop: '2px',
  },
  scaleTickLeft: {
    position: 'absolute',
    left: 0,
    top: '-3px',
    width: '1px',
    height: '5px',
    backgroundColor: '#FFFFFF',
  },
  scaleTickMid1: {
    position: 'absolute',
    left: '33px',
    top: '-2px',
    width: '1px',
    height: '4px',
    backgroundColor: '#FFFFFF',
  },
  scaleTickMid2: {
    position: 'absolute',
    left: '66px',
    top: '-2px',
    width: '1px',
    height: '4px',
    backgroundColor: '#FFFFFF',
  },
  scaleTickRight: {
    position: 'absolute',
    right: 0,
    top: '-3px',
    width: '1px',
    height: '5px',
    backgroundColor: '#FFFFFF',
  },
  scaleLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '8.5px',
    color: '#E2E8F0',
    fontFamily: 'monospace',
  },
  bottomRightToolbar: {
    position: 'absolute',
    bottom: '24px',
    right: '16px',
    zIndex: 15,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    backgroundColor: 'rgba(9, 14, 23, 0.88)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '6px',
    padding: '4px',
    boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
  },
  toolBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.12s ease',
  },
  attributionBadge: {
    position: 'absolute',
    bottom: '4px',
    right: '70px',
    zIndex: 10,
    fontSize: '9px',
    color: '#64748B',
    fontFamily: 'Inter, system-ui, sans-serif',
    pointerEvents: 'none',
  },
};
