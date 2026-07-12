"""
### FILE: app/database.py
============================================================
RaktaSetu AI — Database Layer
============================================================
Two databases, zero managed infrastructure:

1. SQLite (via SQLAlchemy) — Tabular donor data, triage logs,
   match logs, and feedback. Contains the critical `consent_given`
   column on the Donor model.

2. KùzuDB (embedded graph) — Conversational memory and
   donor↔patient relationship mapping for the RAG chat.

============================================================
"""

import os
import datetime
from typing import Optional

from sqlalchemy import (
    create_engine,
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    Text,
    event,
)
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from dotenv import load_dotenv

# Attempt KùzuDB import — it's optional for basic functionality
try:
    import kuzu

    KUZU_AVAILABLE = True
except ImportError:
    KUZU_AVAILABLE = False
    print("[WARN] KuzuDB not installed. Graph features will be disabled.")

load_dotenv()

# ============================================================
# SQLAlchemy Configuration
# ============================================================
# DATABASE_URL-first: when set (e.g. a Neon `postgresql://...` string), use it
# directly. Otherwise fall back to local SQLite for development.
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # --- Remote PostgreSQL (Neon) ---
    IS_SQLITE = False
    # SQLITE_DB_PATH is unused in this mode, but kept defined so downstream
    # references (e.g. init/logging) don't break.
    SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", "data/raktasetu.db")

    from urllib.parse import urlparse

    _db_host = urlparse(DATABASE_URL).hostname or "<unknown>"
    print(f"[DB] Using PostgreSQL: {_db_host}")

    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Recover from Neon closing idle connections
        echo=False,          # Set True for SQL debug logging
    )
else:
    # --- Local SQLite (development fallback) ---
    IS_SQLITE = True
    SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", "data/raktasetu.db")
    # Ensure the data directory exists
    os.makedirs(os.path.dirname(SQLITE_DB_PATH) if os.path.dirname(SQLITE_DB_PATH) else ".", exist_ok=True)

    DATABASE_URL = f"sqlite:///{SQLITE_DB_PATH}"
    print(f"[DB] Using SQLite: {os.path.abspath(SQLITE_DB_PATH)}")

    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # Required for SQLite + FastAPI
        echo=False,  # Set True for SQL debug logging
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# Enable WAL mode for better concurrent read performance on SQLite.
# Only registered for SQLite — these PRAGMAs are SQLite-specific.
if IS_SQLITE:

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


# ============================================================
# SQLAlchemy Models
# ============================================================


class Donor(Base):
    """
    Core donor table. Mirrors the cleaned CSV schema with the
    addition of `consent_given` (CRITICAL for /match filtering)
    and `ml_score` (RandomForest prediction probability).
    """

    __tablename__ = "donors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), unique=False, index=True, nullable=False)
    bridge_id = Column(String(128), nullable=True)

    # --- Role & Status ---
    role = Column(String(50), nullable=True)             # Emergency Donor, Bridge Donor, Volunteer
    role_status = Column(Boolean, nullable=True)          # true/false
    bridge_status = Column(Boolean, nullable=True)        # true/false
    status = Column(String(20), nullable=True)            # active/inactive

    # --- Blood & Demographics ---
    blood_group = Column(String(20), index=True, nullable=True)  # e.g. "O Positive"
    gender = Column(String(10), nullable=True)            # Kept in DB for display, not ML
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # --- Bridge (Patient) Info ---
    bridge_gender = Column(String(10), nullable=True)
    bridge_blood_group = Column(String(20), nullable=True)
    quantity_required = Column(Integer, nullable=True)
    last_transfusion_date = Column(DateTime, nullable=True)
    expected_next_transfusion_date = Column(DateTime, nullable=True)

    # --- Donor History ---
    registration_date = Column(DateTime, nullable=True)
    donor_type = Column(String(30), nullable=True)       # One-Time, Regular, Other
    last_contacted_date = Column(DateTime, nullable=True)
    last_donation_date = Column(DateTime, nullable=True)
    next_eligible_date = Column(DateTime, nullable=True)
    donations_till_date = Column(Integer, nullable=True)
    eligibility_status = Column(String(20), nullable=True)  # eligible/not eligible
    cycle_of_donations = Column(Integer, nullable=True)     # days
    total_calls = Column(Integer, nullable=True)
    frequency_in_days = Column(Integer, nullable=True)
    status_of_bridge = Column(Boolean, nullable=True)
    donated_earlier = Column(Boolean, nullable=True)
    last_bridge_donation_date = Column(DateTime, nullable=True)
    calls_to_donations_ratio = Column(Float, nullable=True)
    user_donation_active_status = Column(String(20), nullable=True)  # Active/Inactive
    inactive_trigger_comment = Column(Text, nullable=True)

    # --- CONSENT LAYER (CRITICAL for judging criteria) ---
    # The /match endpoint MUST filter out donors where consent_given=False.
    # Default is True so imported CSV data is immediately matchable.
    consent_given = Column(Boolean, default=True, nullable=False)

    # --- ML Score ---
    # Populated by the trained RandomForest model's predict_proba
    ml_score = Column(Float, nullable=True)

    # --- Contact Info ---
    # Phone number for WhatsApp dispatch (+91 format)
    # Nullable: CSV-imported donors won't have this field
    phone_number = Column(String(20), nullable=True)

    def __repr__(self):
        return f"<Donor(id={self.id}, user_id={self.user_id[:16]}..., blood_group={self.blood_group}, consent={self.consent_given})>"


class TriageRequest(Base):
    """
    Logs every triage request from patients/coordinators.
    Stores the AI-determined urgency level.
    """

    __tablename__ = "triage_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_description = Column(Text, nullable=False)
    blood_group_needed = Column(String(20), nullable=True)
    urgency = Column(String(20), nullable=True)          # CRITICAL, MODERATE, LOW
    ai_reasoning = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class MatchLog(Base):
    """
    Audit trail: every time /match returns ranked donors,
    we log the request parameters and top results.
    """

    __tablename__ = "match_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    triage_id = Column(Integer, nullable=True)
    blood_group = Column(String(20), nullable=False)
    urgency = Column(String(20), nullable=False)
    matched_donor_ids = Column(Text, nullable=True)      # JSON list of donor IDs
    scores = Column(Text, nullable=True)                  # JSON list of scores
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class FeedbackLog(Base):
    """
    Feedback from donors and patients to close the loop.
    """

    __tablename__ = "feedback_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(128), nullable=True)
    user_role = Column(String(20), nullable=True)        # donor / patient / coordinator
    rating = Column(Integer, nullable=True)              # 1-5
    comment = Column(Text, nullable=True)
    endpoint_used = Column(String(50), nullable=True)    # which endpoint triggered this
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ChatSession(Base):
    """
    Chat session metadata. One row per conversation session.
    Migrated from KùzuDB to SQLAlchemy (Postgres/SQLite) for
    zero-managed-infrastructure conversational memory.
    """

    __tablename__ = "chat_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(String(128), unique=True, index=True, nullable=False)
    user_id = Column(String(128), nullable=True)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)


class ChatMessage(Base):
    """
    Individual chat messages belonging to a ChatSession.
    Ordered via `message_order` for chronological reconstruction.
    """

    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    message_id = Column(String(128), unique=True, index=True, nullable=False)
    session_id = Column(String(128), index=True, nullable=False)
    role = Column(String(20), nullable=False)  # "user" or "assistant"
    content = Column(Text, nullable=False)
    message_order = Column(Integer, nullable=False, default=0)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)


# ============================================================
# Database Initialization (SQLite)
# ============================================================


def init_sqlite_db():
    """
    Create all tables if they don't exist.
    Safe to call multiple times (idempotent).
    """
    Base.metadata.create_all(bind=engine)
    print(f"[OK] SQLite database initialized at: {SQLITE_DB_PATH}")


def get_db() -> Session:
    """
    FastAPI dependency: yields a SQLAlchemy session per request.
    Usage:
        @app.get("/example")
        def example(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ============================================================
# KùzuDB Configuration (Embedded Graph Database)
# ============================================================
KUZU_DB_PATH = os.getenv("KUZU_DB_PATH", "data/kuzu_db")

# Module-level graph DB connection (lazy-initialized)
_kuzu_db = None
_kuzu_conn = None


def get_kuzu_connection():
    """
    Returns a KùzuDB connection, initializing the DB on first call.
    Thread-safe for the single-writer, multi-reader pattern.
    """
    global _kuzu_db, _kuzu_conn

    if not KUZU_AVAILABLE:
        return None

    if _kuzu_db is None:
        os.makedirs(KUZU_DB_PATH, exist_ok=True)
        _kuzu_db = kuzu.Database(KUZU_DB_PATH)
        _kuzu_conn = kuzu.Connection(_kuzu_db)
        _init_kuzu_schema(_kuzu_conn)

    return _kuzu_conn


def _init_kuzu_schema(conn):
    """
    Create KùzuDB node and relationship tables for:
    - Donor ↔ Patient relationship mapping
    - Chat session memory (conversational RAG context)

    Safe to call multiple times — uses CREATE ... IF NOT EXISTS.
    """
    print(f"[GRAPH] Initializing KuzuDB graph at: {KUZU_DB_PATH}")

    # --- Node Tables ---
    conn.execute("""
        CREATE NODE TABLE IF NOT EXISTS DonorNode (
            donor_id STRING,
            blood_group STRING,
            donor_type STRING,
            donations_count INT64,
            is_eligible BOOLEAN,
            consent_given BOOLEAN,
            PRIMARY KEY (donor_id)
        )
    """)

    conn.execute("""
        CREATE NODE TABLE IF NOT EXISTS PatientNode (
            patient_id STRING,
            blood_group_needed STRING,
            urgency STRING,
            created_at STRING,
            PRIMARY KEY (patient_id)
        )
    """)

    conn.execute("""
        CREATE NODE TABLE IF NOT EXISTS ChatSession (
            session_id STRING,
            user_id STRING,
            started_at STRING,
            PRIMARY KEY (session_id)
        )
    """)

    conn.execute("""
        CREATE NODE TABLE IF NOT EXISTS ChatMessage (
            message_id STRING,
            role STRING,
            content STRING,
            timestamp STRING,
            PRIMARY KEY (message_id)
        )
    """)

    # --- Relationship Tables ---
    conn.execute("""
        CREATE REL TABLE IF NOT EXISTS DONATED_TO (
            FROM DonorNode TO PatientNode,
            donation_date STRING,
            units INT64
        )
    """)

    conn.execute("""
        CREATE REL TABLE IF NOT EXISTS MATCHED_WITH (
            FROM DonorNode TO PatientNode,
            match_score DOUBLE,
            matched_at STRING
        )
    """)

    conn.execute("""
        CREATE REL TABLE IF NOT EXISTS HAS_MESSAGE (
            FROM ChatSession TO ChatMessage,
            message_order INT64
        )
    """)

    print("[OK] KuzuDB schema initialized (7 tables)")


def _kuzu_store_chat_message(session_id: str, user_id: str, role: str, content: str):
    """
    [DEPRECATED — KùzuDB path] Store a chat message in the KùzuDB graph.
    Retained for reference only; the active implementation is the
    SQLAlchemy-backed `store_chat_message` below.
    """
    conn = get_kuzu_connection()
    if conn is None:
        return  # KùzuDB not available, silently skip

    import uuid

    now = datetime.datetime.utcnow().isoformat()
    msg_id = str(uuid.uuid4())

    # Upsert session node
    try:
        conn.execute(
            "MERGE (s:ChatSession {session_id: $sid}) SET s.user_id = $uid, s.started_at = $ts",
            parameters={"sid": session_id, "uid": user_id, "ts": now},
        )
    except Exception:
        pass  # Session may already exist

    # Create message node
    try:
        conn.execute(
            "CREATE (m:ChatMessage {message_id: $mid, role: $role, content: $content, timestamp: $ts})",
            parameters={"mid": msg_id, "role": role, "content": content, "ts": now},
        )
    except Exception:
        pass

    # Create relationship
    try:
        # Count existing messages for ordering
        result = conn.execute(
            "MATCH (s:ChatSession {session_id: $sid})-[r:HAS_MESSAGE]->(m:ChatMessage) RETURN count(r) AS cnt",
            parameters={"sid": session_id},
        )
        order = 0
        while result.has_next():
            order = result.get_next()[0]

        conn.execute(
            """
            MATCH (s:ChatSession {session_id: $sid}), (m:ChatMessage {message_id: $mid})
            CREATE (s)-[:HAS_MESSAGE {message_order: $ord}]->(m)
            """,
            parameters={"sid": session_id, "mid": msg_id, "ord": order + 1},
        )
    except Exception:
        pass


def _kuzu_get_chat_history(session_id: str, limit: int = 10) -> list[dict]:
    """
    [DEPRECATED — KùzuDB path] Retrieve recent chat messages from KùzuDB.
    Retained for reference only; the active implementation is the
    SQLAlchemy-backed `get_chat_history` below.
    """
    conn = get_kuzu_connection()
    if conn is None:
        return []

    try:
        result = conn.execute(
            """
            MATCH (s:ChatSession {session_id: $sid})-[r:HAS_MESSAGE]->(m:ChatMessage)
            RETURN m.role, m.content, m.timestamp
            ORDER BY r.message_order DESC
            LIMIT $lim
            """,
            parameters={"sid": session_id, "lim": limit},
        )
        messages = []
        while result.has_next():
            row = result.get_next()
            messages.append({"role": row[0], "content": row[1], "timestamp": row[2]})
        # Return in chronological order
        return list(reversed(messages))
    except Exception:
        return []


# ============================================================
# Chat Persistence (SQLAlchemy — active implementation)
# ============================================================
# Chat history is stored in the relational DB (Postgres in production,
# SQLite in dev) rather than KùzuDB. The public signatures below are
# unchanged so callers in ai_client.py require no modification.


def store_chat_message(session_id: str, user_id: str, role: str, content: str):
    """
    Persist a chat message to the relational DB.

    - Upserts the ChatSession row for `session_id`.
    - Creates a ChatMessage with a uuid4 `message_id`.
    - Computes `message_order` from the count of existing messages
      for the session.
    """
    import uuid

    db = SessionLocal()
    try:
        # Upsert the session
        session = (
            db.query(ChatSession)
            .filter(ChatSession.session_id == session_id)
            .first()
        )
        if session is None:
            session = ChatSession(session_id=session_id, user_id=user_id)
            db.add(session)
        elif user_id and session.user_id != user_id:
            session.user_id = user_id

        # Determine ordering from existing message count
        message_order = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .count()
        )

        message = ChatMessage(
            message_id=str(uuid.uuid4()),
            session_id=session_id,
            role=role,
            content=content,
            message_order=message_order,
        )
        db.add(message)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def get_chat_history(session_id: str, limit: int = 10) -> list[dict]:
    """
    Retrieve the most recent `limit` messages for a session, returned
    in chronological (oldest → newest) order.

    Returns a list of {"role", "content", "timestamp"} dicts, where
    `timestamp` is an ISO-8601 string.
    """
    db = SessionLocal()
    try:
        rows = (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.message_order.desc())
            .limit(limit)
            .all()
        )
        # Rows come newest-first; reverse to chronological order.
        rows = list(reversed(rows))
        return [
            {
                "role": row.role,
                "content": row.content,
                "timestamp": row.timestamp.isoformat() if row.timestamp else None,
            }
            for row in rows
        ]
    finally:
        db.close()


# ============================================================
# Module-level auto-init
# ============================================================
# When this module is imported, initialize SQLite tables.
# KùzuDB is lazy-initialized on first get_kuzu_connection() call.
init_sqlite_db()
