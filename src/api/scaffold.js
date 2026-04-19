import { MOCK_PROSPECTS } from '../data/mockProspects.js';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Returns structured ICP filters from natural language query
export async function parseQueryToFilters(naturalLanguageQuery) {
  // TODO: replace with real LLM call to extract ICP from natural language
  await sleep(400);
  return {
    raw: naturalLanguageQuery,
    titles: ['VP Revenue', 'Director of Distribution', 'CCO'],
    industries: ['Hospitality', 'Travel'],
    regions: ['Southeast Asia', 'APAC'],
    keywords: ['OTA', 'direct booking', 'commission'],
  };
}

// Returns array of enriched prospect objects
export async function runEnrichmentPipeline(filters) {
  // TODO: replace with real Crustdata calls: /company/identify -> /person/search -> /person/enrich
  await sleep(1800);
  return MOCK_PROSPECTS;
}

// Returns web signal objects per prospect
export async function fetchWebSignals(prospects) {
  // TODO: replace with real Crustdata /web/search/live calls
  await sleep(900);
  return prospects.map((p) => ({
    id: p.name,
    hook: p.hook,
    source: 'mock',
  }));
}

// Returns Why-Now score (0–100) per prospect
export async function scoreProspect(prospect, signals) {
  // TODO: replace with real LLM scoring call
  await sleep(50);
  return prospect.score;
}

// Returns { subject, body } for a prospect
export async function generateOutreach(prospect) {
  // TODO: replace with real LLM call to generate personalised outreach
  await sleep(600);
  return {
    subject: prospect.emailSubject,
    body: prospect.emailBody,
  };
}

// Top-level orchestrator: query in, ranked prospects out
export async function runDealRadar(query) {
  const filters = await parseQueryToFilters(query);
  const prospects = await runEnrichmentPipeline(filters);
  const signals = await fetchWebSignals(prospects);
  await Promise.all(prospects.map((p) => scoreProspect(p, signals)));
  return [...prospects].sort((a, b) => b.score - a.score);
}
