/**
 * MachineMind — Fog & Atmospheric Visibility Page
 * 
 * Pit Atmospheric Visibility & Sensor Diagnostics:
 * Monitors optical fog obstruction, ambient dust levels, and edge sensor health
 * (radar, thermal imaging, GNSS, IMU) across the open-cast corridor.
 */

import React from 'react';
import { CloudFog, Eye, Radar, Thermometer, Radio, Activity } from 'lucide-react';
import type { UseTelemetryReturn } from '../hooks/useTelemetry';

interface VisibilityProps {
  telemetry: UseTelemetryReturn;
}

export const Visibility: React.FC<VisibilityProps> = ({ telemetry }) => {
  const { snapshot } = telemetry;
  const t = snapshot.telemetryHemm01;
  const visibilityCondition = t?.visibility_condition ?? 'NORMAL';
  const sensors = t?.sensor_health ?? {
    radar: 'SIMULATED',
    thermal: 'NOT_CONNECTED',
    gnss: 'SIMULATED',
    imu: 'SIMULATED',
  };

  return (
    <div style={styles.container} aria-label="Fog and Visibility Workspace">
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <CloudFog size={20} color="var(--accent-blue)" />
          <h2 style={styles.heading}>ATMOSPHERIC VISIBILITY & SENSOR DIAGNOSTICS</h2>
          <span style={styles.badge}>OPTICAL DEGRADATION MONITOR</span>
        </div>
        <p style={styles.subheading}>
          Multi-spectral perception diagnostics and blind-curve fog occlusion monitoring across the Bailadila pit corridor.
        </p>
      </div>

      <div style={styles.grid}>
        {/* Visibility Condition Card */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Eye size={16} color="var(--accent-blue)" />
            <span style={styles.cardTitle}>PIT CORRIDOR OPTICAL CONDITIONS</span>
          </div>
          <div style={styles.visibilityMetric}>
            <span style={styles.visibilityStatus}>{visibilityCondition}</span>
            <span style={styles.visibilityDesc}>
              {visibilityCondition === 'NORMAL' 
                ? 'Nominal ambient visibility. Visual line-of-sight uninhibited by dust or heavy fog.'
                : 'Dense fog/dust occlusion detected. Radar & thermal sensor fusion mandatory.'}
            </span>
          </div>
          <div style={styles.attenuationBarContainer}>
            <span style={styles.barLabel}>OPTICAL ATTENUATION INDEX</span>
            <div style={styles.barTrack}>
              <div 
                style={{
                  ...styles.barFill,
                  width: visibilityCondition === 'POOR' ? '85%' : visibilityCondition === 'DEGRADED' ? '45%' : '12%',
                  backgroundColor: visibilityCondition === 'POOR' ? 'var(--crit-red)' : visibilityCondition === 'DEGRADED' ? 'var(--warn-amber)' : 'var(--safe-green)',
                }} 
              />
            </div>
          </div>
        </div>

        {/* Edge Sensor Suite Health */}
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <Activity size={16} color="var(--accent-blue)" />
            <span style={styles.cardTitle}>HEMM-01 ONBOARD SENSOR SUITE</span>
          </div>

          <div style={styles.sensorList}>
            <div style={styles.sensorItem}>
              <div style={styles.sensorName}>
                <Radar size={14} color="var(--text-secondary)" />
                <span>Millimeter-Wave Radar</span>
              </div>
              <span style={styles.sensorState}>{sensors.radar}</span>
            </div>

            <div style={styles.sensorItem}>
              <div style={styles.sensorName}>
                <Thermometer size={14} color="var(--text-secondary)" />
                <span>Long-Wave Thermal IR</span>
              </div>
              <span style={styles.sensorState}>{sensors.thermal}</span>
            </div>

            <div style={styles.sensorItem}>
              <div style={styles.sensorName}>
                <Radio size={14} color="var(--text-secondary)" />
                <span>RTK GNSS Receiver</span>
              </div>
              <span style={styles.sensorState}>{sensors.gnss}</span>
            </div>

            <div style={styles.sensorItem}>
              <div style={styles.sensorName}>
                <Activity size={14} color="var(--text-secondary)" />
                <span>6-DOF IMU Telemetry</span>
              </div>
              <span style={styles.sensorState}>{sensors.imu}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    padding: '24px',
    backgroundColor: 'var(--bg-base)',
    overflowY: 'auto',
  },
  header: {
    marginBottom: '24px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '6px',
  },
  heading: {
    fontSize: '16px',
    fontWeight: 600,
    color: 'var(--text-primary)',
    letterSpacing: '0.05em',
    margin: 0,
  },
  badge: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '2px',
    backgroundColor: 'var(--line)',
    color: 'var(--text-secondary)',
  },
  subheading: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    margin: 0,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
    gap: '16px',
  },
  card: {
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    padding: '16px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '16px',
    paddingBottom: '10px',
    borderBottom: '1px solid var(--line)',
  },
  cardTitle: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '0.05em',
  },
  visibilityMetric: {
    marginBottom: '16px',
  },
  visibilityStatus: {
    fontSize: '22px',
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    color: 'var(--safe-green)',
    display: 'block',
    marginBottom: '6px',
  },
  visibilityDesc: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
  attenuationBarContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  barLabel: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
  },
  barTrack: {
    width: '100%',
    height: '6px',
    backgroundColor: 'var(--bg-base)',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  sensorList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sensorItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 10px',
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--line)',
    borderRadius: '2px',
  },
  sensorName: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    color: 'var(--text-primary)',
  },
  sensorState: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    color: 'var(--accent-blue)',
  },
};

export default Visibility;
