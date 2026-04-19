# Deal-Radar

An AI agent that tells you WHO to sell to, WHY now, and WHAT to say.

## Stack

- **Frontend:** Vite + React 18 + Tailwind CSS v4
- **Backend:** FastAPI (Python 3.11+) — proxies Crustdata + OpenAI so secrets never touch the browser

## Getting started

You need two terminals: one for the backend, one for the frontend.

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# fill in CRUSTDATA_API_KEY and OPENAI_API_KEY in .env
python -m uvicorn main:app --reload --port 8000
```

> Use `python -m uvicorn …` rather than bare `uvicorn …`. If you have `pyenv`
> (or another global install) with its own `uvicorn`, the shim will outrank
> your venv on `PATH` and you'll get `ModuleNotFoundError: No module named
> 'httpx'` because the global interpreter doesn't have your venv packages.
> `python -m uvicorn` always uses the active venv.

See [backend/README.md](backend/README.md) for endpoint detail.

### 2. Frontend

```bash
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api/*` to `http://localhost:8000`, so the frontend never sees the API keys.

### Other scripts

- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build

## The flow

A single page reveals 5 steps sequentially:

1. **Query** — type a natural-language prospect description, or click an example chip
2. **Agent reasoning** — animated log of the 8 pipeline steps
3. **Prospects** — ranked table of leads with Why-Now scores from the LLM
4. **Briefing** — click any row for a pre-call card (company news, signal, pain point, talking points)
5. **Outreach** — editable subject + body, copy-to-clipboard, CSV export of all leads

## Project layout

```
src/
  App.jsx                 phase state machine
  index.css               tailwind + theme tokens
  api/scaffold.js         5 functions that hit the FastAPI backend
  components/
    QueryInput.jsx
    AgentReasoning.jsx
    ProspectTable.jsx
    BriefingCard.jsx
    OutreachPanel.jsx
backend/
  main.py                 FastAPI app + routes
  crustdata.py            async httpx Crustdata client
  llm.py                  OpenAI wrappers (gpt-5.4-mini by default)
  pipeline.py             Recipe D orchestration
  schemas.py              pydantic request/response models
```

## Where the secrets live

`backend/.env` (gitignored) holds both keys:

```
CRUSTDATA_API_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
```

The frontend never reads either key — every call goes through the FastAPI proxy.
