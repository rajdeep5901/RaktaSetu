# RaktaSetu

Intelligent, zero-budget blood donation matching platform — AI-powered triage,
hybrid-ranked donor matching with consent enforcement, personalized outreach, and
RAG chat.

- **`bloodwarriors-backend/`** — FastAPI core API (triage, matching, chat, feedback).
- **`bloodwarriors-frontend/`** — Vite + React NGO Command Center and donor portal.

See [`raktasetu_architecture.md`](raktasetu_architecture.md) for the full system design.

## Deployment Architecture

The production deployment separates **ephemeral compute** from **persistent storage**
to keep the platform durable at $0/month.

- **Compute — Render.** The FastAPI backend runs on Render's free web-service tier.
  These containers are **ephemeral**: their local filesystem is wiped on every
  deploy, restart, and idle spin-down. No application state can safely live on disk.

- **Persistent storage — Neon PostgreSQL.** Persistent data was migrated off local
  SQLite onto **Neon** (serverless PostgreSQL) through the existing **SQLAlchemy**
  layer. The app switches on `DATABASE_URL`: when a `postgresql://` connection string
  is set it uses Neon; unset, it falls back to local SQLite for development. No model
  or query changes were required — only the engine binding.

- **Chat history flattened into relational tables.** Conversational memory previously
  lived in **KùzuDB**, an embedded graph database whose files sat on the container's
  local disk — and were therefore destroyed on every Render spin-down. That graph was
  **flattened into two relational PostgreSQL tables**, `chat_sessions` and
  `chat_messages` (linked by `session_id`, ordered by `message_order`), managed by the
  same SQLAlchemy models. This guarantees **conversation persistence across container
  restarts** while adding **$0** of managed infrastructure — achieving production-grade
  durability on entirely free tiers.

### Configuration

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Render env (`sync: false`) | Neon PostgreSQL connection string. Unset → local SQLite. |
| `ALLOWED_ORIGINS` | Render env (`sync: false`) | Comma-separated allowed CORS origins. Unset → `*` for local dev. |
| `VITE_API_BASE_URL` | Frontend build env | Backend API URL. Unset → `http://localhost:8000`. |
| `GROQ_API_KEY` | Render env (`sync: false`) | Groq API key (when `USE_MOCK_AI=False`). |
