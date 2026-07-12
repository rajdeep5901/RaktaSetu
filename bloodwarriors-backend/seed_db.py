"""
### FILE: seed_db.py
============================================================
RaktaSetu AI — Non-Destructive Donor Seeding
============================================================
Ingests Dataset.csv (legacy donor rows) into the application
database via the SQLAlchemy engine defined in `app.database`,
WITHOUT touching UI code, FastAPI endpoints, or the schema.

This script is engine-agnostic: it seeds whatever `DATABASE_URL`
points at (PostgreSQL on Neon/Supabase in production, SQLite in
local development). Table creation is handled on import of
`app.database` (init_sqlite_db -> Base.metadata.create_all).

Design constraints (see task brief):
  * to_sql(if_exists="append")  -> never drops/replaces `donors`,
    so the 5 live frontend-registered donors are preserved.
  * Injects safe defaults the ML model / /match endpoint expect:
        consent_given -> True   (so rows are matchable)
        status        -> "active" where blank
  * registration_date -> utcnow() - 30d, so legacy rows do NOT
    trip the is_new_donor() highlight (NEW_DONOR_WINDOW_DAYS=7).

Pipeline-health hardening (why this script is not a naive append):
  The /match endpoint reads donors through the SQLAlchemy ORM.
  Boolean and DateTime columns have STRICT result processors, so
  the raw CSV values ("TRUE"/"FALSE" and DD-MM-YYYY dates) would
  crash every read. We normalise them to 0/1/NULL and ISO
  datetimes before inserting. Column types are read live from the
  engine via SQLAlchemy's inspector -- nothing is hard-coded.

Usage:
    python seed_db.py            # seed (aborts if already seeded)
    python seed_db.py --force    # seed even if legacy rows exist
"""

import os
import sys
import sqlite3
import datetime

import pandas as pd
from sqlalchemy import inspect, text

# Importing app.database creates all tables (Base.metadata.create_all)
# and gives us the configured engine + Donor model.
from app.database import engine, Donor  # noqa: F401  (Donor re-exported for callers/tests)

# ------------------------------------------------------------
# Paths (resolved relative to this file so it runs from anywhere)
# ------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "Dataset.csv")
TABLE = "donors"

# Rows already present beyond this count => we assume the CSV was
# already seeded, and abort to avoid double-insertion (7k -> 14k).
ALREADY_SEEDED_THRESHOLD = 50

# Legacy hex-ID length the backend uses to distinguish legacy vs
# frontend donors (app/main.py::_LEGACY_ID_HEX_LEN). Used only for a
# non-fatal sanity warning here.
LEGACY_ID_HEX_LEN = 64


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------
def get_table_columns():
    """Return {column_name: declared_type_upper} for TABLE, excluding
    the autoincrement primary key `id`. Read live from the engine via
    SQLAlchemy's inspector so nothing about the schema is hard-coded."""
    cols = {}
    for col in inspect(engine).get_columns(TABLE):
        if col.get("primary_key"):  # skip the autoincrement id
            continue
        cols[col["name"]] = str(col["type"]).upper()
    return cols


def to_bool_int(series):
    """Map TRUE/FALSE-ish strings to Python booleans, blanks/unknown to None.

    Returns native ``True``/``False`` (NOT integers 1/0) so psycopg2 binds them
    as PostgreSQL ``boolean`` values instead of crashing on an int->bool insert.
    NaN/Null values become ``None`` (SQL NULL)."""
    truthy = {"true", "1", "t", "yes", "y"}
    falsy = {"false", "0", "f", "no", "n"}

    def conv(v):
        if v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NA:
            return None
        s = str(v).strip().lower()
        if s in truthy:
            return True
        if s in falsy:
            return False
        return None  # blank / unparseable -> NULL

    return series.map(conv)


def to_iso_datetime(series):
    """Parse DD-MM-YYYY (or similar day-first) dates to ISO
    'YYYY-MM-DD HH:MM:SS.ffffff' strings; blanks/unparseable -> None.
    ISO strings are what SQLAlchemy's DateTime result processor expects."""
    parsed = pd.to_datetime(series, format="%d-%m-%Y", errors="coerce")
    # Fallback for any stragglers in a different day-first layout.
    missing = parsed.isna() & series.notna() & (series.astype(str).str.strip() != "")
    if missing.any():
        parsed.loc[missing] = pd.to_datetime(
            series[missing], dayfirst=True, errors="coerce"
        )
    return parsed.dt.strftime("%Y-%m-%d %H:%M:%S.%f").where(parsed.notna(), None)


def to_number(series, integer=False):
    """Coerce to numeric; blanks/unparseable -> None. Integers become
    nullable so NULL survives instead of becoming NaN/0."""
    num = pd.to_numeric(series, errors="coerce")
    if integer:
        num = num.astype("Int64")  # pandas nullable integer
    return num.astype(object).where(num.notna(), None)


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------
def main():
    force = "--force" in sys.argv

    if not os.path.exists(CSV_PATH):
        sys.exit(f"[ERROR] Dataset.csv not found at {CSV_PATH}")

    is_sqlite = str(engine.url).startswith("sqlite")
    print(f"[INFO] Seeding target: {engine.url.render_as_string(hide_password=True)}")

    conn = engine.connect()
    try:
        # --- Pre-flight: existing rows & guard against re-seeding ---
        existing = conn.execute(text(f"SELECT COUNT(*) FROM {TABLE}")).scalar()
        print(f"[INFO] Existing rows in '{TABLE}': {existing}")
        if existing > ALREADY_SEEDED_THRESHOLD and not force:
            sys.exit(
                f"[ABORT] '{TABLE}' already has {existing} rows (> {ALREADY_SEEDED_THRESHOLD}). "
                "Looks already seeded. Re-run with --force to append anyway."
            )

        # --- Backup (SQLite only, via SQLite online backup API) ---
        # PostgreSQL backups are the provider's responsibility (Neon/Supabase
        # PITR), so we only take a local file backup when on SQLite.
        if is_sqlite:
            db_file = engine.url.database
            backup_path = db_file + ".seedbak"
            with sqlite3.connect(db_file) as src, sqlite3.connect(backup_path) as bak:
                src.backup(bak)
            print(f"[INFO] Backup written: {backup_path}")
        else:
            print("[INFO] Non-SQLite engine detected; skipping local file backup.")

        table_cols = get_table_columns()

        # --- Load CSV as raw strings (no pandas type coercion yet) ---
        df = pd.read_csv(CSV_PATH, dtype=str, keep_default_na=False, na_values=[""])
        print(f"[INFO] Read {len(df)} rows / {len(df.columns)} columns from CSV")

        # Keep only columns that actually exist on the table.
        keep = [c for c in df.columns if c in table_cols]
        dropped = [c for c in df.columns if c not in table_cols]
        if dropped:
            print(f"[INFO] Ignoring CSV columns not in schema: {dropped}")
        df = df[keep].copy()

        # --- Normalise by declared column type (live from schema) ---
        for col in list(df.columns):
            decl = table_cols[col]
            if col == "registration_date":
                continue  # overridden below
            if "BOOL" in decl:
                df[col] = to_bool_int(df[col])
            elif "DATE" in decl or "TIME" in decl:
                df[col] = to_iso_datetime(df[col])
            elif "INT" in decl:
                df[col] = to_number(df[col], integer=True)
            elif "FLOAT" in decl or "REAL" in decl or "DOUB" in decl:
                df[col] = to_number(df[col], integer=False)
            else:  # VARCHAR / TEXT: convert NaN -> None, keep strings
                df[col] = df[col].astype(object).where(df[col].notna(), None)

        # --- Inject safe defaults the pipeline expects ---
        # consent_given: NOT NULL on the model; default True so rows match.
        df["consent_given"] = True
        # status: default "active" where the CSV left it blank.
        if "status" in df.columns:
            df["status"] = df["status"].map(
                lambda v: "active" if v is None or str(v).strip() == "" else v
            )
        else:
            df["status"] = "active"

        # registration_date: 30 days in the past -> avoids is_new_donor
        # highlight (window is 7 days) AND sidesteps the corrupt CSV values.
        reg_ts = (datetime.datetime.utcnow() - datetime.timedelta(days=30)).strftime(
            "%Y-%m-%d %H:%M:%S.%f"
        )[:-3]  # milliseconds, matching frontend format YYYY-MM-DD HH:MM:SS.fff
        df["registration_date"] = reg_ts

        # --- Sanity check: legacy IDs shouldn't trip the "new donor" heuristic ---
        if "user_id" in df.columns:
            def hexlen(uid):
                uid = "" if uid is None else str(uid)
                return len(uid[2:] if uid.startswith("\\x") else uid)

            odd = df["user_id"].map(lambda u: hexlen(u) != LEGACY_ID_HEX_LEN).sum()
            if odd:
                print(
                    f"[WARN] {odd} CSV rows have a user_id hex length != {LEGACY_ID_HEX_LEN}; "
                    "these could show as 'new donor' in the UI."
                )

        # Final guard: never send a column the table doesn't have.
        df = df[[c for c in df.columns if c in table_cols]]

        # --- Append (NEVER replace) ---
        before = conn.execute(text(f"SELECT COUNT(*) FROM {TABLE}")).scalar()
        df.to_sql(TABLE, engine, if_exists="append", index=False)
        after = conn.execute(text(f"SELECT COUNT(*) FROM {TABLE}")).scalar()

        appended = after - before
        print(f"[OK] Appended {appended} rows. '{TABLE}' now has {after} rows "
              f"({before} preserved).")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
