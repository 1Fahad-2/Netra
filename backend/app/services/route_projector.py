"""
NETRA — Route Projector Service  (Phase 2E)

Computes route_distance (metres along the canonical haul-road corridor) for
an arbitrary GPS coordinate by projecting it onto the frozen polyline.

SOURCE OF TRUTH
---------------
The 63-vertex REAL_HAUL_CORRIDOR_PATH defined in
    frontend/src/data/realHaulRoad.ts

Those coordinates are FROZEN and must not be changed.  This module embeds
an exact copy of the vertex array so the Python backend can stay independent
of the TypeScript frontend without requiring a shared file.  The values here
must be kept in sync with realHaulRoad.ts whenever (if ever) the route is
officially updated.

COORDINATE ORDER
----------------
Every vertex is stored as (longitude, latitude) — the GeoJSON / Mapbox
convention used in realHaulRoad.ts.  Internally this module converts to
metres for distance calculations.

ALGORITHM
---------
For each polyline segment AB:
  1. Project the query point P onto the infinite line through A→B.
  2. Clamp the projection parameter t to [0, 1] so the closest point
     stays within the segment.
  3. Track the segment with the smallest perpendicular distance.
  4. Return cumulative distance = (distance to start of best segment) +
     (t × segment length).

SECTION CLASSIFICATION
----------------------
Named section boundaries mirror activeHaulRoute.ts:
  0 m           → BC01_START_DIST_M  : BLIND_CURVE_APPROACH
  BC01_START_M  → BC01_END_M         : BLIND_CURVE          (BC01)
  BC01_END_M    → BC02_APPROACH_M    : BLIND_CURVE_EXIT
  BC02_APPROACH → BC02_END_M         : BLIND_CURVE_02
  BC02_END_M    → route end          : BC02_EXIT

GRACEFUL DEGRADATION
--------------------
If the GPS coordinate is more than MAX_OFF_ROUTE_M from the nearest route
point, the function returns route_distance = None and section_id = "UNKNOWN".
The caller (hardware telemetry adapter) should handle this and NOT snap the
vehicle to the route.

DISCLAIMER
----------
Demo/prototype use only.  Not an official NMDC survey or DGMS measurement.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Optional, Tuple

# ── Approximate Earth constants ────────────────────────────────────────────────
# Good enough for a ~1 km mine road.  Uses the same approximations as the
# TypeScript routeIntelligence.ts / calcDistanceMeters functions.

_METERS_PER_DEG_LAT = 111_000.0   # ~constant globally
_METERS_PER_DEG_LNG = 105_400.0   # good approximation at 18–19 °N latitude


def _deg_to_meters(lng: float, lat: float) -> Tuple[float, float]:
    """Convert a (longitude, latitude) point to approximate (x, y) in metres."""
    return lng * _METERS_PER_DEG_LNG, lat * _METERS_PER_DEG_LAT


# ── Frozen route geometry (exact copy of REAL_HAUL_CORRIDOR_PATH) ─────────────
#
# DO NOT MODIFY THESE COORDINATES.
# They are frozen and must match frontend/src/data/realHaulRoad.ts exactly.
#
# Format: (longitude, latitude)

_FROZEN_ROUTE: list[Tuple[float, float]] = [
    # ── APPROACH ──────────────────────────────────────────────────────────────
    (81.23495335, 18.65144331),  #  0  approach start
    (81.23494257, 18.65171961),  #  1
    (81.23493897, 18.65185946),  #  2
    (81.23496057, 18.65203485),  #  3
    (81.23496777, 18.65224292),  #  4
    (81.23496777, 18.65243052),  #  5
    (81.23496417, 18.65252262),  #  6
    # ── BLIND CURVE 01 ────────────────────────────────────────────────────────
    (81.23490297, 18.65263177),  #  7  BC01 entry   (BC01_START_INDEX)
    (81.23489217, 18.65265565),  #  8
    (81.23485977, 18.65270340),  #  9
    (81.23480577, 18.65274774),  # 10
    (81.23471577, 18.65278867),  # 11
    (81.23461496, 18.65283984),  # 12
    (81.23453216, 18.65285348),  # 13
    (81.23444216, 18.65285348),  # 14
    (81.23434496, 18.65285348),  # 15
    (81.23428736, 18.65283984),  # 16
    (81.23426936, 18.65275115),  # 17  BC01 apex    (BC01_APEX_INDEX)
    (81.23428376, 18.65268976),  # 18
    (81.23432336, 18.65260789),  # 19
    (81.23434136, 18.65254991),  # 20
    (81.23443856, 18.65243393),  # 21
    (81.23453576, 18.65226339),  # 22
    (81.23458616, 18.65214059),  # 23
    (81.23454656, 18.65197004),  # 24
    (81.23453936, 18.65175515),  # 25
    (81.23452496, 18.65150615),  # 26  BC01 exit    (BC01_END_INDEX)
    # ── LINK ROAD ─────────────────────────────────────────────────────────────
    (81.23453576, 18.65127594),  # 27
    (81.23455736, 18.65106446),  # 28
    (81.23457896, 18.65084274),  # 29
    (81.23462216, 18.65061762),  # 30
    (81.23463435, 18.65048572),  # 31
    (81.23466483, 18.65031634),  # 32
    (81.23470139, 18.65017775),  # 33
    (81.23471968, 18.65006418),  # 34
    (81.23474609, 18.64997757),  # 35
    (81.23477656, 18.64989480),  # 36
    (81.23482545, 18.64981524),  # 37
    (81.23488233, 18.64974402),  # 38  BC02 approach (BC02_APPROACH_INDEX)
    # ── BLIND CURVE 02 ────────────────────────────────────────────────────────
    (81.23494937, 18.64967280),  # 39
    (81.23501970, 18.64960569),  # 40
    (81.23510096, 18.64952292),  # 41
    (81.23517409, 18.64944593),  # 42
    (81.23524113, 18.64936893),  # 43
    (81.23528176, 18.64929964),  # 44
    (81.23532239, 18.64923805),  # 45
    (81.23534068, 18.64918415),  # 46  BC02 apex    (BC02_APEX_INDEX)
    (81.23533255, 18.64913410),  # 47
    (81.23530208, 18.64907636),  # 48
    (81.23521472, 18.64902439),  # 49  BC02 end     (BC02_END_INDEX)
    # ── BC02 EXIT ─────────────────────────────────────────────────────────────
    (81.23515784, 18.64902824),  # 50
    (81.23509487, 18.64904749),  # 51
    (81.23504002, 18.64905519),  # 52
    (81.23495469, 18.64910716),  # 53
    (81.23488156, 18.64914950),  # 54
    (81.23484296, 18.64918030),  # 55
    (81.23479217, 18.64921495),  # 56
    (81.23466013, 18.64936123),  # 57
    (81.23451589, 18.64950945),  # 58
    (81.23435947, 18.64965766),  # 59
    (81.23420711, 18.64981934),  # 60
    (81.23406490, 18.64996755),  # 61
    (81.23397145, 18.65006187),  # 62  route end
]

# Vertex count sanity check — must be 63.
assert len(_FROZEN_ROUTE) == 63, (
    f"Route vertex count mismatch: expected 63, got {len(_FROZEN_ROUTE)}. "
    "Check that _FROZEN_ROUTE matches REAL_HAUL_CORRIDOR_PATH exactly."
)


def _seg_len_m(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    """Length of a route segment in metres (lng,lat inputs)."""
    x1, y1 = _deg_to_meters(*p1)
    x2, y2 = _deg_to_meters(*p2)
    return math.hypot(x2 - x1, y2 - y1)


# ── Pre-computed cumulative distances for every vertex ────────────────────────
# cumulative_dist[i] = total route length from vertex 0 to vertex i (metres).

_CUM_DIST: list[float] = [0.0]
for _i in range(len(_FROZEN_ROUTE) - 1):
    _CUM_DIST.append(_CUM_DIST[-1] + _seg_len_m(_FROZEN_ROUTE[_i], _FROZEN_ROUTE[_i + 1]))

ROUTE_TOTAL_LENGTH_M: float = _CUM_DIST[-1]
"""Total length of the frozen route in metres (derived, not hardcoded)."""

# ── Named vertex landmark distances (derived from cumulative distances) ────────
# Indices match the constants in realHaulRoad.ts exactly.

BC01_START_INDEX   = 7
BC01_APEX_INDEX    = 17
BC01_END_INDEX     = 26
BC02_APPROACH_INDEX = 38
BC02_APEX_INDEX    = 46
BC02_END_INDEX     = 49

BC01_START_DIST_M  = _CUM_DIST[BC01_START_INDEX]
BC01_APEX_DIST_M   = _CUM_DIST[BC01_APEX_INDEX]
BC01_END_DIST_M    = _CUM_DIST[BC01_END_INDEX]
BC02_APPROACH_DIST_M = _CUM_DIST[BC02_APPROACH_INDEX]
BC02_APEX_DIST_M   = _CUM_DIST[BC02_APEX_INDEX]
BC02_END_DIST_M    = _CUM_DIST[BC02_END_INDEX]

# ── Off-route threshold ───────────────────────────────────────────────────────
# GPS coordinates more than this many metres from the nearest polyline point
# are considered "off-route" — route_distance returns None.
MAX_OFF_ROUTE_M = 200.0  # generous threshold for prototype; tighten per-site


# ── Section ID lookup ─────────────────────────────────────────────────────────
# Section boundaries derived from the frozen route, mirroring activeHaulRoute.ts.

_SECTIONS: list[Tuple[float, float, str]] = [
    (0.0,              BC01_START_DIST_M,    "BLIND_CURVE_APPROACH"),
    (BC01_START_DIST_M, BC01_END_DIST_M,     "BLIND_CURVE"),
    (BC01_END_DIST_M,  BC02_APPROACH_DIST_M, "BLIND_CURVE_EXIT"),
    (BC02_APPROACH_DIST_M, BC02_END_DIST_M,  "BLIND_CURVE_02"),
    (BC02_END_DIST_M,  ROUTE_TOTAL_LENGTH_M, "BC02_EXIT"),
]


def _section_id_for_dist(route_dist_m: float) -> str:
    """Return the section_id for a given route_distance (metres).

    Uses exclusive upper-bound matching (start <= x < end) for all sections
    except the last, so that a vertex sitting exactly on a section boundary is
    classified in the downstream section — matching activeHaulRoute.ts semantics.
    """
    for start, end, sid in _SECTIONS[:-1]:
        if start <= route_dist_m < end:
            return sid
    # Last section: inclusive on both ends (catches the route-end vertex exactly)
    return _SECTIONS[-1][2]


# ── Public result type ────────────────────────────────────────────────────────

@dataclass
class RouteProjectionResult:
    """Result of projecting a GPS coordinate onto the frozen haul-road corridor."""

    route_distance_m: Optional[float]
    """Cumulative route distance in metres, or None if the coordinate is off-route."""

    section_id: str
    """Section identifier matching activeHaulRoute.ts section IDs."""

    off_route_distance_m: float
    """Perpendicular distance (metres) from the GPS point to the nearest route segment."""

    on_route: bool
    """True when off_route_distance_m <= MAX_OFF_ROUTE_M."""


# ── Core projection function ──────────────────────────────────────────────────

def project_gps_to_route(
    latitude: float,
    longitude: float,
    max_off_route_m: float = MAX_OFF_ROUTE_M,
) -> RouteProjectionResult:
    """
    Project an arbitrary GPS coordinate onto the frozen haul-road corridor.

    Parameters
    ----------
    latitude, longitude : float
        WGS-84 coordinates of the query point (e.g. from ESP32 GPS).
    max_off_route_m : float
        Maximum allowable perpendicular distance (metres) before the point
        is classified as off-route.  Default: MAX_OFF_ROUTE_M.

    Returns
    -------
    RouteProjectionResult
        .route_distance_m : cumulative metres along the route, or None if off-route.
        .section_id       : matching section label, or "UNKNOWN" if off-route.
        .off_route_distance_m : perpendicular distance to nearest segment.
        .on_route         : True when within max_off_route_m of the corridor.
    """
    # Query point in metre space
    px, py = _deg_to_meters(longitude, latitude)

    best_dist2   = math.inf   # squared perpendicular distance
    best_seg_idx = 0
    best_t       = 0.0

    for i in range(len(_FROZEN_ROUTE) - 1):
        ax, ay = _deg_to_meters(*_FROZEN_ROUTE[i])
        bx, by = _deg_to_meters(*_FROZEN_ROUTE[i + 1])

        vx, vy = bx - ax, by - ay
        seg_len2 = vx * vx + vy * vy

        if seg_len2 < 1e-12:
            # Degenerate zero-length segment — treat as point
            dx, dy = px - ax, py - ay
            dist2 = dx * dx + dy * dy
            t = 0.0
        else:
            # Parameter t = projection of (P-A) onto segment AB, clamped to [0,1]
            t = ((px - ax) * vx + (py - ay) * vy) / seg_len2
            t = max(0.0, min(1.0, t))
            cx, cy = ax + t * vx, ay + t * vy
            dx, dy = px - cx, py - cy
            dist2 = dx * dx + dy * dy

        if dist2 < best_dist2:
            best_dist2   = dist2
            best_seg_idx = i
            best_t       = t

    # Perpendicular distance
    off_route_m = math.sqrt(best_dist2)

    # Cumulative route distance to the projected point
    seg_len_m      = _seg_len_m(_FROZEN_ROUTE[best_seg_idx], _FROZEN_ROUTE[best_seg_idx + 1])
    route_dist_m   = _CUM_DIST[best_seg_idx] + best_t * seg_len_m

    on_route = off_route_m <= max_off_route_m

    return RouteProjectionResult(
        route_distance_m  = round(route_dist_m, 3) if on_route else None,
        section_id        = _section_id_for_dist(route_dist_m) if on_route else "UNKNOWN",
        off_route_distance_m = round(off_route_m, 3),
        on_route          = on_route,
    )
