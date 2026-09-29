/**
 * NETRA — Phase 2A: two-vehicle safety assessment (TTC + risk + reason).
 *
 * This is the ONE place in the frontend where the following-distance gap, closing speed, TTC
 * and prototype risk level are computed. Nothing here is random and nothing is AI/ML:
 * it is deterministic, rule-based logic over the values passed in.
 *
 * PROTOTYPE THRESHOLDS — these are demonstration values for the NETRA SIH prototype.
 * They are NOT official NMDC / DGMS / mining-safety limits.
 *
 *   CRITICAL : gap < 10 m  OR  TTC < 2 s
 *   HIGH     : gap < 20 m  OR  TTC < 4 s
 *   CAUTION  : gap < 30 m  OR  TTC < 6 s
 *   NORMAL   : otherwise
 */

// ---------------------------------------------------------------------------------------
// Constants (prototype thresholds — defined once, referenced everywhere)
// ---------------------------------------------------------------------------------------
export const RISK_THRESHOLDS = {
  CRITICAL: { distanceM: 10, ttcS: 2 },
  HIGH: { distanceM: 20, ttcS: 4 },
  CAUTION: { distanceM: 30, ttcS: 6 },
} as const;

export type SafetyRiskLevel = 'NORMAL' | 'CAUTION' | 'HIGH' | 'CRITICAL';
/** UNKNOWN is returned when the inputs are missing/invalid — never silently reported as NORMAL. */
export type SafetyAssessmentLevel = SafetyRiskLevel | 'UNKNOWN';

/** Ordered lowest → highest severity (useful for progression checks). */
export const SAFETY_LEVEL_ORDER: SafetyRiskLevel[] = ['NORMAL', 'CAUTION', 'HIGH', 'CRITICAL'];

export type RiskTrigger = 'DISTANCE' | 'TTC';

/** Optional route context used ONLY to add a supported "blind curve" phrase to the reason. */
export interface RouteRiskContext {
  /** Trailing vehicle is on the approach section, before the blind curve. */
  approachingBlindCurve?: boolean;
  /** Trailing vehicle is inside the blind curve section. */
  inBlindCurve?: boolean;
}

export interface SafetyAssessmentInput {
  /** Along-route position of the LEAD vehicle (m). */
  leadPositionM: number | null | undefined;
  /** Along-route position of the TRAILING vehicle (m). */
  trailingPositionM: number | null | undefined;
  /** Lead vehicle ground speed (m/s). */
  leadSpeedMs: number | null | undefined;
  /** Trailing vehicle ground speed (m/s). */
  trailingSpeedMs: number | null | undefined;
  context?: RouteRiskContext;
}

export interface SafetyAssessment {
  level: SafetyAssessmentLevel;
  /** gap = lead_position − trailing_position (m); null if inputs invalid. */
  gapM: number | null;
  /** closing_speed = trailing_speed − lead_speed (m/s); > 0 means the gap is shrinking. */
  closingSpeedMs: number | null;
  /** TTC = gap / closing_speed (s); null when NOT closing (or inputs invalid). */
  ttcS: number | null;
  isClosing: boolean;
  /** Which rule(s) put the level where it is (empty for NORMAL/UNKNOWN). */
  triggers: RiskTrigger[];
  /** Human-readable, built only from the calculated state above. */
  reason: string;
  /** Prototype risk index 0..1 for ordering/visualisation. Not a collision probability. */
  riskScore: number;
  method: 'RULE_BASED_PROTOTYPE';
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const r1 = (v: number): number => Number(v.toFixed(1));

// ---------------------------------------------------------------------------------------
// TTC (the only TTC formula in the frontend)
// ---------------------------------------------------------------------------------------

/**
 * Time-to-collision in seconds, or null when there is no closing event.
 * Returns null for: non-finite inputs, gap < 0 (vehicles overlap / order inverted),
 * closing speed <= 0 (gap steady or opening).
 */
export function calculateTtc(gapM: number | null | undefined, closingSpeedMs: number | null | undefined): number | null {
  if (!isFiniteNumber(gapM) || !isFiniteNumber(closingSpeedMs)) return null;
  if (gapM < 0 || closingSpeedMs <= 0) return null;
  return gapM / closingSpeedMs;
}

// ---------------------------------------------------------------------------------------
// Risk classification (the only place the thresholds are applied)
// ---------------------------------------------------------------------------------------

export function classifyRisk(
  gapM: number,
  ttcS: number | null
): { level: SafetyRiskLevel; triggers: RiskTrigger[] } {
  const bands: SafetyRiskLevel[] = ['CRITICAL', 'HIGH', 'CAUTION'];
  for (const level of bands) {
    const th = RISK_THRESHOLDS[level as keyof typeof RISK_THRESHOLDS];
    const triggers: RiskTrigger[] = [];
    if (gapM < th.distanceM) triggers.push('DISTANCE');
    if (ttcS !== null && ttcS < th.ttcS) triggers.push('TTC');
    if (triggers.length > 0) return { level, triggers };
  }
  return { level: 'NORMAL', triggers: [] };
}

/** Prototype risk index (0..1): the larger of "how far into the distance band" and "how far into the TTC band". */
function computeRiskScore(gapM: number, ttcS: number | null): number {
  const distScore = clamp01((RISK_THRESHOLDS.CAUTION.distanceM - gapM) / RISK_THRESHOLDS.CAUTION.distanceM);
  const ttcScore = ttcS === null ? 0 : clamp01((RISK_THRESHOLDS.CAUTION.ttcS - ttcS) / RISK_THRESHOLDS.CAUTION.ttcS);
  return Number(Math.max(distScore, ttcScore, 0).toFixed(2));
}

// ---------------------------------------------------------------------------------------
// Explainable reason (only phrases supported by the calculated values)
// ---------------------------------------------------------------------------------------

function buildReason(
  level: SafetyRiskLevel,
  triggers: RiskTrigger[],
  gapM: number,
  closingSpeedMs: number,
  ttcS: number | null,
  context?: RouteRiskContext
): string {
  const gap = r1(gapM);
  const isClosing = ttcS !== null;
  const trend = isClosing
    ? `Following distance decreasing (closing ${r1(closingSpeedMs)} m/s)`
    : closingSpeedMs < 0
      ? `Following distance increasing (opening ${r1(-closingSpeedMs)} m/s)`
      : 'Following distance steady';

  if (level === 'NORMAL') {
    return isClosing
      ? `Safe following distance (${gap} m). ${trend}, TTC ${r1(ttcS as number)} s is above configured thresholds.`
      : `Safe following distance (${gap} m). ${trend}.`;
  }

  const th = RISK_THRESHOLDS[level];
  const parts: string[] = [];
  if (triggers.includes('DISTANCE')) parts.push(`Gap ${gap} m below ${th.distanceM} m threshold`);
  if (triggers.includes('TTC')) parts.push(`TTC ${r1(ttcS as number)} s below ${th.ttcS} s threshold`);
  parts.push(trend);
  if (context?.inBlindCurve) parts.push('Trailing vehicle inside blind curve');
  else if (context?.approachingBlindCurve) parts.push('Approaching blind curve');
  return `${level}: ${parts.join('. ')}.`;
}

// ---------------------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------------------

export function assessSafety(input: SafetyAssessmentInput): SafetyAssessment {
  const { leadPositionM, trailingPositionM, leadSpeedMs, trailingSpeedMs, context } = input;

  const positionsValid = isFiniteNumber(leadPositionM) && isFiniteNumber(trailingPositionM);
  const speedsValid =
    isFiniteNumber(leadSpeedMs) && isFiniteNumber(trailingSpeedMs) && leadSpeedMs >= 0 && trailingSpeedMs >= 0;

  if (!positionsValid || !speedsValid) {
    return {
      level: 'UNKNOWN',
      gapM: null,
      closingSpeedMs: null,
      ttcS: null,
      isClosing: false,
      triggers: [],
      reason: 'Insufficient or invalid telemetry (position/speed missing); risk cannot be assessed.',
      riskScore: 0,
      method: 'RULE_BASED_PROTOTYPE',
    };
  }

  const gapM = (leadPositionM as number) - (trailingPositionM as number);
  const closingSpeedMs = (trailingSpeedMs as number) - (leadSpeedMs as number);

  if (gapM < 0) {
    // Order inverted / overlap: never report this as a safe state.
    return {
      level: 'CRITICAL',
      gapM,
      closingSpeedMs,
      ttcS: null,
      isClosing: closingSpeedMs > 0,
      triggers: ['DISTANCE'],
      reason: 'CRITICAL: Vehicle positions overlap or are out of order (gap below 0 m).',
      riskScore: 1,
      method: 'RULE_BASED_PROTOTYPE',
    };
  }

  const ttcS = calculateTtc(gapM, closingSpeedMs);
  const { level, triggers } = classifyRisk(gapM, ttcS);

  return {
    level,
    gapM,
    closingSpeedMs,
    ttcS,
    isClosing: closingSpeedMs > 0,
    triggers,
    reason: buildReason(level, triggers, gapM, closingSpeedMs, ttcS, context),
    riskScore: computeRiskScore(gapM, ttcS),
    method: 'RULE_BASED_PROTOTYPE',
  };
}
