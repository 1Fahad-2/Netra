/*
 * Demo safety thresholds – configurable values for the MAP‑ROUTE‑2 pipeline.
 * These are NOT DGMS‑certified operational limits; they are solely for the
 * SIH 2026 demonstration.
 */
export const MAX_MATCH_DISTANCE_METERS = 30;
export const ADVISORY_DISTANCE_METERS = 120;
export const CAUTION_DISTANCE_METERS = 80;
export const WARNING_DISTANCE_METERS = 40;
export const CRITICAL_DISTANCE_METERS = 20;

export const CURVE_HEADING_GENTLE_DEG = 15;
export const CURVE_HEADING_MODERATE_DEG = 30;
export const CURVE_HEADING_SHARP_DEG = 45;

// Advisory speeds (km/h) corresponding to curve severities.
export const ADVISORY_SPEED_GENTLE = 30;
export const ADVISORY_SPEED_MODERATE = 22;
export const ADVISORY_SPEED_SHARP = 15;
