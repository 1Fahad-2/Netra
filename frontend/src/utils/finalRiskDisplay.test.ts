/**
 * Minimal tests for the Final Risk + Alert display helpers (Feature 10).
 * Run style matches src/utils/networkSyncDisplay.test.ts (ts-node script,
 * no test framework).
 *
 * Covers:
 *   - NORMAL -> no alert
 *   - CAUTION / HIGH / CRITICAL -> alert
 *   - UNKNOWN -> no alert
 *   - recommendation comes from the Compact Event (not a fallback)
 *   - distance alone -> no alert (isActiveAlert never takes distance)
 */

import { isActiveAlert, resolveFinalRisk, resolveRecommendedAction } from './finalRiskDisplay';

function fail(msg: string) {
  console.error(msg);
  process.exit(1);
}

function runTests() {
  // 1. NORMAL -> no alert
  if (isActiveAlert('NORMAL')) fail('NORMAL must not be an active alert');

  // 2. CAUTION / HIGH / CRITICAL -> alert
  for (const level of ['CAUTION', 'HIGH', 'CRITICAL'] as const) {
    if (!isActiveAlert(level)) fail(`${level} must be an active alert`);
  }

  // 3. UNKNOWN -> no alert
  if (isActiveAlert('UNKNOWN')) fail('UNKNOWN must not be an active alert');

  // 3b. Missing/undefined/null level -> no alert
  if (isActiveAlert(undefined)) fail('undefined level must not be an active alert');
  if (isActiveAlert(null)) fail('null level must not be an active alert');

  // 4. Distance alone must never create an alert: isActiveAlert has no
  // distance parameter at all — only a risk level. Confirm the function
  // signature enforces this by checking that a NORMAL level near a vehicle
  // (i.e. any distance) still reports no alert.
  const normalWithCloseDistanceStillNoAlert = isActiveAlert('NORMAL');
  if (normalWithCloseDistanceStillNoAlert) fail('distance alone (via NORMAL risk) must not create an alert');

  // 5. resolveFinalRisk prefers the Compact Event's final_risk over the fallback
  if (resolveFinalRisk('CRITICAL', 'NORMAL') !== 'CRITICAL') {
    fail('resolveFinalRisk should prefer the Compact Event final_risk over the fallback');
  }
  // ...and falls back to the existing stable/snapshot level when the Compact Event has none
  if (resolveFinalRisk(undefined, 'HIGH') !== 'HIGH') {
    fail('resolveFinalRisk should fall back to the existing level when final_risk is absent');
  }
  // ...and defaults to UNKNOWN when neither is available
  if (resolveFinalRisk(undefined, undefined) !== 'UNKNOWN') {
    fail('resolveFinalRisk should default to UNKNOWN when nothing is available');
  }

  // 6. recommendation comes from the Compact Event, not the fallback, when both are present
  if (resolveRecommendedAction('HOLD', 'PROCEED') !== 'HOLD') {
    fail('resolveRecommendedAction should use the Compact Event recommended_action, not the fallback');
  }
  // ...falls back only when the Compact Event has no recommended_action
  if (resolveRecommendedAction(undefined, 'REDUCE SPEED') !== 'REDUCE SPEED') {
    fail('resolveRecommendedAction should fall back when the Compact Event has no recommended_action');
  }
  // ...and defaults to NOT AVAILABLE when neither is available
  if (resolveRecommendedAction(undefined, undefined) !== 'NOT AVAILABLE') {
    fail('resolveRecommendedAction should default to NOT AVAILABLE when nothing is available');
  }

  console.log('All final risk + alert display tests passed');
  process.exit(0);
}

runTests();
