import React from 'react';
import { 
  Layers, 
  Maximize2, 
  Compass, 
  Crosshair, 
  Mountain,
  EyeOff,
  Navigation
} from 'lucide-react';

export const MapPlaceholder: React.FC = () => {
  return (
    <section style={styles.container} aria-label="Hero Mine Map Container">
      {/* Precision Industrial Grid Canvas */}
      <div style={styles.gridOverlay} />

      {/* Top Left: Mine Geospatial Anchor */}
      <div style={styles.geoAnchor}>
        <div style={styles.geoHeader}>
          <Mountain size={14} color="var(--accent-blue)" />
          <span style={styles.geoTitle}>REPRESENTATIVE BAILADILA-INSPIRED OPEN-CAST MINE ENVIRONMENT</span>
        </div>
        <div style={styles.geoMeta}>
          <span className="font-mono">REPRESENTATIVE BAILADILA-INSPIRED ENVIRONMENT · SIMULATION</span>
        </div>
      </div>

      {/* Top Right: Layer Control HUD Shell */}
      <div style={styles.layerControlShell} title="Layer Control Drawer — Checkpoint 2">
        <div style={styles.layerButton}>
          <Layers size={14} color="var(--text-secondary)" />
          <span style={styles.layerText}>11 OPERATIONAL LAYERS</span>
          <span style={styles.layerStateBadge}>STANDBY</span>
        </div>
      </div>

      {/* Center Target Reticle & Placeholder Information */}
      <div style={styles.centerTarget}>
        <div style={styles.reticleRing}>
          <Crosshair size={32} color="var(--accent-blue)" strokeWidth={1.5} />
        </div>

        <div style={styles.targetInfo}>
          <h2 style={styles.targetHeading}>3D MINE MAP HERO COMPONENT</h2>
          <p style={styles.targetSub}>
            Hardware-accelerated Deck.gl + MapLibre integration will render here in <strong style={{ color: 'var(--accent-blue)' }}>Checkpoint 2</strong>.
          </p>
          <div style={styles.specBadges}>
            <span style={styles.specChip}>STEPPED BENCHES</span>
            <span style={styles.specChip}>HAUL ROADS</span>
            <span style={styles.specChip}>LOADING / DUMP ZONES</span>
            <span style={styles.specChip}>BLIND CURVES</span>
            <span style={styles.specChip}>FOG OVERLAY</span>
            <span style={styles.specChip}>DYNAMIC RISK HALOS</span>
            <span style={styles.specChip}>HEMM-01 & HEMM-02</span>
          </div>
          <div style={styles.offlineNotice}>
            <EyeOff size={12} color="var(--text-muted)" />
            <span>OFFLINE-SAFE VECTOR GEOMETRY ARCHITECTURE — ZERO EXTERNAL TILE DEPENDENCY</span>
          </div>
        </div>
      </div>

      {/* Bottom Left: Camera Orientation & Compass HUD */}
      <div style={styles.cameraHud}>
        <div style={styles.compassBox}>
          <Compass size={16} color="var(--accent-blue)" />
          <span style={styles.compassHeading}>N 000°</span>
        </div>
        <div style={styles.cameraReadouts}>
          <span style={styles.cameraItem}>PITCH: <span className="font-mono">55.0°</span></span>
          <span style={styles.cameraItem}>BEARING: <span className="font-mono">0.0°</span></span>
          <span style={styles.cameraItem}>ZOOM: <span className="font-mono">15.5</span></span>
          <span style={styles.cameraItem}>VIEW: <span className="font-mono">REPRESENTATIVE MINE</span></span>
        </div>
      </div>

      {/* Bottom Right: Map Reset & Tool Affordances */}
      <div style={styles.mapTools}>
        <button style={styles.toolButton} title="Reset Map Camera View" disabled>
          <Navigation size={13} />
          <span>RESET VIEW</span>
        </button>
        <button style={styles.toolButton} title="Toggle Fullscreen Map" disabled>
          <Maximize2 size={13} />
        </button>
      </div>
    </section>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    flex: 1,
    height: '100%',
    backgroundColor: 'var(--bg-base)',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
  },
  gridOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundImage: `
      linear-gradient(to right, rgba(35, 48, 71, 0.4) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(35, 48, 71, 0.4) 1px, transparent 1px)
    `,
    backgroundSize: '40px 40px',
    pointerEvents: 'none',
    opacity: 0.6,
  },
  geoAnchor: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    backgroundColor: 'rgba(17, 25, 39, 0.92)',
    backdropFilter: 'blur(4px)',
    border: '1px solid var(--line)',
    padding: '8px 12px',
    borderRadius: '4px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    zIndex: 5,
  },
  geoHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  geoTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: 'var(--text-primary)',
  },
  geoMeta: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
  },
  layerControlShell: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    zIndex: 5,
  },
  layerButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    backgroundColor: 'rgba(17, 25, 39, 0.92)',
    backdropFilter: 'blur(4px)',
    border: '1px solid var(--line)',
    padding: '6px 12px',
    borderRadius: '4px',
    cursor: 'default',
  },
  layerText: {
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-secondary)',
    letterSpacing: '0.04em',
  },
  layerStateBadge: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--text-muted)',
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--line)',
    padding: '2px 5px',
    borderRadius: '2px',
  },
  centerTarget: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    maxWidth: '560px',
    padding: '28px',
    backgroundColor: 'rgba(17, 25, 39, 0.75)',
    border: '1px solid var(--line-highlight)',
    borderRadius: '6px',
    zIndex: 4,
  },
  reticleRing: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    border: '1px dashed var(--accent-blue-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
    backgroundColor: 'var(--accent-blue-subtle)',
  },
  targetInfo: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  targetHeading: {
    fontFamily: 'var(--font-display)',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--text-primary)',
  },
  targetSub: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: 1.5,
    maxWidth: '460px',
  },
  specBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: '6px',
    marginTop: '10px',
  },
  specChip: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--line)',
    padding: '2px 6px',
    borderRadius: '3px',
    letterSpacing: '0.03em',
  },
  offlineNotice: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    marginTop: '14px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
  },
  cameraHud: {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: 'rgba(17, 25, 39, 0.92)',
    backdropFilter: 'blur(4px)',
    border: '1px solid var(--line)',
    padding: '6px 12px',
    borderRadius: '4px',
    zIndex: 5,
  },
  compassBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    paddingRight: '10px',
    borderRight: '1px solid var(--line)',
  },
  compassHeading: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--accent-blue)',
  },
  cameraReadouts: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '10px',
    color: 'var(--text-muted)',
    letterSpacing: '0.03em',
  },
  cameraItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  mapTools: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    zIndex: 5,
  },
  toolButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    backgroundColor: 'rgba(17, 25, 39, 0.92)',
    border: '1px solid var(--line)',
    color: 'var(--text-muted)',
    padding: '6px 10px',
    borderRadius: '4px',
    fontSize: '10px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    cursor: 'not-allowed',
    opacity: 0.7,
  },
};
