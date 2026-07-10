# RaktaSetu AI — Master Architecture Context

> **Purpose**: Drop this file into any future AI agent's context window to instantly restore full understanding of the project without re-reading the codebase. Last verified: 2026-07-01.

---

## 1. Project Overview & Constraints

**Mission**: RaktaSetu AI is an emergency blood donation coordination platform that matches donors to patients using ML-ranked scoring, LLM-powered triage, and graph-memory RAG chat — all on a **$0/month** infrastructure stack.

**Infrastructure Constraints**:

| Layer | Technology | Cost |
|---|---|---|
| AI Inference | Groq Free Tier (`llama-3.1-8b-instant`, 30 req/min) | $0 |
| SQL Database | SQLite (embedded, WAL mode, no server) | $0 |
| Graph Database | KùzuDB (embedded, no server) | $0 |
| ML Model | LightGBM (in-process, `.joblib` artifact, ~115 KB) | $0 |
| Backend Hosting | Render / any free tier (FastAPI + Uvicorn) | $0 |
| Frontend Hosting | Vercel / Netlify (React + Vite static build) | $0 |
| Notifications | WhatsApp via `wa.me` deep links (no API, no Twilio) | $0 |
| Auth | Hardcoded passcode (`admin123`) + SHA-256 hash token in `sessionStorage` | $0 |

**Key toggle**: `USE_MOCK_AI=True` (default) enables fully offline operation with deterministic mock responses. Set to `False` + provide `GROQ_API_KEY` for live LLM inference.

---

## 2. Tech Stack & Design Language

### Backend
- **Framework**: FastAPI 0.115.6 + Uvicorn 0.34.0
- **ML**: LightGBM 4.5.0 (LGBMClassifier, `is_unbalance=True`)
- **ORM**: SQLAlchemy 2.0.36 (declarative_base, SQLite)
- **Graph DB**: KùzuDB 0.8.2 (embedded, lazy-initialized)
- **AI Client**: Groq Python SDK 0.9.0 (`llama-3.1-8b-instant`)
- **Data Processing**: Pandas 2.2.3, scikit-learn 1.6.1
- **Validation**: Pydantic 2.10.5

### Frontend
- **Framework**: React 18.3 + Vite 6.0
- **Styling**: Tailwind CSS 3.4.15 (custom theme tokens, no external UI libs)
- **Icons**: Lucide React 0.460.0
- **HTTP Client**: Axios 1.7.9 (with request/response interceptors)
- **Routing**: React Router DOM 6.28.0
- **Fonts**: Google Fonts — Inter (body) + JetBrains Mono (code/data)

### UI/UX Design Language: "Light Consumer Marketplace" (Airbnb Pivot)
- **North star**: Light, generous, high-trust consumer marketplace. White canvas, soft shadows, rounded elements. The prior "Premium Cyber-Medical" dark terminal aesthetic is fully abandoned.
- **Canvas**: `cloud` (`#ffffff`) page background, `hof` (`#f7f7f7`) / `surface-strong` (`#f2f2f2`) subtle panels & table headers
- **Primary accent (Rausch)**: `#ff385c` — CTAs, registration, triage submit, WhatsApp dispatch, AI avatar
- **Success (Babu)**: `#00a699` — confirmations, available donors, high match scores (≥80%)
- **Alert (Hackberry)**: `#EB4D5C` — critical urgency, error states, consent revocation
- **Text**: `ink` (`#222222`) headlines/body, `body` (`#3f3f3f`) running text, `muted` (`#6a6a6a`) sub-labels
- **Borders**: `hairline` (`#dddddd`) / `hairline-soft` (`#ebebeb`) — thin dividers; cards lean on `shadow-sm`/`shadow-md`, not hard borders
- **Radii**: pills/inputs `rounded-full`, cards `rounded-md` (14px), buttons `rounded-sm` (8px)
- **Typography**: Inter for all UI/prose; JetBrains Mono reserved for data cells & code blocks only
- **Shared classes** (`index.css`): `.rs-card`, `.rs-input`, `.rs-btn-primary`, `.rs-btn-secondary`, `.rs-badge-critical|moderate|low`
- **Banned**: neon values, glassmorphism, `.tactical-grid`/scan overlays, gradient borders, monospace for non-data prose
- **Rule**: Zero external UI component libraries. All components are hand-built.

---

## 3. File Tree Map

```
RaktaSetu_final/
├── bloodwarriors-backend/
│   ├── .env                         # Env config (USE_MOCK_AI, GROQ_API_KEY, DB paths)
│   ├── .env.example                 # Template for .env
│   ├── Dataset.csv                  # 1.5 MB BloodWarriors donor dataset
│   ├── requirements.txt             # Python deps (pinned versions)
│   ├── SETUP_GUIDE.md               # Setup instructions
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # ★ FastAPI monolith (1048 lines, all endpoints)
│   │   ├── database.py              # SQLAlchemy models + KùzuDB schema (423 lines)
│   │   ├── ai_client.py             # Groq AI: triage, outreach, RAG chat (485 lines)
│   │   ├── bedrock_client.py        # Legacy AWS Bedrock client (unused, kept for ref)
│   │   └── donor_rf_model.joblib    # Trained LightGBM artifact (~115 KB)
│   ├── ml/
│   │   └── train_model.py           # ML pipeline: CSV → features → LightGBM → .joblib
│   ├── data/                        # Runtime: raktasetu.db + kuzu_db/ (auto-created)
│   └── tests/
│
├── bloodwarriors-frontend/
│   ├── .env                         # VITE_API_BASE_URL="http://localhost:8000"
│   ├── package.json                 # React 18 + Vite 6 + Tailwind 3.4
│   ├── index.html                   # Google Fonts, blood-drop favicon, meta SEO
│   ├── vite.config.js               # Port 5173, auto-open
│   ├── tailwind.config.js           # Custom color tokens + keyframe animations
│   ├── postcss.config.js            # tailwindcss + autoprefixer
│   └── src/
│       ├── main.jsx                 # Entry: StrictMode → BrowserRouter → AuthProvider → App
│       ├── index.css                # ★ Global design system (CSS keyframes, glassmorphism)
│       ├── App.jsx                  # ★ Router shell: sidebar (NGO) + full-screen (donor/landing)
│       ├── components/
│       │   ├── ProtectedRoute.jsx   # Auth guard: redirects to "/" if !isAuthenticated
│       │   └── Toast.jsx            # Toast notification system (useToast hook + ToastContainer)
│       ├── lib/
│       │   ├── api.js               # Axios instance + token injection interceptor
│       │   └── AuthContext.jsx       # React context: login/logout, sessionStorage token
│       └── pages/
│           ├── Landing.jsx           # Cinematic split-screen hero (donor | NGO)
│           ├── Overview.jsx          # NGO dashboard (stats, system health, uptime)
│           ├── donor/
│           │   ├── Register.jsx      # Donor registration form (+91 phone, encrypted ID)
│           │   └── DonorChat.jsx     # Empathetic FAQ chat (civilian-facing)
│           └── ngo/
│               ├── Triage.jsx        # AI triage — parse text → urgency; routes to /ngo/match?blood_group=&urgency=
│               ├── MatchMatrix.jsx   # Donor ranking grid + WhatsApp dispatch; auto-runs from triage params
│               └── Chat.jsx          # RaktaSetu Intelligence — agentic ops RAG chat
```

---

## 4. Database Schemas

### 4.1 SQLAlchemy — Donor Model (`database.py:80`)

```python
class Donor(Base):
    __tablename__ = "donors"

    id                              # Integer, PK, autoincrement
    user_id                         # String(128), indexed, NOT NULL — hex-encoded frontend ID
    bridge_id                       # String(128), nullable

    # Role & Status
    role                            # String(50)  — "Emergency Donor", "Bridge Donor", "Volunteer"
    role_status                     # Boolean
    bridge_status                   # Boolean
    status                          # String(20)  — "active" / "inactive"

    # Blood & Demographics
    blood_group                     # String(20), indexed — e.g. "O Positive"
    gender                          # String(10)  — kept for display, dropped in ML
    latitude, longitude             # Float — dropped in ML, used for proximity scoring

    # Bridge (Patient) Info
    bridge_gender                   # String(10)
    bridge_blood_group              # String(20)
    quantity_required               # Integer
    last_transfusion_date           # DateTime
    expected_next_transfusion_date  # DateTime

    # Donor History
    registration_date               # DateTime
    donor_type                      # String(30) — "One-Time", "Regular", "Voluntary"
    last_contacted_date             # DateTime
    last_donation_date              # DateTime
    next_eligible_date              # DateTime
    donations_till_date             # Integer
    eligibility_status              # String(20) — "eligible" / "not eligible"
    cycle_of_donations              # Integer (days)
    total_calls                     # Integer
    frequency_in_days               # Integer
    status_of_bridge                # Boolean
    donated_earlier                 # Boolean
    last_bridge_donation_date       # DateTime
    calls_to_donations_ratio        # Float
    user_donation_active_status     # String(20) — "Active" / "Inactive"
    inactive_trigger_comment        # Text

    # ★ CONSENT LAYER (CRITICAL — DPDP 2023)
    consent_given                   # Boolean, default=True, NOT NULL
                                    # /match MUST filter: consent_given == True

    # ML Score
    ml_score                        # Float, nullable — RandomForest predict_proba

    # ★ Contact Info (ADDED for WhatsApp dispatch)
    phone_number                    # String(20), nullable
                                    # CSV imports set this to None (defensive fallback)
```

**Other SQL Tables**: `TriageRequest` (triage audit log), `MatchLog` (match audit trail), `FeedbackLog` (user feedback).

### 4.2 KùzuDB — Graph Schema (`database.py:250`)

```
Node Tables:
  DonorNode     (donor_id PK, blood_group, donor_type, donations_count, is_eligible, consent_given)
  PatientNode   (patient_id PK, blood_group_needed, urgency, created_at)
  ChatSession   (session_id PK, user_id, started_at)
  ChatMessage   (message_id PK, role, content, timestamp)

Relationship Tables:
  DONATED_TO    : DonorNode → PatientNode  (donation_date, units)
  MATCHED_WITH  : DonorNode → PatientNode  (match_score, matched_at)
  HAS_MESSAGE   : ChatSession → ChatMessage (message_order)
```

Used for: RAG chat conversational memory (last N messages per session) and donor↔patient relationship audit.

---

## 5. API Contract & Coupling

### 5.1 Endpoints

| Method | Path | Purpose | Auth | Frontend Caller |
|---|---|---|---|---|
| `GET` | `/` | Health check | None | — |
| `POST` | `/triage` | AI triage: parse description → urgency + blood groups | None | `Triage.jsx` |
| `POST` | `/match` | Hybrid-ranked donor matching (LightGBM + heuristics) | None | `MatchMatrix.jsx` |
| `POST` | `/chat` | RAG chat with KùzuDB session memory + intent guardrail | None | `DonorChat.jsx`, `ngo/Chat.jsx` |
| `POST` | `/feedback` | Submit donor/patient feedback | None | — |
| `GET` | `/donors` | List all donors (paginated) | None | `Overview.jsx` |
| `POST` | `/donors` | Register new donor (returns 201) | None | `Register.jsx` |
| `PATCH` | `/donors/{id}/consent` | Revoke DPDP consent (irreversible in session) | None | `MatchMatrix.jsx` |
| `POST` | `/auth/login` | NGO coordinator authentication | None | `AuthContext.jsx` |
| `POST` | `/ingest-csv` | Bulk import `Dataset.csv` into SQLite | None | Admin/manual |

### 5.2 Authentication Mechanism

1. **Frontend**: `Landing.jsx` modal → user enters passcode → `AuthContext.login()` calls `POST /auth/login`.
2. **Backend**: Compares against hardcoded `NGO_PASSCODE = "admin123"`. On success, returns `rs-ngo-{sha256_hash[:32]}` token.
3. **Storage**: Token stored in `sessionStorage` (key: `rs_ngo_token`) — **tab-scoped, expires on tab close**.
4. **Injection**: `api.js` Axios request interceptor reads `sessionStorage` and attaches `Authorization: Bearer {token}` header to all requests.
5. **Guard**: `ProtectedRoute.jsx` wraps all `/ngo/*` routes — redirects to `/` if `!isAuthenticated`.

### 5.3 CORS

```python
CORSMiddleware(allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
```

### 5.4 Frontend↔Backend Payload Alignment

**Register.jsx → POST /donors**:
```json
{
  "user_id": "\\x6a6f686e646f6500",     // hex-encoded from generateEncryptedUserId()
  "blood_group": "O Positive",
  "last_donation_date": "2024-12-15",    // ISO date string
  "donations_till_date": 3,
  "role": "Emergency Donor",
  "consent_given": true,
  "status": "active",
  "donor_type": "Voluntary",
  "eligibility_status": "eligible",
  "phone_number": "+919876543210"        // Optional, null if not provided
}
```

---

## 6. Core Features & Business Logic

### 6.1 AI Triage (`ai_client.py → triage_request()`)
- **Input**: Free-text patient description (supports Hindi, Telugu, Marathi, English, transliterated).
- **Output**: `{ urgency: "CRITICAL"|"MODERATE"|"LOW", reasoning, recommended_blood_groups }`.
- **Live mode**: Groq `llama-3.1-8b-instant` with structured JSON system prompt.
- **Mock mode**: Keyword-matching classifier (critical: "bleeding", "trauma"; low: "elective", "routine").
- **Fallback**: If Groq call fails, silently falls back to mock.

### 6.2 Hybrid Match Ranking (`main.py → POST /match`)
- **Pre-filter**: `consent_given == True` (DPDP mandatory), matching `blood_group`, `eligibility_status == 'eligible'`.
- **Scoring**: 4-component dynamic weighted ensemble:

| Component | CRITICAL | MODERATE | LOW | Source |
|---|---|---|---|---|
| ML Probability | 55% | 45% | 40% | LightGBM `predict_proba` on donor features |
| Reliability | 25% | 25% | 25% | `donations_till_date / max(donations)` |
| Cycle Readiness | 15% | 15% | 15% | Days since last donation vs. 56-day window |
| Proximity | 5% | 15% | 20% | Haversine distance (lat/lng), inversely weighted |

- **Outreach**: After ranking, top-N donors get AI-generated 2-sentence mobilization messages via `generate_outreach()`.

#### Triage → Match Auto-Routing Pipeline
Triage and Match are wired into a single zero-click handoff:
1. `Triage.jsx` classifies the request, then navigates to `/ngo/match?blood_group=<top recommended group>&urgency=<CRITICAL|MODERATE|LOW>`.
2. `MatchMatrix.jsx` reads the search params on mount, hydrates the `bloodGroup`/`urgency` selects, and auto-executes `handleMatch()` (~300 ms debounce) — no manual "Find Donors" click needed.
3. Params are cleared immediately via `navigate('/ngo/match', { replace: true })` so a refresh won't re-fire; a small "From Triage #XXXX" provenance badge is shown on the controls row.

### 6.3 WhatsApp Dispatch (`MatchMatrix.jsx`)
- **Protocol**: 100% free `https://wa.me/{phone}?text={encoded_message}` deep links.
- **No API keys, no Twilio, no cost**. Opens WhatsApp Web/native client with donor's number + LightGBM-generated outreach text pre-pasted.
- **Guard**: Donors without `phone_number` get a greyed-out "NO PHONE" button. Phone is optional during registration.

### 6.4 RAG Chat — Behavioral Split

**Both chats call the same `POST /chat` endpoint**, but differ in frontend context:

| Aspect | DonorChat.jsx (Civilian) | ngo/Chat.jsx (Tactical) |
|---|---|---|
| Theme | Rausch, empathetic | Rausch/light marketplace, ops-focused |
| User ID | `"anonymous-donor"` | `"command-center-operator"` |
| System prompt | Empathetic blood donation FAQs | Operational intelligence queries |
| Mock responses | Donation eligibility, blood groups, scheduling | Model architecture, feature weights, graph schema, pipeline metrics |
| Label | `RaktaSetu.AI` | `RaktaSetu AI` (header: "RaktaSetu Intelligence") |
| Guardrail | Medical intent only (refuses off-topic) | Operational-intelligence scope |
| Suggested queries | "When can I donate?", "Blood types?" | "Show model architecture", "Active feature weights" |

**Backend RAG** (`ai_client.py → rag_chat()`):
- Stores every message in KùzuDB (`ChatSession → HAS_MESSAGE → ChatMessage`).
- Retrieves last 10 messages for context window.
- Injects conversation history into system prompt with intent guardrail.
- Off-topic queries trigger a hard refusal message.

### 6.5 ML Training Pipeline (`ml/train_model.py`)
- **Input**: `Dataset.csv` (~1.5 MB, BloodWarriors dataset)
- **Target**: `has_donated = 1 if calls_to_donations_ratio IS NOT NULL`
- **Leakage prevention**: Drops `gender`, `latitude`, `longitude` (spec), `donated_earlier` (target leak), `donations_till_date` (proxy leak)
- **Features**: Date columns → days-since-epoch, booleans → 0/1, categoricals → one-hot
- **Model**: LGBMClassifier (gbdt, 300 estimators, depth=6, `is_unbalance=True`)
- **Output**: `app/donor_rf_model.joblib` (serialized model + feature names)
- **Run**: `python ml/train_model.py` from `bloodwarriors-backend/`

### 6.6 DPDP Consent Protocol
- Every donor has `consent_given` (default `True`).
- `POST /match` **mandatorily filters** `consent_given == True` — donors who revoked are never returned.
- `PATCH /donors/{id}/consent` sets `consent_given = False`.
- Frontend: Revoked rows get CSS class `consent-revoked` (opacity 25%, blur, pointer-events disabled) — **irreversible in the current session**.

---

## 7. Frontend Routing Map

```
/                       → Landing.jsx        (full-screen, no sidebar)
/donor/register         → Register.jsx       (full-screen, donor-page-wrapper)
/donor/chat             → DonorChat.jsx      (full-screen, donor-page-wrapper)
/ngo/overview           → Overview.jsx       (sidebar shell, ProtectedRoute)
/ngo/triage             → Triage.jsx         (sidebar shell, ProtectedRoute)
/ngo/match              → MatchMatrix.jsx    (sidebar shell, ProtectedRoute)
/ngo/chat               → Chat.jsx           (sidebar shell, ProtectedRoute)
```

**Sidebar shell** (`App.jsx → NgoLayout`): Collapsible sidebar with nav links, uptime counter, DISCONNECT button. Renders child via `<Outlet />`.

---

## 8. Environment Variables

### Backend (`.env`)
```env
USE_MOCK_AI=True                           # True=offline, False=live Groq
GROQ_API_KEY="your_free_groq_api_key_here" # Free at console.groq.com
SQLITE_DB_PATH="data/raktasetu.db"         # Auto-created
KUZU_DB_PATH="data/kuzu_db"                # Auto-created
APP_HOST=0.0.0.0
APP_PORT=8000
```

### Frontend (`.env`)
```env
VITE_API_BASE_URL="http://localhost:8000"
```

---

## 9. Quick Start Commands

```powershell
# ── Backend ──
cd bloodwarriors-backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python ml/train_model.py              # Train LightGBM (one-time)
uvicorn app.main:app --reload --port 8000

# ── Frontend ──
cd bloodwarriors-frontend
npm install
npm run dev                            # Opens http://localhost:5173
```

**Test login passcode**: `admin123`

---

> **End of Master Context**. This document captures the complete architecture, schemas, API contracts, business logic, and design language of RaktaSetu AI as of 2026-07-01.
