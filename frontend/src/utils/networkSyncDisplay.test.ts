/**
 * Minimal tests for the Control Room Network + Store-and-Forward display
 * helpers (Feature 9). Run style matches
 * src/utils/sensorHealthDisplay.test.ts (ts-node script, no test framework).
 */

import {
  countBufferedForVehicle,
  summarizeBufferedByVehicle,
  getSyncPhase,
  formatLastSyncTime,
  LINK_STATUS_COLOR,
  SYNC_PHASE_COLOR,
  SYNC_PHASE_LABEL,
  type BufferedEventLike,
} from './networkSyncDisplay';

function fail(msg: string) {
  console.error(msg);
  process.exit(1);
}

function runTests() {
  // 1. Every LinkStatus / SyncPhase has a color and (for phases) a label
  for (const status of ['ONLINE', 'OFFLINE', 'UNKNOWN'] as const) {
    if (!LINK_STATUS_COLOR[status]) fail(`missing color for link status "${status}"`);
  }
  for (const phase of ['OFFLINE', 'SYNCING', 'BUFFERED', 'SYNCED', 'UNKNOWN'] as const) {
    if (!SYNC_PHASE_COLOR[phase]) fail(`missing color for sync phase "${phase}"`);
    if (!SYNC_PHASE_LABEL[phase]) fail(`missing label for sync phase "${phase}"`);
  }

  // 2. countBufferedForVehicle / summarizeBufferedByVehicle are derived, never invented
  const events: BufferedEventLike[] = [
    { vehicle_id: 'HEMM-01' },
    { vehicle_id: 'HEMM-01' },
    { vehicle_id: 'HEMM-02' },
  ];
  if (countBufferedForVehicle(events, 'HEMM-01') !== 2) fail('expected 2 buffered events for HEMM-01');
  if (countBufferedForVehicle(events, 'HEMM-02') !== 1) fail('expected 1 buffered event for HEMM-02');
  if (countBufferedForVehicle(events, 'HEMM-03') !== 0) fail('expected 0 buffered events for an unknown vehicle');

  const summary = summarizeBufferedByVehicle(events);
  if (summary['HEMM-01'] !== 2 || summary['HEMM-02'] !== 1) fail('summarizeBufferedByVehicle produced wrong counts');
  if ('HEMM-03' in summary) fail('summarizeBufferedByVehicle should not invent an entry for a vehicle with no buffered events');

  if (summarizeBufferedByVehicle([]).HEMM_ANY !== undefined) fail('empty buffer should summarize to an empty map');

  // 3. getSyncPhase precedence: UNKNOWN > OFFLINE > SYNCING > BUFFERED > SYNCED
  if (getSyncPhase({ linkStatus: 'UNKNOWN', bufferedCount: 0, syncing: false }) !== 'UNKNOWN') {
    fail('UNKNOWN link should always report UNKNOWN phase');
  }
  if (getSyncPhase({ linkStatus: 'UNKNOWN', bufferedCount: 5, syncing: true }) !== 'UNKNOWN') {
    fail('UNKNOWN link should take precedence over buffered/syncing');
  }
  if (getSyncPhase({ linkStatus: 'OFFLINE', bufferedCount: 0, syncing: false }) !== 'OFFLINE') {
    fail('OFFLINE link with nothing buffered should report OFFLINE');
  }
  if (getSyncPhase({ linkStatus: 'OFFLINE', bufferedCount: 3, syncing: true }) !== 'OFFLINE') {
    fail('OFFLINE link should take precedence over syncing/buffered');
  }
  if (getSyncPhase({ linkStatus: 'ONLINE', bufferedCount: 4, syncing: true }) !== 'SYNCING') {
    fail('an in-flight sync request should report SYNCING while ONLINE');
  }
  if (getSyncPhase({ linkStatus: 'ONLINE', bufferedCount: 2, syncing: false }) !== 'BUFFERED') {
    fail('ONLINE link with events still buffered should report BUFFERED');
  }
  if (getSyncPhase({ linkStatus: 'ONLINE', bufferedCount: 0, syncing: false }) !== 'SYNCED') {
    fail('ONLINE link with nothing buffered should report SYNCED');
  }

  // 4. formatLastSyncTime handles null/invalid/valid timestamps without throwing
  if (formatLastSyncTime(null) !== 'Never') fail('null last_sync_time should format as "Never"');
  if (formatLastSyncTime('not-a-date') !== 'Never') fail('invalid last_sync_time should format as "Never"');
  const formatted = formatLastSyncTime('2026-01-01T12:00:00.000Z');
  if (!formatted || formatted === 'Never') fail('a valid ISO timestamp should format to a non-empty, non-"Never" string');

  // 5. Pure functions: inputs are never mutated
  const beforeEvents = JSON.stringify(events);
  countBufferedForVehicle(events, 'HEMM-01');
  summarizeBufferedByVehicle(events);
  if (JSON.stringify(events) !== beforeEvents) fail('buffer helpers mutated their input');

  console.log('All network + sync display tests passed');
  process.exit(0);
}

runTests();
