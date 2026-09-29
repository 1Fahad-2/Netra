/**
 * MachineMind — Fleet Overview Page
 * 
 * Prototype Fleet Management:
 * Monitoring interface for registered open-cast HEMM units.
 * Strictly restricted to prototype fleet: HEMM-01 and HEMM-02.
 */

import React from 'react';
import { Truck, Radio, Shield, Gauge, Compass } from 'lucide-react';
import type { UseTelemetryReturn } from '../hooks/useTelemetry';
import type { SafetyLevel } from '../types/contract';

interface FleetProps {
  telemetry: UseTelemetryReturn;
}

export const Fleet: React.FC<FleetProps> = ({ telemetry }) => {
  const { telemetryMap, selectedVehicleId, setSelectedVehicleId } = telemetry;
  const hemm01 = telemetryMap['HEMM-01'];
  const hemm02 = telemetryMap['HEMM-02'];

  const fleet = [
    {
      id: 'HEMM-01',
      type: '100T DUMPER (LEAD)',
      role: 'Lead Hauler',
      telemetry: hemm01,
      safetyLevel: (telemetry.snapshot?.safetyLevel ?? 'NORMAL') as SafetyLevel,
      // Use 4-level safetyLevel: CRITICAL or HIGH → HAZARD HOLD; CAUTION → ADVISORY; else OPERATIONAL
      status:
        telemetry.snapshot?.safetyLevel === 'CRITICAL' ? 'HAZARD HOLD — CRITICAL'
        : telemetry.snapshot?.safetyLevel === 'HIGH'     ? 'HAZARD HOLD'
        : telemetry.snapshot?.safetyLevel === 'CAUTION'  ? 'ADVISORY'
        : 'OPERATIONAL',
      badgeClass:
        telemetry.snapshot?.safetyLevel === 'CRITICAL' ? 'red'
        : telemetry.snapshot?.safetyLevel === 'HIGH'     ? 'red'
        : telemetry.snapshot?.safetyLevel === 'CAUTION'  ? 'amber'
        : 'green',
    },
    {
      id: 'HEMM-02',
      type: '100T DUMPER (TRAILING)',
      role: 'Trailing Hauler',
      telemetry: hemm02,
      safetyLevel: (telemetry.snapshot?.safetyLevel ?? 'NORMAL') as SafetyLevel,
      status: 'OPERATIONAL',
      badgeClass: 'green',
    },
  ];

  return (
    <div style={styles.container} aria-label="Fleet Overview Workspace">
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <Truck size={20} color="var(--accent-blue)" />
          <h2 style={styles.heading}>REGISTERED PROTOTYPE FLEET</h2>
          <span style={styles.fleetBadge}>2 VEHICLES REGISTERED</span>
        </div>
        <p style={styles.subheading}>
          Real-time telemetry and dispatch state for active haulage prototype units in Bailadila pit corridor.
        </p>
      </div>

      <div style={styles.grid}>
        {fleet.map((item) => {
          const isSelected = selectedVehicleId === item.id;
          const t = item.telemetry;

          return (
            <div
              key={item.id}
              style={{
                ...styles.card,
                ...(isSelected ? styles.cardSelected : {}),
              }}
              onClick={() => setSelectedVehicleId(item.id)}
            >
              <div style={styles.cardHeader}>
                <div style={styles.vehicleIdentity}>
                  <Truck size={18} color={isSelected ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                  <div>
                    <h3 style={styles.vehicleId}>{item.id}</h3>
                    <span style={styles.vehicleType}>{item.type}</span>
                  </div>
                </div>
                <div style={styles.statusBadge}>
                  <span className={`status-dot ${item.badgeClass}`} />
                  <span style={styles.statusText}>{item.status}</span>
                </div>
              </div>

              <div style={styles.metricsGrid}>
                <div style={styles.metric}>
                  <div style={styles.metricLabel}>
                    <Gauge size={12} color="var(--text-muted)" />
                    <span>GROUND SPEED</span>
                  </div>
                  <span style={styles.metricValue}>
                    {t ? `${Math.round(t.speed)} km/h` : 'STANDBY'}
                  </span>
                </div>

                <div style={styles.metric}>
                  <div style={styles.metricLabel}>
                    <Compass size={12} color="var(--text-muted)" />
                    <span>BEARING</span>
                  </div>
                  <span style={styles.metricValue}>
                    {t ? `${Math.round(t.heading)}°` : 'NOMINAL'}
                  </span>
                </div>

                <div style={styles.metric}>
                  <div style={styles.metricLabel}>
                    <Shield size={12} color="var(--text-muted)" />
                    <span>SAFETY LEVEL</span>
                  </div>
                  <span
                    style={{
                      ...styles.metricValue,
                      color:
                        item.safetyLevel === 'CRITICAL' ? 'var(--crit-red)'
                        : item.safetyLevel === 'HIGH'     ? '#F97316'
                        : item.safetyLevel === 'CAUTION'  ? 'var(--warn-amber)'
                        : item.safetyLevel === 'UNKNOWN'  ? 'var(--text-muted)'
                        : 'var(--safe-green)',
                    }}
                  >
                    {item.safetyLevel}
                  </span>
                </div>

                <div style={styles.metric}>
                  <div style={styles.metricLabel}>
                    <Radio size={12} color="var(--text-muted)" />
                    <span>DATA MODE</span>
                  </div>
                  <span style={styles.metricValue}>
                    {t?.data_mode ?? 'SIMULATION'}
                  </span>
                </div>
              </div>

              <div style={styles.cardFooter}>
                <span style={styles.footerNote}>Role: {item.role}</span>
                <span style={styles.footerProvenance}>Source: {t?.source_metadata ?? 'SIMULATOR'}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={styles.noticeBox}>
        <span style={styles.noticeTitle}>PROTOTYPE REGISTRATION NOTICE</span>
        <p style={styles.noticeText}>
          In accordance with the SIH 2026 testbed specification, the active fleet is strictly limited to HEMM-01 (lead hauler) and HEMM-02 (trailing hauler). Zero fleet inflation permitted.
        </p>
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
  fleetBadge: {
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
    marginBottom: '24px',
  },
  card: {
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    padding: '16px',
    cursor: 'pointer',
    transition: 'border-color 0.15s ease',
  },
  cardSelected: {
    border: '1px solid var(--accent-blue)',
    backgroundColor: 'var(--bg-active)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid var(--line)',
  },
  vehicleIdentity: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  vehicleId: {
    fontSize: '15px',
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    margin: '0 0 2px 0',
  },
  vehicleType: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  statusBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '2px',
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--line)',
  },
  statusText: {
    color: 'var(--text-primary)',
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    marginBottom: '16px',
  },
  metric: {
    backgroundColor: 'var(--bg-base)',
    padding: '8px 10px',
    borderRadius: '2px',
    border: '1px solid var(--line)',
  },
  metricLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    marginBottom: '4px',
  },
  metricValue: {
    fontSize: '13px',
    fontWeight: 600,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    paddingTop: '8px',
    borderTop: '1px solid var(--line)',
  },
  footerNote: {
    color: 'var(--text-secondary)',
  },
  footerProvenance: {
    color: 'var(--accent-blue)',
  },
  noticeBox: {
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderLeft: '3px solid var(--accent-blue)',
    borderRadius: '2px',
    padding: '12px 16px',
  },
  noticeTitle: {
    fontSize: '11px',
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent-blue)',
    display: 'block',
    marginBottom: '4px',
  },
  noticeText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: '1.4',
  },
};

export default Fleet;
