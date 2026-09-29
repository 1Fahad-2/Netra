/**
 * NETRA — Final Risk + Alert Display Helpers (Feature 10)
 *
 * Pure presentation helpers layered on top of the EXISTING Compact Event
 * contract (../types/compactEvent.ts) and the existing 4-level safety
 * assessment (SafetyLevel: NORMAL / CAUTION / HIGH / CRITICAL / UNKNOWN).
 *
 * Scope (deliberately small):
 *   - Presentation-only helpers for VehicleSnapshotShell — no risk
 *     calculation, no Risk Fusion, no Recommendation Engine changes.
 *   - `resolveFinalRisk` / `resolveRecommendedAction` only ever pick
 *     between EXISTING values already computed elsewhere; they never
 *     invent or recompute a risk level or recommendation.
 *   - `isActiveAlert` is the single source of truth for the CAUTION /
 *     HIGH / CRITICAL alert threshold, so distance alone can never
 *     trigger an alert — only an actual risk level can.
 */

import type { SafetyLevel } from '../types/contract';

/** Risk levels that count as an active alert in the Vehicle Snapshot panel. */
const ACTIVE_ALERT_LEVELS: ReadonlySet<string> = new Set(['CAUTION', 'HIGH', 'CRITICAL']);

/**
 * Whether a given (final) risk level should show as an active alert.
 * CAUTION / HIGH / CRITICAL → active. NORMAL / UNKNOWN / missing → not active.
 * Distance is never a parameter here on purpose: distance alone must never
 * create an alert, only an actual risk level can.
 */
export function isActiveAlert(level: SafetyLevel | string | null | undefined): boolean {
  if (!level) return false;
  return ACTIVE_ALERT_LEVELS.has(level);
}

/**
 * Resolve the final risk level to display for a vehicle: prefer the Compact
 * Event's `final_risk` (Feature 7, backend-fused) when present, otherwise
 * fall back to the existing stable/snapshot safety level. Never recomputes
 * a risk level — purely picks between values that already exist.
 */
export function resolveFinalRisk(
  compactEventFinalRisk: SafetyLevel | null | undefined,
  fallbackLevel: SafetyLevel | null | undefined
): SafetyLevel {
  return (compactEventFinalRisk ?? fallbackLevel ?? 'UNKNOWN') as SafetyLevel;
}

/**
 * Resolve the recommended-action text to display for a vehicle: prefer the
 * Compact Event's own `recommended_action` field directly (no relabeling),
 * falling back to the existing stable action / snapshot action when the
 * Compact Event isn't available yet.
 */
export function resolveRecommendedAction(
  compactEventAction: string | null | undefined,
  fallbackAction: string | null | undefined
): string {
  return compactEventAction ?? fallbackAction ?? 'NOT AVAILABLE';
}
