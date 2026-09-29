"""
NETRA Phase-2C Step 2 — Local Safety Logic Unit Tests.

Verifies the local-warning threshold logic defined in the ESP32 firmware
(esp32_hemm_telemetry.ino) as a pure-Python mirror so it can be tested
without physical hardware.

Thresholds (PROTOTYPE DEMO — not DGMS-certified):
  CRITICAL    : distance < 10 m
  HIGH        : 10 m <= distance < 20 m
  NORMAL      : distance >= 20 m
  SENSOR FAULT: distance < 0 (invalid / timeout)

These thresholds intentionally mirror the NETRA backend Phase-2A risk bands.

Run from backend/ directory:
    python -m pytest tests/test_local_safety_logic.py -v
"""

import pytest
from enum import Enum


# ---------------------------------------------------------------------------
# Pure-Python mirror of the ESP32 classifyLocalSafety() function
# This is NOT running on the microcontroller; it mirrors the logic for
# offline unit testing without physical hardware.
# ---------------------------------------------------------------------------

class LocalSafetyLevel(Enum):
    NORMAL       = "NORMAL"
    HIGH         = "HIGH"
    CRITICAL     = "CRITICAL"
    SENSOR_FAULT = "SENSOR_FAULT"


LOCAL_CRITICAL_M = 10.0   # PROTOTYPE DEMO threshold
LOCAL_HIGH_M     = 20.0   # PROTOTYPE DEMO threshold


def classify_local_safety(dist_m: float) -> LocalSafetyLevel:
    """
    Mirror of the ESP32 classifyLocalSafety() C function.

    Invalid / negative distance is conservatively SENSOR_FAULT —
    never treated as NORMAL / clear path.
    """
    if dist_m < 0.0:
        return LocalSafetyLevel.SENSOR_FAULT
    if dist_m < LOCAL_CRITICAL_M:
        return LocalSafetyLevel.CRITICAL
    if dist_m < LOCAL_HIGH_M:
        return LocalSafetyLevel.HIGH
    return LocalSafetyLevel.NORMAL


# ---------------------------------------------------------------------------
# Tests: NORMAL band
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("dist_m", [20.0, 25.4, 30.0, 100.0, 38.0])
def test_normal_band(dist_m):
    assert classify_local_safety(dist_m) == LocalSafetyLevel.NORMAL


def test_exact_20m_boundary_is_normal():
    """20.0 m is exactly on the HIGH/NORMAL boundary — must be NORMAL (strict <)."""
    assert classify_local_safety(20.0) == LocalSafetyLevel.NORMAL


# ---------------------------------------------------------------------------
# Tests: HIGH band (10 m ≤ dist < 20 m)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("dist_m", [10.0, 15.2, 19.9, 12.5])
def test_high_band(dist_m):
    assert classify_local_safety(dist_m) == LocalSafetyLevel.HIGH


def test_exact_10m_boundary_is_critical():
    """9.99 m is CRITICAL; 10.0 m is the start of HIGH (strict <)."""
    assert classify_local_safety(9.99) == LocalSafetyLevel.CRITICAL
    assert classify_local_safety(10.0) == LocalSafetyLevel.HIGH


# ---------------------------------------------------------------------------
# Tests: CRITICAL band (dist < 10 m)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("dist_m", [7.8, 5.0, 0.5, 9.99, 0.01])
def test_critical_band(dist_m):
    assert classify_local_safety(dist_m) == LocalSafetyLevel.CRITICAL


def test_zero_distance_is_critical():
    """0.0 m distance (contact) must be CRITICAL, not SENSOR_FAULT."""
    assert classify_local_safety(0.0) == LocalSafetyLevel.CRITICAL


# ---------------------------------------------------------------------------
# Tests: SENSOR FAULT (invalid / negative)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("dist_m", [-1.0, -0.001, -999.0])
def test_invalid_distance_is_sensor_fault(dist_m):
    """Negative distance (HC-SR04 timeout) must be SENSOR_FAULT, not NORMAL."""
    assert classify_local_safety(dist_m) == LocalSafetyLevel.SENSOR_FAULT


def test_sensor_fault_is_not_normal():
    """Fail-safe: SENSOR_FAULT must never be confused with NORMAL."""
    result = classify_local_safety(-1.0)
    assert result != LocalSafetyLevel.NORMAL
    assert result == LocalSafetyLevel.SENSOR_FAULT


# ---------------------------------------------------------------------------
# Tests: Demo sequence values (matches DEMO_SEQ in firmware)
# ---------------------------------------------------------------------------

def test_demo_sequence_25m_is_normal():
    """Demo step 0: 25.0 m → NORMAL"""
    assert classify_local_safety(25.0) == LocalSafetyLevel.NORMAL


def test_demo_sequence_15m_is_high():
    """Demo step 1: 15.2 m → HIGH"""
    assert classify_local_safety(15.2) == LocalSafetyLevel.HIGH


def test_demo_sequence_7m_is_critical():
    """Demo step 2: 7.8 m → CRITICAL"""
    assert classify_local_safety(7.8) == LocalSafetyLevel.CRITICAL


def test_demo_sequence_fault():
    """Demo step 3: -1.0 m → SENSOR_FAULT"""
    assert classify_local_safety(-1.0) == LocalSafetyLevel.SENSOR_FAULT


# ---------------------------------------------------------------------------
# Tests: Boundary strictness (thresholds are strict < not <=)
# ---------------------------------------------------------------------------

def test_boundary_strictness_critical_high():
    """Threshold is strict <: 10.0 is HIGH not CRITICAL."""
    assert classify_local_safety(10.0 - 0.001) == LocalSafetyLevel.CRITICAL
    assert classify_local_safety(10.0)          == LocalSafetyLevel.HIGH


def test_boundary_strictness_high_normal():
    """Threshold is strict <: 20.0 is NORMAL not HIGH."""
    assert classify_local_safety(20.0 - 0.001) == LocalSafetyLevel.HIGH
    assert classify_local_safety(20.0)          == LocalSafetyLevel.NORMAL


# ---------------------------------------------------------------------------
# Tests: Independence from backend
# ---------------------------------------------------------------------------

def test_local_safety_independent_of_wifi():
    """
    The local safety classification is a pure function — it has no dependency
    on Wi-Fi, backend, or database.  This test verifies it produces the
    correct result without any network calls.
    """
    # These should all work even with zero network access
    assert classify_local_safety(25.0) == LocalSafetyLevel.NORMAL
    assert classify_local_safety(15.0) == LocalSafetyLevel.HIGH
    assert classify_local_safety(8.0)  == LocalSafetyLevel.CRITICAL
    assert classify_local_safety(-1.0) == LocalSafetyLevel.SENSOR_FAULT


def test_four_distinct_output_states():
    """All four states are reachable and mutually distinct."""
    results = {
        classify_local_safety(25.0),
        classify_local_safety(15.0),
        classify_local_safety(8.0),
        classify_local_safety(-1.0),
    }
    assert len(results) == 4


# ---------------------------------------------------------------------------
# Recommended action mapping (mirrors firmware buzzer/LED intent)
# ---------------------------------------------------------------------------

def test_normal_no_warning():
    assert classify_local_safety(25.0) == LocalSafetyLevel.NORMAL


def test_high_intermittent_warning():
    assert classify_local_safety(15.0) == LocalSafetyLevel.HIGH


def test_critical_continuous_warning():
    assert classify_local_safety(7.8) == LocalSafetyLevel.CRITICAL


def test_sensor_fault_distinct_pattern():
    assert classify_local_safety(-1.0) == LocalSafetyLevel.SENSOR_FAULT
