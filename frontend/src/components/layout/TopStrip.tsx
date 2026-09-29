import React, { useContext } from 'react';
import { Mountain, MapPin, Bell } from 'lucide-react';
import type { RiskLevel } from '../../types/contract';
import { MapCameraContext } from '../../contexts/MapCameraContext';

interface TopStripProps {
  riskLevel?: RiskLevel;
  isPlaying?: boolean;
}

export const TopStrip: React.FC<TopStripProps> = () => {
  const { center } = useContext(MapCameraContext);

  return (
    <header style={styles.header} aria-label="Command Center Master Navigation">
      {/* Left Branding */}
      <div style={styles.brandSection}>
        <div style={styles.brandLogo}>
          <Mountain size={20} color="#3B82F6" strokeWidth={2.4} />
        </div>
        <div style={styles.brandTextContainer}>
          <div style={styles.brandTitle}>NETRA</div>
          <div style={styles.brandSubtitle}>Mine Safety Command Center</div>
        </div>
      </div>

      {/* Center Status Indicators */}
      <div style={styles.centerStatus}>
        <div style={styles.statusPill}>
          <span style={styles.dotGreen} />
          <span style={styles.statusLabel}>Map Service</span>
          <span style={styles.statusValue}>Online</span>
        </div>

        <div style={styles.statusPill}>
          <span style={styles.dotGreen} />
          <span style={styles.statusLabel}>Database</span>
          <span style={styles.statusValue}>Online</span>
        </div>

        <div style={styles.statusPill}>
          <span style={styles.dotGreen} />
          <span style={styles.statusLabel}>Telemetry</span>
          <span style={styles.statusValue}>Live</span>
        </div>
      </div>

      {/* Right Location & Timestamp */}
      <div style={styles.rightSection}>
        {/* Mine Location Tag */}
        <div style={styles.locationContainer}>
          <MapPin size={15} color="#94A3B8" />
          <div style={styles.locationText}>
            <span style={styles.locationName}>Bailadila Mine – Deposit 14</span>
            <span style={styles.locationCoords}>{center[0].toFixed(4)}° E, {center[1].toFixed(4)}° N</span>
          </div>
        </div>

        {/* Timestamp */}
        <div style={styles.timeContainer}>
          <span style={styles.dateText}>Apr 26, 2025</span>
          <span style={styles.clockText}>14:32:17</span>
        </div>

        {/* Notification Bell with Badge */}
        <div style={styles.bellButton} title="3 Unresolved Safety Notifications">
          <Bell size={16} color="#E2E8F0" />
          <span style={styles.bellBadge}>3</span>
        </div>
      </div>
    </header>
  );
};

const styles: Record<string, React.CSSProperties> = {
  header: {
    height: '52px',
    width: '100%',
    backgroundColor: '#090E17',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    flexShrink: 0,
    zIndex: 30,
    userSelect: 'none',
    boxSizing: 'border-box',
  },
  brandSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexShrink: 0,
  },
  brandLogo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandTextContainer: {
    display: 'flex',
    flexDirection: 'column',
  },
  brandTitle: {
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    color: '#FFFFFF',
    fontFamily: 'Inter, system-ui, sans-serif',
    lineHeight: '1.2',
  },
  brandSubtitle: {
    fontSize: '11px',
    color: '#94A3B8',
    fontFamily: 'Inter, system-ui, sans-serif',
    lineHeight: '1.2',
  },
  centerStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '12px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  dotGreen: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    backgroundColor: '#22C55E',
    boxShadow: '0 0 6px rgba(34, 197, 94, 0.8)',
    display: 'inline-block',
  },
  statusLabel: {
    color: '#94A3B8',
    fontWeight: 500,
  },
  statusValue: {
    color: '#22C55E',
    fontWeight: 600,
  },
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexShrink: 0,
  },
  locationContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  },
  locationText: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
  },
  locationName: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#E2E8F0',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  locationCoords: {
    fontSize: '10.5px',
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  timeContainer: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'right',
    fontSize: '11px',
    color: '#94A3B8',
    fontFamily: 'monospace',
    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
    paddingLeft: '14px',
  },
  dateText: {
    color: '#CBD5E1',
    fontWeight: 500,
  },
  clockText: {
    color: '#94A3B8',
  },
  bellButton: {
    width: '32px',
    height: '32px',
    borderRadius: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    cursor: 'pointer',
  },
  bellBadge: {
    position: 'absolute',
    top: '-3px',
    right: '-3px',
    backgroundColor: '#EF4444',
    color: '#FFFFFF',
    fontSize: '9px',
    fontWeight: 700,
    width: '15px',
    height: '15px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '1.5px solid #090E17',
  },
};
