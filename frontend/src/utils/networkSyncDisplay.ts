/**
 * NETRA — Control Room Network + Store-and-Forward Display Helpers (Feature 9)
 *
 * Pure presentation mapping only, layered on the EXISTING backend APIs:
 *   GET  /api/network/status
 *   GET  /api/network/buffer
 *   POST /api/network/sync
 *   GET  /api/network/sync/status
 * (see ../services/networkStatusApi.ts for the fetch wrappers).
 *
 * Scope (deliberately small):
 *   - Presentation-only helpers — no dashboard layout, no data fetching.
 *   - Does NOT change network buffer logic, sync logic, or the Compact
 *     Event contract.
 *   - Does NOT fabricate connectivity/buffer data — every value here is
 *     derived from data the existing backend APIs actually returned, or is
 *     explicitly UNKNOWN when that data is not (yet) available.
 */

/** Vehicle-side connectivity state as shown in the Control Room. */
export type LinkStatus = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';

/** Minimal shape this module needs from a buffered Compact Event. */
export interface BufferedEventLike {
  vehicle_id: string;
}

/** Minimal shape this module needs from GET /api/network/sync/status (and the POST /sync response). */
export interface SyncStatusLike {
  buffered_count: number;
  synced_count: number;
  failed_count: number;
  last_sync_time: string | null;
}

/** Discrete Store-and-Forward visual phase for a single vehicle or the fleet as a whole. */
export type SyncPhase = 'OFFLINE' | 'SYNCING' | 'BUFFERED' | 'SYNCED' | 'UNKNOWN';

export const LINK_STATUS_COLOR: Record<LinkStatus, string> = {
  ONLINE: '#22C55E',
  OFFLINE: '#EF4444',
  UNKNOWN: '#64748B',
};

export const SYNC_PHASE_COLOR: Record<SyncPhase, string> = {
  OFFLINE: '#EF4444',
  SYNCING: '#38BDF8',
  BUFFERED: '#F59E0B',
  SYNCED: '#22C55E',
  UNKNOWN: '#64748B',
};

export const SYNC_PHASE_LABEL: Record<SyncPhase, string> = {
  OFFLINE: 'OFFLINE',
  SYNCING: 'SYNCING…',
  BUFFERED: 'BUFFERED',
  SYNCED: 'SYNCED',
  UNKNOWN: 'UNKNOWN',
};

/**
 * Count how many currently-buffered events belong to a given vehicle.
 * Pure/derived from the existing GET /api/network/buffer event list —
 * never invents a count for a vehicle that has no buffered events.
 */
export function countBufferedForVehicle(
  events: BufferedEventLike[],
  vehicleId: string
): number {
  return events.filter((e) => e.vehicle_id === vehicleId).length;
}

/**
 * Group the existing buffered-event list by vehicle_id into per-vehicle
 * counts. Pure/derived — does not add entries for vehicles with zero
 * buffered events.
 */
export function summarizeBufferedByVehicle(
  events: BufferedEventLike[]
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const event of events) {
    result[event.vehicle_id] = (result[event.vehicle_id] ?? 0) + 1;
  }
  return result;
}

/**
 * Derive one discrete visual phase from the existing connectivity state,
 * a buffered-event count, and whether a sync request is currently in
 * flight (a real, in-progress network call — not fabricated data).
 *
 * Precedence: UNKNOWN link > OFFLINE link > actively SYNCING > events
 * still BUFFERED > SYNCED (nothing buffered, link healthy).
 */
export function getSyncPhase(params: {
  linkStatus: LinkStatus;
  bufferedCount: number;
  syncing: boolean;
}): SyncPhase {
  const { linkStatus, bufferedCount, syncing } = params;
  if (linkStatus === 'UNKNOWN') return 'UNKNOWN';
  if (linkStatus === 'OFFLINE') return 'OFFLINE';
  if (syncing) return 'SYNCING';
  if (bufferedCount > 0) return 'BUFFERED';
  return 'SYNCED';
}

/** Human-readable relative-ish formatting for last_sync_time (or a placeholder when absent). */
export function formatLastSyncTime(lastSyncTime: string | null): string {
  if (!lastSyncTime) return 'Never';
  const date = new Date(lastSyncTime);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleTimeString();
}
