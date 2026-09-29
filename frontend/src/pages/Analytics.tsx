/**
 * MachineMind — Mine Safety Analytics Page
 * 
 * Haul Road Traffic & Safety Analytics:
 * Safe headway adherence, closing velocity profiles, and Time-To-Collision trends.
 */

import React from 'react';
import { BarChart3, TrendingDown, Gauge, Shield } from 'lucide-react';
import type { UseTelemetryReturn } from '../hooks/useTelemetry';

interface AnalyticsProps {
  telemetry: UseTelemetryReturn;
}

export const Analytics: React.FC<AnalyticsProps> = ({ telemetry }) => {
  const { snapshot } = telemetry;

  return (
    <div style={styles.container} aria-label="Mine Analytics Workspace">
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <BarChart3 size={20} color="var(--accent-blue)" />
          <h2 style={styles.heading}>PIT SAFETY & TRAFFIC ANALYTICS</h2>
          <span style={styles.badge}>OPERATIONAL METRICS</span>
        </div>
        <p style={styles.subheading}>
          Statistical safety margins, following headway compliance, and proximity deceleration profiles.
        </p>
      </div>

      <div style={styles.metricsRow}>
        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>
            <Gauge size={14} color="var(--accent-blue)" />
            <span>CURRENT HEADWAY DISTANCE</span>
          </div>
          <span style={styles.metricValue}>{snapshot.distanceMeters} m</span>
          <span style={styles.metricSub}>Minimum Safety Threshold: 30 m</span>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>
            <TrendingDown size={14} color="var(--warn-amber)" />
            <span>TIME-TO-COLLISION MARGIN</span>
          </div>
          <span style={styles.metricValue}>{snapshot.ttcSeconds} s</span>
          <span style={styles.metricSub}>Critical Threshold: 5.5 s</span>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricLabel}>
            <Shield size={14} color="var(--accent-blue)" />
            <span>RELATIVE CLOSING SPEED</span>
          </div>
          <span style={styles.metricValue}>{snapshot.relativeSpeedMs} m/s</span>
          <span style={styles.metricSub}>Trailing Speed: {snapshot.hemm01.speedKmh} km/h</span>
        </div>
      </div>

      <div style={styles.chartPlaceholder}>
        <span style={styles.chartPlaceholderTitle}>HEADWAY ADHERENCE PROFILE (CORRIDOR 01)</span>
        <p style={styles.chartPlaceholderDesc}>
          Historical proximity telemetry is persisted to the PostgreSQL append-only ledger on every tick. Detailed time-series graphs and fleet distribution analytics will be visualized here in subsequent phases.
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
  metricsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '16px',
    marginBottom: '24px',
  },
  metricCard: {
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    padding: '16px',
  },
  metricLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    marginBottom: '8px',
  },
  metricValue: {
    fontSize: '24px',
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-primary)',
    display: 'block',
    marginBottom: '4px',
  },
  metricSub: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
  },
  chartPlaceholder: {
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  chartPlaceholderTitle: {
    fontSize: '12px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--accent-blue)',
    letterSpacing: '0.05em',
  },
  chartPlaceholderDesc: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    margin: 0,
    lineHeight: '1.5',
  },
};

export default Analytics;
