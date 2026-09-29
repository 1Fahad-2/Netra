import React from 'react';
import "../../styles/card.css";
import { 
  Truck, 
  AlertTriangle, 
  Compass, 
  Video, 
  RotateCcw, 
  Play, 
  Pause, 
  RotateCw 
} from 'lucide-react';
import type { RiskLevel, RecommendedAction } from '../../types/contract';
import {
  ACTIVE_BLIND_CURVE_HAZARD,
  formatDistanceToBlindCurve,
} from '../../data/activeHaulRoute';

interface BottomStripProps {
  isPlaying?: boolean;
  onStart?: () => void;
  onPause?: () => void;
  onReset?: () => void;
  progressSeconds?: number;
  riskLevel?: RiskLevel;
  recommendedAction?: RecommendedAction;
  distanceMeters?: number;
  ttcSeconds?: number;
  onSafetyScene?: () => void;
  onFollowVehicle?: () => void;
  onResetView?: () => void;
  camera?: import('../../types/map').MapCameraState;
  selectedVehicleId?: string;
  snapshot?: import('../../services/demoSimulation').SimulationTelemetrySnapshot;
  onSelectVehicle?: (vehicleId: string) => void;
  telemetryMap?: Record<string, import('../../types/contract').VehicleTelemetry>;
}

export const BottomStrip: React.FC<BottomStripProps> = ({
  isPlaying = false,
  onStart,
  onPause,
  onReset,
  onSafetyScene,
  onFollowVehicle,
  onResetView,
  camera,
  selectedVehicleId,
  snapshot,
  onSelectVehicle,
  telemetryMap,
}) => {
  // Derive data mode: show LIVE HARDWARE when at least one vehicle carries
  // hardware/physical telemetry (data_mode set by the backend hardware adapter).
  const isLiveHardware = Object.values(telemetryMap ?? {}).some(
    (t) => t.data_mode === 'PHYSICAL_TESTBED' || t.data_mode === 'LIVE'
  );
  return (
    <footer style={styles.footer} aria-label="Operational Status & Bottom Controls">
      {/* Card 1: Fleet Overview */}
      <div style={styles.card}>
        <span style={styles.cardTitle}>Fleet Overview</span>
        <div style={styles.fleetRow}>
          <div
            className={`card-base ${selectedVehicleId === 'HEMM-01' ? 'card-base-selected' : ''}`}
            onClick={() => onSelectVehicle?.('HEMM-01')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, padding: '6px 8px' }}
          >
            <div style={styles.truckGreen}>
              <Truck size={14} color="#22C55E" />
            </div>
            <div style={styles.fleetInfo}>
              <span style={styles.fleetId}>HEMM-01</span>
              <span style={styles.fleetSpeed}>{snapshot?.hemm01?.speedKmh ?? 22} km/h</span>
            </div>
            <span style={styles.dotGreen} />
          </div>

          <div
            className={`card-base ${selectedVehicleId === 'HEMM-02' ? 'card-base-selected' : ''}`}
            onClick={() => onSelectVehicle?.('HEMM-02')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, padding: '6px 8px' }}
          >
            <div style={styles.truckBlue}>
              <Truck size={14} color="#38BDF8" />
            </div>
            <div style={styles.fleetInfo}>
              <span style={styles.fleetId}>HEMM-02</span>
              <span style={styles.fleetSpeed}>{snapshot?.hemm02?.speedKmh ?? 16} km/h</span>
            </div>
            <span style={styles.dotGreen} />
          </div>
        </div>
      </div>

      {/* Card 2: Current Location */}
      <div style={styles.card}>
        <span style={styles.cardTitle}>Current Location</span>
        <div style={styles.locationContent}>
          {selectedVehicleId && snapshot && (
            <>
              <div style={styles.coordsLine}>
                {(() => {
                  const key = selectedVehicleId.toLowerCase().includes('01') ? 'telemetryHemm01' : 'telemetryHemm02';
                  const telemetry = snapshot?.[key];
                  if (telemetry?.position?.latitude && telemetry?.position?.longitude) {
                    const lat = Number(telemetry.position.latitude).toFixed(4);
                    const lon = Number(telemetry.position.longitude).toFixed(4);
                    return `${lat}° N, ${lon}° E`;
                  }
                  return '--';
                })()}
              </div>
              <div className="card-base" style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                {(() => {
                  const key = selectedVehicleId.toLowerCase().includes('01') ? 'currentSectionHemm01' : 'currentSectionHemm02';
                  const sec = snapshot?.[key];
                  if (sec?.sectionId && sec?.name) {
                    return `${sec.sectionId} (${sec.name})`;
                  }
                  return '--';
                })()}
              </div>
              <div style={styles.motionLine}>Speed: {selectedVehicleId === 'HEMM-01' ? snapshot?.hemm01?.speedKmh ?? 22 : snapshot?.hemm02?.speedKmh ?? 16} km/h | Heading: {selectedVehicleId === 'HEMM-01' ? snapshot?.hemm01?.heading ?? 0 : snapshot?.hemm02?.heading ?? 0}°</div>
            </>
          )}
        </div>
      </div>

      {/* Card 3: Next Hazard */}
      <div className="card-base">
        <span style={styles.cardTitle}>Next Hazard</span>
        <div style={styles.hazardContent}>
          <div style={styles.hazardTitleRow}>
            <AlertTriangle size={13} color="#F59E0B" />
            <span style={styles.hazardMainName}>{ACTIVE_BLIND_CURVE_HAZARD.name}</span>
          </div>
          {/* Route distance from the selected vehicle to the active hazard */}
          {(() => {
            const telemetry =
              selectedVehicleId === 'HEMM-02' ? snapshot?.telemetryHemm02 : snapshot?.telemetryHemm01;
            return (
              <div style={styles.hazardDetailLine}>
                Distance: {formatDistanceToBlindCurve(telemetry?.route_distance)}
              </div>
            );
          })()}
          <div style={styles.hazardRecLine}>Recommended Speed: {ACTIVE_BLIND_CURVE_HAZARD.recommendedSpeed} km/h</div>
        </div>
      </div>

      {/* Card 4: Map Controls & Scenario Action */}
      <div className="card-base" style={{ flex: 1.2 }}>
        <div style={styles.cardHeaderRow}>
          <span style={styles.cardTitle}>Map Controls</span>
          {/* Quick Scenario Player */}
          <div style={styles.scenarioButtonGroup}>
            {isPlaying ? (
              <button 
                style={styles.scenarioBtn} 
                onClick={onPause} 
                title="Pause Simulation"
              >
                <Pause size={10} color="#F59E0B" />
                <span>PAUSE</span>
              </button>
            ) : (
              <button 
                style={styles.scenarioBtnPlay} 
                onClick={onStart} 
                title="Play Simulation"
              >
                <Play size={10} color="#22C55E" />
                <span>PLAY</span>
              </button>
            )}
            <button 
              style={styles.scenarioBtnReset} 
              onClick={onReset} 
              title="Reset Simulation"
            >
              <RotateCcw size={10} color="#94A3B8" />
            </button>
          </div>
        </div>

        <div style={styles.mapButtonsRow}>
          <button 
            style={styles.controlBtn} 
            onClick={onSafetyScene} 
            title="Focus Camera on Safety Encounter"
          >
            <Video size={11} color="#38BDF8" />
            <span>Safety Scene</span>
          </button>

          <button 
            style={styles.controlBtn} 
            onClick={onFollowVehicle} 
            title="Track Selected Vehicle with Camera"
          >
            <Compass size={11} color="#38BDF8" />
            <span>Follow Vehicle</span>
          </button>

          <button 
            style={styles.controlBtn} 
            onClick={onResetView} 
            title="Reset Map View"
          >
            <RotateCw size={11} color="#94A3B8" />
            <span>Reset View</span>
          </button>
        </div>
      </div>

      {/* Card 5: Data Mode */}
      <div style={styles.card}>
        <span style={styles.cardTitle}>Data Mode</span>
        <div style={styles.dataModeContent}>
          <div style={styles.modeStatusRow}>
            <span style={isLiveHardware ? styles.dotBlue : styles.dotGreen} />
            <span style={styles.modeTitle}>{isLiveHardware ? 'LIVE HARDWARE' : 'Simulation'}</span>
          </div>
          <div style={styles.cameraParamsLine}>
            Zoom: {camera?.zoom ? camera.zoom.toFixed(1) : '16.2'} | Pitch: {camera?.pitch ? Math.round(camera.pitch) : '0'}° | Bearing: {camera?.bearing ? Math.round(camera.bearing) : '0'}°
          </div>
        </div>
      </div>
    </footer>
  );
};

const styles: Record<string, React.CSSProperties> = {
  footer: {
    height: '76px',
    width: '100%',
    backgroundColor: '#090E17',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'stretch',
    padding: '8px 14px',
    gap: '10px',
    flexShrink: 0,
    zIndex: 25,
    userSelect: 'none',
    boxSizing: 'border-box',
  },
  card: {
    // Styling moved to CSS class .card-base
    // Retain layout properties
    padding: '8px 12px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between',
    flex: 1,
    minWidth: 0,
    cursor: 'pointer',
  },
  cardHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: '10.5px',
    fontWeight: 700,
    color: '#94A3B8',
    fontFamily: 'Inter, system-ui, sans-serif',
    letterSpacing: '0.02em',
  },
  fleetRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  },
  fleetItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  truckGreen: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  truckBlue: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fleetInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  fleetId: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#F1F5F9',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  fleetSpeed: {
    fontSize: '9.5px',
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  dotGreen: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#22C55E',
    boxShadow: '0 0 4px #22C55E',
  },
  dotBlue: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#38BDF8',
    boxShadow: '0 0 4px #38BDF8',
  },
  locationContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  coordsLine: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#F8FAFC',
    fontFamily: 'monospace',
  },
  sectionLine: {
    fontSize: '9.5px',
    color: '#38BDF8',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  motionLine: {
    fontSize: '9.5px',
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  hazardContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  hazardTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  hazardMainName: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#F59E0B',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  hazardDetailLine: {
    fontSize: '9.5px',
    color: '#E2E8F0',
    fontFamily: 'monospace',
  },
  hazardRecLine: {
    fontSize: '9.5px',
    color: '#94A3B8',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  mapButtonsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  controlBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '4px',
    padding: '5px 8px',
    color: '#F1F5F9',
    fontSize: '10px',
    fontWeight: 600,
    fontFamily: 'Inter, system-ui, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    cursor: 'pointer',
    transition: 'all 0.12s ease',
  },
  scenarioButtonGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  scenarioBtn: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    border: '1px solid rgba(245, 158, 11, 0.4)',
    color: '#F59E0B',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '9px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    cursor: 'pointer',
  },
  scenarioBtnPlay: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    border: '1px solid rgba(34, 197, 94, 0.4)',
    color: '#22C55E',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '9px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '3px',
    cursor: 'pointer',
  },
  scenarioBtnReset: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '3px',
    padding: '3px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  dataModeContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  modeStatusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  modeTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#22C55E',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  cameraParamsLine: {
    fontSize: '9.5px',
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
};
