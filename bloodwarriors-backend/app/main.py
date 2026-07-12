"""
### FILE: app/main.py
============================================================
RaktaSetu AI — FastAPI Core API
============================================================
Monolith API serving triage, donor matching, RAG chat, and
feedback endpoints. Connects all layers:

- ML Model (LightGBM) for donor likelihood scoring
- SQLAlchemy (SQLite) for persistent donor data
- KùzuDB for conversational memory
- Groq AI (llama3-8b-8192 free tier) for AI-powered features

Endpoints:
    GET  /              — Health check
    POST /triage        — AI urgency classification
    POST /match         — Hybrid-ranked donor matching (consent enforced)
    POST /chat          — RAG chat with memory
    POST /feedback      — Feedback collection
    GET  /donors        — Paginated donor list
    PATCH /donors/{id}/consent — Update consent status
    POST /ingest-csv    — One-shot CSV import

Test via Swagger UI: http://localhost:8000/docs
============================================================
"""

import os
import json
import datetime
import warnings
from typing import Optional

warnings.filterwarnings("ignore", category=FutureWarning)

import pandas as pd
import joblib
import numpy as np
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func
from dotenv import load_dotenv

load_dotenv()

# --- Local imports ---
from app.database import (
    get_db,
    Donor,
    TriageRequest,
    MatchLog,
    FeedbackLog,
    init_sqlite_db,
    get_kuzu_connection,
)
from app.ai_client import triage_request, generate_outreach, rag_chat

# ============================================================
# App Initialization
# ============================================================
app = FastAPI(
    title="RaktaSetu AI",
    description=(
        "Intelligent blood donation matching platform. "
        "AI-powered triage, hybrid-ranked donor matching with consent enforcement, "
        "personalized outreach, and RAG chat — all on zero budget."
    ),
    version="1.0.0",
    docs_url="/docs",      # Swagger UI
    redoc_url="/redoc",     # ReDoc alternative
)

# CORS configuration.
# Production: set ALLOWED_ORIGINS to a comma-separated list of allowed
# frontend origins (e.g. "https://app.example.com,https://admin.example.com").
# Development: leave it unset to fall back to "*" so local frontends work.
_allowed_origins_env = os.getenv("ALLOWED_ORIGINS")
if _allowed_origins_env:
    ALLOWED_ORIGINS = [origin.strip() for origin in _allowed_origins_env.split(",") if origin.strip()]
else:
    ALLOWED_ORIGINS = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================
# ML Model Loading
# ============================================================
MODEL_PATH = os.path.join(os.path.dirname(__file__), "donor_rf_model.joblib")
_ml_artifact = None


def get_ml_model():
    """
    Lazy-load the trained LightGBM model and its feature names.
    Returns (model, feature_names) or (None, None) if model not found.
    """
    global _ml_artifact
    if _ml_artifact is None:
        if os.path.exists(MODEL_PATH):
            _ml_artifact = joblib.load(MODEL_PATH)
            print(f"[OK] ML model loaded from: {MODEL_PATH}")
            print(f"   Features: {len(_ml_artifact['feature_names'])} columns")
        else:
            print(f"[WARN] ML model not found at {MODEL_PATH}. Run `python ml/train_model.py` first.")
            return None, None
    return _ml_artifact["model"], _ml_artifact["feature_names"]


# ============================================================
# Pydantic Request/Response Schemas
# ============================================================
# --- Triage ---
class TriageRequestSchema(BaseModel):
    """
    Test payload for /triage:
    {
        "patient_description": "Critical: Patient is bleeding heavily after a car accident, needs O Negative blood immediately",
        "blood_group_needed": "O Negative"
    }
    """
    patient_description: str = Field(..., min_length=10, description="Free-text description of patient condition")
    blood_group_needed: Optional[str] = Field(None, description="Specific blood group needed, e.g. 'O Positive'")


class TriageResponseSchema(BaseModel):
    triage_id: int
    urgency: str
    reasoning: str
    recommended_blood_groups: list[str]


# --- Match ---
class MatchRequestSchema(BaseModel):
    """
    Test payload for /match:
    {
        "blood_group": "O Positive",
        "urgency": "CRITICAL",
        "max_results": 10
    }
    """
    blood_group: str = Field(..., description="Required blood group, e.g. 'O Positive'")
    urgency: str = Field("MODERATE", description="CRITICAL, MODERATE, or LOW")
    max_results: int = Field(10, ge=1, le=10, description="Top-10 matched donors to return (locked ceiling)")
    latitude: Optional[float] = Field(None, description="Patient latitude for proximity scoring")
    longitude: Optional[float] = Field(None, description="Patient longitude for proximity scoring")
    triage_id: Optional[int] = Field(None, description="Triage ID for audit chain")


class MatchedDonorSchema(BaseModel):
    donor_id: int
    user_id: str
    blood_group: str
    donations_till_date: Optional[int]
    eligibility_status: Optional[str]
    ml_score: Optional[float]
    reliability_score: float
    cycle_score: float
    proximity_score: float
    final_score: float
    outreach_message: str
    phone_number: Optional[str] = None
    is_new_donor: bool = False


class MatchResponseSchema(BaseModel):
    urgency: str
    blood_group: str
    total_eligible: int
    donors: list[MatchedDonorSchema]


# --- Chat ---
class ChatRequestSchema(BaseModel):
    """
    Test payload for /chat:
    {
        "session_id": "test-session-001",
        "message": "When can I donate blood again?",
        "user_id": "donor-abc123"
    }
    """
    session_id: str = Field(..., description="Unique conversation session ID")
    message: str = Field(..., min_length=1, description="User's chat message")
    user_id: str = Field("anonymous", description="Optional user identifier")


class ChatResponseSchema(BaseModel):
    session_id: str
    response: str


# --- Feedback ---
class FeedbackRequestSchema(BaseModel):
    """
    Test payload for /feedback:
    {
        "user_id": "donor-abc123",
        "user_role": "donor",
        "rating": 5,
        "comment": "The matching was very fast and accurate!",
        "endpoint_used": "/match"
    }
    """
    user_id: Optional[str] = Field(None, description="User identifier")
    user_role: str = Field("donor", description="donor, patient, or coordinator")
    rating: int = Field(..., ge=1, le=5, description="Rating from 1-5")
    comment: Optional[str] = Field(None, description="Optional feedback text")
    endpoint_used: Optional[str] = Field(None, description="Which endpoint this feedback is about")


# --- Consent ---
class ConsentUpdateSchema(BaseModel):
    """
    Test payload for /donors/{id}/consent:
    {
        "consent_given": true
    }
    """
    consent_given: bool


# --- Donor Creation ---
class DonorCreateSchema(BaseModel):
    """
    Test payload for POST /donors:
    {
        "user_id": "\\\\x6a6f686e646f6500",
        "blood_group": "O Positive",
        "last_donation_date": "2024-12-15",
        "donations_till_date": 3,
        "role": "Emergency Donor",
        "consent_given": true,
        "status": "active",
        "donor_type": "Voluntary",
        "eligibility_status": "eligible",
        "phone_number": "+919876543210"
    }
    """
    user_id: str = Field(..., description="Hex-encoded user identifier from frontend")
    blood_group: str = Field(..., description="Blood group, e.g. 'O Positive'")
    last_donation_date: Optional[str] = Field(None, description="ISO date of last donation")
    donations_till_date: int = Field(0, ge=0, description="Historical donation count")
    role: str = Field("Emergency Donor", description="Donor role classification")
    consent_given: bool = Field(True, description="DPDP consent status")
    status: str = Field("active", description="Donor status: active/inactive")
    donor_type: str = Field("Voluntary", description="One-Time, Regular, Voluntary, Other")
    eligibility_status: str = Field("eligible", description="eligible/not eligible")
    phone_number: Optional[str] = Field(None, description="Donor phone number in +91XXXXXXXXXX format for WhatsApp dispatch")


# --- Auth ---
class AuthLoginSchema(BaseModel):
    """
    Test payload for POST /auth/login:
    {
        "passcode": "admin123"
    }
    """
    passcode: str = Field(..., min_length=1, description="NGO coordinator access passcode")


# ============================================================
# Helper Functions
# ============================================================


# Donors registered within this window are flagged as freshly onboarded.
NEW_DONOR_WINDOW_DAYS = 7
# Legacy Dataset.csv user_ids are SHA-256 hex (\x + 64 hex chars). Frontend-generated
# IDs from generateEncryptedUserId() are shorter hex, so a non-64 hex payload signals
# a portal-registered (new) donor.
_LEGACY_ID_HEX_LEN = 64


def is_new_donor(donor: Donor) -> bool:
    """
    Flag a donor as newly registered (for Match Matrix highlighting).

    True when EITHER:
      - registration_date falls within the last NEW_DONOR_WINDOW_DAYS, OR
      - the user_id is a frontend-generated hex ID (not the 64-char SHA-256
        format used by the legacy Dataset.csv rows).
    """
    # Signal 1: recent registration timestamp
    reg = donor.registration_date
    if reg is not None:
        try:
            if (datetime.datetime.utcnow() - reg).days <= NEW_DONOR_WINDOW_DAYS:
                return True
        except (TypeError, ValueError):
            pass

    # Signal 2: frontend hex-ID heuristic
    uid = donor.user_id or ""
    hex_part = uid[2:] if uid.startswith("\\x") else uid
    if hex_part and len(hex_part) != _LEGACY_ID_HEX_LEN:
        return True

    return False


def compute_reliability_score(donor: Donor) -> float:
    """
    Reliability score: how reliable is this donor based on donation history.
    Normalized to [0, 1].

    Components:
    - donations_till_date (more = higher)
    - calls_to_donations_ratio (lower = better, means fewer calls needed per donation)
    - donated_earlier (boolean bonus)
    - user_donation_active_status (Active = bonus)
    """
    score = 0.0

    # Donations count contribution (capped at 15 for normalization)
    donations = donor.donations_till_date or 0
    score += min(donations / 15.0, 1.0) * 0.4

    # Calls-to-donations ratio (lower is better)
    ratio = donor.calls_to_donations_ratio
    if ratio is not None and ratio > 0:
        # Invert: ratio of 1.0 (1 call per donation) → 1.0 score
        # ratio of 10.0 → 0.1 score
        ratio_score = min(1.0 / ratio, 1.0)
    elif ratio is not None and ratio == 0:
        ratio_score = 0.5  # No calls but donated (unusual, neutral)
    else:
        ratio_score = 0.0  # Never donated
    score += ratio_score * 0.3

    # Donated earlier bonus
    if donor.donated_earlier:
        score += 0.15

    # Active status bonus
    if donor.user_donation_active_status == "Active":
        score += 0.15

    return round(min(score, 1.0), 4)


def compute_cycle_score(donor: Donor) -> float:
    """
    Cycle score: how likely is the donor to be available based on
    their donation cycle and eligibility.
    Normalized to [0, 1].
    """
    score = 0.0

    # Eligibility status is the strongest signal
    if donor.eligibility_status == "eligible":
        score += 0.5
    else:
        score += 0.1  # "not eligible" still gets a small base

    # Next eligible date proximity
    if donor.next_eligible_date:
        days_until_eligible = (donor.next_eligible_date - datetime.datetime.utcnow()).days
        if days_until_eligible <= 0:
            score += 0.3  # Already eligible
        elif days_until_eligible <= 14:
            score += 0.15  # Soon eligible
        # Otherwise no bonus
    else:
        score += 0.1  # Unknown eligibility date, small benefit of doubt

    # Short cycle = more frequent donor = better
    cycle = donor.cycle_of_donations or 0
    if cycle > 0 and cycle <= 90:
        score += 0.2  # Standard 90-day cycle
    elif cycle > 90:
        score += 0.1  # Longer but still donates

    return round(min(score, 1.0), 4)


def compute_proximity_score(
    donor: Donor,
    patient_lat: Optional[float],
    patient_lon: Optional[float],
) -> float:
    """
    Dummy proximity score. If patient coordinates are provided,
    computes a simple inverse-distance score. Otherwise returns 0.5.
    """
    if patient_lat is None or patient_lon is None:
        return 0.5  # Neutral when no location available

    if donor.latitude is None or donor.longitude is None:
        return 0.3  # Unknown donor location, slight penalty

    # Simple Euclidean distance in degrees (good enough for same-city matching)
    dist = ((donor.latitude - patient_lat) ** 2 + (donor.longitude - patient_lon) ** 2) ** 0.5

    # Convert to score: closer = higher (max 1.0 at dist=0, 0.1 at dist>=1 degree)
    if dist < 0.001:
        return 1.0  # Same location
    elif dist < 0.1:
        return round(0.8 + 0.2 * (1 - dist / 0.1), 4)  # Very close
    elif dist < 0.5:
        return round(0.4 + 0.4 * (1 - dist / 0.5), 4)  # Moderate distance
    else:
        return 0.1  # Far away


def get_ml_prediction(donor: Donor) -> float:
    """
    Get the ML model's predicted probability that this donor will donate.
    Returns the pre-computed ml_score if available, otherwise runs inference.
    """
    if donor.ml_score is not None:
        return donor.ml_score

    model, feature_names = get_ml_model()
    if model is None:
        return 0.5  # Fallback if model not trained yet

    # Build feature vector from donor record
    # This is a simplified inference — in production, you'd replicate
    # the exact same feature engineering as train_model.py
    features = {}

    # Numeric features (donated_earlier and donations_till_date
    # are intentionally excluded -- they leak the target variable)
    features["cycle_of_donations"] = donor.cycle_of_donations or -1
    features["total_calls"] = donor.total_calls or -1
    features["frequency_in_days"] = donor.frequency_in_days or -1
    features["quantity_required"] = donor.quantity_required or -1

    # Boolean features (donated_earlier removed for leakage prevention)
    features["role_status"] = 1 if donor.role_status else 0
    features["bridge_status"] = 1 if donor.bridge_status else 0
    features["status_of_bridge"] = 1 if donor.status_of_bridge else -1

    # Date features (days since epoch)
    epoch = datetime.datetime(1970, 1, 1)
    for date_col in ["registration_date", "last_contacted_date", "last_donation_date",
                      "next_eligible_date", "last_transfusion_date", "expected_next_transfusion_date"]:
        val = getattr(donor, date_col, None)
        if val and isinstance(val, datetime.datetime):
            features[date_col] = (val - epoch).days
        else:
            features[date_col] = -1

    # One-hot encoded categoricals
    for feat_name in feature_names:
        if feat_name not in features:
            # Check if this is a one-hot column (e.g., "blood_group_O Positive")
            features[feat_name] = 0  # Default to 0 for missing indicators

    # Set the correct one-hot indicators
    for prefix, attr in [("blood_group_", "blood_group"), ("donor_type_", "donor_type"),
                          ("eligibility_status_", "eligibility_status"), ("role_", "role"),
                          ("user_donation_active_status_", "user_donation_active_status"),
                          ("status_", "status")]:
        val = getattr(donor, attr, None) or "UNKNOWN"
        col_name = f"{prefix}{val}"
        if col_name in features:
            features[col_name] = 1

    # Build the feature vector in the correct column order
    X = np.array([[features.get(f, 0) for f in feature_names]])

    try:
        proba = model.predict_proba(X)[0][1]  # Probability of class 1 (has_donated)
        return round(float(proba), 4)
    except Exception:
        return 0.5  # Fallback on any error


# ============================================================
# Endpoints
# ============================================================


@app.get("/", tags=["Health"])
def health_check():
    """
    Health check endpoint. Returns server status and configuration.
    """
    model, features = get_ml_model()
    return {
        "status": "healthy",
        "app": "RaktaSetu AI",
        "version": "1.0.0",
        "mock_mode": os.getenv("USE_MOCK_AI", "True"),
        "ml_model_loaded": model is not None,
        "ml_features": len(features) if features else 0,
        "timestamp": datetime.datetime.utcnow().isoformat(),
    }


@app.post("/triage", response_model=TriageResponseSchema, tags=["Triage"])
def triage_endpoint(
    request: TriageRequestSchema,
    db: Session = Depends(get_db),
):
    """
    AI-powered urgency classification for blood requests.

    **Test with Swagger UI (/docs):**
    ```json
    {
        "patient_description": "Critical: Patient is bleeding heavily after a car accident, needs O Negative blood immediately",
        "blood_group_needed": "O Negative"
    }
    ```

    **How it works:**
    1. Sends patient description to Groq llama3 (or mock)
    2. Returns urgency level: CRITICAL, MODERATE, or LOW
    3. Logs the triage request to SQLite for audit trail
    """
    # Call AI triage
    result = triage_request(request.patient_description, request.blood_group_needed)

    # Persist to database
    triage_log = TriageRequest(
        patient_description=request.patient_description,
        blood_group_needed=request.blood_group_needed,
        urgency=result["urgency"],
        ai_reasoning=result["reasoning"],
    )
    db.add(triage_log)
    db.commit()
    db.refresh(triage_log)

    return TriageResponseSchema(
        triage_id=triage_log.id,
        urgency=result["urgency"],
        reasoning=result["reasoning"],
        recommended_blood_groups=result.get("recommended_blood_groups", []),
    )


@app.post("/match", response_model=MatchResponseSchema, tags=["Matching"])
def match_endpoint(
    request: MatchRequestSchema,
    db: Session = Depends(get_db),
):
    """
    Hybrid-ranked donor matching with CONSENT enforcement.

    **CRITICAL: Donors with consent_given=False are STRICTLY EXCLUDED.**

    **Test with Swagger UI (/docs):**
    ```json
    {
        "blood_group": "O Positive",
        "urgency": "CRITICAL",
        "max_results": 10
    }
    ```

    **Dynamic Hybrid Ranker:**
    - If urgency = CRITICAL:
        Score = (0.55 × ML_Prob) + (0.25 × reliability) + (0.15 × cycle) + (0.05 × proximity)
    - If urgency = LOW:
        Score = (0.40 × ML_Prob) + (0.25 × reliability) + (0.15 × cycle) + (0.20 × proximity)
    - If urgency = MODERATE (default):
        Score = (0.45 × ML_Prob) + (0.25 × reliability) + (0.15 × cycle) + (0.15 × proximity)
    """
    urgency = request.urgency.upper()
    if urgency not in ("CRITICAL", "MODERATE", "LOW"):
        urgency = "MODERATE"

    # =========================================================
    # CONSENT FILTER (MANDATORY — Judging Criteria Requirement)
    # =========================================================
    # Query donors matching blood group WITH consent_given=True
    query = db.query(Donor).filter(
        Donor.blood_group == request.blood_group,
        Donor.consent_given == True,         # <<< CONSENT ENFORCEMENT
        Donor.status == "active",
    )

    eligible_donors = query.all()
    total_eligible = len(eligible_donors)

    if total_eligible == 0:
        return MatchResponseSchema(
            urgency=urgency,
            blood_group=request.blood_group,
            total_eligible=0,
            donors=[],
        )

    # =========================================================
    # Score each donor with the Dynamic Hybrid Ranker
    # =========================================================
    scored_donors = []
    for donor in eligible_donors:
        ml_prob = get_ml_prediction(donor)
        reliability = compute_reliability_score(donor)
        cycle = compute_cycle_score(donor)
        proximity = compute_proximity_score(donor, request.latitude, request.longitude)

        # --- Dynamic weight selection based on urgency ---
        if urgency == "CRITICAL":
            # CRITICAL: ML probability dominates, proximity minimal
            # Score = (0.55 × ML_Prob) + (0.25 × reliability) + (0.15 × cycle) + (0.05 × proximity)
            final_score = (
                0.55 * ml_prob
                + 0.25 * reliability
                + 0.15 * cycle
                + 0.05 * proximity
            )
        elif urgency == "LOW":
            # LOW: proximity gets more weight (dummy_proximity)
            # Score = (0.40 × ML_Prob) + (0.25 × reliability) + (0.15 × cycle) + (0.20 × proximity)
            final_score = (
                0.40 * ml_prob
                + 0.25 * reliability
                + 0.15 * cycle
                + 0.20 * proximity
            )
        else:
            # MODERATE: balanced weights
            final_score = (
                0.45 * ml_prob
                + 0.25 * reliability
                + 0.15 * cycle
                + 0.15 * proximity
            )

        final_score = round(final_score, 4)

        # Defer outreach generation — placeholder for now
        scored_donors.append(MatchedDonorSchema(
            donor_id=donor.id,
            user_id=donor.user_id,
            blood_group=donor.blood_group or "Unknown",
            donations_till_date=donor.donations_till_date,
            eligibility_status=donor.eligibility_status,
            ml_score=ml_prob,
            reliability_score=reliability,
            cycle_score=cycle,
            proximity_score=proximity,
            final_score=final_score,
            outreach_message="",  # Will be filled after ranking
            phone_number=donor.phone_number,
            is_new_donor=is_new_donor(donor),
        ))

    # Sort by final_score descending
    scored_donors.sort(key=lambda d: d.final_score, reverse=True)

    # Limit results
    top_donors = scored_donors[: request.max_results]

    # =========================================================
    # OUTREACH GENERATION (Rate-Limit Optimized)
    # =========================================================
    # Only call Groq AI for the #1 ranked donor to conserve
    # the free tier quota (30 RPM). Ranks 2-10 get a template.
    for i, donor_schema in enumerate(top_donors):
        if i == 0:
            # Top-1: Full Groq AI personalized outreach
            donor_name = f"Donor-{donor_schema.user_id[:8]}"
            try:
                donor_schema.outreach_message = generate_outreach(
                    donor_name=donor_name,
                    donor_blood_group=donor_schema.blood_group,
                    donations_count=donor_schema.donations_till_date or 0,
                    urgency=urgency,
                    patient_context=f"{request.blood_group} blood needed ({urgency} urgency)",
                )
            except Exception as e:
                print(f"[GROQ API ERROR] Outreach generation failed: {e}")
                donor_schema.outreach_message = (
                    f"Template: URGENT - Blood type {donor_schema.blood_group} "
                    f"needed at Hospital. Please check your portal."
                )
        else:
            # Ranks 2-10: Hardcoded template (no Groq call)
            donor_schema.outreach_message = (
                f"Template: URGENT - Blood type {donor_schema.blood_group} "
                f"needed at Hospital. Please check your portal."
            )

    # Log the match to SQLite audit trail
    match_log = MatchLog(
        triage_id=request.triage_id,
        blood_group=request.blood_group,
        urgency=urgency,
        matched_donor_ids=json.dumps([d.donor_id for d in top_donors]),
        scores=json.dumps([d.final_score for d in top_donors]),
    )
    db.add(match_log)
    db.commit()

    return MatchResponseSchema(
        urgency=urgency,
        blood_group=request.blood_group,
        total_eligible=total_eligible,
        donors=top_donors,
    )


@app.post("/chat", response_model=ChatResponseSchema, tags=["Chat"])
def chat_endpoint(request: ChatRequestSchema, db: Session = Depends(get_db)):
    """
    RAG-powered chat with KùzuDB conversational memory.

    **Test with Swagger UI (/docs):**
    ```json
    {
        "session_id": "test-session-001",
        "message": "When can I donate blood again?",
        "user_id": "donor-abc123"
    }
    ```

    **How it works:**
    1. Retrieves conversation history from KuzuDB graph
    2. Queries the live total donor count so the Command Center co-pilot
       reports the exact database size (no hallucinated counts)
    3. Sends context + new message to Groq llama3 (or mock) with intent guardrail
    4. Stores both user message and AI response in KuzuDB
    5. Returns the AI response
    """
    # Live database size — injected into the NGO admin prompt so the co-pilot
    # always knows the real-time donor count instead of guessing.
    live_donor_count = db.query(func.count(Donor.id)).scalar() or 0

    response = rag_chat(
        session_id=request.session_id,
        user_message=request.message,
        user_id=request.user_id,
        live_donor_count=live_donor_count,
    )
    return ChatResponseSchema(
        session_id=request.session_id,
        response=response,
    )


@app.post("/feedback", tags=["Feedback"])
def feedback_endpoint(
    request: FeedbackRequestSchema,
    db: Session = Depends(get_db),
):
    """
    Collect feedback from donors, patients, and coordinators.

    **Test with Swagger UI (/docs):**
    ```json
    {
        "user_id": "donor-abc123",
        "user_role": "donor",
        "rating": 5,
        "comment": "The matching was very fast and accurate!",
        "endpoint_used": "/match"
    }
    ```
    """
    feedback = FeedbackLog(
        user_id=request.user_id,
        user_role=request.user_role,
        rating=request.rating,
        comment=request.comment,
        endpoint_used=request.endpoint_used,
    )
    db.add(feedback)
    db.commit()
    db.refresh(feedback)

    return {
        "status": "received",
        "feedback_id": feedback.id,
        "message": "Thank you for your feedback!",
    }


@app.get("/donors", tags=["Donors"])
def list_donors(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Donors per page"),
    blood_group: Optional[str] = Query(None, description="Filter by blood group"),
    db: Session = Depends(get_db),
):
    """
    List all donors with pagination and optional blood group filter.
    """
    query = db.query(Donor)

    if blood_group:
        query = query.filter(Donor.blood_group == blood_group)

    total = query.count()
    donors = query.offset((page - 1) * per_page).limit(per_page).all()

    return {
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": (total + per_page - 1) // per_page,
        "donors": [
            {
                "id": d.id,
                "user_id": d.user_id,
                "blood_group": d.blood_group,
                "donor_type": d.donor_type,
                "donations_till_date": d.donations_till_date,
                "eligibility_status": d.eligibility_status,
                "consent_given": d.consent_given,
                "ml_score": d.ml_score,
                "status": d.status,
                "phone_number": d.phone_number,
            }
            for d in donors
        ],
    }


@app.get("/analytics", tags=["Analytics"])
def analytics(db: Session = Depends(get_db)):
    """
    Real-time analytics for the Command Center dashboard.

    All figures are live aggregations over the SQLite `donors` table:

    - **total_donors**: count of every donor row.
    - **blood_type_distribution**: donor count grouped by `blood_group`.
    - **recent_registrations**: donors registered in the last 7 days
      (via `registration_date`).
    - **registration_trend**: real per-day registration counts for the
      trailing 7 days (oldest → newest), for sparkline rendering.
    - **reliability_distribution**: donors bucketed by hybrid reliability
      score (>80%, 50-80%, <50%) — donation history + calls-to-donations.
    - **eligibility_metrics**: donor counts grouped by `eligibility_status`.
    - **donor_type_split**: donor counts grouped by `donor_type`
      (e.g. Voluntary vs Replacement).
    """
    # --- Total donors ---
    total_donors = db.query(func.count(Donor.id)).scalar() or 0

    # --- Blood type distribution (grouped count) ---
    distribution_rows = (
        db.query(Donor.blood_group, func.count(Donor.id))
        .group_by(Donor.blood_group)
        .all()
    )
    blood_type_distribution = {
        (bg or "Unknown"): count for bg, count in distribution_rows
    }

    # --- Reliability distribution (bucketed by hybrid reliability score) ---
    # Reuse the exact reliability formula the Match ranker uses so the dashboard
    # reflects the real scoring. Score is normalized to [0, 1].
    reliability_distribution = {">80%": 0, "50-80%": 0, "<50%": 0}
    for donor in db.query(Donor).all():
        rel = compute_reliability_score(donor)
        if rel > 0.8:
            reliability_distribution[">80%"] += 1
        elif rel >= 0.5:
            reliability_distribution["50-80%"] += 1
        else:
            reliability_distribution["<50%"] += 1

    # --- Eligibility metrics (grouped count of eligibility_status) ---
    eligibility_rows = (
        db.query(Donor.eligibility_status, func.count(Donor.id))
        .group_by(Donor.eligibility_status)
        .all()
    )
    eligibility_metrics = {
        (status or "unknown"): count for status, count in eligibility_rows
    }

    # --- Donor type split (grouped count of donor_type) ---
    donor_type_rows = (
        db.query(Donor.donor_type, func.count(Donor.id))
        .group_by(Donor.donor_type)
        .all()
    )
    donor_type_split = {
        (dtype or "Unknown"): count for dtype, count in donor_type_rows
    }

    # --- Recent registrations (trailing 7 days, real timestamps) ---
    now = datetime.datetime.utcnow()
    window_start = now - datetime.timedelta(days=NEW_DONOR_WINDOW_DAYS)
    recent_registrations = (
        db.query(func.count(Donor.id))
        .filter(Donor.registration_date != None, Donor.registration_date >= window_start)
        .scalar()
        or 0
    )

    # --- Per-day registration trend for the last 7 days (oldest -> newest) ---
    registration_trend = []
    for offset in range(NEW_DONOR_WINDOW_DAYS - 1, -1, -1):
        day_start = (now - datetime.timedelta(days=offset)).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        day_end = day_start + datetime.timedelta(days=1)
        day_count = (
            db.query(func.count(Donor.id))
            .filter(
                Donor.registration_date != None,
                Donor.registration_date >= day_start,
                Donor.registration_date < day_end,
            )
            .scalar()
            or 0
        )
        registration_trend.append({"date": day_start.strftime("%Y-%m-%d"), "count": day_count})

    return {
        "total_donors": total_donors,
        "blood_type_distribution": blood_type_distribution,
        "recent_registrations": recent_registrations,
        "registration_trend": registration_trend,
        "reliability_distribution": reliability_distribution,
        "eligibility_metrics": eligibility_metrics,
        "donor_type_split": donor_type_split,
        "generated_at": now.isoformat(),
    }


@app.patch("/donors/{donor_id}/consent", tags=["Donors"])
def update_consent(
    donor_id: int,
    request: ConsentUpdateSchema,
    db: Session = Depends(get_db),
):
    """
    Update a donor's consent status.

    **Test with Swagger UI (/docs):**
    ```json
    {
        "consent_given": false
    }
    ```

    Setting consent_given=False will immediately exclude this donor
    from all /match results.
    """
    donor = db.query(Donor).filter(Donor.id == donor_id).first()
    if not donor:
        raise HTTPException(status_code=404, detail=f"Donor with id={donor_id} not found")

    donor.consent_given = request.consent_given
    db.commit()

    return {
        "status": "updated",
        "donor_id": donor_id,
        "consent_given": donor.consent_given,
        "message": f"Consent {'granted' if request.consent_given else 'revoked'}. "
                   f"{'Donor is now matchable.' if request.consent_given else 'Donor excluded from matching.'}",
    }


@app.post("/donors", tags=["Donors"], status_code=201)
def create_donor(
    request: DonorCreateSchema,
    db: Session = Depends(get_db),
):
    """
    Register a new donor from the frontend portal.

    **Test with Swagger UI (/docs):**
    ```json
    {
        "user_id": "\\\\x6a6f686e646f6500",
        "blood_group": "O Positive",
        "last_donation_date": "2024-12-15",
        "donations_till_date": 3,
        "role": "Emergency Donor",
        "consent_given": true,
        "status": "active",
        "donor_type": "Voluntary",
        "eligibility_status": "eligible"
    }
    ```

    Creates a Donor record in SQLite. The `user_id` is the hex-encoded
    identifier generated by the frontend's `generateEncryptedUserId()`.
    """
    # Parse last_donation_date if provided
    last_donation = None
    if request.last_donation_date:
        try:
            last_donation = datetime.datetime.strptime(
                request.last_donation_date, "%Y-%m-%d"
            )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid date format: {request.last_donation_date}. Expected YYYY-MM-DD.",
            )

    donor = Donor(
        user_id=request.user_id,
        blood_group=request.blood_group,
        last_donation_date=last_donation,
        donations_till_date=request.donations_till_date,
        role=request.role,
        consent_given=request.consent_given,
        status=request.status,
        donor_type=request.donor_type,
        eligibility_status=request.eligibility_status,
        registration_date=datetime.datetime.utcnow(),
        user_donation_active_status="Active",
        phone_number=request.phone_number,
    )
    db.add(donor)
    db.commit()
    db.refresh(donor)

    return {
        "status": "created",
        "donor_id": donor.id,
        "user_id": donor.user_id,
        "blood_group": donor.blood_group,
        "consent_given": donor.consent_given,
        "phone_number": donor.phone_number,
        "message": "Donor registered successfully. Now eligible for matching coordination.",
    }


# ============================================================
# Static Passcode — NGO Mock Auth ($0/month)
# ============================================================
NGO_PASSCODE = os.getenv("NGO_PASSCODE", "admin123")


@app.post("/auth/login", tags=["Auth"])
def auth_login(request: AuthLoginSchema):
    """
    Mock authentication for NGO coordinators.
    Zero-cost, no JWT library, no user database.

    **Test with Swagger UI (/docs):**
    ```json
    {
        "passcode": "admin123"
    }
    ```

    Returns a timestamped token on success, 401 on failure.
    """
    if request.passcode != NGO_PASSCODE:
        raise HTTPException(
            status_code=401,
            detail="Invalid passcode. Access denied.",
        )

    # Generate a simple timestamped token (not cryptographic — mock only)
    import hashlib

    timestamp = datetime.datetime.utcnow().isoformat()
    token_seed = f"raktasetu-ngo-{timestamp}-{request.passcode}"
    token_hash = hashlib.sha256(token_seed.encode()).hexdigest()[:32]
    token = f"rs-ngo-{token_hash}"

    return {
        "status": "authenticated",
        "token": token,
        "role": "ngo_coordinator",
        "message": "Access granted. Welcome to the Command Center.",
    }


@app.post("/ingest-csv", tags=["Admin"])
def ingest_csv(
    db: Session = Depends(get_db),
):
    """
    One-shot CSV → SQLite import.

    Reads Dataset.csv from the project root, cleans it, and inserts
    all rows into the donors table. Safe to call multiple times:
    clears existing data before import.

    **No request body needed — just POST to this endpoint.**
    """
    csv_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "Dataset.csv")
    if not os.path.exists(csv_path):
        raise HTTPException(status_code=404, detail=f"Dataset.csv not found at {csv_path}")

    print(f"[IMPORT] Ingesting CSV from: {csv_path}")

    # Read CSV
    df = pd.read_csv(csv_path)
    print(f"   Loaded {len(df)} rows")

    # Clear existing donors (idempotent re-import)
    db.query(Donor).delete()
    db.commit()

    # Date columns to parse
    date_cols = [
        "last_transfusion_date", "expected_next_transfusion_date",
        "registration_date", "last_contacted_date", "last_donation_date",
        "next_eligible_date", "last_bridge_donation_date",
    ]

    # Boolean columns to convert
    bool_cols = ["role_status", "bridge_status", "status_of_bridge", "donated_earlier"]

    inserted = 0
    errors = 0

    for _, row in df.iterrows():
        try:
            donor_kwargs = {}

            # String columns
            for col in ["user_id", "bridge_id", "role", "blood_group", "gender",
                         "bridge_gender", "bridge_blood_group", "donor_type",
                         "eligibility_status", "status", "user_donation_active_status",
                         "inactive_trigger_comment"]:
                val = row.get(col)
                donor_kwargs[col] = str(val) if pd.notna(val) else None

            # Float columns
            for col in ["latitude", "longitude", "calls_to_donations_ratio"]:
                val = row.get(col)
                donor_kwargs[col] = float(val) if pd.notna(val) else None

            # Integer columns
            for col in ["quantity_required", "donations_till_date", "cycle_of_donations",
                         "total_calls", "frequency_in_days"]:
                val = row.get(col)
                donor_kwargs[col] = int(val) if pd.notna(val) else None

            # Boolean columns
            for col in bool_cols:
                val = row.get(col)
                if pd.notna(val):
                    donor_kwargs[col] = str(val).lower() == "true"
                else:
                    donor_kwargs[col] = None

            # Date columns
            for col in date_cols:
                val = row.get(col)
                if pd.notna(val):
                    try:
                        donor_kwargs[col] = pd.to_datetime(val)
                    except Exception:
                        donor_kwargs[col] = None
                else:
                    donor_kwargs[col] = None

            # Consent layer: default to True for imported data
            donor_kwargs["consent_given"] = True

            # Defensive: CSV has no phone_number column — explicitly set None
            donor_kwargs["phone_number"] = None

            donor = Donor(**donor_kwargs)
            db.add(donor)
            inserted += 1

        except Exception as e:
            errors += 1
            if errors <= 5:  # Only print first 5 errors
                print(f"   [WARN] Row error: {e}")

    db.commit()
    print(f"[OK] Ingested {inserted} donors ({errors} errors)")

    return {
        "status": "complete",
        "inserted": inserted,
        "errors": errors,
        "total_rows_in_csv": len(df),
    }


# ============================================================
# Startup Event
# ============================================================
@app.on_event("startup")
def startup_event():
    """
    Runs when the FastAPI server starts:
    1. Ensures SQLite tables exist
    2. Initializes KùzuDB connection
    3. Pre-loads the ML model
    """
    print("=" * 60)
    print("  [BLOOD] RaktaSetu AI -- Starting Up")
    print("=" * 60)
    init_sqlite_db()
    get_kuzu_connection()
    model, features = get_ml_model()
    if model:
        print(f"   ML model ready ({len(features)} features)")
    else:
        print("   [WARN] ML model not loaded. POST to /ingest-csv after training.")
    print("=" * 60)
    print("  Server ready. Open http://localhost:8000/docs for Swagger UI")
    print("=" * 60)
