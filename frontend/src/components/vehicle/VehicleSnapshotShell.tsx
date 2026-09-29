import React from 'react';
import { 
  Truck, 
  AlertTriangle, 
  AlertOctagon, 
  ArrowDownCircle,
  Mountain,
  Wifi,
  WifiOff,
  RefreshCw,
} from 'lucide-react';
import type { SimulationTelemetrySnapshot } from '../../services/demoSimulation';
import {
  ACTIVE_BLIND_CURVE_HAZARD,
  formatDistanceToBlindCurve,
} from '../../data/activeHaulRoute';
import { toCompactEventsFromSnapshot } from '../../services/compactEventAdapter';
import { getSensorHealthDisplayEntries, hasDegradedSensor } from '../../utils/sensorHealthDisplay';
import type { CompactSensorHealth } from '../../types/compactEvent';
import { useNetworkSyncStatus } from '../../hooks/useNetworkSyncStatus';
import { isActiveAlert, resolveFinalRisk, resolveRecommendedAction } from '../../utils/finalRiskDisplay';
import {
  getSyncPhase,
  formatLastSyncTime,
  LINK_STATUS_COLOR,
  SYNC_PHASE_COLOR,
  SYNC_PHASE_LABEL,
  type LinkStatus,
} from '../../utils/networkSyncDisplay';

interface VehicleSnapshotShellProps {
  selectedVehicleId: string | null;
  onSelectVehicle?: (id: string | null) => void;
  onClearSelection?: () => void;
  snapshot?: SimulationTelemetrySnapshot;
  /** Hysteresis-stable safety level from useTelemetry (avoids oscillation at thresholds). */
  stableLevel?: import('../../services/safetyAssessment').SafetyAssessmentLevel;
  /** Authoritative single action string for the current stable level. */
  stableAction?: string;
  // Phase 2D
  backendPrediction?: import('../../hooks/useTelemetry').BackendOncomingPrediction | null;
  conflictPhase?: import('../../services/demoSimulation').ConflictPhase;
  blindCurve01Active?: boolean;
  blindCurve02Active?: boolean;
  simulationPrediction?: import('../../services/demoSimulation').SimulationPrediction | null;
}

/**
 * Sensor Health strip (Feature 8) — minimal, reused per-vehicle.
 * Renders the existing Compact Event sensor_health values as small chips.
 * Purely presentational: does not compute or alter any status values.
 */
const SensorHealthStrip: React.FC<{ health: CompactSensorHealth }> = ({ health }) => {
  const entries = getSensorHealthDisplayEntries(health);
  return (
    <div style={styles.sensorHealthRow} aria-label="Sensor health">
      {entries.map((entry) => (
        <div
          key={entry.key}
          style={{
            ...styles.sensorChip,
            ...(entry.degraded ? styles.sensorChipDegraded : {}),
          }}
          title={`${entry.label}: ${entry.status}`}
        >
          <span style={{ ...styles.sensorChipDot, backgroundColor: entry.color }} />
          <span style={styles.sensorChipLabel}>{entry.label}</span>
          <span style={{ ...styles.sensorChipStatus, color: entry.color }}>{entry.status}</span>
        </div>
      ))}
    </div>
  );
};

/**
 * Per-vehicle network/buffer badge (Feature 9) — minimal, reused per-vehicle.
 * Purely presentational: renders the existing (shared) connectivity state
 * plus this vehicle's real buffered-event count from GET /api/network/buffer.
 */
const VehicleLinkBadge: React.FC<{
  linkStatus: LinkStatus;
  bufferedCount: number;
  syncing: boolean;
}> = ({ linkStatus, bufferedCount, syncing }) => {
  const phase = getSyncPhase({ linkStatus, bufferedCount, syncing });
  const color = SYNC_PHASE_COLOR[phase];
  return (
    <div
      style={{ ...styles.sensorChip, ...(phase === 'OFFLINE' || phase === 'BUFFERED' ? styles.sensorChipDegraded : {}) }}
      title={`Network: ${linkStatus}${bufferedCount > 0 ? ` — ${bufferedCount} buffered` : ''}`}
    >
      {linkStatus === 'OFFLINE' ? <WifiOff size={10} color={color} /> : <Wifi size={10} color={color} />}
      <span style={styles.sensorChipLabel}>Link</span>
      <span style={{ ...styles.sensorChipStatus, color }}>
        {SYNC_PHASE_LABEL[phase]}
        {bufferedCount > 0 ? ` (${bufferedCount})` : ''}
      </span>
    </div>
  );
};

export const VehicleSnapshotShell: React.FC<VehicleSnapshotShellProps> = ({
  selectedVehicleId = 'HEMM-01',
  onSelectVehicle,
  snapshot,
  stableLevel,
  stableAction,
  backendPrediction,
  conflictPhase: _conflictPhase,
  blindCurve01Active = false,
  blindCurve02Active = false,
  simulationPrediction,
}) => {
  // Use real simulation snapshot values if running, or default reference values
  const hemm01Speed = snapshot?.hemm01?.speedKmh ?? 22;
  const hemm01Heading = snapshot?.hemm01?.heading ?? 72;
  const hemm01Lat = snapshot?.telemetryHemm01?.position?.latitude ? Number(snapshot.telemetryHemm01.position.latitude).toFixed(4) : '--';
  const hemm01Lon = snapshot?.telemetryHemm01?.position?.longitude ? Number(snapshot.telemetryHemm01.position.longitude).toFixed(4) : '--';
  const hemm01Sec = snapshot?.currentSectionHemm01?.sectionId 
    ? `${snapshot.currentSectionHemm01.sectionId} (${snapshot.currentSectionHemm01.name})` 
    : '--';

  const hemm02Speed = snapshot?.hemm02?.speedKmh ?? 16;
  const hemm02Heading = snapshot?.hemm02?.heading ?? 248;
  const hemm02Lat = snapshot?.telemetryHemm02?.position?.latitude ? Number(snapshot.telemetryHemm02.position.latitude).toFixed(4) : '--';
  const hemm02Lon = snapshot?.telemetryHemm02?.position?.longitude ? Number(snapshot.telemetryHemm02.position.longitude).toFixed(4) : '--';
  const hemm02Sec = snapshot?.currentSectionHemm02?.sectionId 
    ? `${snapshot.currentSectionHemm02.sectionId} (${snapshot.currentSectionHemm02.name})` 
    : '--';

  // Feature 8: existing Compact Event sensor_health, adapted (not recomputed)
  // from the current telemetry snapshot. Falls back to undefined when no
  // snapshot is available yet, so the strip simply doesn't render.
  const compactEvents = snapshot ? toCompactEventsFromSnapshot(snapshot) : undefined;

  // Feature 9: existing backend network status + Store-and-Forward buffer/sync
  // state (GET/POST /api/network/*), polled — never fabricated locally.
  const { linkStatus, bufferedTotal, bufferedByVehicle, syncStatus, syncing, triggerSyncNow } =
    useNetworkSyncStatus();
  const hemm01Buffered = bufferedByVehicle['HEMM-01'] ?? 0;
  const hemm02Buffered = bufferedByVehicle['HEMM-02'] ?? 0;
  const fleetSyncPhase = getSyncPhase({ linkStatus, bufferedCount: bufferedTotal, syncing });
  const canSyncNow = linkStatus === 'ONLINE' && bufferedTotal > 0 && !syncing;

  const distance = snapshot?.distanceMeters ?? 142;
  // Use TTC sentinel to detect unavailable case (99.9 = not closing)
  const ttcRaw = snapshot?.ttcSecondsRaw ?? null;
  const ttcDisplay = ttcRaw !== null ? `${ttcRaw} s` : '—';

  // Phase 2A: use full 4-level safetyLevel so CRITICAL and HIGH both show the risk badge,
  // while CAUTION is an advisory (no stop condition) and UNKNOWN is not treated as NORMAL.
  // Use stableLevel (hysteresis-filtered) when available to prevent oscillation at thresholds.
  const _effectiveLevel = stableLevel ?? snapshot?.safetyLevel;

  // Feature 10: the selected vehicle's own Compact Event (final_risk,
  // recommended_action, distance_m, ttc_s, risk_type) is the preferred
  // source for the panel — falls back to the existing hysteresis-stable
  // level/action when no snapshot/Compact Event is available yet.
  const selectedCompactEvent = compactEvents
    ? (selectedVehicleId === 'HEMM-02' ? compactEvents.hemm02 : compactEvents.hemm01)
    : undefined;

  // Final, displayed risk level for the selected vehicle. Never recomputed —
  // just picks between the Compact Event's final_risk and the existing
  // stable/snapshot level.
  const finalRisk = resolveFinalRisk(selectedCompactEvent?.final_risk, _effectiveLevel);

  // Active Alert gate: CAUTION / HIGH / CRITICAL only. Driven ONLY by the
  // resolved risk level — never by distance alone (see isActiveAlert).
  const isActiveConflict = isActiveAlert(finalRisk);

  // Feature 10: recommended_action is read directly from the Compact Event
  // (no duplicate text relabeling) with a fallback to the existing stable
  // action / snapshot action when the Compact Event isn't available yet.
  const activeAction = resolveRecommendedAction(
    selectedCompactEvent?.recommended_action,
    stableAction ?? snapshot?.recommendedAction ?? null
  );
  const recomDisplay = activeAction !== 'NOT AVAILABLE' ? {
    action: activeAction,
    detail:
      activeAction === 'HOLD' || activeAction === 'HOLD / STOP'
        ? 'Bring vehicle to a complete stop'
      : activeAction === 'REDUCE SPEED'
        ? 'Reduce to safe following speed'
      : activeAction === 'MAINTAIN CONTROLLED SPEED'
        ? 'Maintain current speed — DEMO prototype target'
      : activeAction === 'PROCEED'
        ? 'Maintain safe following distance'
      : 'Awaiting assessment',
    color:
      activeAction === 'HOLD' || activeAction === 'HOLD / STOP'
        ? '#EF4444'
      : activeAction === 'REDUCE SPEED'
        ? '#F97316'
      : activeAction === 'MAINTAIN CONTROLLED SPEED'
        ? '#F59E0B'
      : '#22C55E',
  } : {
    action: 'NOT AVAILABLE',
    detail: 'Risk assessment not available',
    color: '#94A3B8',
  };

  // Feature 10: distance / TTC / risk type shown in the Active Alerts card,
  // preferring the selected vehicle's own Compact Event values when
  // available, falling back to the existing shared snapshot values.
  const alertDistance = selectedCompactEvent?.distance_m ?? distance;
  const alertTtcDisplay = selectedCompactEvent?.ttc_s != null ? `${selectedCompactEvent.ttc_s} s` : ttcDisplay;
  const alertRiskType = selectedCompactEvent?.risk_type;

  return (
    <aside style={styles.sidebar} aria-label="Vehicle Details & Realtime Safety Panel">
      {/* 1. Vehicle Details */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Vehicle Details</span>
        </div>

        <div style={styles.cardsColumn}>
          {/* HEMM-01 Card */}
          <div
            style={{
              ...styles.vehicleCard,
              ...(selectedVehicleId === 'HEMM-01' ? styles.vehicleCardSelected : {}),
            }}
            onClick={() => onSelectVehicle?.('HEMM-01')}
          >
            <div style={styles.cardHeader}>
              <div style={styles.cardHeaderLeft}>
                <div style={styles.truckIconGreen}>
                  <Truck size={14} color="#22C55E" />
                </div>
                <span style={styles.vehicleName}>HEMM-01 (Forward ↑)</span>
              </div>
              <div style={styles.activeTag}>
                {compactEvents && hasDegradedSensor(compactEvents.hemm01.sensor_health) ? (
                  <>
                    <span style={styles.amberDot} />
                    <span style={{ color: '#F59E0B' }}>Sensor Issue</span>
                  </>
                ) : (
                  <>
                    <span style={styles.greenDot} />
                    <span>Active</span>
                  </>
                )}
              </div>
            </div>

            <div style={styles.cardGrid}>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Lat:</span>
                <span style={styles.gridValue}>{hemm01Lat}° N</span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Lon:</span>
                <span style={styles.gridValue}>{hemm01Lon}° E</span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Speed:</span>
                <span style={styles.gridValue}>{hemm01Speed} km/h</span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Heading:</span>
                <span style={styles.gridValue}>{hemm01Heading}°</span>
              </div>
              <div style={{ ...styles.gridItem, gridColumn: 'span 2' }}>
                <span style={styles.gridLabel}>Section:</span>
                <span style={styles.gridValueHighlight}>{hemm01Sec}</span>
              </div>
            </div>

            {compactEvents && (
              <SensorHealthStrip health={compactEvents.hemm01.sensor_health} />
            )}
            <div style={styles.linkRow}>
              <VehicleLinkBadge linkStatus={linkStatus} bufferedCount={hemm01Buffered} syncing={syncing} />
            </div>
          </div>

          {/* HEMM-02 Card */}
          <div
            style={{
              ...styles.vehicleCard,
              ...(selectedVehicleId === 'HEMM-02' ? styles.vehicleCardSelected : {}),
            }}
            onClick={() => onSelectVehicle?.('HEMM-02')}
          >
            <div style={styles.cardHeader}>
              <div style={styles.cardHeaderLeft}>
                <div style={styles.truckIconBlue}>
                  <Truck size={14} color="#38BDF8" />
                </div>
                <span style={styles.vehicleName}>HEMM-02 (Reverse ↓)</span>
              </div>
              <div style={styles.activeTag}>
                {compactEvents && hasDegradedSensor(compactEvents.hemm02.sensor_health) ? (
                  <>
                    <span style={styles.amberDot} />
                    <span style={{ color: '#F59E0B' }}>Sensor Issue</span>
                  </>
                ) : (
                  <>
                    <span style={styles.greenDot} />
                    <span>Active</span>
                  </>
                )}
              </div>
            </div>

            <div style={styles.cardGrid}>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Lat:</span>
                <span style={styles.gridValue}>{hemm02Lat}° N</span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Lon:</span>
                <span style={styles.gridValue}>{hemm02Lon}° E</span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Speed:</span>
                <span style={styles.gridValue}>{hemm02Speed} km/h</span>
              </div>
              <div style={styles.gridItem}>
                <span style={styles.gridLabel}>Heading:</span>
                <span style={styles.gridValue}>{hemm02Heading}°</span>
              </div>
              <div style={{ ...styles.gridItem, gridColumn: 'span 2' }}>
                <span style={styles.gridLabel}>Section:</span>
                <span style={styles.gridValueHighlight}>{hemm02Sec}</span>
              </div>
            </div>

            {compactEvents && (
              <SensorHealthStrip health={compactEvents.hemm02.sensor_health} />
            )}
            <div style={styles.linkRow}>
              <VehicleLinkBadge linkStatus={linkStatus} bufferedCount={hemm02Buffered} syncing={syncing} />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Upcoming Hazards */}
      <div style={styles.section}>
        <span style={styles.sectionTitle}>Upcoming Hazards</span>
        <div style={styles.hazardsList}>
          {/* Exactly ONE active hazard (BLIND_CURVE), distance from the selected vehicle along the route */}
          <div style={styles.hazardRow}>
            <div style={styles.hazardLeft}>
              <div style={styles.hazardIconAmber}>
                <AlertTriangle size={13} color="#F59E0B" />
              </div>
              <span style={styles.hazardName}>{ACTIVE_BLIND_CURVE_HAZARD.name}</span>
            </div>
            <span style={styles.hazardDist}>
              {formatDistanceToBlindCurve(
                (selectedVehicleId === 'HEMM-02'
                  ? snapshot?.telemetryHemm02
                  : snapshot?.telemetryHemm01
                )?.route_distance
              )}
            </span>
          </div>
        </div>
      </div>

      {/* 2.5 Blind Curve Active — shown ONLY when a vehicle enters the activation zone.
           This is contextual route information, NOT a collision alert. */}
      {(blindCurve01Active || blindCurve02Active) && (
        <div style={styles.section}>
          <div style={{
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.4)',
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={14} color="#F59E0B" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#F59E0B', letterSpacing: '0.08em' }}>
                {blindCurve01Active ? 'BLIND CURVE 01' : 'BLIND CURVE 02'} — ACTIVE ZONE
              </span>
            </div>
            <span style={{ fontSize: '10px', color: '#94A3B8', paddingLeft: '22px' }}>
              Visibility restricted. Approach at reduced speed.
            </span>
            <span style={{ fontSize: '9px', color: '#64748B', paddingLeft: '22px', fontStyle: 'italic' }}>
              Zone-triggered contextual advisory — not a collision alert.
            </span>
          </div>
        </div>
      )}

      {/* 2.7 Oncoming Vehicle Prediction + LoRa command
           Shown when the backend (authoritative) or simulation predictor fires.
           The backend prediction always takes priority. */}
      {(backendPrediction?.predicted || simulationPrediction?.predicted) && (
        <div style={styles.section}>
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.35)',
            borderRadius: '8px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}>
            {/* Detection source — clearly labelled */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertOctagon size={14} color="#EF4444" />
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#EF4444', letterSpacing: '0.08em' }}>
                ONCOMING VEHICLE DETECTED
              </span>
            </div>
            <div style={{ fontSize: '10px', color: '#94A3B8', paddingLeft: '22px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span>Vehicle: <strong style={{ color: '#F8FAFC' }}>
                {backendPrediction?.oncomingVehicleId ?? simulationPrediction?.oncomingVehicleId ?? 'HEMM-02'}
              </strong></span>
              <span>Direction: <strong style={{ color: '#F8FAFC' }}>OPPOSITE</strong></span>
              <span>Conflict zone: <strong style={{ color: '#F59E0B' }}>
                {backendPrediction?.atBlindCurveId ?? simulationPrediction?.atBlindCurveId ?? '—'}
              </strong></span>
              {(backendPrediction?.estimatedTtcS ?? simulationPrediction?.estimatedTtcS) && (
                <span>Est. TTC: <strong style={{ color: '#F8FAFC' }}>
                  {(backendPrediction?.estimatedTtcS ?? simulationPrediction?.estimatedTtcS)?.toFixed(1)} s
                </strong></span>
              )}
              <span style={{ color: '#64748B', fontStyle: 'italic', marginTop: '2px' }}>
                Source: {backendPrediction?.predicted ? 'TELEMETRY_PREDICTION (backend)' : 'SIMULATION_PREDICTION'}
              </span>
            </div>
            {/* LoRa command panel — only shown when backend issued a command */}
            {backendPrediction?.predicted && backendPrediction.commands && backendPrediction.commands.length > 0 && (
              <div style={{
                marginTop: '4px',
                paddingTop: '6px',
                borderTop: '1px solid rgba(239,68,68,0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '3px',
              }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#F59E0B', letterSpacing: '0.1em' }}>SAFETY COMMAND ISSUED</span>
                {backendPrediction.commands.map((cmd) => (
                  <div key={cmd.command_id} style={{ fontSize: '9px', color: '#94A3B8', display: 'flex', gap: '6px' }}>
                    <span style={{ color: '#64748B' }}>{cmd.command_id}</span>
                    <span style={{ color: '#F8FAFC' }}>{cmd.vehicle_id}</span>
                    <span style={{ color: '#F97316' }}>→ {cmd.action}</span>
                  </div>
                ))}
                <div style={{ fontSize: '9px', color: '#64748B', marginTop: '2px' }}>
                  Conflict ID: {backendPrediction.conflictId} &nbsp;|&nbsp;
                  Transport: <span style={{ color: '#F59E0B' }}>{backendPrediction.transportStatus ?? 'LORA_SIMULATED'}</span>
                </div>
                <div style={{ fontSize: '8px', color: '#475569', fontStyle: 'italic', marginTop: '1px' }}>
                  No physical LoRa radio active — SIMULATED transport only.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Active Alerts — only shown for CAUTION / HIGH / CRITICAL final risk.
           NORMAL / UNKNOWN never show an active alert, and distance alone
           (see isActiveAlert in utils/finalRiskDisplay.ts) can never trigger one. */}
      <div style={styles.section}>
        <span style={styles.sectionTitleRed}>
          <span style={styles.redDot} />
          Active Alerts
        </span>

        {isActiveConflict ? (
          <div style={styles.alertCard}>
            <div style={styles.alertLeftIcon}>
              <AlertOctagon size={16} color="#EF4444" />
            </div>
            <div style={styles.alertContent}>
              <div style={styles.alertTitle}>VEHICLE CONFLICT</div>
              <div style={styles.alertSubtitle}>HEMM-01 &amp; HEMM-02</div>
              <div style={styles.alertMetrics}>
                <span>Distance: {alertDistance} m</span>
                <span>|</span>
                {/* Only show a real TTC — never the 99.9 not-closing sentinel */}
                <span>TTC: {alertTtcDisplay}</span>
                {alertRiskType && alertRiskType !== 'UNKNOWN' && (
                  <>
                    <span>|</span>
                    <span>Type: {alertRiskType}</span>
                  </>
                )}
              </div>
            </div>
            <span style={{ ...styles.riskBadge, ...styles[`riskBadge${finalRisk}`] }}>
              {finalRisk}
            </span>
          </div>
        ) : (
          <div style={{ ...styles.alertCard, backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={styles.alertLeftIcon}>
              <AlertOctagon size={16} color="#22C55E" />
            </div>
            <div style={styles.alertContent}>
              <div style={{ ...styles.alertTitle, color: '#22C55E' }}>NO ACTIVE CONFLICT</div>
              <div style={styles.alertSubtitle}>Monitoring HEMM-01 &amp; HEMM-02</div>
              <div style={styles.alertMetrics}>
                <span>Distance: {alertDistance} m</span>
                <span>|</span>
                <span>Final Risk: {finalRisk}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. System Recommendation */}
      <div style={styles.section}>
        <span style={styles.sectionTitle}>System Recommendation</span>
        <div style={styles.recommendationCard}>
          <div style={styles.recomIconContainer}>
            <ArrowDownCircle size={18} color={recomDisplay.color} />
          </div>
          <div style={styles.recomText}>
            <div style={{ ...styles.recomAction, color: recomDisplay.color }}>{recomDisplay.action}</div>
            <div style={styles.recomDetail}>{recomDisplay.detail}</div>
          </div>
        </div>
      </div>

      {/* 4.5 Network & Sync (Feature 9) — existing /api/network/* endpoints, polled */}
      <div style={styles.section}>
        <div style={styles.sectionHeader}>
          <span style={styles.sectionTitle}>Network &amp; Sync</span>
          <button
            style={{ ...styles.syncNowButton, ...(canSyncNow ? {} : styles.syncNowButtonDisabled) }}
            onClick={() => { if (canSyncNow) triggerSyncNow(); }}
            disabled={!canSyncNow}
            title="Sync buffered events now (POST /api/network/sync)"
          >
            <RefreshCw size={10} color={canSyncNow ? '#38BDF8' : '#64748B'} />
            <span>{syncing ? 'SYNCING…' : 'SYNC NOW'}</span>
          </button>
        </div>
        <div style={styles.networkCard}>
          <div style={styles.networkIconContainer}>
            {linkStatus === 'OFFLINE' ? (
              <WifiOff size={16} color={LINK_STATUS_COLOR.OFFLINE} />
            ) : (
              <Wifi size={16} color={LINK_STATUS_COLOR[linkStatus]} />
            )}
          </div>
          <div style={styles.networkText}>
            <div style={{ ...styles.networkStatusLine, color: SYNC_PHASE_COLOR[fleetSyncPhase] }}>
              {linkStatus} · {SYNC_PHASE_LABEL[fleetSyncPhase]}
            </div>
            <div style={styles.networkDetailLine}>
              Buffered: {bufferedTotal}
              {syncStatus ? ` · Synced: ${syncStatus.synced_count} · Failed: ${syncStatus.failed_count}` : ''}
            </div>
            <div style={styles.networkDetailLine}>
              Last sync: {formatLastSyncTime(syncStatus?.last_sync_time ?? null)}
            </div>
          </div>
        </div>
      </div>

      {/* 5. Map Context */}
      <div style={styles.contextFooter}>
        <div style={styles.contextIcon}>
          <Mountain size={16} color="#38BDF8" />
        </div>
        <div style={styles.contextText}>
          <span style={styles.contextLabel}>Map Context</span>
          <span style={styles.contextValue}>Bailadila Mine / Deposit-14</span>
        </div>
      </div>
    </aside>
  );
};

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '320px',
    height: '100%',
    backgroundColor: 'rgba(9, 14, 23, 0.95)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '16px 14px',
    flexShrink: 0,
    zIndex: 20,
    userSelect: 'none',
    boxSizing: 'border-box',
    overflowY: 'auto',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#F8FAFC',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  sectionTitleRed: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#EF4444',
    fontFamily: 'Inter, system-ui, sans-serif',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  redDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#EF4444',
    display: 'inline-block',
  },
  cardsColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  vehicleCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    padding: '10px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  vehicleCardSelected: {
    borderColor: '#3B82F6',
    backgroundColor: 'rgba(59, 130, 246, 0.06)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  cardHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  truckIconGreen: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  truckIconBlue: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleName: {
    fontSize: '11.5px',
    fontWeight: 700,
    color: '#F1F5F9',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  activeTag: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '10px',
    color: '#22C55E',
    fontWeight: 600,
  },
  greenDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    backgroundColor: '#22C55E',
  },
  amberDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    backgroundColor: '#F59E0B',
  },
  sensorHealthRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  },
  sensorChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '2px 5px',
    borderRadius: '3px',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
  },
  sensorChipDegraded: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.35)',
  },
  sensorChipDot: {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  sensorChipLabel: {
    fontSize: '9px',
    color: '#94A3B8',
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: 500,
  },
  sensorChipStatus: {
    fontSize: '9px',
    fontFamily: 'monospace',
    fontWeight: 700,
  },
  linkRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '4px',
  },
  networkCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    padding: '9px 11px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  networkIconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  networkText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  networkStatusLine: {
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.03em',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  networkDetailLine: {
    fontSize: '9.5px',
    color: '#94A3B8',
    fontFamily: 'monospace',
  },
  syncNowButton: {
    backgroundColor: 'rgba(56, 189, 248, 0.12)',
    border: '1px solid rgba(56, 189, 248, 0.4)',
    color: '#38BDF8',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '9px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  syncNowButtonDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
  cardGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '5px 8px',
    fontSize: '10.5px',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  gridItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  gridLabel: {
    color: '#64748B',
  },
  gridValue: {
    color: '#CBD5E1',
    fontFamily: 'monospace',
    fontWeight: 500,
  },
  gridValueHighlight: {
    color: '#38BDF8',
    fontWeight: 600,
  },
  hazardsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  hazardRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 9px',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '4px',
  },
  hazardLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  hazardIconAmber: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardIconBlue: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardIconGreen: {
    width: '20px',
    height: '20px',
    borderRadius: '4px',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hazardName: {
    fontSize: '11px',
    color: '#E2E8F0',
    fontWeight: 600,
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  hazardDist: {
    fontSize: '10.5px',
    color: '#94A3B8',
    fontFamily: 'monospace',
    fontWeight: 600,
  },
  alertCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '6px',
    padding: '9px 11px',
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    position: 'relative',
  },
  alertLeftIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
  },
  alertTitle: {
    fontSize: '10.5px',
    fontWeight: 700,
    color: '#EF4444',
    letterSpacing: '0.04em',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  alertSubtitle: {
    fontSize: '10px',
    color: '#CBD5E1',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  alertMetrics: {
    fontSize: '9.5px',
    color: '#94A3B8',
    fontFamily: 'monospace',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  riskBadge: {
    fontSize: '8.5px',
    fontWeight: 700,
    color: '#FFFFFF',
    backgroundColor: '#DC2626',
    padding: '2px 5px',
    borderRadius: '3px',
    letterSpacing: '0.04em',
  },
  // Feature 10: per-level Final Risk badge colors (CAUTION/HIGH/CRITICAL only —
  // NORMAL/UNKNOWN never reach the alert card, see isActiveAlert).
  riskBadgeCAUTION: {
    backgroundColor: '#F59E0B',
  },
  riskBadgeHIGH: {
    backgroundColor: '#F97316',
  },
  riskBadgeCRITICAL: {
    backgroundColor: '#DC2626',
  },
  recommendationCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '6px',
    padding: '9px 11px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  recomIconContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  recomText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  recomAction: {
    fontSize: '11px',
    fontWeight: 700,
    color: '#EF4444',
    letterSpacing: '0.03em',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  recomDetail: {
    fontSize: '10px',
    color: '#94A3B8',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  contextFooter: {
    marginTop: 'auto',
    paddingTop: '10px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
  },
  contextIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextText: {
    display: 'flex',
    flexDirection: 'column',
  },
  contextLabel: {
    fontSize: '9.5px',
    color: '#64748B',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  contextValue: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#CBD5E1',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
};
