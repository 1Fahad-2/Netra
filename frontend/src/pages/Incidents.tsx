
/**
 * NETRA — Incident Records & Historical Safety Report Ledger
 *
 * Data sources (existing, no new API):
 *   1. fetchTelemetryHistory('HEMM-01' | 'HEMM-02', 200) → GET /api/telemetry/{id}/history
 *      Returns VehicleTelemetry[] (newest first) from PostgreSQL.
 *   2. fetchActiveAlerts() → GET /api/alerts  (used for live alert items)
 *   3. telemetry.alerts  (live WebSocket alert stream from useTelemetry)
 *
 * Events are derived by detecting state transitions in the telemetry history.
 * Only genuine state-changes are shown (not every raw tick).
 */

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FileText,
  History,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Navigation,
  Car,
  RefreshCw,
  Filter,
} from 'lucide-react';

import type { UseTelemetryReturn } from '../hooks/useTelemetry';
import { fetchTelemetryHistory, fetchActiveAlerts } from '../services/api';
import type { VehicleTelemetry, AlertItem } from '../types/contract';
interface IncidentsProps {
  telemetry: UseTelemetryReturn;
}

// ── Event classification ────────────────────────────────────────────────────────

type EventType =
  | 'NEAR_MISS'
  | 'CRITICAL_PROXIMITY'
  | 'APPROACHING_VEHICLE'
  | 'BLIND_CURVE_ACTIVE'
  | 'UPCOMING_BLIND_CURVE'
  | 'SAFE'
  | 'ALERT';

interface ReportEvent {
  id: string;
  timestamp: string;
  vehicleId: string;
  eventType: EventType;
  sectionId: string;
  riskLevel: string;
  recommendedAction: string;
  distanceM: number | null;
  ttcS: number | null;
  objectType: string | null;
  description: string;
}

/** Classify a VehicleTelemetry record into an EventType */
function classifyTelemetry(t: VehicleTelemetry): EventType {
  const risk = (t.risk_level ?? 'LOW').toUpperCase();
  const sec  = (t.section_id ?? '').toUpperCase();
  const obj  = t.object_detected;

  // Near-miss / critical
  if (obj && (risk === 'HIGH' || risk === 'CRITICAL')) return 'NEAR_MISS';
  // Approaching vehicle
  if (obj && risk === 'MEDIUM') return 'APPROACHING_VEHICLE';
  // Also flag non-zero distance object regardless of risk
  if (obj && (t.object_distance ?? 0) > 0) return 'APPROACHING_VEHICLE';

  // Blind curve sections (exclude approach/exit labels)
  if (sec.includes('BLIND_CURVE') && !sec.includes('APPROACH') && !sec.includes('EXIT')) {
    return 'BLIND_CURVE_ACTIVE';
  }
  if (sec.includes('APPROACH')) return 'UPCOMING_BLIND_CURVE';

  return 'SAFE';
}

function describeEvent(t: VehicleTelemetry, type: EventType): string {
  switch (type) {
    case 'NEAR_MISS':
      return `Near-miss detected — ${t.vehicle_id} within ${t.object_distance?.toFixed(1) ?? '?'} m of ${t.object_type ?? 'vehicle'}. TTC: ${t.ttc?.toFixed(1) ?? '?'} s. Action: ${t.recommended_action ?? 'HOLD'}.`;
    case 'APPROACHING_VEHICLE':
      return `${t.object_type ?? 'HEMM-02'} approaching ${t.vehicle_id} — distance ${t.object_distance?.toFixed(2) ?? '?'} m, TTC ${t.ttc?.toFixed(1) ?? '?'} s.`;
    case 'BLIND_CURVE_ACTIVE':
      return `${t.vehicle_id} traversing blind curve zone (${t.section_id}). Reduced visibility active.`;
    case 'UPCOMING_BLIND_CURVE':
      return `Blind curve ahead — ${t.section_id}. Distance: ${t.object_distance?.toFixed(0) ?? '?'} m. Rec. speed: ${t.route_distance?.toFixed(0) ?? '?'} m on route.`;
    case 'SAFE':
      return `Haul corridor clear. Safe headway maintained.`;
    default:
      return `Safety event recorded.`;
  }
}

/** Collapse consecutive duplicate event types per vehicle into single events */
function collapseStateTransitions(records: VehicleTelemetry[]): ReportEvent[] {
  const result: ReportEvent[] = [];
  const lastTypePerVehicle: Record<string, EventType> = {};

  // records arrive newest-first from the API; process oldest-first for transitions
  const sorted = [...records].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const t of sorted) {
    const type = classifyTelemetry(t);
    const prev = lastTypePerVehicle[t.vehicle_id];

    // Only emit an event when the state changes
    if (type !== prev) {
      lastTypePerVehicle[t.vehicle_id] = type;
      result.push({
        id: `${t.vehicle_id}-${t.timestamp}`,
        timestamp: t.timestamp,
        vehicleId: t.vehicle_id,
        eventType: type,
        sectionId: t.section_id ?? '',
        riskLevel: t.risk_level ?? 'LOW',
        recommendedAction: t.recommended_action ?? 'PROCEED',
        distanceM: t.object_distance ?? null,
        ttcS: t.ttc ?? null,
        objectType: t.object_type ?? null,
        description: describeEvent(t, type),
      });
    }
  }

  // Return newest-first for display
  return result.reverse();
}

/** Convert an AlertItem into a ReportEvent */
function alertToEvent(a: AlertItem): ReportEvent {
  const sev = (a.severity ?? '').toUpperCase();
  let type: EventType = 'ALERT';
  if (sev === 'CRITICAL') type = 'NEAR_MISS';
  else if (sev === 'WARNING') type = 'APPROACHING_VEHICLE';
  return {
    id: `alert-${a.id}`,
    timestamp: a.timestamp,
    vehicleId: a.vehicle_id,
    eventType: type,
    sectionId: '',
    riskLevel: sev,
    recommendedAction: '',
    distanceM: null,
    ttcS: null,
    objectType: null,
    description: `${a.title} — ${a.reason}`,
  };
}

// ── Colour helpers ──────────────────────────────────────────────────────────────

function eventColor(type: EventType): string {
  switch (type) {
    case 'NEAR_MISS':
    case 'CRITICAL_PROXIMITY': return 'var(--crit-red)';
    case 'APPROACHING_VEHICLE': return '#F97316';
    case 'BLIND_CURVE_ACTIVE': return 'var(--crit-red)';
    case 'UPCOMING_BLIND_CURVE': return 'var(--warn-amber)';
    case 'SAFE': return 'var(--safe-green)';
    default: return 'var(--accent-blue)';
  }
}

function eventLabel(type: EventType): string {
  switch (type) {
    case 'NEAR_MISS': return 'NEAR MISS';
    case 'CRITICAL_PROXIMITY': return 'CRITICAL PROXIMITY';
    case 'APPROACHING_VEHICLE': return 'APPROACHING VEHICLE';
    case 'BLIND_CURVE_ACTIVE': return 'BLIND CURVE ACTIVE';
    case 'UPCOMING_BLIND_CURVE': return 'UPCOMING BLIND CURVE';
    case 'SAFE': return 'SAFE';
    case 'ALERT': return 'ALERT';
  }
}

function EventIcon({ type, size = 14 }: { type: EventType; size?: number }) {
  const color = eventColor(type);
  switch (type) {
    case 'NEAR_MISS':
    case 'CRITICAL_PROXIMITY': return <AlertCircle size={size} color={color} />;
    case 'APPROACHING_VEHICLE': return <Car size={size} color={color} />;
    case 'BLIND_CURVE_ACTIVE': return <AlertCircle size={size} color={color} />;
    case 'UPCOMING_BLIND_CURVE': return <Navigation size={size} color={color} />;
    case 'SAFE': return <ShieldCheck size={size} color={color} />;
    default: return <AlertTriangle size={size} color={color} />;
  }
}

// ── Timestamp formatter ────────────────────────────────────────────────────────

function fmtTs(ts: string): string {
  try {
    const d = new Date(ts);
    const date = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    return `${date} ${time}`;
  } catch {
    return ts;
  }
}

// ── Filter types ────────────────────────────────────────────────────────────────

type FilterKey = 'ALL' | 'BLIND_CURVE' | 'APPROACHING_VEHICLE' | 'NEAR_MISS' | 'SAFE';

function matchesFilter(event: ReportEvent, filter: FilterKey, vehicle: string): boolean {
  const vehicleOk = vehicle === 'ALL' || event.vehicleId === vehicle;
  if (!vehicleOk) return false;
  switch (filter) {
    case 'ALL': return true;
    case 'BLIND_CURVE':
      return event.eventType === 'BLIND_CURVE_ACTIVE' || event.eventType === 'UPCOMING_BLIND_CURVE';
    case 'APPROACHING_VEHICLE':
      return event.eventType === 'APPROACHING_VEHICLE';
    case 'NEAR_MISS':
      return event.eventType === 'NEAR_MISS' || event.eventType === 'CRITICAL_PROXIMITY';
    case 'SAFE':
      return event.eventType === 'SAFE';
  }
}

// ── Main Component ──────────────────────────────────────────────────────────────

export const Incidents: React.FC<IncidentsProps> = ({ telemetry }) => {
  const { alerts: liveAlerts } = telemetry;

  const [histH01, setHistH01] = useState<VehicleTelemetry[]>([]);
  const [histH02, setHistH02] = useState<VehicleTelemetry[]>([]);
  const [restAlerts, setRestAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const [activeFilter, setActiveFilter] = useState<FilterKey>('ALL');
  const [vehicleFilter, setVehicleFilter] = useState<string>('ALL');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [h1, h2, al] = await Promise.all([
        fetchTelemetryHistory('HEMM-01', 200),
        fetchTelemetryHistory('HEMM-02', 200),
        fetchActiveAlerts(),
      ]);
      setHistH01(h1);
      setHistH02(h2);
      setRestAlerts(al);
      setLastRefresh(new Date());
    } catch {
      // keep whatever we had
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Derive events from telemetry history
  const historyEvents = useMemo<ReportEvent[]>(() => {
    return collapseStateTransitions([...histH01, ...histH02]);
  }, [histH01, histH02]);

  // Merge REST alerts and live WS alerts, de-duplicated by id
  const alertEvents = useMemo<ReportEvent[]>(() => {
    const byId = new Map<string, AlertItem>();
    restAlerts.forEach(a => { if (a?.id != null) byId.set(a.id, a); });
    liveAlerts.forEach((a: any) => { if (a?.id != null) byId.set(a.id, a); });
    return Array.from(byId.values())
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .map(alertToEvent);
  }, [restAlerts, liveAlerts]);

  // Merge and de-duplicate all events, newest first
  const allEvents = useMemo<ReportEvent[]>(() => {
    const byId = new Map<string, ReportEvent>();
    [...historyEvents, ...alertEvents].forEach(e => {
      if (!byId.has(e.id)) byId.set(e.id, e);
    });
    return Array.from(byId.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [historyEvents, alertEvents]);

  // Filtered events
  const filteredEvents = useMemo(
    () => allEvents.filter(e => matchesFilter(e, activeFilter, vehicleFilter)),
    [allEvents, activeFilter, vehicleFilter]
  );

  // Summary stats (from all events, not filtered)
  const stats = useMemo(() => ({
    total: allEvents.length,
    nearMiss: allEvents.filter(e => e.eventType === 'NEAR_MISS' || e.eventType === 'CRITICAL_PROXIMITY').length,
    blindCurve: allEvents.filter(e => e.eventType === 'BLIND_CURVE_ACTIVE' || e.eventType === 'UPCOMING_BLIND_CURVE').length,
    approaching: allEvents.filter(e => e.eventType === 'APPROACHING_VEHICLE').length,
  }), [allEvents]);

  const filterButtons: { key: FilterKey; label: string }[] = [
    { key: 'ALL', label: 'ALL EVENTS' },
    { key: 'BLIND_CURVE', label: 'BLIND CURVE' },
    { key: 'APPROACHING_VEHICLE', label: 'APPROACHING' },
    { key: 'NEAR_MISS', label: 'NEAR MISS' },
    { key: 'SAFE', label: 'SAFE' },
  ];

  return (
    <div style={styles.container} aria-label="Incident Records Workspace">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <FileText size={20} color="var(--accent-blue)" />
          <h2 style={styles.heading}>INCIDENT RECORDS &amp; NEAR-MISS INVESTIGATION</h2>
          <span style={styles.badge}>SAFETY AUDIT LEDGER</span>
        </div>
        <div style={styles.headerBottom}>
          <p style={styles.subheading}>
            Historical safety events, proximity alerts, blind-curve transitions and near-miss investigation records.
          </p>
          <button
            style={styles.refreshBtn}
            onClick={loadData}
            disabled={loading}
            title="Refresh history"
          >
            <RefreshCw size={13} color={loading ? 'var(--text-muted)' : 'var(--accent-blue)'} />
            <span style={{ color: loading ? 'var(--text-muted)' : 'var(--accent-blue)' }}>
              {loading ? 'LOADING…' : 'REFRESH'}
            </span>
          </button>
        </div>
        {!loading && (
          <p style={styles.lastSync}>
            Last sync: {lastRefresh.toLocaleTimeString('en-IN', { hour12: false })} — {allEvents.length} events from PostgreSQL + WebSocket
          </p>
        )}
      </div>

      {/* ── Summary Cards ──────────────────────────────────────────────────── */}
      <div style={styles.summaryGrid}>
        <SummaryCard label="TOTAL EVENTS" value={stats.total} color="var(--accent-blue)" />
        <SummaryCard label="NEAR MISSES" value={stats.nearMiss} color="var(--crit-red)" />
        <SummaryCard label="BLIND CURVE" value={stats.blindCurve} color="var(--warn-amber)" />
        <SummaryCard label="APPROACHING" value={stats.approaching} color="#F97316" />
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div style={styles.filterRow}>
        <div style={styles.filterGroup}>
          <Filter size={12} color="var(--text-muted)" />
          {filterButtons.map(({ key, label }) => (
            <button
              key={key}
              style={{
                ...styles.filterBtn,
                ...(activeFilter === key ? styles.filterBtnActive : {}),
              }}
              onClick={() => setActiveFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div style={styles.vehicleGroup}>
          {(['ALL', 'HEMM-01', 'HEMM-02'] as const).map(v => (
            <button
              key={v}
              style={{
                ...styles.filterBtn,
                ...(vehicleFilter === v ? styles.filterBtnActive : {}),
              }}
              onClick={() => setVehicleFilter(v)}
            >
              {v === 'ALL' ? 'ALL VEHICLES' : v}
            </button>
          ))}
        </div>
      </div>

      {/* ── Event Ledger ───────────────────────────────────────────────────── */}
      <div style={styles.ledger}>
        {loading && allEvents.length === 0 ? (
          <div style={styles.emptyState}>
            <RefreshCw size={20} color="var(--text-muted)" />
            <p style={styles.emptyTitle}>LOADING SAFETY RECORDS…</p>
            <p style={styles.emptyDesc}>Fetching telemetry history from PostgreSQL.</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div style={styles.emptyState}>
            <ShieldCheck size={24} color="var(--safe-green)" />
            <p style={styles.emptyTitle}>
              {allEvents.length === 0 ? 'NO HISTORICAL SAFETY EVENTS' : 'NO MATCHING EVENTS'}
            </p>
            <p style={styles.emptyDesc}>
              {allEvents.length === 0
                ? 'Historical safety records will appear here as telemetry and safety events are recorded. Run the demo to generate events.'
                : 'No events match the selected filter. Try "ALL EVENTS".'}
            </p>
          </div>
        ) : (
          <>
            <div style={styles.ledgerHeader}>
              <span style={styles.ledgerHeaderCell}>TIME</span>
              <span style={styles.ledgerHeaderCell}>VEHICLE</span>
              <span style={styles.ledgerHeaderCell}>EVENT TYPE</span>
              <span style={styles.ledgerHeaderCell}>SECTION</span>
              <span style={styles.ledgerHeaderCell}>DISTANCE</span>
              <span style={styles.ledgerHeaderCell}>TTC</span>
              <span style={styles.ledgerHeaderCell}>RISK</span>
              <span style={styles.ledgerHeaderCell}>ACTION</span>
            </div>
            {filteredEvents.map(event => (
              <EventRow key={event.id} event={event} />
            ))}
          </>
        )}
      </div>

      {/* ── Audit Info ─────────────────────────────────────────────────────── */}
      <div style={styles.auditBox}>
        <div style={styles.auditHeader}>
          <History size={14} color="var(--accent-blue)" />
          <span style={styles.auditTitle}>POSTGRESQL AUDIT TRAIL PRESERVATION</span>
        </div>
        <p style={styles.auditText}>
          All telemetry ticks accepted by POST /api/telemetry are committed to the PostgreSQL append-only
          database. Historical incident records are never overwritten or deleted on RESET, guaranteeing
          evidentiary integrity for DGMS safety compliance audits. Events above are derived from
          state-change detection across the full persisted telemetry history.
        </p>
      </div>

    </div>
  );
};

// ── Sub-components ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ ...cardStyles.card, borderTop: `3px solid ${color}` }}>
      <span style={{ ...cardStyles.value, color }}>{value}</span>
      <span style={cardStyles.label}>{label}</span>
    </div>
  );
}

const cardStyles: Record<string, React.CSSProperties> = {
  card: {
    flex: 1,
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  value: {
    fontSize: '28px',
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    lineHeight: 1,
  },
  label: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
  },
};

function EventRow({ event }: { event: ReportEvent }) {
  const color = eventColor(event.eventType);
  const isElevated = event.eventType === 'NEAR_MISS' || event.eventType === 'BLIND_CURVE_ACTIVE';

  return (
    <div style={{ ...rowStyles.row, borderLeft: `3px solid ${color}` }}>
      {/* Top row: time + vehicle + event type */}
      <div style={rowStyles.topLine}>
        <span style={rowStyles.ts}>{fmtTs(event.timestamp)}</span>
        <span style={rowStyles.vehicle}>{event.vehicleId}</span>
        <div style={rowStyles.eventBadge}>
          <EventIcon type={event.eventType} size={13} />
          <span style={{ ...rowStyles.eventLabel, color }}>{eventLabel(event.eventType)}</span>
        </div>
      </div>

      {/* Description */}
      <p style={rowStyles.desc}>{event.description}</p>

      {/* Metrics row */}
      <div style={rowStyles.metaRow}>
        {event.sectionId && (
          <MetaChip label="SECTION" value={event.sectionId} />
        )}
        {event.distanceM !== null && (
          <MetaChip label="DISTANCE" value={`${event.distanceM.toFixed(1)} m`} highlight={isElevated ? color : undefined} />
        )}
        {event.ttcS !== null && (
          <MetaChip label="TTC" value={`${event.ttcS.toFixed(1)} s`} highlight={isElevated ? color : undefined} />
        )}
        {event.objectType && (
          <MetaChip label="OBJECT" value={event.objectType} />
        )}
        <MetaChip
          label="RISK"
          value={event.riskLevel}
          highlight={
            event.riskLevel === 'HIGH' || event.riskLevel === 'CRITICAL' ? 'var(--crit-red)'
            : event.riskLevel === 'MEDIUM' ? '#F97316'
            : undefined
          }
        />
        {event.recommendedAction && (
          <MetaChip label="ACTION" value={event.recommendedAction} highlight={isElevated ? color : undefined} />
        )}
      </div>
    </div>
  );
}

function MetaChip({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div style={chipStyles.chip}>
      <span style={chipStyles.label}>{label}</span>
      <span style={{ ...chipStyles.value, ...(highlight ? { color: highlight, fontWeight: 700 } : {}) }}>
        {value}
      </span>
    </div>
  );
}

const chipStyles: Record<string, React.CSSProperties> = {
  chip: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  label: {
    fontSize: '8px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    letterSpacing: '0.06em',
  },
  value: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
  },
};

const rowStyles: Record<string, React.CSSProperties> = {
  row: {
    backgroundColor: 'var(--bg-panel)',
    borderBottom: '1px solid var(--line-subtle)',
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    transition: 'background-color 0.15s',
  },
  topLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
  },
  ts: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    minWidth: '160px',
  },
  vehicle: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--accent-blue)',
    minWidth: '72px',
  },
  eventBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  eventLabel: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.04em',
  },
  desc: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: '1.4',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    paddingTop: '6px',
    borderTop: '1px solid var(--line-subtle)',
  },
};

// ── Page styles ─────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    padding: '24px',
    backgroundColor: 'var(--bg-base)',
    overflowY: 'auto',
    gap: '20px',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  headerBottom: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '2px',
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
  lastSync: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    margin: 0,
  },
  refreshBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    background: 'transparent',
    border: '1px solid var(--accent-blue-border)',
    borderRadius: '3px',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    letterSpacing: '0.05em',
    flexShrink: 0,
  },
  summaryGrid: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  vehicleGroup: {
    display: 'flex',
    gap: '6px',
  },
  filterBtn: {
    background: 'transparent',
    border: '1px solid var(--line)',
    borderRadius: '3px',
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    color: 'var(--text-muted)',
    letterSpacing: '0.04em',
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    borderColor: 'var(--accent-blue)',
    color: 'var(--accent-blue)',
    backgroundColor: 'var(--accent-blue-subtle)',
  },
  ledger: {
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  ledgerHeader: {
    display: 'flex',
    gap: '0',
    padding: '8px 16px',
    borderBottom: '1px solid var(--line)',
    backgroundColor: 'var(--bg-panel-muted)',
  },
  ledgerHeaderCell: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--text-muted)',
    letterSpacing: '0.08em',
    flex: 1,
    minWidth: 0,
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    padding: '48px 24px',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: '13px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--text-secondary)',
    letterSpacing: '0.05em',
    margin: 0,
  },
  emptyDesc: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    margin: 0,
    maxWidth: '400px',
    lineHeight: '1.5',
  },
  auditBox: {
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    padding: '16px',
  },
  auditHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px',
  },
  auditTitle: {
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--accent-blue)',
    letterSpacing: '0.05em',
  },
  auditText: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: '1.4',
  },
};

export default Incidents;
