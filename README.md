# Deal-Radar

An AI agent that tells you WHO to sell to, WHY now, and WHAT to say.

## Stack

Vite + React 18 + Tailwind CSS v4. No backend.

## Getting started

```bash
npm install
npm run dev
```

Open http://localhost:5173.

### Other scripts

- `npm run build` — production build to `dist/`
- `npm run preview` — preview the production build

## The flow

A single page reveals 5 steps sequentially:

1. **Query** — type a natural-language prospect description, or click an example chip
2. **Agent reasoning** — animated log of 8 mock pipeline steps
3. **Prospects** — ranked table of 5 mock leads with Why-Now scores
4. **Briefing** — click any row for a pre-call card (company news, signal, pain point, talking points)
5. **Outreach** — editable subject + body, copy-to-clipboard, CSV export of all leads

Total perceived time from "Run" click to prospect table: ~5–6 seconds.

## Project layout

```
src/
  App.jsx                 phase state machine
  index.css               tailwind + theme tokens
  api/scaffold.js         5 mock async fns + runDealRadar orchestrator
  data/mockProspects.js   MOCK_PROSPECTS array
  components/
    QueryInput.jsx
    AgentReasoning.jsx
    ProspectTable.jsx
    BriefingCard.jsx
    OutreachPanel.jsx
```

## Replacing the mocks

Each function in [src/api/scaffold.js](src/api/scaffold.js) carries a `// TODO: replace with real API call` comment. Swap the `await sleep(...)` + mock return for a real Crustdata or LLM call without changing the `runDealRadar` orchestrator's signature.
