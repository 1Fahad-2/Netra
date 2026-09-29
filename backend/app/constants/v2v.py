"""V2V safety engine prototype constants.

These values are used only for the NETRA SIH prototype demo route and are
**not** certified mine safety limits (DGMS / NMDC or otherwise).
Adjust per-site after formal validation.

Phase-2A four-level risk thresholds (OR semantics: distance OR TTC trigger):
  CRITICAL : gap <  10 m  OR  TTC < 2 s
  HIGH     : gap <  20 m  OR  TTC < 4 s
  CAUTION  : gap <  30 m  OR  TTC < 6 s
  NORMAL   : otherwise
  UNKNOWN  : insufficient / invalid data
"""

# ── Distance thresholds (metres) ────────────────────────────────────────────
CRITICAL_DISTANCE_M = 10   # gap < 10 m → CRITICAL
HIGH_DISTANCE_M     = 20   # gap < 20 m → HIGH
CAUTION_DISTANCE_M  = 30   # gap < 30 m → CAUTION

# ── TTC thresholds (seconds) ─────────────────────────────────────────────────
CRITICAL_TTC_S = 2    # TTC < 2 s → CRITICAL
HIGH_TTC_S     = 4    # TTC < 4 s → HIGH
CAUTION_TTC_S  = 6    # TTC < 6 s → CAUTION

# ── Telemetry freshness ───────────────────────────────────────────────────────
# Records whose timestamps differ by more than this are considered stale.
MAX_TELEMETRY_AGE_S = 2

# ── Direction classification ─────────────────────────────────────────────────
# When route_distance ordering can determine same-corridor travel, the raw
# heading difference may still be wide (e.g. the ~173° Bailadila blind curve).
# Use this tolerance when falling back to pure-heading direction detection.
SAME_DIRECTION_HEADING_THRESHOLD  = 45   # degrees – headings within this → SAME
OPPOSITE_DIRECTION_HEADING_THRESHOLD = 135  # degrees – headings this far apart → OPPOSITE

# ── Back-compat aliases (kept to avoid import-errors in legacy test imports) ─
# These are intentionally set equal to the HIGH thresholds so that any
# remaining references behave conservatively. Remove in a future cleanup.
WARNING_DISTANCE_M = HIGH_DISTANCE_M
WARNING_TTC_S      = HIGH_TTC_S
