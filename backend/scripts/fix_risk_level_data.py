"""
NETRA Phase-2B Step 2.5 — One-shot risk_level data compatibility cleanup.

Purpose:
  Convert legacy risk_level values in telemetry_events (and alert rows)
  from the old 3-level contract to the Phase-2A 4-level contract:
    LOW    -> NORMAL
    MEDIUM -> CAUTION

Only those two values are touched. HIGH, CRITICAL, UNKNOWN, and NULL are
left exactly as they are.

Usage (from backend/ directory):
    python scripts/fix_risk_level_data.py

The script reads DATABASE_URL from the environment (or backend/.env).
No schema changes are made — this is a data-only UPDATE.
"""

import sys
import os
from pathlib import Path

# ── Load .env from backend directory if present ────────────────────────────
env_path = Path(__file__).resolve().parents[1] / ".env"
if env_path.is_file():
    from dotenv import load_dotenv
    load_dotenv(dotenv_path=env_path)
    print(f"[info] Loaded .env from {env_path}")

# ── Resolve DATABASE_URL ───────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "mysql+pymysql://root:password@localhost:3306/netra"
)
print(f"[info] Using DATABASE_URL: {DATABASE_URL}")

# ── Connect ────────────────────────────────────────────────────────────────
try:
    from sqlalchemy import create_engine, text
except ImportError:
    print("[error] SQLAlchemy is not installed. Cannot proceed.")
    sys.exit(1)

connect_args = {}
engine_kwargs: dict = {"future": True, "echo": False}

if "sqlite" in DATABASE_URL:
    connect_args["check_same_thread"] = False
    engine_kwargs["connect_args"] = connect_args
else:
    connect_args["connect_timeout"] = 5
    engine_kwargs["connect_args"] = connect_args

try:
    engine = create_engine(DATABASE_URL, **engine_kwargs)
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print("[ok]   Database connection successful.\n")
except Exception as exc:
    print(f"[error] Cannot connect to database: {exc}")
    print(
        "\nPlease ensure DATABASE_URL is set correctly, e.g.:\n"
        "  $env:DATABASE_URL = 'mysql+pymysql://root:PASSWORD@localhost:3306/netra'\n"
        "  python scripts/fix_risk_level_data.py"
    )
    sys.exit(1)

# ── Inspect before ────────────────────────────────────────────────────────
print("=" * 60)
print("BEFORE — distinct risk_level values in telemetry_events")
print("=" * 60)

with engine.connect() as conn:
    rows = conn.execute(
        text("SELECT risk_level, COUNT(*) as cnt FROM telemetry_events GROUP BY risk_level ORDER BY risk_level")
    ).fetchall()

if not rows:
    print("  (table is empty or does not exist)\n")
else:
    for risk_level, cnt in rows:
        print(f"  {str(risk_level)!r:20s}  {cnt} row(s)")

# Count legacy values
pre_low    = sum(cnt for rl, cnt in rows if str(rl).upper() == "LOW")
pre_medium = sum(cnt for rl, cnt in rows if str(rl).upper() == "MEDIUM")
print(f"\n  LOW rows to convert   : {pre_low}")
print(f"  MEDIUM rows to convert: {pre_medium}\n")

if pre_low == 0 and pre_medium == 0:
    print("[ok]   No legacy LOW / MEDIUM values found. No changes needed.")
else:
    # ── Convert ───────────────────────────────────────────────────────────
    print("=" * 60)
    print("CONVERTING legacy risk_level values")
    print("=" * 60)

    with engine.begin() as conn:
        if pre_low > 0:
            result = conn.execute(
                text("UPDATE telemetry_events SET risk_level = 'NORMAL' WHERE risk_level = 'LOW'")
            )
            print(f"  LOW    -> NORMAL  : {result.rowcount} row(s) updated")

        if pre_medium > 0:
            result = conn.execute(
                text("UPDATE telemetry_events SET risk_level = 'CAUTION' WHERE risk_level = 'MEDIUM'")
            )
            print(f"  MEDIUM -> CAUTION : {result.rowcount} row(s) updated")

    print()

# ── Inspect after ─────────────────────────────────────────────────────────
print("=" * 60)
print("AFTER — distinct risk_level values in telemetry_events")
print("=" * 60)

with engine.connect() as conn:
    rows_after = conn.execute(
        text("SELECT risk_level, COUNT(*) as cnt FROM telemetry_events GROUP BY risk_level ORDER BY risk_level")
    ).fetchall()

remaining_low    = 0
remaining_medium = 0

if not rows_after:
    print("  (table is empty)\n")
else:
    for risk_level, cnt in rows_after:
        print(f"  {str(risk_level)!r:20s}  {cnt} row(s)")
        if str(risk_level).upper() == "LOW":
            remaining_low += cnt
        if str(risk_level).upper() == "MEDIUM":
            remaining_medium += cnt

print()

# ── Verify ────────────────────────────────────────────────────────────────
print("=" * 60)
print("VERIFICATION")
print("=" * 60)

if remaining_low == 0 and remaining_medium == 0:
    print("  [PASS] No LOW or MEDIUM values remain in telemetry_events.")
else:
    print(f"  [FAIL] {remaining_low} LOW and {remaining_medium} MEDIUM rows still present!")
    sys.exit(1)

# ── Summary ───────────────────────────────────────────────────────────────
print()
print("=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"  LOW rows converted    : {pre_low}")
print(f"  MEDIUM rows converted : {pre_medium}")
print(f"  Files changed         : NONE (data-only operation)")
print()
print("Phase-2B Step 2.5 data compatibility fix complete.")
