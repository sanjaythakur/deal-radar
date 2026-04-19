// All five scaffold functions now hit the FastAPI backend
// (backend/main.py). The frontend never sees the Crustdata or OpenAI keys.
//
// runDealRadar() preserves its 5-step shape so the agent-reasoning panel
// keeps its rhythm.

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MIN_STEP_MS = 500;

async function postJSON(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) {
    let detail;
    try {
      detail = await res.json();
    } catch {
      detail = await res.text().catch(() => '');
    }
    const msg =
      typeof detail === 'string'
        ? detail
        : detail?.detail?.crustdata || detail?.detail || JSON.stringify(detail);
    const err = new Error(`${path} failed (${res.status}): ${msg}`);
    err.status = res.status;
    err.detail = detail;
    throw err;
  }
  return res.json();
}

// Wrap a real network call so the agent-reasoning step never finishes
// faster than MIN_STEP_MS — keeps the spinner perceptible.
async function withFloor(promise) {
  const start = Date.now();
  const result = await promise;
  const elapsed = Date.now() - start;
  if (elapsed < MIN_STEP_MS) await sleep(MIN_STEP_MS - elapsed);
  return result;
}

// Returns structured ICP filters from natural language query
export async function parseQueryToFilters(naturalLanguageQuery) {
  return withFloor(postJSON('/api/parse-query', { query: naturalLanguageQuery }));
}

// Returns array of enriched prospect objects
export async function runEnrichmentPipeline(filters) {
  return withFloor(postJSON('/api/enrich', { filters }));
}

// Returns prospects with recentPost / hook filled from web search
export async function fetchWebSignals(prospects) {
  return withFloor(postJSON('/api/web-signals', { prospects }));
}

// Returns Why-Now score (0–100) for a single prospect
export async function scoreProspect(prospect, signals) {
  const data = await postJSON('/api/score', {
    prospect,
    signals: signals ?? prospect.raw_signals ?? {},
  });
  return data.score;
}

// Returns { subject, body } for a prospect
export async function generateOutreach(prospect) {
  return postJSON('/api/outreach', { prospect });
}

// Top-level orchestrator: query in, ranked prospects out
export async function runDealRadar(query) {
  const filters = await parseQueryToFilters(query);

  let prospects = await runEnrichmentPipeline(filters);
  prospects = await fetchWebSignals(prospects);

  const scores = await Promise.all(
    prospects.map((p) => scoreProspect(p, p.raw_signals).catch(() => 0))
  );
  prospects = prospects.map((p, i) => ({ ...p, score: scores[i] }));

  return [...prospects].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
