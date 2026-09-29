/**
 * NETRA — Safety Alerts Page (Live)
 *
 * Alert states driven exclusively by the existing useTelemetry hook / snapshot:
 *
 *   SAFE           — no upcoming hazard, no BC active, no approaching vehicle
 *   UPCOMING BC    — snapshot.upcomingHazardHemm01 is non-null
 *   BC ACTIVE      — snapshot.blindCurve01Active or blindCurve02Active is true
 *   APPROACHING    — snapshot.telemetryHemm01.object_detected === true
 *
 * All four conditions are independent — they may display simultaneously.
 * Theme: black/dark cards, coloured left-border accent only. No light backgrounds.
 */

import React from 'react';
import {
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  Navigation,
  Car,
} from 'lucide-react';
import type { UseTelemetryReturn } from '../hooks/useTelemetry';

interface AlertsProps {
  telemetry: UseTelemetryReturn;
}

/** Convert a featureId like "BLIND_CURVE_01" → "BLIND CURVE 1" */
function formatCurveName(featureId: string): string {
  const m = featureId.match(/BLIND_CURVE_?0*(\d+)/i);
  if (m) return `BLIND CURVE ${m[1]}`;
  if (featureId.toUpperCase().includes('BLIND_CURVE')) return 'BLIND CURVE 1';
  return featureId;
}

/** Convert curveId like "BLIND_CURVE_01" to a display label */
function formatActiveCurveName(curveId: string | null | undefined): string {
  if (!curveId) return 'BLIND CURVE';
  return formatCurveName(curveId);
}

export const Alerts: React.FC<AlertsProps> = ({ telemetry }) => {
  const { snapshot, blindCurve01Active, blindCurve02Active } = telemetry;

  // ── Derived live states ──────────────────────────────────────────────────────

  const t1 = snapshot.telemetryHemm01;

  /** APPROACHING VEHICLE: HEMM-01 radar sees an approaching object */
  const approachingDetected = t1?.object_detected === true;
  const approachingObjectType = t1?.object_type ?? 'UNKNOWN';
  const approachingDistanceM = t1?.object_distance ?? null;
  const approachingTtcS = t1?.ttc ?? null;
  const approachingRiskLevel = t1?.risk_level ?? 'HIGH';
  const approachingAction = t1?.recommended_action ?? 'REDUCE SPEED';

  /** UPCOMING BLIND CURVE: route intelligence returned a hazard ahead */
  const upcomingHazard = snapshot.upcomingHazardHemm01 ?? null;
  const hasUpcoming = upcomingHazard !== null;

  /** BLIND CURVE ACTIVE: HEMM-01 or HEMM-02 is inside a BC activation zone */
  const hasBC01Active = blindCurve01Active;
  const hasBC02Active = blindCurve02Active;
  const hasAnyBCActive = hasBC01Active || hasBC02Active;

  // Active curve IDs from the zone; fall back to label if zone id is null
  const activeCurveId01 = snapshot.activeZoneIdHemm01 ?? (hasBC01Active ? 'BLIND_CURVE_01' : null);
  const activeCurveId02 = snapshot.activeZoneIdHemm02 ?? (hasBC02Active ? 'BLIND_CURVE_02' : null);

  /** SAFE: nothing is happening */
  const isSafe = !hasUpcoming && !hasAnyBCActive && !approachingDetected;

  // Active alert count for the header badge
  let activeAlertCount = 0;
  if (hasUpcoming) activeAlertCount++;
  if (hasAnyBCActive) activeAlertCount++;
  if (approachingDetected) activeAlertCount++;

  // Risk accent colour for approaching vehicle
  const riskColor =
    approachingRiskLevel === 'HIGH' ? '#F97316'
    : approachingRiskLevel === 'MEDIUM' ? 'var(--warn-amber)'
    : 'var(--safe-green)';

  // TTC display
  const ttcDisplay = approachingTtcS !== null ? `${approachingTtcS.toFixed(1)} s` : '—';

  return (
    <div style={styles.container} aria-label="Safety Alerts Ledger">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <AlertTriangle
            size={20}
            color={
              approachingDetected && approachingRiskLevel === 'HIGH' ? '#F97316'
              : hasAnyBCActive ? 'var(--crit-red)'
              : hasUpcoming ? 'var(--warn-amber)'
              : 'var(--safe-green)'
            }
          />
          <h2 style={styles.heading}>SAFETY ALERT LEDGER</h2>
          <span
            style={{
              ...styles.counterBadge,
              backgroundColor: isSafe
                ? 'rgba(47, 191, 113, 0.15)'
                : activeAlertCount >= 2
                  ? 'rgba(229, 72, 77, 0.15)'
                  : 'rgba(245, 158, 11, 0.15)',
              color: isSafe
                ? 'var(--safe-green)'
                : activeAlertCount >= 2
                  ? 'var(--crit-red)'
                  : 'var(--warn-amber)',
            }}
          >
            {isSafe ? '0 ACTIVE ALERTS' : `${activeAlertCount} ACTIVE ALERT${activeAlertCount > 1 ? 'S' : ''}`}
          </span>
        </div>
        <p style={styles.subheading}>
          Live safety event log — Bailadila pit haul corridor. Updates automatically from the NETRA telemetry engine.
        </p>
      </div>

      {/* ── Alert Cards ────────────────────────────────────────────────────── */}
      <div style={styles.content}>

        {/* 1. SAFE */}
        {isSafe && (
          <div style={{ ...styles.alertCard, ...styles.alertCardSafe }}>
            <div style={styles.alertCardHeader}>
              <div style={styles.alertTitleGroup}>
                <ShieldCheck size={18} color="var(--safe-green)" />
                <span style={{ ...styles.alertTitle, color: 'var(--safe-green)' }}>SAFE</span>
                <span style={styles.severityBadgeSafe}>NOMINAL</span>
              </div>
            </div>
            <p style={styles.alertReason}>All Corridors Clear — Nominal Separation</p>
            <div style={styles.alertMetrics}>
              <span style={styles.metricItem}>Vehicle: <strong>HEMM-01</strong></span>
              <span style={styles.metricItem}>
                Separation: <strong>{snapshot.distanceMeters} m</strong>
              </span>
              <span style={styles.metricItem}>
                Status: <strong style={{ color: 'var(--safe-green)' }}>SAFE</strong>
              </span>
            </div>
          </div>
        )}

        {/* 2. UPCOMING BLIND CURVE */}
        {hasUpcoming && upcomingHazard && (
          <div style={{ ...styles.alertCard, ...styles.alertCardWarning }}>
            <div style={styles.alertCardHeader}>
              <div style={styles.alertTitleGroup}>
                <Navigation size={18} color="var(--warn-amber)" />
                <span style={styles.alertTitle}>
                  {formatCurveName(upcomingHazard.featureId)} — UPCOMING
                </span>
                <span style={styles.severityBadgeWarning}>UPCOMING HAZARD</span>
              </div>
            </div>
            <p style={styles.alertReason}>
              {upcomingHazard.warningLabel || `${formatCurveName(upcomingHazard.featureId)} ahead on haul corridor.`}
            </p>
            <div style={styles.alertMetrics}>
              <span style={styles.metricItem}>Vehicle: <strong>HEMM-01</strong></span>
              <span style={styles.metricItem}>
                Distance: <strong style={{ color: 'var(--warn-amber)' }}>{upcomingHazard.distanceMeters} m</strong>
              </span>
              <span style={styles.metricItem}>Severity: <strong>{upcomingHazard.severity}</strong></span>
              <span style={styles.metricItem}>Rec. Speed: <strong>{upcomingHazard.recommendedSpeed} km/h</strong></span>
            </div>
          </div>
        )}

        {/* 3. BLIND CURVE ACTIVE — BC01 */}
        {hasBC01Active && (
          <div style={{ ...styles.alertCard, ...styles.alertCardCritical }}>
            <div style={styles.alertCardHeader}>
              <div style={styles.alertTitleGroup}>
                <AlertCircle size={18} color="var(--crit-red)" />
                <span style={styles.alertTitle}>
                  {formatActiveCurveName(activeCurveId01)} — ACTIVE
                </span>
                <span style={styles.severityBadgeCritical}>ACTIVE</span>
              </div>
            </div>
            <p style={styles.alertReason}>
              Vehicle is currently traversing {formatActiveCurveName(activeCurveId01)}. Reduced visibility — proceed with extreme caution.
            </p>
            <div style={styles.alertMetrics}>
              <span style={styles.metricItem}>Vehicle: <strong>HEMM-01</strong></span>
              <span style={styles.metricItem}>
                Status: <strong style={{ color: 'var(--crit-red)' }}>ACTIVE</strong>
              </span>
              <span style={styles.metricItem}>Zone: <strong>{activeCurveId01 ?? 'BLIND_CURVE_01'}</strong></span>
            </div>
          </div>
        )}

        {/* 4. BLIND CURVE ACTIVE — BC02 */}
        {hasBC02Active && (
          <div style={{ ...styles.alertCard, ...styles.alertCardCritical }}>
            <div style={styles.alertCardHeader}>
              <div style={styles.alertTitleGroup}>
                <AlertCircle size={18} color="var(--crit-red)" />
                <span style={styles.alertTitle}>
                  {formatActiveCurveName(activeCurveId02)} — ACTIVE
                </span>
                <span style={styles.severityBadgeCritical}>ACTIVE</span>
              </div>
            </div>
            <p style={styles.alertReason}>
              Vehicle is currently traversing {formatActiveCurveName(activeCurveId02)}. Reduced visibility — proceed with extreme caution.
            </p>
            <div style={styles.alertMetrics}>
              <span style={styles.metricItem}>Vehicle: <strong>HEMM-01</strong></span>
              <span style={styles.metricItem}>
                Status: <strong style={{ color: 'var(--crit-red)' }}>ACTIVE</strong>
              </span>
              <span style={styles.metricItem}>Zone: <strong>{activeCurveId02 ?? 'BLIND_CURVE_02'}</strong></span>
            </div>
          </div>
        )}

        {/* 5. APPROACHING VEHICLE */}
        {approachingDetected && (
          <div
            style={{
              ...styles.alertCard,
              borderLeft: `4px solid ${riskColor}`,
              backgroundColor: approachingRiskLevel === 'HIGH'
                ? 'rgba(249, 115, 22, 0.05)'
                : 'rgba(230, 169, 58, 0.05)',
            }}
          >
            <div style={styles.alertCardHeader}>
              <div style={styles.alertTitleGroup}>
                <Car size={18} color={riskColor} />
                <span style={styles.alertTitle}>APPROACHING VEHICLE DETECTED</span>
                <span
                  style={{
                    ...styles.severityBadgeBase,
                    backgroundColor: approachingRiskLevel === 'HIGH'
                      ? 'rgba(249,115,22,0.2)'
                      : 'rgba(230,169,58,0.2)',
                    color: riskColor,
                  }}
                >
                  {approachingRiskLevel}
                </span>
              </div>
            </div>
            <p style={styles.alertReason}>
              {approachingObjectType} approaching HEMM-01 on haul corridor.
            </p>
            <div style={styles.alertMetrics}>
              <span style={styles.metricItem}>Vehicle: <strong>HEMM-01</strong></span>
              <span style={styles.metricItem}>Object: <strong>{approachingObjectType}</strong></span>
              {approachingDistanceM !== null && (
                <span style={styles.metricItem}>
                  Distance: <strong style={{ color: riskColor }}>{approachingDistanceM.toFixed(2)} m</strong>
                </span>
              )}
              <span style={styles.metricItem}>
                TTC: <strong style={{ color: riskColor }}>{ttcDisplay}</strong>
              </span>
              <span style={styles.metricItem}>
                Risk: <strong style={{ color: riskColor }}>{approachingRiskLevel}</strong>
              </span>
              <span style={styles.metricItem}>
                Action: <strong style={{ color: riskColor }}>{approachingAction}</strong>
              </span>
            </div>
          </div>
        )}

        {/* Safety Protocol Info */}
        <div style={styles.infoSection}>
          <div style={styles.infoTitleRow}>
            <ShieldAlert size={14} color="var(--accent-blue)" />
            <span style={styles.infoTitle}>SAFETY PROTOCOL SPECIFICATION</span>
          </div>
          <p style={styles.infoText}>
            Safety alerts are generated by the NETRA Phase 2A/2D rule-based engine.
            BLIND CURVE ACTIVE: vehicle within 100 m of curve apex.
            APPROACHING VEHICLE: radar-detected object with HIGH/MEDIUM risk.
            UPCOMING HAZARD: hazard within 200 m lookahead window.
            All states update live via existing WebSocket telemetry — no refresh needed.
          </p>
        </div>

      </div>
    </div>
  );
};

// ── Styles — all dark/black; accents via left-border and text only ─────────────
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
  counterBadge: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: '2px',
  },
  subheading: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    margin: 0,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  // Base dark card
  alertCard: {
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    padding: '16px',
  },
  // Left-border accent variants — card bg stays dark
  alertCardSafe: {
    borderLeft: '4px solid var(--safe-green)',
    backgroundColor: 'rgba(47, 191, 113, 0.04)',
  },
  alertCardWarning: {
    borderLeft: '4px solid var(--warn-amber)',
    backgroundColor: 'rgba(230, 169, 58, 0.04)',
  },
  alertCardCritical: {
    borderLeft: '4px solid var(--crit-red)',
    backgroundColor: 'rgba(229, 72, 77, 0.05)',
  },
  alertCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  alertTitleGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  alertTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '0.03em',
  },
  // Shared badge base
  severityBadgeBase: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '2px',
  },
  severityBadgeSafe: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '2px',
    backgroundColor: 'rgba(47, 191, 113, 0.2)',
    color: 'var(--safe-green)',
  },
  severityBadgeWarning: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '2px',
    backgroundColor: 'rgba(230, 169, 58, 0.2)',
    color: 'var(--warn-amber)',
  },
  severityBadgeCritical: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '2px',
    backgroundColor: 'rgba(229, 72, 77, 0.2)',
    color: 'var(--crit-red)',
  },
  alertReason: {
    fontSize: '12px',
    color: 'var(--text-primary)',
    margin: '0 0 12px 0',
    lineHeight: '1.4',
  },
  alertMetrics: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '16px',
    paddingTop: '10px',
    borderTop: '1px solid var(--line)',
  },
  metricItem: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
  },
  infoSection: {
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    padding: '16px',
  },
  infoTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  infoTitle: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--accent-blue)',
    letterSpacing: '0.05em',
  },
  infoText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: '1.4',
  },
};

export default Alerts;
