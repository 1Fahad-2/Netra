"""Blind-curve advance-warning thresholds — NETRA Phase 1 (Feature 11).

These values control ONLY the backend blind-curve state machine
(app/services/blind_curve_state_service.py). They are intentionally kept in
one place so nothing is hard-coded inline across the service/API layers.

Prototype thresholds for the SIH demo route — NOT official DGMS/NMDC
mine-safety standards. Tune per-site after formal validation.
"""

# ── Approach window ──────────────────────────────────────────────────────────
# A vehicle is warned "UPCOMING_BLIND_CURVE" once it is within this many
# metres (along the route) of the curve's entry point.
BLIND_CURVE_APPROACH_DISTANCE_M = 120.0

# ── Anti-flap hysteresis ─────────────────────────────────────────────────────
# GPS noise can make route_distance jitter a few metres around a section
# boundary. To stop the state visibly flickering on the ESP32/OLED, any
# transition that DOWNGRADES urgency (ACTIVE -> UPCOMING, UPCOMING -> SAFE)
# only takes effect once the vehicle is this far past the raw boundary.
# Transitions that UPGRADE urgency (SAFE -> UPCOMING, UPCOMING -> ACTIVE)
# always apply immediately at the raw boundary — a real warning is never
# delayed for the sake of smoothing.
BLIND_CURVE_STATE_HYSTERESIS_M = 8.0
