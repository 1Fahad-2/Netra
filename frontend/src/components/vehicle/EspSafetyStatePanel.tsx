/**
 * NETRA — ESP32 Safety-State Panel (Feature 11 frontend integration)
 *
 * Renders the REAL backend GET /api/esp/{vehicle_id}/safety-state response
 * verbatim (via useEspSafetyState). This is the exact state the ESP32
 * hardware would render on its OLED — the panel does not compute, guess, or
 * invent any of these values.
 *
 * Kept as a small, self-contained panel (separate from the existing
 * simulation-driven VehicleSnapshotShell) so the two data sources are never
 * mixed: this always shows backend-authoritative Feature 11 state, whatever
 * the local demo simulation is doing.
 */

import React from 'react';
import { Route, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { useEspSafetyState } from '../../hooks/useEspSafetyState';

interface EspSafetyStatePanelProps {
  vehicleId: string;
}

export function colorForHazard(hazard: string | undefined): string {
  if (!hazard) return 'var(--text-muted)';
  if (hazard === 'SAFE') return 'var(--safe-green)';
  if (hazard === 'UPCOMING VEHICLE') return 'var(--crit-red)';
  if (hazard.startsWith('BLIND CURVE')) return 'var(--crit-red)';
  if (hazard.startsWith('UPCOMING BLIND CURVE')) return 'var(--warn-amber)';
  return 'var(--text-secondary)';
}

export const EspSafetyStatePanel: React.FC<EspSafetyStatePanelProps> = ({ vehicleId }) => {
  const { data, isConnected, isBackendUnavailable } = useEspSafetyState(vehicleId);

  const hazard = data?.hazard_state;
  const color = colorForHazard(hazard);

  return (
    <div style={styles.container} aria-label="ESP32 Real Backend Safety State">
      <div style={styles.header}>
        <div style={styles.badge}>
          <Route size={11} color="var(--accent-blue)" />
          <span style={styles.badgeTitle}>ESP32 SAFETY STATE — {vehicleId}</span>
        </div>
        <span style={styles.connIndicator} title={isBackendUnavailable ? 'Backend unreachable — showing last known state' : 'Live'}>
          {isConnected ? (
            isBackendUnavailable ? (
              <WifiOff size={11} color="var(--warn-amber)" />
            ) : (
              <Wifi size={11} color="var(--safe-green)" />
            )
          ) : (
            <WifiOff size={11} color="var(--text-muted)" />
          )}
        </span>
      </div>

      {!isConnected ? (
        <div style={styles.waitingRow}>Connecting to backend…</div>
      ) : (
        <>
          <div style={{ ...styles.hazardRow, color }}>
            {hazard === 'UPCOMING VEHICLE' && <AlertTriangle size={13} color={color} />}
            <span style={styles.hazardText}>{hazard}</span>
          </div>

          {data?.state === 'UPCOMING_BLIND_CURVE' && data.distance_to_curve != null && (
            <div style={styles.fieldRow}>
              <span style={styles.fieldLabel}>DISTANCE TO CURVE</span>
              <span style={styles.fieldValue}>{data.distance_to_curve.toFixed(1)} m</span>
            </div>
          )}

          {data?.vehicle_alert ? (
            <div style={styles.alertBox}>
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>VEHICLE</span>
                <span style={styles.fieldValue}>{data.vehicle_alert.vehicle_id}</span>
              </div>
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>DISTANCE</span>
                <span style={styles.fieldValue}>
                  {data.vehicle_alert.distance != null ? `${data.vehicle_alert.distance.toFixed(1)} m` : 'N/A'}
                </span>
              </div>
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>RISK</span>
                <span style={styles.fieldValue}>{data.vehicle_alert.risk}</span>
              </div>
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>TTC</span>
                <span style={styles.fieldValue}>
                  {data.vehicle_alert.ttc != null ? `${data.vehicle_alert.ttc.toFixed(1)} s` : 'N/A'}
                </span>
              </div>
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>ACTION</span>
                <span style={styles.fieldValue}>{data.vehicle_alert.action ?? 'N/A'}</span>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '8px 12px',
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    minWidth: '220px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  badgeTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '9px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: 'var(--accent-blue)',
  },
  connIndicator: {
    display: 'flex',
    alignItems: 'center',
  },
  waitingRow: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
  },
  hazardRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  hazardText: {
    fontFamily: 'var(--font-display)',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.03em',
  },
  fieldRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
  },
  fieldLabel: {
    fontSize: '9px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
  },
  fieldValue: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    fontWeight: 600,
  },
  alertBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    marginTop: '2px',
    padding: '6px 8px',
    backgroundColor: 'var(--crit-red-subtle)',
    border: '1px solid var(--crit-red-border)',
    borderRadius: '3px',
  },
};
