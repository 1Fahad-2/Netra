/**
 * NETRA — Judge Mode Safety Journey Panel (Phase 3 frontend, Feature 11)
 *
 * A single, judge-facing view of the REAL backend safety journey:
 *   SAFE -> UPCOMING BLIND CURVE 1 -> BLIND CURVE 1 ACTIVE ->
 *   UPCOMING VEHICLE (HEMM-02) -> HEMM-02 PASSES -> SAFE ->
 *   UPCOMING BLIND CURVE 2 -> BLIND CURVE 2 ACTIVE (no vehicle)
 *
 * Every value shown (hazard state, curve, distance, vehicle alert, TTC,
 * risk, action) comes verbatim from GET /api/esp/HEMM-01/safety-state via
 * the existing useEspSafetyState poll — this component does not compute or
 * invent any safety value. The step tracker below only reads the SAME
 * hazard_state string to decide which step to highlight; it never
 * fabricates a state or a vehicle.
 *
 * Start Demo / Reset Demo drive the journey via judgeDemoDriver.ts, which
 * POSTs to the EXISTING telemetry endpoint (no new backend endpoint, no
 * process spawning). If you'd rather drive it from the CLI instead, run
 *   API_BASE_URL=http://127.0.0.1:8001 python app/demo_full_journey_demo.py
 * and this panel will show the same live transitions either way.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Route, AlertTriangle, Wifi, WifiOff, Play, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useEspSafetyState } from '../../hooks/useEspSafetyState';
import { colorForHazard } from './EspSafetyStatePanel';
import { runJudgeDemo, resetJudgeDemo, JUDGE_DEMO_STAGES, type JudgeDemoControls } from '../../services/judgeDemoDriver';

interface JudgeSafetyJourneyPanelProps {
  vehicleId: string;
}

type StepKey =
  | 'safe_initial'
  | 'upcoming_bc1'
  | 'bc1_active'
  | 'upcoming_vehicle'
  | 'vehicle_passed'
  | 'safe_after_bc1'
  | 'upcoming_bc2'
  | 'bc2_active';

const STEP_DEFS: { key: StepKey; label: string }[] = [
  { key: 'safe_initial', label: 'SAFE' },
  { key: 'upcoming_bc1', label: 'UPCOMING BLIND CURVE 1' },
  { key: 'bc1_active', label: 'BLIND CURVE 1 ACTIVE' },
  { key: 'upcoming_vehicle', label: 'UPCOMING VEHICLE — HEMM-02' },
  { key: 'vehicle_passed', label: 'HEMM-02 PASSES' },
  { key: 'safe_after_bc1', label: 'SAFE' },
  { key: 'upcoming_bc2', label: 'UPCOMING BLIND CURVE 2' },
  { key: 'bc2_active', label: 'BLIND CURVE 2 ACTIVE — NO VEHICLE DETECTED' },
];

function computeStepKey(
  hazard: string | undefined,
  enteredBC1: boolean,
  vehicleSeenInBC1: boolean
): StepKey | null {
  if (!hazard) return null;
  switch (hazard) {
    case 'SAFE':
      return enteredBC1 ? 'safe_after_bc1' : 'safe_initial';
    case 'UPCOMING BLIND CURVE 1':
      return 'upcoming_bc1';
    case 'BLIND CURVE 1 ACTIVE':
      return vehicleSeenInBC1 ? 'vehicle_passed' : 'bc1_active';
    case 'UPCOMING VEHICLE':
      return 'upcoming_vehicle';
    case 'UPCOMING BLIND CURVE 2':
      return 'upcoming_bc2';
    case 'BLIND CURVE 2 ACTIVE':
      return 'bc2_active';
    default:
      return null;
  }
}

export const JudgeSafetyJourneyPanel: React.FC<JudgeSafetyJourneyPanelProps> = ({ vehicleId }) => {
  const { data, isConnected, isBackendUnavailable } = useEspSafetyState(vehicleId);

  // Local "episode" flags — read ONLY the backend's own hazard_state to
  // decide which journey step is current. Never invents a state.
  const [enteredBC1, setEnteredBC1] = useState(false);
  const [vehicleSeenInBC1, setVehicleSeenInBC1] = useState(false);

  useEffect(() => {
    const hazard = data?.hazard_state;
    if (!hazard) return;
    if (hazard === 'UPCOMING BLIND CURVE 1' || hazard === 'BLIND CURVE 1 ACTIVE') {
      setEnteredBC1(true);
    }
    if (hazard === 'UPCOMING VEHICLE') {
      setVehicleSeenInBC1(true);
    }
  }, [data?.hazard_state]);

  const hazard = data?.hazard_state;
  const color = colorForHazard(hazard);
  const currentStepKey = computeStepKey(hazard, enteredBC1, vehicleSeenInBC1);
  const currentIndex = STEP_DEFS.findIndex((s) => s.key === currentStepKey);

  // ── Demo playback controls ────────────────────────────────────────────
  const demoControlsRef = useRef<JudgeDemoControls | null>(null);
  const [isDemoRunning, setIsDemoRunning] = useState(false);
  const [demoStatusText, setDemoStatusText] = useState<string | null>(null);
  const [demoErrorText, setDemoErrorText] = useState<string | null>(null);

  const handleStartDemo = () => {
    if (isDemoRunning) return;
    setDemoErrorText(null);
    setIsDemoRunning(true);
    setDemoStatusText('Starting…');
    demoControlsRef.current = runJudgeDemo(
      (index, stage) => {
        setDemoStatusText(stage.label);
        if (index === JUDGE_DEMO_STAGES.length - 1) {
          setIsDemoRunning(false);
        }
      },
      () => {
        setDemoErrorText('Demo playback failed — is the backend running?');
        setIsDemoRunning(false);
      }
    );
  };

  const handleResetDemo = () => {
    demoControlsRef.current?.cancel();
    demoControlsRef.current = null;
    setIsDemoRunning(false);
    setDemoStatusText(null);
    setDemoErrorText(null);
    setEnteredBC1(false);
    setVehicleSeenInBC1(false);
    resetJudgeDemo().catch(() => setDemoErrorText('Reset failed — is the backend running?'));
  };

  return (
    <div style={styles.container} aria-label="NETRA Judge Mode Safety Journey">
      <div style={styles.header}>
        <div style={styles.badge}>
          <Route size={12} color="var(--accent-blue)" />
          <span style={styles.badgeTitle}>NETRA SAFETY JOURNEY — {vehicleId}</span>
        </div>
        <span
          style={styles.connIndicator}
          title={isBackendUnavailable ? 'Backend unreachable — showing last known state' : 'Live'}
        >
          {isConnected ? (
            isBackendUnavailable ? (
              <>
                <WifiOff size={11} color="var(--warn-amber)" />
                <span style={{ ...styles.connText, color: 'var(--warn-amber)' }}>RECONNECTING</span>
              </>
            ) : (
              <>
                <Wifi size={11} color="var(--safe-green)" />
                <span style={{ ...styles.connText, color: 'var(--safe-green)' }}>LIVE</span>
              </>
            )
          ) : (
            <>
              <WifiOff size={11} color="var(--text-muted)" />
              <span style={styles.connText}>CONNECTING…</span>
            </>
          )}
        </span>
      </div>

      {!isConnected ? (
        <div style={styles.waitingRow}>Connecting to backend…</div>
      ) : (
        <>
          {/* Big current-state banner */}
          <div style={{ ...styles.hazardBanner, borderColor: color }}>
            {hazard === 'UPCOMING VEHICLE' && <AlertTriangle size={16} color={color} />}
            <span style={{ ...styles.hazardText, color }}>{hazard ?? '—'}</span>
          </div>

          <div style={styles.fieldsGrid}>
            {data?.curve_id && (
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>CURVE</span>
                <span style={styles.fieldValue}>{data.curve_id.replace(/_/g, ' ')}</span>
              </div>
            )}
            {data?.state === 'UPCOMING_BLIND_CURVE' && data.distance_to_curve != null && (
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>DISTANCE TO CURVE</span>
                <span style={styles.fieldValue}>{data.distance_to_curve.toFixed(1)} m</span>
              </div>
            )}
          </div>

          {data?.vehicle_alert ? (
            <div style={styles.alertBox}>
              <div style={styles.alertHeader}>
                <AlertTriangle size={12} color="var(--crit-red)" />
                <span style={styles.alertHeaderText}>APPROACHING VEHICLE</span>
              </div>
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
                <span style={styles.fieldLabel}>TTC</span>
                <span style={styles.fieldValue}>
                  {data.vehicle_alert.ttc != null ? `${data.vehicle_alert.ttc.toFixed(1)} s` : 'N/A'}
                </span>
              </div>
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>RISK</span>
                <span style={styles.fieldValue}>{data.vehicle_alert.risk}</span>
              </div>
              <div style={styles.fieldRow}>
                <span style={styles.fieldLabel}>ACTION</span>
                <span style={styles.fieldValue}>{data.vehicle_alert.action ?? 'N/A'}</span>
              </div>
            </div>
          ) : (
            enteredBC1 && (
              <div style={styles.noVehicleRow}>No vehicle detected</div>
            )
          )}

          {/* Journey stepper */}
          <div style={styles.stepperTitle}>JOURNEY</div>
          <div style={styles.stepper}>
            {STEP_DEFS.map((step, idx) => {
              const isCurrent = idx === currentIndex;
              const isDone = currentIndex >= 0 && idx < currentIndex;
              return (
                <div key={step.key} style={styles.stepRow}>
                  <span style={styles.stepIcon}>
                    {isDone ? (
                      <CheckCircle2 size={12} color="var(--safe-green)" />
                    ) : (
                      <span
                        style={{
                          ...styles.stepDot,
                          backgroundColor: isCurrent ? color : 'var(--line-highlight)',
                          boxShadow: isCurrent ? `0 0 0 3px ${color}33` : 'none',
                        }}
                      />
                    )}
                  </span>
                  <span
                    style={{
                      ...styles.stepLabel,
                      color: isCurrent ? 'var(--text-primary)' : isDone ? 'var(--text-secondary)' : 'var(--text-muted)',
                      fontWeight: isCurrent ? 700 : 500,
                    }}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Demo controls */}
          <div style={styles.demoRow}>
            <button
              style={{ ...styles.demoBtn, ...(isDemoRunning ? styles.demoBtnDisabled : styles.demoBtnAction) }}
              onClick={handleStartDemo}
              disabled={isDemoRunning}
              title="Play the full 9-stage journey against the real backend"
            >
              <Play size={11} fill="currentColor" />
              <span>{isDemoRunning ? 'RUNNING' : 'START DEMO'}</span>
            </button>
            <button
              style={{ ...styles.demoBtn, ...styles.demoBtnAction }}
              onClick={handleResetDemo}
              title="Re-park both vehicles to the journey start (SAFE)"
            >
              <RotateCcw size={11} />
              <span>RESET DEMO</span>
            </button>
            {demoStatusText && <span style={styles.demoStatusText}>{demoStatusText}</span>}
            {demoErrorText && <span style={styles.demoErrorText}>{demoErrorText}</span>}
          </div>
        </>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px 14px',
    backgroundColor: 'var(--bg-panel)',
    border: '1px solid var(--line)',
    borderRadius: '6px',
    minWidth: '300px',
    maxWidth: '320px',
    maxHeight: 'calc(100vh - var(--top-strip-height) - var(--bottom-strip-height) - 24px)',
    overflowY: 'auto',
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
    gap: '4px',
  },
  connText: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--text-muted)',
  },
  waitingRow: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
  },
  hazardBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    padding: '8px 10px',
    borderRadius: '4px',
    border: '1px solid',
    backgroundColor: 'var(--bg-panel-muted)',
  },
  hazardText: {
    fontFamily: 'var(--font-display)',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.02em',
  },
  fieldsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
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
    padding: '6px 8px',
    backgroundColor: 'var(--crit-red-subtle)',
    border: '1px solid var(--crit-red-border)',
    borderRadius: '4px',
  },
  alertHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    marginBottom: '2px',
  },
  alertHeaderText: {
    fontSize: '9px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    letterSpacing: '0.05em',
    color: 'var(--crit-red)',
  },
  noVehicleRow: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    padding: '4px 2px',
  },
  stepperTitle: {
    fontSize: '9px',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: 'var(--text-muted)',
    marginTop: '2px',
  },
  stepper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  stepRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  },
  stepIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '12px',
  },
  stepDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    display: 'inline-block',
  },
  stepLabel: {
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.01em',
  },
  demoRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '6px',
    marginTop: '4px',
    paddingTop: '8px',
    borderTop: '1px solid var(--line)',
  },
  demoBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--line)',
    color: 'var(--text-secondary)',
    padding: '4px 8px',
    borderRadius: '3px',
    fontSize: '10px',
    fontFamily: 'var(--font-display)',
    fontWeight: 600,
    letterSpacing: '0.03em',
  },
  demoBtnAction: {
    cursor: 'pointer',
    color: 'var(--text-primary)',
    borderColor: 'var(--line-highlight)',
  },
  demoBtnDisabled: {
    cursor: 'not-allowed',
    opacity: 0.5,
    color: 'var(--safe-green)',
    borderColor: 'rgba(47, 191, 113, 0.5)',
  },
  demoStatusText: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    width: '100%',
  },
  demoErrorText: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--crit-red)',
    width: '100%',
  },
};

export default JudgeSafetyJourneyPanel;
