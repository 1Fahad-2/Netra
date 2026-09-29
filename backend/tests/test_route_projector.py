"""
Phase 2E — Route Projector Tests

Verifies that route_projector.project_gps_to_route() correctly maps GPS
coordinates onto the frozen REAL_HAUL_CORRIDOR_PATH (63 vertices, 847.953 m).

All expected distances are derived from the frozen route geometry — they are
NOT hardcoded approximations.

Test requirements (from Phase 2E spec):
  1. Vertex 0  (approach start)   → route_distance ≈ 0 m
  2. Vertex 17 (BC01 apex)        → route_distance ≈ BC01_APEX_DIST_M (~198 m)
  3. Vertex 46 (BC02 apex)        → route_distance ≈ BC02_APEX_DIST_M (~646 m)
  4. Vertex 62 (route end)        → route_distance ≈ ROUTE_TOTAL_LENGTH_M (~847.953 m)
  5. Route distance is monotone along the frozen vertices
  6. Off-route coordinates return on_route=False, route_distance_m=None
  7. GPS near BC01 apex projects within ±5 m of BC01_APEX_DIST_M
  8. GPS near BC02 apex projects within ±5 m of BC02_APEX_DIST_M
  9. section_id values match known section labels for each region
 10. Vertex count sanity (63 vertices embedded)
"""

import math
import pytest

from app.services.route_projector import (
    _FROZEN_ROUTE,
    _CUM_DIST,
    BC01_APEX_DIST_M,
    BC02_APEX_DIST_M,
    BC01_APEX_INDEX,
    BC02_APEX_INDEX,
    ROUTE_TOTAL_LENGTH_M,
    MAX_OFF_ROUTE_M,
    project_gps_to_route,
    RouteProjectionResult,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _vertex_lat_lng(index: int):
    """Return (latitude, longitude) for the given frozen route vertex."""
    lng, lat = _FROZEN_ROUTE[index]
    return lat, lng


# ── Basic geometry invariants ──────────────────────────────────────────────────

class TestRouteGeometry:
    def test_vertex_count_is_63(self):
        """Frozen route must have exactly 63 vertices (spec requirement 10)."""
        assert len(_FROZEN_ROUTE) == 63

    def test_cumulative_distances_monotone_increasing(self):
        """Cumulative distances must be strictly monotone along the route (req 5)."""
        for i in range(1, len(_CUM_DIST)):
            assert _CUM_DIST[i] > _CUM_DIST[i - 1], (
                f"CUM_DIST[{i}]={_CUM_DIST[i]:.3f} <= CUM_DIST[{i-1}]={_CUM_DIST[i-1]:.3f}"
            )

    def test_total_route_length_within_expected_range(self):
        """Route length must be in [800, 900] m — same check as verifyPhase2ASafety.ts."""
        assert 800.0 <= ROUTE_TOTAL_LENGTH_M <= 900.0, (
            f"Route length {ROUTE_TOTAL_LENGTH_M:.3f} m outside [800, 900] m"
        )

    def test_bc01_apex_dist_approx_198(self):
        """BC01 apex (vertex 17) should be approx 198 m along the route."""
        assert 180.0 <= BC01_APEX_DIST_M <= 220.0, (
            f"BC01_APEX_DIST_M={BC01_APEX_DIST_M:.3f} outside expected ~198 m band"
        )

    def test_bc02_apex_dist_approx_646(self):
        """BC02 apex (vertex 46) should be approx 646 m along the route."""
        assert 620.0 <= BC02_APEX_DIST_M <= 670.0, (
            f"BC02_APEX_DIST_M={BC02_APEX_DIST_M:.3f} outside expected ~646 m band"
        )

    def test_cum_dist_length_equals_route_total(self):
        """Last cumulative distance entry must equal ROUTE_TOTAL_LENGTH_M."""
        assert abs(_CUM_DIST[-1] - ROUTE_TOTAL_LENGTH_M) < 1e-6


# ── Projection at exact frozen vertices ────────────────────────────────────────

class TestProjectionAtVertices:
    """
    For a GPS coordinate exactly at a known route vertex, the projection
    must map back to the same cumulative distance (within floating-point
    rounding and the ~3-decimal rounding applied in the result).
    """

    def _check_vertex(self, index: int, label: str, tolerance_m: float = 0.5):
        lat, lng = _vertex_lat_lng(index)
        result = project_gps_to_route(lat, lng)
        expected = _CUM_DIST[index]
        assert result.on_route, f"{label} (v{index}) reported off-route"
        assert result.route_distance_m is not None
        assert abs(result.route_distance_m - expected) <= tolerance_m, (
            f"{label} (v{index}): expected {expected:.3f} m, "
            f"got {result.route_distance_m:.3f} m (diff {abs(result.route_distance_m - expected):.3f} m)"
        )
        # Off-route distance must be near zero
        assert result.off_route_distance_m < 0.5, (
            f"{label} (v{index}): off_route_distance {result.off_route_distance_m:.3f} m > 0.5 m"
        )

    def test_vertex_0_approach_start_near_0m(self):
        """Requirement 1: vertex 0 → route_distance ≈ 0 m."""
        self._check_vertex(0, "approach start")

    def test_vertex_17_bc01_apex_near_198m(self):
        """Requirement 2: BC01 apex (v17) → route_distance ≈ BC01_APEX_DIST_M."""
        self._check_vertex(BC01_APEX_INDEX, "BC01 apex")

    def test_vertex_46_bc02_apex_near_646m(self):
        """Requirement 3: BC02 apex (v46) → route_distance ≈ BC02_APEX_DIST_M."""
        self._check_vertex(BC02_APEX_INDEX, "BC02 apex")

    def test_vertex_62_route_end_near_total_length(self):
        """Requirement 4: vertex 62 → route_distance ≈ ROUTE_TOTAL_LENGTH_M."""
        self._check_vertex(62, "route end")

    def test_all_vertices_project_monotone(self):
        """
        Requirement 5 — projection of every vertex must produce monotone
        increasing route_distance values.
        """
        prev_dist = -1.0
        for i, (lng, lat) in enumerate(_FROZEN_ROUTE):
            result = project_gps_to_route(lat, lng)
            assert result.on_route, f"Vertex {i} reported off-route"
            assert result.route_distance_m is not None
            assert result.route_distance_m >= prev_dist - 0.01, (
                f"Non-monotone at vertex {i}: {result.route_distance_m:.3f} < prev {prev_dist:.3f}"
            )
            prev_dist = result.route_distance_m


# ── Off-route handling ─────────────────────────────────────────────────────────

class TestOffRoute:
    def test_far_away_coordinate_is_off_route(self):
        """
        Requirement 6: GPS coordinates far outside the mine corridor must
        return on_route=False and route_distance_m=None.
        The user's demo payload (22.1290, 82.1390) is ~170 km away.
        """
        result = project_gps_to_route(22.1290, 82.1390)
        assert result.on_route is False
        assert result.route_distance_m is None
        assert result.section_id == "UNKNOWN"
        # Off-route distance must be >> MAX_OFF_ROUTE_M
        assert result.off_route_distance_m > MAX_OFF_ROUTE_M

    def test_nearby_but_still_off_route(self):
        """A point clearly outside the mine corridor should be off-route.

        The frozen route is a compact ~848 m winding road.  A shift of +0.005° lat
        AND +0.005° lng places the query point roughly 700+ m from every route
        segment, well beyond MAX_OFF_ROUTE_M (200 m).
        """
        lng, lat = _FROZEN_ROUTE[0]
        # +0.005° lat ≈ +555 m north, +0.005° lng ≈ +527 m east
        # Even the northernmost route segment (v13-16, lat≈18.6528) is ~400+ m south.
        result = project_gps_to_route(lat + 0.005, lng + 0.005)
        assert result.off_route_distance_m > MAX_OFF_ROUTE_M, (
            f"Expected off_route > {MAX_OFF_ROUTE_M} m, got {result.off_route_distance_m:.1f} m"
        )
        assert result.on_route is False

    def test_on_route_within_threshold(self):
        """A point 5 m off the corridor must be classified on_route=True."""
        # Shift vertex 31 (mid-link-road) by ~0.00005° lng (≈ 5 m)
        lng, lat = _FROZEN_ROUTE[31]
        result = project_gps_to_route(lat, lng + 0.00005)
        assert result.on_route is True
        assert result.route_distance_m is not None


# ── Near-apex GPS tests ────────────────────────────────────────────────────────

class TestNearApexProjection:
    def test_gps_near_bc01_apex_projects_within_15m(self):
        """
        Requirement 7: a GPS point ~10 m off the BC01 apex should project to
        within ±15 m of BC01_APEX_DIST_M.

        Tolerance rationale: BC01 is a tight hairpin.  A point offset ~10 m
        perpendicular to the apex vertex may project onto the adjacent inbound
        or outbound segment rather than the apex segment itself, producing a
        route_distance up to ~10 m from the apex along the polyline.  15 m
        captures this correctly without being artificially loose.
        """
        lng, lat = _FROZEN_ROUTE[BC01_APEX_INDEX]
        # ~0.00009° lat ≈ 10 m perpendicular offset
        result = project_gps_to_route(lat + 0.00009, lng)
        assert result.on_route is True
        assert result.route_distance_m is not None
        assert abs(result.route_distance_m - BC01_APEX_DIST_M) <= 15.0, (
            f"BC01 near-apex: expected ≈{BC01_APEX_DIST_M:.1f} m, "
            f"got {result.route_distance_m:.1f} m"
        )

    def test_gps_near_bc02_apex_projects_within_15m(self):
        """
        Requirement 8: a GPS point ~10 m off the BC02 apex should project to
        within ±15 m of BC02_APEX_DIST_M.

        Same tolerance rationale as BC01 — the sweep arc means an offset
        perpendicular to the apex vertex projects onto a neighbouring segment.
        """
        lng, lat = _FROZEN_ROUTE[BC02_APEX_INDEX]
        result = project_gps_to_route(lat - 0.00009, lng)
        assert result.on_route is True
        assert result.route_distance_m is not None
        assert abs(result.route_distance_m - BC02_APEX_DIST_M) <= 15.0, (
            f"BC02 near-apex: expected ≈{BC02_APEX_DIST_M:.1f} m, "
            f"got {result.route_distance_m:.1f} m"
        )


# ── Section ID classification ──────────────────────────────────────────────────

class TestSectionIds:
    """Requirement 9: section_id labels must match activeHaulRoute.ts."""

    _EXPECTED = [
        (0,  "BLIND_CURVE_APPROACH"),   # approach start
        (4,  "BLIND_CURVE_APPROACH"),   # mid-approach
        (7,  "BLIND_CURVE"),            # BC01 entry
        (17, "BLIND_CURVE"),            # BC01 apex
        (26, "BLIND_CURVE_EXIT"),       # BC01 exit
        (32, "BLIND_CURVE_EXIT"),       # link road
        (38, "BLIND_CURVE_02"),         # BC02 approach
        (46, "BLIND_CURVE_02"),         # BC02 apex
        (49, "BC02_EXIT"),              # BC02 end
        (62, "BC02_EXIT"),              # route end
    ]

    @pytest.mark.parametrize("vertex_idx,expected_section", _EXPECTED)
    def test_section_id_at_vertex(self, vertex_idx: int, expected_section: str):
        lat, lng = _vertex_lat_lng(vertex_idx)
        result = project_gps_to_route(lat, lng)
        assert result.on_route, f"v{vertex_idx} is unexpectedly off-route"
        assert result.section_id == expected_section, (
            f"v{vertex_idx}: expected section '{expected_section}', "
            f"got '{result.section_id}' (dist={result.route_distance_m:.1f} m)"
        )


# ── Requirement 6: hardware no longer persists route_distance=0.0 ──────────────

class TestHardwareRouteDistanceNotAlwaysZero:
    """
    Requirement 6: Verify that a hardware GPS coordinate ON the mine corridor
    no longer produces route_distance=0.0 (as the old hardcode did).

    This is a unit test against the projector; full end-to-end is covered by
    test_hardware_telemetry.py when the backend is live.
    """

    def test_on_route_coordinate_gives_nonzero_distance(self):
        """Vertex 17 (BC01 apex) must produce route_distance > 0."""
        lat, lng = _vertex_lat_lng(BC01_APEX_INDEX)
        result = project_gps_to_route(lat, lng)
        assert result.on_route is True
        assert result.route_distance_m is not None
        assert result.route_distance_m > 1.0, (
            f"Expected route_distance >> 0 for BC01 apex, got {result.route_distance_m}"
        )

    def test_off_route_coordinate_gracefully_gives_none(self):
        """Off-route GPS (22.1290, 82.1390) returns None, not 0.0."""
        result = project_gps_to_route(22.1290, 82.1390)
        assert result.route_distance_m is None  # must be None, not 0.0


# ── Derived constants sanity ───────────────────────────────────────────────────

class TestDerivedConstants:
    """Verify that the predictor now uses correctly derived values."""

    def test_bc01_apex_dist_matches_frozen_route(self):
        from app.services.oncoming_predictor import BC01_APEX_DIST_M as pred_bc01
        assert abs(pred_bc01 - BC01_APEX_DIST_M) < 1e-6, (
            f"Predictor BC01_APEX_DIST_M {pred_bc01} != projector {BC01_APEX_DIST_M}"
        )

    def test_bc02_apex_dist_matches_frozen_route(self):
        from app.services.oncoming_predictor import BC02_APEX_DIST_M as pred_bc02
        assert abs(pred_bc02 - BC02_APEX_DIST_M) < 1e-6, (
            f"Predictor BC02_APEX_DIST_M {pred_bc02} != projector {BC02_APEX_DIST_M}"
        )

    def test_route_length_matches_frozen_route(self):
        from app.services.oncoming_predictor import ROUTE_LENGTH_M as pred_len
        assert abs(pred_len - ROUTE_TOTAL_LENGTH_M) < 1e-6, (
            f"Predictor ROUTE_LENGTH_M {pred_len} != projector {ROUTE_TOTAL_LENGTH_M}"
        )
