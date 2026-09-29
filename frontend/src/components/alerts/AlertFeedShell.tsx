import React from 'react';
import { Bell, ShieldCheck, AlertTriangle, AlertCircle } from 'lucide-react';
import type { RiskLevel, RecommendedAction, SafetyLevel } from '../../types/contract';

interface AlertFeedShellProps {
  riskLevel?: RiskLevel;         // 3-level wire value (preserved for backward compat)
  safetyLevel?: SafetyLevel;     // 4-level Phase 2A value — preferred when present
  recommendedAction?: RecommendedAction;
  distanceMeters?: number;
  ttcSeconds?: number;
}

export const AlertFeedShell: React.FC<AlertFeedShellProps> = ({
  riskLevel = 'LOW',
  safetyLevel,
  distanceMeters = 118,
  ttcSeconds = 24.5,
}) => {
  // Prefer 4-level safetyLevel; fall back to mapping the 3-level riskLevel.
  const effectiveLevel: SafetyLevel =
    safetyLevel ??
    (riskLevel === 'HIGH' ? 'CRITICAL' : riskLevel === 'MEDIUM' ? 'CAUTION' : 'NORMAL');

  const isCritical = effectiveLevel === 'CRITICAL';
  const isHigh     = effectiveLevel === 'HIGH';
  const isCaution  = effectiveLevel === 'CAUTION';
  const isUnknown  = effectiveLevel === 'UNKNOWN';
  const isElevated = isCritical || isHigh || isCaution;

  return (
    <div style={styles.container} aria-label="Live Safety Alert Feed">
      {/* Feed Header */}
      <div style={styles.header}>
        <div style={styles.headerTitle}>
          <Bell
            size={13}
            color={
              isCritical ? 'var(--crit-red)'
              : isHigh    ? '#F97316'
              : isCaution ? 'var(--warn-amber)'
              : isUnknown ? 'var(--text-muted)'
              : 'var(--text-secondary)'
            }
          />
          <span style={styles.titleText}>LIVE OPERATIONAL ALERT FEED</span>
          <span
            style={{
              ...styles.alertCounterBadge,
              ...(isCritical ? styles.badgeCritical : isHigh ? styles.badgeHigh : isCaution ? styles.badgeMedium : {}),
            }}
          >
            {isCritical ? '1 CRITICAL' : isHigh ? '1 HIGH' : isCaution ? '1 CAUTION' : '0 ACTIVE'}
          </span>
        </div>
        <div style={styles.headerActions}>
          <span style={styles.feedStatus}>
            {isCritical ? 'CRITICAL INTERVENTION REQUIRED'
              : isHigh    ? 'ACTIVE HIGH RISK PROTOCOL'
              : isCaution ? 'COLLISION MONITOR ACTIVE'
              : isUnknown ? 'ASSESSMENT UNAVAILABLE'
              : 'STREAM NOMINAL'}
          </span>
        </div>
      </div>

      {/* Alert Feed Body - Dynamic State */}
      <div style={styles.feedBody}>
        <div
          style={{
            ...styles.emptyRow,
            ...(isCritical ? styles.rowHigh
              : isHigh     ? styles.rowHighOrange
              : isCaution  ? styles.rowMedium
              : {}),
          }}
        >
          <div style={styles.emptyLeft}>
            <span className={`status-dot ${isCritical ? 'red' : isHigh ? 'red' : isCaution ? 'amber' : 'green'}`} />
            {isCritical ? (
              <AlertCircle size={14} color="var(--crit-red)" />
            ) : isHigh ? (
              <AlertCircle size={14} color="#F97316" />
            ) : isCaution ? (
              <AlertTriangle size={14} color="var(--warn-amber)" />
            ) : (
              <ShieldCheck size={14} color={isUnknown ? 'var(--text-muted)' : 'var(--safe-green)'} />
            )}
            <span
              style={{
                ...styles.emptyMainText,
                color:
                  isCritical ? 'var(--crit-red)'
                  : isHigh    ? '#F97316'
                  : isCaution ? 'var(--warn-amber)'
                  : isUnknown ? 'var(--text-muted)'
                  : 'var(--text-primary)',
              }}
            >
              {isCritical
                ? 'CRITICAL COLLISION PROXIMITY HAZARD'
                : isHigh
                  ? 'HIGH PROXIMITY HAZARD'
                  : isCaution
                    ? 'COLLISION PROXIMITY ADVISORY'
                    : isUnknown
                      ? 'RISK ASSESSMENT UNAVAILABLE'
                      : 'NO ACTIVE SAFETY ALERTS'}
            </span>
            <span style={styles.emptyDivider}>·</span>
            <span style={styles.emptySubText}>
              {isCritical
                ? `HEMM-01 within ${distanceMeters}m of HEMM-02 at blind curve apex. Action: HOLD VEHICLE.`
                : isHigh
                  ? `HEMM-01 within ${distanceMeters}m of HEMM-02. High proximity risk. Action: REDUCE SPEED.`
                  : isCaution
                    ? `HEMM-01 approaching HEMM-02 (${distanceMeters}m gap). Action: REDUCE SPEED.`
                    : isUnknown
                      ? 'Insufficient telemetry data for safety assessment.'
                      : 'Safe headway maintained (>75m). Nominal following distance on haul corridor.'}
            </span>
          </div>
          <div style={styles.emptyRight}>
            <span
              style={{
                ...styles.timeTag,
                color:
                  isCritical ? 'var(--crit-red)'
                  : isHigh    ? '#F97316'
                  : isCaution ? 'var(--warn-amber)'
                  : 'var(--text-muted)',
                fontWeight: isElevated ? 700 : 400,
              }}
            >
              {isCritical
                ? `TTC ${ttcSeconds}s (CRITICAL — HOLD)`
                : isHigh
                  ? `TTC ${ttcSeconds}s (HIGH — REDUCE SPEED)`
                  : isCaution
                    ? `TTC ${ttcSeconds}s (CAUTION — REDUCE SPEED)`
                    : 'TTC BUFFER CLEAR'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    padding: '8px 16px',
    justifyContent: 'center',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '6px',
  },
  headerTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  titleText: {
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: 'var(--text-secondary)',
  },
  alertCounterBadge: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--line)',
    color: 'var(--safe-green)',
    padding: '1px 5px',
    borderRadius: '2px',
  },
  badgeMedium: {
    color: 'var(--warn-amber)',
    borderColor: 'rgba(230, 169, 58, 0.4)',
    backgroundColor: 'rgba(230, 169, 58, 0.1)',
  },
  badgeCritical: {
    color: 'var(--crit-red)',
    borderColor: 'rgba(229, 72, 77, 0.5)',
    backgroundColor: 'rgba(229, 72, 77, 0.15)',
  },
  badgeHigh: {
    color: '#F97316',
    borderColor: 'rgba(249, 115, 22, 0.5)',
    backgroundColor: 'rgba(249, 115, 22, 0.15)',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
  },
  feedStatus: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
  },
  feedBody: {
    display: 'flex',
    flexDirection: 'column',
  },
  emptyRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    padding: '8px 12px',
    transition: 'all 0.2s ease',
  },
  rowMedium: {
    borderColor: 'rgba(230, 169, 58, 0.4)',
    backgroundColor: 'rgba(230, 169, 58, 0.05)',
  },
  rowHighOrange: {
    borderColor: 'rgba(249, 115, 22, 0.5)',
    backgroundColor: 'rgba(249, 115, 22, 0.08)',
  },
  rowHigh: {
    borderColor: 'rgba(229, 72, 77, 0.5)',
    backgroundColor: 'rgba(229, 72, 77, 0.08)',
  },
  emptyLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  emptyMainText: {
    fontFamily: 'var(--font-display)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    color: 'var(--text-primary)',
  },
  emptyDivider: {
    color: 'var(--text-muted)',
  },
  emptySubText: {
    fontSize: '11px',
    color: 'var(--text-muted)',
  },
  emptyRight: {
    display: 'flex',
    alignItems: 'center',
  },
  timeTag: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    letterSpacing: '0.05em',
  },
};
