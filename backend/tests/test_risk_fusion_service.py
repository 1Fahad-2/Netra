"""
Backend Risk Fusion Service tests — Phase-4A.

Verifies:
  - All-NORMAL inputs fuse to NORMAL
  - A single higher-risk input elevates the final risk
  - Multiple high-risk inputs still fuse deterministically (worst wins)
  - CRITICAL input always dominates
  - UNKNOWN / missing input(s) are handled safely (ignored unless ALL
    sources are missing, in which case the result is UNKNOWN)
  - Fusion is deterministic across repeated/reordered calls
  - Final risk is never lower than the highest valid incoming risk
"""

import pytest

from app.services.risk_fusion_service import (
    RiskFusionService,
    RiskFusionResult,
    EDGE_SOURCE,
    V2V_SOURCE,
    INFRASTRUCTURE_SOURCE,
)
from app.schemas.telemetry import RiskLevel


@pytest.fixture
def fusion() -> RiskFusionService:
    return RiskFusionService()


# ─────────────────────────────────────────────────────────────────────────────
# All NORMAL
# ─────────────────────────────────────────────────────────────────────────────
def test_all_normal_fuses_to_normal(fusion):
    result = fusion.fuse(
        edge_risk=RiskLevel.NORMAL,
        v2v_risk=RiskLevel.NORMAL,
        infrastructure_risk=RiskLevel.NORMAL,
    )
    assert result.final_risk == RiskLevel.NORMAL
    assert set(result.contributing_sources) == {EDGE_SOURCE, V2V_SOURCE, INFRASTRUCTURE_SOURCE}


# ─────────────────────────────────────────────────────────────────────────────
# One higher risk among otherwise-normal inputs
# ─────────────────────────────────────────────────────────────────────────────
def test_single_elevated_input_wins(fusion):
    result = fusion.fuse(
        edge_risk=RiskLevel.CAUTION,
        v2v_risk=RiskLevel.HIGH,
        infrastructure_risk=RiskLevel.NORMAL,
    )
    assert result.final_risk == RiskLevel.HIGH
    assert result.contributing_sources == [V2V_SOURCE]


def test_matches_spec_example(fusion):
    # edge = CAUTION, v2v = HIGH, infrastructure = NORMAL → final = HIGH
    result = fusion.fuse(
        edge_risk=RiskLevel.CAUTION,
        v2v_risk=RiskLevel.HIGH,
        infrastructure_risk=RiskLevel.NORMAL,
    )
    assert result.final_risk == RiskLevel.HIGH


# ─────────────────────────────────────────────────────────────────────────────
# Multiple high risks
# ─────────────────────────────────────────────────────────────────────────────
def test_multiple_high_risks_fuse_to_high(fusion):
    result = fusion.fuse(
        edge_risk=RiskLevel.HIGH,
        v2v_risk=RiskLevel.HIGH,
        infrastructure_risk=RiskLevel.CAUTION,
    )
    assert result.final_risk == RiskLevel.HIGH
    assert set(result.contributing_sources) == {EDGE_SOURCE, V2V_SOURCE}


# ─────────────────────────────────────────────────────────────────────────────
# CRITICAL input always dominates
# ─────────────────────────────────────────────────────────────────────────────
def test_critical_input_dominates_all_others(fusion):
    result = fusion.fuse(
        edge_risk=RiskLevel.NORMAL,
        v2v_risk=RiskLevel.CRITICAL,
        infrastructure_risk=RiskLevel.HIGH,
    )
    assert result.final_risk == RiskLevel.CRITICAL
    assert result.contributing_sources == [V2V_SOURCE]


def test_final_risk_never_lower_than_highest_valid_input(fusion):
    all_levels = [RiskLevel.NORMAL, RiskLevel.CAUTION, RiskLevel.HIGH, RiskLevel.CRITICAL]
    severity = {lvl: i for i, lvl in enumerate(all_levels)}
    cases = [
        (RiskLevel.NORMAL, RiskLevel.CAUTION, RiskLevel.HIGH),
        (RiskLevel.CRITICAL, RiskLevel.NORMAL, RiskLevel.NORMAL),
        (RiskLevel.CAUTION, RiskLevel.CAUTION, RiskLevel.CAUTION),
    ]
    for edge, v2v, infra in cases:
        result = fusion.fuse(edge_risk=edge, v2v_risk=v2v, infrastructure_risk=infra)
        highest_valid = max(severity[l] for l in (edge, v2v, infra))
        assert severity[result.final_risk] >= highest_valid


# ─────────────────────────────────────────────────────────────────────────────
# UNKNOWN / missing input handling
# ─────────────────────────────────────────────────────────────────────────────
def test_unknown_input_is_ignored_when_others_valid(fusion):
    result = fusion.fuse(
        edge_risk=RiskLevel.UNKNOWN,
        v2v_risk=RiskLevel.CAUTION,
        infrastructure_risk=RiskLevel.NORMAL,
    )
    assert result.final_risk == RiskLevel.CAUTION
    assert result.contributing_sources == [V2V_SOURCE]


def test_missing_input_none_treated_same_as_unknown(fusion):
    result = fusion.fuse(edge_risk=None, v2v_risk=RiskLevel.HIGH, infrastructure_risk=None)
    assert result.final_risk == RiskLevel.HIGH
    assert result.sources[EDGE_SOURCE] == RiskLevel.UNKNOWN
    assert result.sources[INFRASTRUCTURE_SOURCE] == RiskLevel.UNKNOWN


def test_all_missing_or_unknown_fuses_to_unknown(fusion):
    result = fusion.fuse(
        edge_risk=RiskLevel.UNKNOWN,
        v2v_risk=None,
        infrastructure_risk=RiskLevel.UNKNOWN,
    )
    assert result.final_risk == RiskLevel.UNKNOWN
    assert result.contributing_sources == []


def test_no_arguments_defaults_to_all_unknown(fusion):
    result = fusion.fuse()
    assert result.final_risk == RiskLevel.UNKNOWN
    assert result.sources == {
        EDGE_SOURCE: RiskLevel.UNKNOWN,
        V2V_SOURCE: RiskLevel.UNKNOWN,
        INFRASTRUCTURE_SOURCE: RiskLevel.UNKNOWN,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Determinism
# ─────────────────────────────────────────────────────────────────────────────
def test_fusion_is_deterministic_across_repeated_calls(fusion):
    kwargs = dict(
        edge_risk=RiskLevel.CAUTION,
        v2v_risk=RiskLevel.HIGH,
        infrastructure_risk=RiskLevel.CAUTION,
    )
    results = [fusion.fuse(**kwargs) for _ in range(5)]
    for result in results:
        assert result.final_risk == RiskLevel.HIGH
        assert result.contributing_sources == [V2V_SOURCE]


def test_fusion_deterministic_regardless_of_service_instance(fusion):
    other = RiskFusionService()
    kwargs = dict(
        edge_risk=RiskLevel.CRITICAL,
        v2v_risk=RiskLevel.CRITICAL,
        infrastructure_risk=RiskLevel.NORMAL,
    )
    r1 = fusion.fuse(**kwargs)
    r2 = other.fuse(**kwargs)
    assert r1.final_risk == r2.final_risk == RiskLevel.CRITICAL
    assert r1.contributing_sources == r2.contributing_sources


def test_result_includes_all_three_normalized_sources(fusion):
    result = fusion.fuse(edge_risk=RiskLevel.NORMAL, v2v_risk=RiskLevel.CAUTION)
    assert isinstance(result, RiskFusionResult)
    assert set(result.sources.keys()) == {EDGE_SOURCE, V2V_SOURCE, INFRASTRUCTURE_SOURCE}
    assert result.sources[INFRASTRUCTURE_SOURCE] == RiskLevel.UNKNOWN
