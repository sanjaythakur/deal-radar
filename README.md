# Deal-Radar

An AI agent that tells you WHO to sell to, WHY now, and WHAT to say.

## Stack

- **Framework:** Next.js 15 (App Router) + React 18 + Tailwind CSS v4
- **API:** Next.js Route Handlers (`app/api/*`) — proxy Crustdata + OpenAI so secrets never touch the browser
- **Persistence:** in-process memory (campaigns reset on server restart / redeploy)

## Getting started

```bash
npm install
cp .env.example .env.local  # then fill in the keys
npm run dev
```

Open http://localhost:3000.

`.env.local` (gitignored) holds the runtime secrets:

```
CRUSTDATA_API_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.4-mini
```

The browser never reads either API key — every call goes through the Next.js
route handlers under `/api/*`.

### Other scripts

- `npm run build` — production build (Next.js standalone output in `.next/`)
- `npm run start` — serve the production build

## The flow

A single page reveals 5 steps sequentially:

1. **Query** — type a natural-language prospect description, or click an example chip
2. **Agent reasoning** — animated log of the 8 pipeline steps
3. **Prospects** — ranked table of leads with Why-Now scores from the LLM
4. **Briefing** — click any row for a pre-call card (company news, signal, pain point, talking points)
5. **Outreach** — editable subject + body, copy-to-clipboard, CSV export of all leads

A second tab (**Campaigns**) keeps hand-picked leads in memory for the lifetime
of the running server. Restart the process and the seed list comes back.

## Project layout

```
app/
  layout.jsx              root <html> shell + globals.css
  page.jsx                'use client' phase state machine (was src/App.jsx)
  globals.css             tailwind + theme tokens
  api/
    health/route.js
    parse-query/route.js
    enrich/route.js
    web-signals/route.js
    score/route.js
    outreach/route.js
    campaigns/
      route.js                                 GET / POST
      [id]/leads/route.js                      POST
      [id]/leads/[prospectId]/route.js         PATCH
      [id]/leads/bulk-status/route.js          POST
      [id]/leads/delete/route.js               POST
components/                React components (unchanged JSX)
hooks/useCampaigns.js      optimistic local state + API sync
data/mockCampaigns.js      seed list + LEAD_STATUSES palette
lib/
  crustdata.js             fetch-based Crustdata client (was backend/crustdata.py)
  llm.js                   OpenAI wrappers (gpt-5.4-mini by default)
  pipeline.js              Recipe D orchestration
  campaigns.js             in-memory campaigns CRUD (seeded on first access)
  client/                  thin browser-side fetch helpers used by app/page.jsx
  server/errors.js         CrustdataError -> HTTP 502 translation
docker-compose.yml         single web (Next.js) service for Coolify
Dockerfile                 multi-stage Next.js standalone build
```

## Deployment (Coolify)

Coolify reads `docker-compose.yml` and deploys the `web` service publicly.
Set these in the Coolify env tab:

- `CRUSTDATA_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, defaults to `gpt-5.4-mini`)

Coolify auto-injects `SERVICE_FQDN_WEB` for the public hostname.
