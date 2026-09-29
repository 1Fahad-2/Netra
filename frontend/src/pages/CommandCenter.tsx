/**
 * MachineMind — Command Center Page
 * 
 * Primary Operational Workspace:
 * Composes the Hero 3D Mine Map (deck.gl + MapLibre), the right Selected Vehicle Detail Panel,
 * and the Bottom Operational Strip (Live Alert Feed + Scenario Controls).
 */

import React from 'react';
import { MineMap } from '../components/map/MineMap';
import { VehicleSnapshotShell } from '../components/vehicle/VehicleSnapshotShell';
import { JudgeSafetyJourneyPanel } from '../components/vehicle/JudgeSafetyJourneyPanel';
import { BottomStrip } from '../components/layout/BottomStrip';
import type { UseTelemetryReturn } from '../hooks/useTelemetry';
import { SAFETY_SCENE_CAMERA } from '../map/mapConfig';

interface CommandCenterProps {
  telemetry: UseTelemetryReturn;
}

export const CommandCenter: React.FC<CommandCenterProps> = ({ telemetry }) => {
  const {
    selectedVehicleId,
    setSelectedVehicleId,
    snapshot,
    vehicles,
    isPlaying,
    progressSeconds,
    handleStart,
    handlePause,
    handleReset,
    telemetryMap,
    stableLevel,
    stableAction,
    backendPrediction,
    conflictPhase,
    blindCurve01Active,
    blindCurve02Active,
    simulationPrediction,
    conflictLineCoordinates,
  } = telemetry;

  // Initial HUD camera = safety-scene camera, centred on the active haul route
  const [cameraState, setCameraState] = React.useState<import('../types/map').MapCameraState>(
    SAFETY_SCENE_CAMERA
  );

  return (
    <div style={styles.pageContainer}>
      {/* Center Workspace: Hero 3D Mine Map + Selected Vehicle Snapshot */}
      <main style={styles.centerWorkspace}>
        {/* Hero 3D Mine Map (MapLibre + Deck.gl Core) */}
        <MineMap 
          selectedVehicleId={selectedVehicleId} 
          onSelectVehicle={setSelectedVehicleId} 
          vehicles={vehicles}
          riskLevel={snapshot.riskLevel}
          headwayMeters={snapshot.distanceMeters}
          ttcSeconds={snapshot.ttcSeconds}
          relativeSpeedMs={snapshot.relativeSpeedMs}
          isPlaying={isPlaying}
          onCameraChange={setCameraState}
          conflictLineCoordinates={conflictLineCoordinates}
          conflictPhase={conflictPhase}
        />

        {/* Feature 11 — Judge Mode: real backend GET /api/esp/HEMM-01/safety-state,
            polled live, plus the full-journey stepper and Start/Reset Demo
            controls. Overlaid on the map so it never disturbs the existing layout. */}
        <div style={styles.espPanelOverlay}>
          <JudgeSafetyJourneyPanel vehicleId="HEMM-01" />
        </div>

        {/* Right Selected Vehicle Snapshot Panel Shell */}
        <VehicleSnapshotShell 
          selectedVehicleId={selectedVehicleId} 
          onSelectVehicle={setSelectedVehicleId}
          onClearSelection={() => setSelectedVehicleId(null)}
          snapshot={snapshot}
          stableLevel={stableLevel}
          stableAction={stableAction}
          backendPrediction={backendPrediction}
          conflictPhase={conflictPhase}
          blindCurve01Active={blindCurve01Active}
          blindCurve02Active={blindCurve02Active}
          simulationPrediction={simulationPrediction}
        />
      </main>

      {/* Bottom Strip: 5-Card Operational & Map Controls Bar */}
      <BottomStrip 
        isPlaying={isPlaying}
        onStart={handleStart}
        onPause={handlePause}
        onReset={handleReset}
        progressSeconds={progressSeconds}
        riskLevel={snapshot.riskLevel}
        recommendedAction={snapshot.recommendedAction}
        distanceMeters={snapshot.distanceMeters}
        ttcSeconds={snapshot.ttcSeconds}
        camera={cameraState}
        selectedVehicleId={selectedVehicleId ?? undefined}
        snapshot={snapshot}
        onSelectVehicle={setSelectedVehicleId}
        telemetryMap={telemetryMap}
      />
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  pageContainer: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    height: '100%',
    overflow: 'hidden',
    minWidth: 0,
  },
  centerWorkspace: {
    display: 'flex',
    flex: 1,
    height: 'calc(100vh - var(--top-strip-height) - var(--bottom-strip-height))',
    overflow: 'hidden',
    position: 'relative',
  },
  espPanelOverlay: {
    position: 'absolute',
    top: '12px',
    left: '12px',
    zIndex: 5,
  },
};

export default CommandCenter;
