"""
### FILE: seed_db.py
============================================================
RaktaSetu AI — Non-Destructive Donor Seeding
============================================================
Ingests Dataset.csv (legacy donor rows) into data/raktasetu.db
using pandas + sqlite3, WITHOUT touching UI code, FastAPI
endpoints, or the existing schema.

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
  datetimes before inserting. Column types are read live from
  PRAGMA table_info -- nothing about the schema is hard-coded.

Usage:
    python seed_db.py            # seed (aborts if already seeded)
    python seed_db.py --force    # seed even if legacy rows exist
"""

import os
import sys
import sqlite3
import datetime

import pandas as pd

# ------------------------------------------------------------
# Paths (resolved relative to this file so it runs from anywhere)
# ------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(BASE_DIR, "Dataset.csv")
DB_PATH = os.path.join(BASE_DIR, "data", "raktasetu.db")
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
def get_table_columns(conn):
    """Return {column_name: declared_type_upper} for TABLE, excluding
    the autoincrement primary key `id`."""
    cur = conn.execute(f"PRAGMA table_info({TABLE})")
    cols = {}
    for _cid, name, decl_type, _notnull, _default, pk in cur.fetchall():
        if pk:  # skip the autoincrement id
            continue
        cols[name] = (decl_type or "").upper()
    return cols


def to_bool_int(series):
    """Map TRUE/FALSE-ish strings to 1/0, blanks/unknown to None."""
    truthy = {"true", "1", "t", "yes", "y"}
    falsy = {"false", "0", "f", "no", "n"}

    def conv(v):
        if v is None:
            return None
        s = str(v).strip().lower()
        if s in truthy:
            return 1
        if s in falsy:
            return 0
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
    if not os.path.exists(DB_PATH):
        sys.exit(f"[ERROR] Database not found at {DB_PATH}. Start the app once to create it.")

    conn = sqlite3.connect(DB_PATH)
    try:
        # --- Pre-flight: existing rows & guard against re-seeding ---
        existing = conn.execute(f"SELECT COUNT(*) FROM {TABLE}").fetchone()[0]
        print(f"[INFO] Existing rows in '{TABLE}': {existing}")
        if existing > ALREADY_SEEDED_THRESHOLD and not force:
            sys.exit(
                f"[ABORT] '{TABLE}' already has {existing} rows (> {ALREADY_SEEDED_THRESHOLD}). "
                "Looks already seeded. Re-run with --force to append anyway."
            )

        # --- Backup (WAL-safe, via SQLite online backup API) ---
        backup_path = DB_PATH + ".seedbak"
        with sqlite3.connect(backup_path) as bak:
            conn.backup(bak)
        print(f"[INFO] Backup written: {backup_path}")

        table_cols = get_table_columns(conn)

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
        df["consent_given"] = 1
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
        before = conn.execute(f"SELECT COUNT(*) FROM {TABLE}").fetchone()[0]
        df.to_sql(TABLE, conn, if_exists="append", index=False)
        conn.commit()
        after = conn.execute(f"SELECT COUNT(*) FROM {TABLE}").fetchone()[0]

        appended = after - before
        print(f"[OK] Appended {appended} rows. '{TABLE}' now has {after} rows "
              f"({before} preserved).")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
