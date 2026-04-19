// All five scaffold functions hit the FastAPI backend (backend/main.py),
// which owns both the Crustdata and OpenAI keys.
//
// runDealRadar() preserves its 5-step shape so the agent-reasoning panel
// keeps its rhythm. It also takes an optional onProgress callback that
// receives real per-stage counts as they arrive.

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

// Returns { prospects, stats: { companies_matched, candidates_found, profiles_enriched } }
export async function runEnrichmentPipeline(filters) {
  return withFloor(postJSON('/api/enrich', { filters }));
}

// Returns { prospects (with recentPost/hook filled), stats: { signals_found } }
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

// Top-level orchestrator: query in, ranked prospects out.
// onProgress(partialStats) is called after each stage with the cumulative
// stats known so far, so the agent-reasoning panel can render real counts.
export async function runDealRadar(query, onProgress) {
  const stats = {};
  const emit = () => onProgress?.({ ...stats });

  const filters = await parseQueryToFilters(query);
  stats.parsed = true;
  emit();

  const enrichResult = await runEnrichmentPipeline(filters);
  Object.assign(stats, enrichResult.stats || {});
  emit();

  const webResult = await fetchWebSignals(enrichResult.prospects || []);
  Object.assign(stats, webResult.stats || {});
  emit();

  const enriched = webResult.prospects || [];

  const scores = await Promise.all(
    enriched.map((p) => scoreProspect(p, p.raw_signals).catch(() => 0))
  );
  const scored = enriched.map((p, i) => ({ ...p, score: scores[i] }));
  stats.scored = scored.length;
  emit();

  stats.prospects_ready = scored.length;
  emit();

  return [...scored].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
