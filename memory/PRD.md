# Deal-Radar — Product Requirements

## Original problem statement
> Pull the code from the GitHub repo `deal-radar` and make sure campaigns are stored in a database so they persist across runs.

## Architecture
- **Frontend:** Vite + React 18 + Tailwind v4 (repo root)
- **Backend:** FastAPI (`/app/backend/main.py`, `server.py` re-exports for supervisor)
- **Database:** MongoDB (`deal_radar` database, `campaigns` collection)
- **3rd-party:** Crustdata + OpenAI (proxied through FastAPI; unchanged)

## What changed in this project (2026-01)

### Persistence (session 1)
- Added MongoDB persistence for campaigns.
  - `backend/db.py` — single Motor client + `campaigns_collection()` helper
  - `backend/campaigns.py` — CRUD router under `/api/campaigns`
  - `backend/server.py` — re-exports `main.app` so supervisor (`server:app`) works
  - `backend/.env` — `MONGO_URL`, `DB_NAME`
  - `requirements.txt` — added `motor`, `pymongo`
- Replaced `src/hooks/useCampaigns.js` localStorage logic with API calls.
- `src/components/CampaignAssignment.jsx` — awaits now-async `createCampaign` / `addLeadsToCampaign`.

### Stable prospectId + optimistic UI (session 2)
- New helper `src/lib/prospectId.js` (`getProspectId`) — prefers `profile_url`, falls back to `name|company`, then `name`.
- Mirrored `_get_prospect_id` in `backend/campaigns.py`; dedup and lead-creation now use it.
- `ProspectTable.jsx` + `App.jsx` — selection/assignment tracking keyed by the stable id.
- Single-lead update endpoint moved off path params (`PATCH /campaigns/{id}/leads/{pid}`) to body (`POST /campaigns/{id}/lead-update` with `{prospectId, status?, notes?}`) so LinkedIn-URL ids (which contain `/`) aren't mangled by ASGI path decoding.
- `useCampaigns` now applies status, notes, bulk-status, and remove **optimistically** (instant table update, server call reconciles, rollback + refresh on error).

## REST surface (campaigns)
- `GET    /api/campaigns`
- `POST   /api/campaigns`                              `{name}`
- `POST   /api/campaigns/{id}/leads`                   `{prospects, provenanceContext}`
- `POST   /api/campaigns/{id}/lead-update`             `{prospectId, status?, notes?}`
- `POST   /api/campaigns/{id}/leads/bulk-status`       `{prospectIds, status}`
- `POST   /api/campaigns/{id}/leads/remove`            `{prospectIds}`

## Verified
- CRUD via curl: create, add leads, update status/notes, bulk-status, remove.
- Two prospects with the same `name` but different `profile_url` are kept as distinct leads.
- Dedup correctly blocks a re-add of the same `profile_url`.
- Data survives `supervisorctl restart backend`.

## Backlog / Next
- P2: Delete campaign endpoint + UI.
- P2: Per-user scoping once auth exists.
- P2: Replace the mock-campaigns seed file with a first-run seeder (or drop it entirely).
