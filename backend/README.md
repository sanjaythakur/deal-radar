# Deal-Radar backend

FastAPI proxy that owns the Crustdata + OpenAI keys and exposes a thin set of
endpoints consumed by the React frontend.

## Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# then fill in CRUSTDATA_API_KEY and OPENAI_API_KEY in .env
```

## Run

```bash
python -m uvicorn main:app --reload --port 8000
```

> Always invoke uvicorn via `python -m uvicorn` so the venv's interpreter is
> used. A bare `uvicorn` may resolve to a global (pyenv / system) install that
> can't see your venv packages, producing
> `ModuleNotFoundError: No module named 'httpx'`.

The Vite dev server proxies `/api/*` to `http://localhost:8000`, so once both
servers are running you can hit the React app at http://localhost:5173 and the
backend will be reachable transparently.

## Endpoints

| Endpoint              | Body                          | Returns                                |
| --------------------- | ----------------------------- | -------------------------------------- |
| `POST /api/parse-query` | `{query}`                   | `Filters`                              |
| `POST /api/enrich`      | `{filters}`                 | `Prospect[]` (no score, no outreach)   |
| `POST /api/web-signals` | `{prospects}`               | `Prospect[]` with `recentPost`/`hook`  |
| `POST /api/score`       | `{prospect, signals}`       | `{score}`                              |
| `POST /api/outreach`    | `{prospect}`                | `{subject, body}`                      |

## Files

- `main.py` — FastAPI app + routes
- `crustdata.py` — async httpx client for the Crustdata REST API
- `llm.py` — async OpenAI wrapper (parse / briefing / score / outreach)
- `pipeline.py` — orchestrates the Crustdata recipe used by `/api/enrich`
- `schemas.py` — pydantic request / response models
