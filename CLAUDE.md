# CLAUDE.md — RaktaSetu Engineering Governance

## Commands
- **Frontend dev**: `cd bloodwarriors-frontend && npm run dev`
- **Backend dev**: `cd bloodwarriors-backend && uvicorn app.main:app --reload`
- **Frontend build**: `cd bloodwarriors-frontend && npm run build`
- **Lint**: `cd bloodwarriors-frontend && npx eslint src/`

## Stack
| Layer | Tech |
|-------|------|
| Frontend | React 18 · Vite 6 · Tailwind 3.4 |
| Backend | FastAPI · SQLAlchemy (relational) · KùzuDB (graph) |
| Graph DB | KùzuDB — all relationship/edge entities (donor↔request, NGO↔hospital) live here natively |

## Token Economy (STRICT)
- Output ONLY the exact modified functions, component blocks, or file diffs requested.
- NEVER rewrite unmodified code or an entire file for a minor change.
- Zero preamble. Zero throat-clearing. No greetings, setup guides, or structural explanations.
- Deliver pure code or high-density bulleted technical logic.

## Design System — Airbnb Pivot

> **Status**: The "Dark Cyber-Medical Terminal" aesthetic is COMPLETELY ABANDONED. Do not reference or generate any element from it.

### Aesthetic North Star
Light, generous, high-trust consumer marketplace. White canvas backgrounds, soft shadows, rounded elements.

### Color Tokens
| Token | Hex | Usage |
|-------|-----|-------|
| `rausch` | `#ff385c` | Primary CTAs, registration, triage submit, dispatch |
| `rausch-dark` | `#e00b41` | Hover / active states |
| `rausch-light` | `#ff5a7d` | Highlights, badges, pills |
| `babu` | `#00a699` | Success, confirmations, available-donor indicators |
| `ink` | `#222222` | Primary text (headlines, nav, body) |
| `body` | `#3f3f3f` | Secondary running-text |
| `muted` | `#6a6a6a` | Sub-labels, inactive tabs, placeholders |
| `muted-soft` | `#929292` | Disabled text |
| `hof` | `#f7f7f7` | Card backgrounds, subtle panels, table stripes |
| `cloud` | `#ffffff` | Page canvas, modals |
| `hackberry` | `#EB4D5C` | Critical alerts, error states, blood-shortage warnings |
| `error-text` | `#c13515` | Inline form validation error text |
| `hairline` | `#dddddd` | Default 1px borders, dividers |
| `hairline-soft` | `#ebebeb` | Lighter editorial dividers |
| `surface-strong` | `#f2f2f2` | Icon-button fills, heavier surface |
| `primary-disabled` | `#ffd1da` | Disabled CTA fill |

### Layout Standards
- **Inputs / Pills**: `rounded-full` (`border-radius: 9999px`)
- **Cards**: `rounded-md` (`border-radius: 14px`)
- **Buttons**: `rounded-sm` (`border-radius: 8px`)
- **Typography**: `Circular`, `Inter`, `-apple-system`, `system-ui`, `Roboto`, `Helvetica Neue`, sans-serif
- **Shadows**: `shadow-sm` / `shadow-md` only; no hard borders on cards
- **Elevation (single tier)**: `box-shadow: rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.04) 0 2px 6px, rgba(0,0,0,0.1) 0 4px 8px` — hover cards, search bar, dropdowns

### Banned Patterns
Do NOT generate any of the following:
- `.tactical-grid`, `.scan-overlay`, `text-glow-*`, neon color values
- Split-dark panel layouts, monospace fonts for non-data/non-code elements
- Gradient borders, cyberpunk iconography, terminal-green accents

## Pipeline Logic

### Triage → Match Routing
1. `Triage.jsx` submits form → navigates to `/ngo/match?blood_group=X&urgency=Y`
2. `MatchMatrix.jsx` reads URL params on mount → auto-executes matching query against backend
3. No manual "Search" click required when params are present

### Database Consistency Rules
- Relational entities (users, requests, inventory) → SQLAlchemy / PostgreSQL
- Relationship/edge entities (donor↔request matches, NGO↔hospital links, referral chains) → KùzuDB graph layer
- Never duplicate graph-native relationships as relational join tables

## File Conventions
- Components: `PascalCase.jsx` in `src/components/`
- Pages: `PascalCase.jsx` in `src/pages/`
- API routes: `snake_case.py` in `app/routers/`
- Tailwind config: `tailwind.config.js` at frontend root — all color tokens defined in `theme.extend.colors`
