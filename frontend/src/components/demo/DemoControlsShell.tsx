import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  CloudFog, 
  Wifi, 
  Sliders
} from 'lucide-react';

interface DemoControlsProps {
  isPlaying?: boolean;
  onStart?: () => void;
  onPause?: () => void;
  onReset?: () => void;
  progressSeconds?: number;
}

export const DemoControlsShell: React.FC<DemoControlsProps> = ({
  isPlaying = false,
  onStart,
  onPause,
  onReset,
  progressSeconds = 0,
}) => {
  const isFinished = progressSeconds >= 25;

  return (
    <div style={styles.container} aria-label="Demonstration Scenario Controls">
      {/* Group Header */}
      <div style={styles.header}>
        <div style={styles.clusterBadge}>
          <Sliders size={11} color="var(--warn-amber)" />
          <span style={styles.clusterTitle}>DEMO CONTROLS</span>
        </div>
        <span style={styles.clusterStatus}>
          {isPlaying 
            ? `SIMULATING (${progressSeconds.toFixed(1)}s / 25s)`
            : isFinished
              ? 'SCENARIO COMPLETE (PAUSED AT 25s)'
              : progressSeconds > 0
                ? `PAUSED (${progressSeconds.toFixed(1)}s / 25s)`
                : 'DEMO READY (25s SCENARIO)'}
        </span>
      </div>

      {/* Control Actions Row */}
      <div style={styles.actionsRow}>
        {/* Playback Controls Cluster */}
        <div style={styles.playbackGroup}>
          <button 
            style={{
              ...styles.ctrlBtn,
              ...(isPlaying ? styles.ctrlBtnPlaying : styles.ctrlBtnAction),
            }} 
            onClick={onStart}
            disabled={isPlaying}
            title="Start Scenario Simulation"
            aria-label="Start Simulation"
          >
            <Play size={11} fill={isPlaying ? 'var(--safe-green)' : 'currentColor'} />
            <span>{isPlaying ? 'RUNNING' : 'START'}</span>
          </button>

          <button 
            style={{
              ...styles.ctrlBtn,
              ...(!isPlaying ? styles.ctrlBtnDisabled : styles.ctrlBtnAction),
            }} 
            onClick={onPause}
            disabled={!isPlaying}
            title="Pause Scenario Simulation"
            aria-label="Pause Simulation"
          >
            <Pause size={11} fill="currentColor" />
            <span>PAUSE</span>
          </button>

          <button 
            style={{
              ...styles.ctrlBtn,
              ...(progressSeconds > 0 || isPlaying ? styles.ctrlBtnAction : styles.ctrlBtnDisabled),
            }} 
            onClick={onReset}
            disabled={!isPlaying && progressSeconds === 0}
            title="Reset Scenario to Beginning (0s)"
            aria-label="Reset Simulation"
          >
            <RotateCcw size={11} />
            <span>RESET</span>
          </button>
        </div>

        <div style={styles.vDivider} />

        {/* Environmental Visibility Override */}
        <div style={styles.envGroup} title="Atmospheric Visibility Simulator Override">
          <CloudFog size={12} color="var(--text-muted)" />
          <span style={styles.fieldLabel}>VIS:</span>
          <div style={styles.selectorMock}>
            <span>NORMAL</span>
          </div>
        </div>

        <div style={styles.vDivider} />

        {/* Network Online/Offline Toggle */}
        <div style={styles.networkGroup} title="Network Connection Switch (Demonstrates offline buffering)">
          <div style={styles.netBtnMock}>
            <span className="status-dot amber" />
            <Wifi size={11} />
            <span>NET: STANDBY</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    padding: '6px 14px',
    backgroundColor: 'rgba(17, 25, 39, 0.6)',
    border: '1px dashed var(--line-highlight)',
    borderRadius: '4px',
    userSelect: 'none',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '5px',
  },
  clusterBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  clusterTitle: {
    fontFamily: 'var(--font-display)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--warn-amber)',
  },
  clusterStatus: {
    fontSize: '9px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
  },
  actionsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  playbackGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  ctrlBtn: {
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
    letterSpacing: '0.04em',
    transition: 'all 0.15s ease',
  },
  ctrlBtnAction: {
    cursor: 'pointer',
    color: 'var(--text-primary)',
    borderColor: 'var(--line-highlight)',
  },
  ctrlBtnPlaying: {
    cursor: 'default',
    color: 'var(--safe-green)',
    borderColor: 'rgba(47, 191, 113, 0.5)',
    backgroundColor: 'rgba(47, 191, 113, 0.12)',
  },
  ctrlBtnDisabled: {
    cursor: 'not-allowed',
    opacity: 0.45,
  },
  vDivider: {
    width: '1px',
    height: '18px',
    backgroundColor: 'var(--line)',
  },
  envGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
  },
  fieldLabel: {
    fontSize: '9px',
    fontWeight: 600,
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-display)',
  },
  selectorMock: {
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--line)',
    color: 'var(--text-primary)',
    padding: '3px 7px',
    borderRadius: '3px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
  },
  networkGroup: {
    display: 'flex',
    alignItems: 'center',
  },
  netBtnMock: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    backgroundColor: 'var(--bg-base)',
    border: '1px solid var(--line)',
    color: 'var(--warn-amber)',
    padding: '4px 9px',
    borderRadius: '3px',
    fontSize: '10px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
  },
};
