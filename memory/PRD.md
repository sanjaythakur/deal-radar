# Deal-Radar — Product Requirements

## Original problem statement
> Pull the code from the GitHub repo `deal-radar` and make sure campaigns are stored in a database so they persist across runs.

## Architecture
- **Frontend:** Vite + React 18 + Tailwind v4 (repo root)
- **Backend:** FastAPI (`/app/backend/main.py`, `server.py` re-exports for supervisor)
- **Database:** MongoDB (`deal_radar` database, `campaigns` collection)
- **3rd-party:** Crustdata + OpenAI (proxied through FastAPI; unchanged)

## What changed in this session (2026-01)
- Added MongoDB persistence for campaigns.
  - `backend/db.py` — single Motor client + `campaigns_collection()` helper
  - `backend/campaigns.py` — CRUD router under `/api/campaigns`
  - `backend/server.py` — re-exports `main.app` so supervisor (`server:app`) works
  - `backend/.env` — `MONGO_URL`, `DB_NAME`
  - `requirements.txt` — added `motor`, `pymongo`
- Replaced `src/hooks/useCampaigns.js` localStorage logic with API calls.
- `src/components/CampaignAssignment.jsx` — awaits now-async `createCampaign` / `addLeadsToCampaign`.

## REST surface (campaigns)
- `GET    /api/campaigns`
- `POST   /api/campaigns`                              `{name}`
- `POST   /api/campaigns/{id}/leads`                   `{prospects, provenanceContext}`
- `PATCH  /api/campaigns/{id}/leads/{prospectId}`      `{status?, notes?}`
- `POST   /api/campaigns/{id}/leads/bulk-status`       `{prospectIds, status}`
- `POST   /api/campaigns/{id}/leads/remove`            `{prospectIds}`

## Verified
- CRUD via curl — create, add leads (dedup by prospect name), update status/notes, bulk-status, remove.
- Data survives `supervisorctl restart backend`.

## Backlog / Next
- P1: Swap `prospectId` from `name` to a stable unique key (current scheme collides when two real prospects share a name).
- P2: Delete campaign endpoint + UI.
- P2: Optimistic UI updates in `useCampaigns` for snappier feel.
- P2: Per-user scoping once auth exists.
