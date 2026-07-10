"""
### FILE: ml/train_model.py
============================================================
RaktaSetu AI -- ML Training Pipeline (v2 -- LightGBM)
============================================================
Reads the BloodWarriors Dataset.csv, cleans it with strict
leakage prevention, engineers features, and trains a
LGBMClassifier to predict donor likelihood (has_donated).

Leakage Prevention:
    - gender, latitude, longitude: dropped (spec requirement)
    - donated_earlier: dropped (directly reveals the target)
    - donations_till_date: dropped (near-perfect proxy for target)

Usage:
    python ml/train_model.py

Output:
    app/donor_rf_model.joblib   -- Serialized model artifact
    (prints classification report + feature importances to stdout)
============================================================
"""

import os
import sys
import pandas as pd
import numpy as np
from lightgbm import LGBMClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

# ============================================================
# 1. CONFIGURATION
# ============================================================
# Resolve paths relative to the project root (one level up from ml/)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(PROJECT_ROOT, "Dataset.csv")
MODEL_OUTPUT_PATH = os.path.join(PROJECT_ROOT, "app", "donor_rf_model.joblib")

# --- LEAKAGE-FREE DROP LIST ---
# gender, latitude, longitude: per original spec
# donated_earlier: binary flag that directly encodes the target
# donations_till_date: count that is a near-perfect proxy for has_donated
COLUMNS_TO_DROP_FOR_ML = [
    "gender",
    "latitude",
    "longitude",
    "donated_earlier",
    "donations_till_date",
]

# Columns that are identifiers / free-text (not useful as features)
ID_AND_TEXT_COLUMNS = [
    "user_id",
    "bridge_id",
    "inactive_trigger_comment",
    "last_bridge_donation_date",  # Mostly null for non-bridge donors
]

# Date columns that we'll convert to "days since epoch" numeric features
DATE_COLUMNS = [
    "last_transfusion_date",
    "expected_next_transfusion_date",
    "registration_date",
    "last_contacted_date",
    "last_donation_date",
    "next_eligible_date",
]

# Categorical columns to one-hot encode
CATEGORICAL_COLUMNS = [
    "blood_group",
    "donor_type",
    "eligibility_status",
    "role",
    "user_donation_active_status",
    "status",
]

# Boolean-like string columns to convert to 0/1
# NOTE: donated_earlier removed -- it is now in the drop list
BOOLEAN_COLUMNS = [
    "role_status",
    "bridge_status",
    "status_of_bridge",
]


def load_and_inspect(csv_path: str) -> pd.DataFrame:
    """
    Load the CSV and print basic diagnostics.
    """
    print(f"[1/6] Loading dataset from: {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"       Shape: {df.shape[0]} rows x {df.shape[1]} columns")
    print(f"       Columns: {list(df.columns)}")
    return df


def create_target(df: pd.DataFrame) -> pd.DataFrame:
    """
    Create the binary target variable:
        has_donated = 1  if  calls_to_donations_ratio is NOT NULL
        has_donated = 0  otherwise
    """
    print("[2/6] Creating target variable 'has_donated'...")
    df["has_donated"] = df["calls_to_donations_ratio"].notna().astype(int)
    counts = df["has_donated"].value_counts()
    print(f"       Class distribution: 0={counts.get(0, 0)}, 1={counts.get(1, 0)}")
    ratio = counts.get(0, 1) / max(counts.get(1, 1), 1)
    print(f"       Imbalance ratio (neg/pos): {ratio:.2f}")
    return df


def drop_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Drop leakage-prone columns, identifiers, and the target source.
    """
    print("[3/6] Dropping non-feature columns (leakage-safe)...")
    cols_to_drop = COLUMNS_TO_DROP_FOR_ML + ID_AND_TEXT_COLUMNS + ["calls_to_donations_ratio"]
    existing_cols = [c for c in cols_to_drop if c in df.columns]
    df = df.drop(columns=existing_cols)
    print(f"       Dropped: {existing_cols}")
    print(f"       Remaining: {df.shape[1]} columns")
    return df


def convert_booleans(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convert string boolean columns ('true'/'false') to numeric 0/1.
    """
    print("[4/6] Converting boolean and date columns...")
    for col in BOOLEAN_COLUMNS:
        if col in df.columns:
            # Map 'true' -> 1, 'false' -> 0, everything else -> NaN -> -1
            df[col] = df[col].map({"true": 1, "false": 0, True: 1, False: 0})
            df[col] = df[col].fillna(-1).astype(int)
    return df


def convert_dates(df: pd.DataFrame) -> pd.DataFrame:
    """
    Convert date/datetime columns to a numeric feature:
    days since Unix epoch (1970-01-01). NaN -> -1.
    """
    epoch = pd.Timestamp("1970-01-01")
    for col in DATE_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
            df[col] = (df[col] - epoch).dt.days
            df[col] = df[col].fillna(-1).astype(int)
    return df


def encode_categoricals(df: pd.DataFrame) -> pd.DataFrame:
    """
    One-hot encode categorical columns. Unknown/NaN categories
    get their own indicator column automatically.
    """
    print("[5/6] One-hot encoding categorical features...")
    existing_cats = [c for c in CATEGORICAL_COLUMNS if c in df.columns]
    # Fill NaN with a sentinel so it gets its own indicator
    for col in existing_cats:
        df[col] = df[col].fillna("UNKNOWN")
    df = pd.get_dummies(df, columns=existing_cats, prefix_sep="_", dtype=int)
    print(f"       Feature matrix shape after encoding: {df.shape}")
    return df


def train_and_export(df: pd.DataFrame, model_path: str) -> None:
    """
    Split data, train LGBMClassifier with is_unbalance=True,
    evaluate, print feature importances, and export.
    """
    print("[6/6] Training LGBMClassifier (LightGBM)...")

    # Separate features and target
    y = df["has_donated"]
    X = df.drop(columns=["has_donated"])

    # Fill any remaining NaN values with -1
    X = X.fillna(-1)

    # Ensure all columns are numeric (safety check)
    non_numeric = X.select_dtypes(exclude=[np.number]).columns.tolist()
    if non_numeric:
        print(f"       WARNING: Dropping non-numeric columns that slipped through: {non_numeric}")
        X = X.drop(columns=non_numeric)

    print(f"       Final feature count: {X.shape[1]}")
    print(f"       Feature names: {list(X.columns)}")

    # Train/test split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    print(f"       Train: {X_train.shape[0]} samples, Test: {X_test.shape[0]} samples")

    # --- LightGBM with production-grade hyperparameters ---
    model = LGBMClassifier(
        boosting_type="gbdt",
        num_leaves=31,
        max_depth=6,
        learning_rate=0.05,
        n_estimators=300,
        is_unbalance=True,       # Handles the ~75/25 class imbalance
        min_child_samples=20,    # Prevent overfitting leaf nodes
        subsample=0.8,           # Row subsampling for regularization
        colsample_bytree=0.8,   # Column subsampling for regularization
        reg_alpha=0.1,           # L1 regularization
        reg_lambda=0.1,          # L2 regularization
        random_state=42,
        n_jobs=-1,               # Use all CPU cores
        verbose=-1,              # Suppress LightGBM training logs
    )
    model.fit(X_train, y_train)

    # Evaluate
    y_pred = model.predict(X_test)
    print("\n===== Classification Report (LightGBM) =====")
    print(classification_report(y_test, y_pred, target_names=["No Donation (0)", "Has Donated (1)"]))

    # --- FULL Feature Importances (split-based) ---
    importances = pd.Series(model.feature_importances_, index=X.columns)
    importances_sorted = importances.sort_values(ascending=False)
    print("===== Feature Importances (all features, split-based) =====")
    for feat, imp in importances_sorted.items():
        marker = " <<<" if imp == importances_sorted.iloc[0] else ""
        print(f"       {feat:45s} {imp:6d}{marker}")

    # Export model + feature names (needed at inference time)
    os.makedirs(os.path.dirname(model_path), exist_ok=True)
    artifact = {
        "model": model,
        "feature_names": list(X.columns),
        "algorithm": "LGBMClassifier",
        "version": "2.0",
    }
    joblib.dump(artifact, model_path)
    print(f"\n[OK] Model exported to: {model_path}")
    print(f"   File size: {os.path.getsize(model_path) / 1024:.1f} KB")
    print(f"   Algorithm: LightGBM (boosting_type=gbdt, is_unbalance=True)")
    print(f"   Features: {X.shape[1]} (leakage-free)")


def main():
    """
    Full pipeline: Load -> Target -> Drop -> Convert -> Encode -> Train -> Export
    """
    print("=" * 60)
    print("  RaktaSetu AI -- ML Training Pipeline v2 (LightGBM)")
    print("=" * 60)

    # Step 1: Load
    df = load_and_inspect(CSV_PATH)

    # Step 2: Create target variable
    df = create_target(df)

    # Step 3: Drop non-feature columns (leakage-safe)
    df = drop_columns(df)

    # Step 4: Convert booleans and dates
    df = convert_booleans(df)
    df = convert_dates(df)

    # Step 5: One-hot encode categoricals
    df = encode_categoricals(df)

    # Step 6: Train and export
    train_and_export(df, MODEL_OUTPUT_PATH)

    print("\n" + "=" * 60)
    print("  Pipeline complete. You can now start the FastAPI server.")
    print("=" * 60)


if __name__ == "__main__":
    main()
